const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const {root,releaseFiles}=require('../scripts/release-files.cjs');
const {verifyRelease}=require('../scripts/verify-release.cjs');
test('release verifier rejects altered payloads even with a matching source commit',async()=>{
  execFileSync(process.execPath,['scripts/build-static.cjs'],{cwd:root});
  let tamper=false,missing=false;
  const server=http.createServer((req,res)=>{
    const file=new URL(req.url,'http://localhost').pathname.slice(1);
    if(missing&&file==='release.json'){res.writeHead(404);res.end();return}
    const content=fs.readFileSync(path.join(root,'dist/pages',file));
    res.end(tamper&&file==='auth.js'?Buffer.concat([content,Buffer.from('\n/* changed */')]):content);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/';
  try{
    assert.equal((await verifyRelease(url)).files,releaseFiles().length);
    tamper=true;await assert.rejects(verifyRelease(url),/HASH_MISMATCH auth.js/);
    tamper=false;missing=true;await assert.rejects(verifyRelease(url),/release.json HTTP 404/);
    assert.equal(fs.existsSync(path.join(root,'dist/pages/supabase')),false);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
