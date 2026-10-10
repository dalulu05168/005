/* Telegram group collector helpers. Image bytes are never inspected or translated. */
const HAN_OR_CJK_PUNCTUATION=/[\p{Script=Han}\u3000-\u303f\uff00-\uff65\ufe10-\ufe1f\ufe30-\ufe4f]/u;
const ROLE_PREFIX=/^\s*(助理|教授|辅助(?:号)?\s*[0-9]{1,3})(?=\s|[:：]|$)/m;

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
