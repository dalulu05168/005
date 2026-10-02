const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {root,releaseFiles}=require('./release-files.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function verifyRelease(baseUrl){
  const base=new URL(baseUrl);
  if(!['https:','http:'].includes(base.protocol))throw new Error('HTTP URL required');
  if(!base.pathname.endsWith('/'))base.pathname+='/';
  const expected=JSON.parse(fs.readFileSync(path.join(root,'dist/pages/release.json'),'utf8'));
  const read=async file=>{
    const url=new URL(file,base);url.searchParams.set('release-check',Date.now());
    const r=await fetch(url,{signal:AbortSignal.timeout(10000),cache:'no-store'});
    if(!r.ok)throw new Error(file+' HTTP '+r.status);
    return Buffer.from(await r.arrayBuffer());
  };
  const release=JSON.parse((await read('release.json')).toString());
  if(release.sourceSha!==expected.sourceSha)throw new Error('SOURCE_MISMATCH '+release.sourceSha+' != '+expected.sourceSha);
  const files=releaseFiles();
  for(const file of files){
    const local=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
    const remote=crypto.createHash('sha256').update(await read(file)).digest('hex');
    if(remote!==local||release.files?.[file]!==local)throw new Error('HASH_MISMATCH '+file);
  }
  return {url:base.href,sourceSha:expected.sourceSha,files:files.length};
}
async function main(){
  const url=process.argv[2];if(!url)throw new Error('Usage: node scripts/verify-release.cjs URL');
  const attempts=Number(process.env.RELEASE_CHECK_ATTEMPTS||1);
  if(!Number.isInteger(attempts)||attempts<1||attempts>60)throw new Error('Invalid attempts');
  for(let i=1;i<=attempts;i++){
    try{console.log(JSON.stringify({release:'PASS',...await verifyRelease(url)}));return}
    catch(e){console.error('Release check '+i+'/'+attempts+': '+e.message);if(i===attempts)throw e;await wait(10000)}
  }
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={verifyRelease};
