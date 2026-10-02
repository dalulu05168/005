const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {root,releaseFiles}=require('./release-files.cjs');
const output=path.join(root,'dist/pages');
const files=releaseFiles();
const sourceSha=process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||
  execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
const hashes={};
for(const file of files){
  const content=fs.readFileSync(path.join(root,file));
  const target=path.join(output,file);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,content);
  hashes[file]=crypto.createHash('sha256').update(content).digest('hex');
}
fs.writeFileSync(path.join(output,'.nojekyll'),'');
fs.writeFileSync(path.join(output,'release.json'),JSON.stringify({sourceSha,files:hashes},null,2)+'\n');
console.log(JSON.stringify({output,sourceSha,files:files.length}));
