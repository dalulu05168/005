import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelegramSource} from '../telegram-user-source.mjs';

const KEY='nuvexa:source:telegram:user:v1';
const eventText='资讯助理\n市场早报。\n\nBună dimineața!';
function harness(twoFactor=false){
  const table=new Map();
  const redis={get:async key=>table.get(key)||null,set:async(key,v)=>{table.set(key,v);return 'OK'},del:async key=>Number(table.delete(key))};
  const collected=[];
  let instance;
  class MockSession{
    constructor(text=''){this.text=text}
    save(){return 'test-session-credential-never-plaintext'}
  }
  class MockClient{
    constructor(){instance=this;this.session=new MockSession();this.authorized=false;this.disconnected=false}
    async connect(){}
    async disconnect(){this.disconnected=true}
    async checkAuthorization(){return this.authorized}
    async sendCode(){return {phoneCodeHash:'server-side-only-hash',isCodeViaApp:true}}
    async invoke(){
      if(twoFactor&&!this.twoFactorComplete)throw Object.assign(Error('SESSION_PASSWORD_NEEDED'),{errorMessage:'SESSION_PASSWORD_NEEDED'});
      this.authorized=true;return {user:{id:'123'}}
    }
    async signInWithPassword(_creds,params){
      assert.equal(await params.password(),'test-two-factor');
      this.twoFactorComplete=true;this.authorized=true
    }
    async getMe(){return {id:'123'}}
    addEventHandler(listener){this.listener=listener}
    async getDialogs(){return [{id:'-100987654',title:'指定来源群',entity:'mock-entity',isChannel:true}]}
    async getMessages(){return [{photo:{},id:25}]}
    async downloadMedia(){return Buffer.from([0xff,0xd8,0xff,0xd9])}
    async logOut(){this.disconnected=true}
  }
  const gram=async()=>({TelegramClient:MockClient,StringSession:MockSession,NewMessage:class {},Api:{auth:{SignIn:class {}}}});
  const source=createTelegramSource({redis,secret:'test-secret-with-entropy-for-the-demo',clientLibrary:gram,ingest:async msg=>{collected.push(msg)}});
  return {source,table,collected,getClient:()=>instance};
}
test('phone validation happens before contacting Telegram',async()=>{
  const {source}=harness();
  await assert.rejects(source.begin({apiId:0,apiHash:'x',phone:'000'}),/INVALID_API_CREDENTIALS_OR_PHONE/);
});
test('user login is explicitly gated and encryption never exposes session',async()=>{
  const {source,table,collected,getClient}=harness();
  assert.equal(source.status().enabled,false);
  const pending=await source.begin({apiId:12345,apiHash:'a'.repeat(32),phone:'+60123456789'});
  assert.equal(pending.stage,'code');
  await assert.rejects(source.choose({chatId:'-100987654',enabled:true}),/TELEGRAM_NOT_CONNECTED/);
  const verified=await source.verifyCode('12345');
  assert.equal(verified.connected,true);
  assert.equal(verified.enabled,false);
  assert.ok(table.get(KEY));
  assert.equal(table.get(KEY).includes('test-session-credential-never-plaintext'),false);
  assert.equal(table.get(KEY).includes('+60123456789'),false);
  const groupList=await source.listGroups();
  assert.deepEqual(groupList,[{id:'-100987654',title:'指定来源群'}]);
  getClient().listener({chatId:'-100987654',message:{id:23,message:eventText,photo:{},senderId:'33'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(collected.length,0);
  await source.choose({chatId:'-100987654',enabled:true});
  getClient().listener({chatId:'-100999',message:{id:24,message:eventText,photo:{}}});
  getClient().listener({chatId:'-100987654',message:{id:25,message:eventText,photo:{},senderId:'33'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(collected.length,1);
  assert.equal(collected[0].mediaRef,'tgmsg:-100987654:25');
  assert.equal((await source.download('tgmsg:-100987654:25')).bytes.length,4);
  await assert.rejects(source.download('tgmsg:-100999:25'),/MEDIA_NOT_FROM_SELECTED_SOURCE/);
  await source.pause();
  getClient().listener({chatId:'-100987654',message:{id:26,message:eventText}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(collected.length,1);
  await source.disconnect();
  assert.equal(table.has(KEY),false);
  assert.equal(source.status().connected,false);
});
test('two-step verification does not expose or persist the 2FA password',async()=>{
  const {source,table}=harness(true);
  await source.begin({apiId:12345,apiHash:'a'.repeat(32),phone:'+60123456789'});
  const intermediate=await source.verifyCode('12345');
  assert.equal(intermediate.stage,'password');
  const finished=await source.verifyPassword('test-two-factor');
  assert.equal(finished.connected,true);
  assert.equal(finished.stage,'');
  assert.equal(table.get(KEY).includes('test-two-factor'),false);
  await source.disconnect();
});
