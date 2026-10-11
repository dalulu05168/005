/* Nuvexa Telegram -> WhatsApp source parser: strict 3-line, unique role coding.
 * Only an authorized Telegram source chat may supply input (enforced upstream).
 * Format:
 *   45老男：
 *   早上好.............
 *   Bună dimineața! Astăzi urmărim evoluția pieței.
 * This module never translates or sends the Chinese line.
 */
const HAN_OR_CJK_PUNCTUATION=/[\p{Script=Han}\u3000-\u303f\uff00-\uff65\ufe10-\ufe1f\ufe30-\ufe4f]/u;
const HAN=/\p{Script=Han}/u;
const LATIN=/\p{Script=Latin}/u;
const MEMBER_HEADER=/^(0[1-9]|[1-9][0-9])(老女|新女|老男|新男)：$/u;
const ROLE_HEADERS=new Map([
  ['助理：',{role:'ASSISTANT',roleName:'助理',translatedRoleName:'Asistent',auxCode:''}],
  ['教授：',{role:'PROFESSOR',roleName:'教授',translatedRoleName:'Profesor',auxCode:''}]
]);
function normalizedSource(raw){
  return String(raw??'').replace(/\r\n?/g,'\n').replace(/\n$/,'');
}
export function identifySourceRole(raw){
  const header=normalizedSource(raw).split('\n',1)[0];
  const named=ROLE_HEADERS.get(header);
  if(named)return {...named};
  const match=header.match(MEMBER_HEADER);
  if(!match)return null;
  const id=Number(match[1]),category=match[2];
  // The configured identity is verified against the current account mapping by the backend.
  // Category is deliberately NOT inferred from the numeric code.
  return {role:'AUXILIARY',roleName:match[1]+category,identity:category,
    translatedRoleName:String(id)+(category.endsWith('男')?' M':' F'),auxCode:String(id)};
}
export function parseFixedTelegramMessage(raw){
  const source=normalizedSource(raw);
  const lines=source.split('\n');
  // Exactly one role header, one nonempty Chinese line, one nonempty
  // pre-written Romanian line. No old aliases, blank separators or extra text.
  if(lines.length!==3)return {ok:false,error:'SOURCE_FORMAT_INVALID'};
  const role=identifySourceRole(lines[0]);
  if(!role)return {ok:false,error:'ROLE_HEADER_INVALID'};
  const chineseOriginal=lines[1].trim();
  const romanianText=lines[2].trim();
  if(!chineseOriginal||!HAN.test(chineseOriginal))return {ok:false,error:'CHINESE_ORIGINAL_REQUIRED'};
  if(!romanianText||!LATIN.test(romanianText)||HAN_OR_CJK_PUNCTUATION.test(romanianText))
    return {ok:false,error:'ROMANIAN_LINE_INVALID'};
  return {ok:true,...role,chineseOriginal,romanianText};
}
export function textWithoutRole(raw){
  const source=normalizedSource(raw);
  const lines=source.split('\n');
  return identifySourceRole(lines[0])?lines.slice(1).join('\n').trim():'';
}
export function containsForbiddenChinese(value){
  return HAN_OR_CJK_PUNCTUATION.test(String(value??''));
}
export function extractPreparedText(raw){
  const parsed=parseFixedTelegramMessage(raw);
  return parsed.ok?parsed.romanianText:'';
}
export function normalizeTelegramUpdate(update,allowedChatIds){
  if(!update||typeof update!=='object')return null;
  const msg=update.message||update.channel_post;
  if(!msg||!msg.chat||!['group','supergroup','channel'].includes(msg.chat.type))return null;
  const chatId=String(msg.chat.id??'');
  if(!allowedChatIds.has(chatId))return null;
  const text=String(msg.text??msg.caption??'').trim();
  const photos=Array.isArray(msg.photo)?msg.photo:[];
  const best=photos.length?photos[photos.length-1]:null;
  const imageFileId=best?.file_id||(msg.document?.mime_type?.startsWith('image/')?msg.document.file_id:null);
  if(!text&&!imageFileId)return null;
  return {
    sourceChatId:chatId,sourceMessageId:String(msg.message_id??''),
    sourceSenderId:String(msg.from?.id??msg.sender_chat?.id??msg.chat.id),
    sourceThreadId:String(msg.message_thread_id??''),
    replyToMessageId:String(msg.reply_to_message?.message_id??''),
    text,mediaRef:imageFileId?'tgfile:'+String(imageFileId):'',
  };
}
