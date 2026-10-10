import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identifySourceRole, textWithoutRole, extractPreparedText, normalizeTelegramUpdate
} from '../telegram-collector.mjs';

test('资讯助理 attached-image caption retains only prepared lower Romanian text',()=>{
  const caption='资讯助理\n各位成员，大家早安☀️\n\n欢迎回到社群。AI Quant已经启动。\n\nBuna dimineata tuturor☀️\n\nBine ati revenit. AI Quant este gata.';
  assert.deepEqual(identifySourceRole(caption),{
    role:'ASSISTANT',roleName:'资讯助理',translatedRoleName:'Asistent informativ',auxCode:''
  });
  assert.equal(extractPreparedText(caption),'Buna dimineata tuturor☀️\n\nBine ati revenit. AI Quant este gata.');
  assert.equal(textWithoutRole(caption).startsWith('各位成员'),true);
  const msg=normalizeTelegramUpdate({
    channel_post:{chat:{id:-1001234,type:'channel'},message_id:101,sender_chat:{id:-1001234},
      photo:[{file_id:'original-tg-photo-ref'}],caption}
  },new Set(['-1001234']));
  assert.equal(msg.mediaRef,'tgfile:original-tg-photo-ref');
  assert.equal(msg.text,caption);
});

test('numbered male/female source labels preserve identity without forwarding Chinese',()=>{
  const man=identifySourceRole('45男\n早安！\n\nBuna dimineata!');
  const woman=identifySourceRole('2女\nAI Quant已准备好。\n\nAI Quant este gata.');
  assert.equal(man.role,'AUXILIARY');
  assert.equal(man.auxCode,'45');
  assert.equal(man.translatedRoleName,'45 M');
  assert.equal(woman.role,'AUXILIARY');
  assert.equal(woman.auxCode,'2');
  assert.equal(woman.translatedRoleName,'2 F');
  assert.equal(extractPreparedText('45男\n早安！\n\nBuna dimineata!'),'Buna dimineata!');
  assert.equal(extractPreparedText('2女\nAI Quant已准备好。\n\nAI Quant este gata.'),'AI Quant este gata.');
});

test('no image on a text post produces no media reference',()=>{
  const msg=normalizeTelegramUpdate({
    channel_post:{chat:{id:-1001234,type:'channel'},message_id:102,
      text:'45男\n你好\n\nBuna dimineata!'}
  },new Set(['-1001234']));
  assert.equal(msg.mediaRef,'');
});

test('no prepared translation and Chinese below translation are fail closed',()=>{
  assert.equal(extractPreparedText('资讯助理\n各位早上好。'),'');
  assert.equal(extractPreparedText('2女\n中文。\n\nBuna dimineata!\n还有中文。'),'');
});

test('English may remain mixed in already prepared Romanian',()=>{
  assert.equal(extractPreparedText('45男\n今日市场\n\nBuna dimineata! Good morning!'),'Buna dimineata! Good morning!');
});

test('unrecognized and out-of-range numbered roles are rejected',()=>{
  assert.equal(identifySourceRole('71男\n大家好'),null);
  assert.equal(identifySourceRole('未知名字\nBonjour'),null);
  assert.equal(identifySourceRole('未提供角色'),null);
});

test('messages from non-whitelisted group are ignored',()=>{
  const msg=normalizeTelegramUpdate({
    message:{chat:{id:-1005678,type:'supergroup'},message_id:100,text:'2女\nOK'}
  },new Set(['-1001234']));
  assert.equal(msg,null);
});
