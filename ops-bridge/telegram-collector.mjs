/* Telegram group collector helpers. Image bytes are never inspected or translated. */
const HAN_OR_CJK_PUNCTUATION=/[\p{Script=Han}\u3000-\u303f\uff00-\uff65\ufe10-\ufe1f\ufe30-\ufe4f]/u;
const ROLE_PREFIX=/^\s*(资讯助理|资讯教授|助理|教授|辅助(?:号)?\s*[0-9]{1,3}|[0-9]{1,3}\s*[男女])(?=\s|[:：]|$)/mu;

export function identifySourceRole(raw) {
  const source=String(raw??'');
  const match=source.match(ROLE_PREFIX);
  if(!match)return null;
  const label=match[1].replace(/\s+/g,'');
  if(label==='资讯助理')return {role:'ASSISTANT',roleName:label,translatedRoleName:'Asistent informativ',auxCode:''};
  if(label==='助理')return {role:'ASSISTANT',roleName:label,translatedRoleName:'Asistent',auxCode:''};
  if(label==='资讯教授')return {role:'PROFESSOR',roleName:label,translatedRoleName:'Profesor',auxCode:''};
  if(label==='教授')return {role:'PROFESSOR',roleName:label,translatedRoleName:'Profesor',auxCode:''};
  const numbered=label.match(/^([0-9]{1,3})([男女])$/u);
  if(numbered){
    const num=Number(numbered[1]);
    if(num<1||num>70)return null;
    return {role:'AUXILIARY',roleName:label,translatedRoleName:String(num)+(numbered[2]==='男'?' M':' F'),auxCode:String(num)};
  }
  const aux=label.match(/^辅助(?:号)?([0-9]{1,3})$/u);
  if(aux)return {role:'AUXILIARY',roleName:label,translatedRoleName:'Asistent auxiliar '+Number(aux[1]),auxCode:String(Number(aux[1]))};
  return null;
}

export function normalizeTelegramUpdate(update, allowedChatIds) {
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
    sourceChatId:chatId,
    sourceMessageId:String(msg.message_id??''),
    sourceSenderId:String(msg.from?.id??msg.sender_chat?.id??msg.chat.id),
    sourceThreadId:String(msg.message_thread_id??''),
    replyToMessageId:String(msg.reply_to_message?.message_id??''),
    text,
    mediaRef:imageFileId?'tgfile:'+String(imageFileId):'',
  };
}

export function textWithoutRole(raw) {
  const source=String(raw??'').trim();
  return source.replace(ROLE_PREFIX,'').replace(/^\s*[:：\-]?\s*/,'').trim();
}

export function containsForbiddenChinese(s) {
  return HAN_OR_CJK_PUNCTUATION.test(String(s??''));
}

/** Extract the supplied text from BELOW the Chinese original, without translating. */
export function extractPreparedText(raw) {
  const content=textWithoutRole(raw).replace(/\r\n?/g,'\n').trim();
  if(!content)return '';
  const lines=content.split('\n');
  let finalOriginal=-1;
  for(let i=0;i<lines.length;i++){
    if(containsForbiddenChinese(lines[i]))finalOriginal=i;
  }
  // If the original already contains no Chinese, preserve all of it.
  // English is allowed, including when mixed into the already prepared Romanian.
  const translated=lines.slice(finalOriginal+1)
    .join('\n')
    .replace(/^\s*(?:Română|Romana|Romanian|Traducere|Translation)\s*:\s*/i,'')
    .trim();
  // Never cut Chinese characters out of a mixed-language line and guess what remains.
  return translated&&!containsForbiddenChinese(translated)?translated:'';
}
