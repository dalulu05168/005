import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identifySourceRole,parseFixedTelegramMessage,textWithoutRole,
  extractPreparedText,normalizeTelegramUpdate
} from '../telegram-collector.mjs';

const example='45老男：\n早上好.............\nBună dimineața! Astăzi urmărim evoluția pieței.';
test('45老男 unique fixed format maps to account code 45; only Romanian is outbound',()=>{
  const parsed=parseFixedTelegramMessage(example);
  assert.equal(parsed.ok,true);
  assert.equal(parsed.role,'AUXILIARY');
  assert.equal(parsed.auxCode,'45');
  assert.equal(parsed.roleName,'45老男');
  assert.equal(parsed.chineseOriginal,'早上好.............');
  assert.equal(parsed.romanianText,'Bună dimineața! Astăzi urmărim evoluția pieței.');
  assert.equal(extractPreparedText(example),parsed.romanianText);
  assert.equal(textWithoutRole(example),'早上好.............\n'+parsed.romanianText);
});
test('assistant and professor share the same exact three-line grammar',()=>{
  for(const [name,role] of [['助理','ASSISTANT'],['教授','PROFESSOR']]){
    const m=parseFixedTelegramMessage(name+'：\n大家好。\nBună ziua!');
    assert.equal(m.role,role);assert.equal(m.romanianText,'Bună ziua!');
    assert.equal(m.auxCode,'');
  }
});
test('all 70 codes map to only one identity category per code',()=>{
  const expected=n=>n<=10?'老女':n<=30?'新女':n<=50?'老男':'新男';
  for(let i=1;i<=70;i++){
    const code=String(i).padStart(2,'0');
    const p=parseFixedTelegramMessage(code+expected(i)+'：\n早上好。\nBună dimineața!');
    assert.equal(p.ok,true,code);
    assert.equal(p.auxCode,String(i));
    for(const other of ['老女','新女','老男','新男'].filter(v=>v!==expected(i))){
      assert.equal(identifySourceRole(code+other+'：\n早上好。\nBună dimineața!'),null,code+other);
    }
  }
});
test('legacy aliases, ASCII colons, missing zero and spaces are all rejected',()=>{
  for(const first of [
    '45男：','辅助45：','资讯助理：','资讯教授：','45老男:','45 老男：',
    '5老女：','05 老女：','01新女：','31新男：','70老男：','71新男：',
    '45老男','45老男 ：','45老男：你好','助理:','教授： '
  ]){
    assert.equal(parseFixedTelegramMessage(first+'\n你好。\nBună dimineața!').ok,false,first);
  }
});
test('one and only one Chinese + one Romanian line, with no blank separators',()=>{
  for(const malformed of [
    '45老男：\nBună dimineața!',
    '45老男：\n\n早上好。\nBună dimineața!',
    '45老男：\n早上好。\n\nBună dimineața!',
    '45老男：\n早上好。\nBună dimineața!\nAnything else',
    '45老男：\n早上好。\n欢迎光临。',
    '45老男：\n早上好。\nBună dimineața! 中午好',
    '45老男：\n...........\nBună dimineața!',
    '45老男：\n早上好。\n......'
  ]){
    assert.equal(parseFixedTelegramMessage(malformed).ok,false,malformed);
    assert.equal(extractPreparedText(malformed),'');
  }
});
test('accept CRLF from Telegram; allow a single final newline',()=>{
  assert.equal(parseFixedTelegramMessage(example.replace(/\n/g,'\r\n')+'\r\n').ok,true);
});
test('do not invent translation or forward the Chinese line',()=>{
  assert.equal(extractPreparedText('45老男：\n市场观察：上涨。\n'), '');
  assert.equal(extractPreparedText('45老男：\n中文\n中文'), '');
});
test('image caption is parsed without inspecting image bytes',()=>{
  const obj=normalizeTelegramUpdate({channel_post:{
    chat:{id:-1001234,type:'channel'},message_id:101,
    photo:[{file_id:'actual-tg-photo'}],caption:example
  }},new Set(['-1001234']));
  assert.equal(obj.mediaRef,'tgfile:actual-tg-photo');
  assert.equal(parseFixedTelegramMessage(obj.text).auxCode,'45');
  assert.equal(obj.sourceMessageId,'101');
});
test('ignore Telegram source groups that are not whitelisted',()=>{
  const obj=normalizeTelegramUpdate({message:{
    chat:{id:-1005678,type:'supergroup'},message_id:22,text:example
  }},new Set(['-1001234']));
  assert.equal(obj,null);
});

test('collector server cannot override canonical role or text using an API parameter',async()=>{
  const {readFile}=await import('node:fs/promises');
  const backend=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const start=backend.indexOf('function parseTelegram(input){');
  const end=backend.indexOf('function verifiedForwardReceipt(',start);
  assert.ok(start>=0&&end>start);
  const safeString=(s,max=500)=>String(s??'').trim().slice(0,max);
  const parseTelegram=Function('safeString','parseFixedTelegramMessage',
    backend.slice(start,end)+'\nreturn parseTelegram')(safeString,parseFixedTelegramMessage);
  assert.equal(parseTelegram({text:example}).ok,true);
  assert.equal(parseTelegram({text:example,role:'PROFESSOR'}).error,'TELEGRAM_ROLE_OR_TEXT_MISMATCH');
  assert.equal(parseTelegram({text:example,auxCode:'66'}).error,'TELEGRAM_ROLE_OR_TEXT_MISMATCH');
  assert.equal(parseTelegram({text:example,romanianText:'Wrong destination text'}).error,'TELEGRAM_ROLE_OR_TEXT_MISMATCH');
  assert.equal(parseTelegram({text:'45男：\n早上好。\nBună dimineața!',role:'AUXILIARY',auxCode:'45'}).ok,false);
  assert.equal(parseTelegram({text:example}).romanianText,'Bună dimineața! Astăzi urmărim evoluția pieței.');
});
test('server rejects messages when no target WhatsApp groups are enabled',async()=>{
  const {readFile}=await import('node:fs/promises');
  const backend=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const index=backend.indexOf('NO_ENABLED_WHATSAPP_TARGET_GROUPS');
  assert.ok(index>=0);
  assert.ok(backend.slice(index-220,index).includes("some(g=>g.enabled)"));
});

test('dispatch text is exactly the third line, with no Chinese and no role heading',async()=>{
 const {readFile}=await import('node:fs/promises');
 const backend=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
 assert.ok(backend.includes("outboundText:head.messageType==='IMAGE'?'':(head.romanianText||''),"));
 assert.ok(!backend.includes("outboundText:head.messageType==='IMAGE'?'':outboundRoleName(head)+"));
});
