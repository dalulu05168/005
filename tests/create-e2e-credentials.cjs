// Provision only this run's test account using GitHub's signed workload identity.
const fs=require('node:fs');const crypto=require('node:crypto');
(async()=>{
 const action=process.argv[2]==='cleanup'?'cleanup':'provision';
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience','chennan-e2e');
 const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});
 if(!response.ok)throw new Error('GitHub identity request failed');
 const identity=(await response.json()).value;
 let verifier={action};
 if(action==='provision'){
  const username='e2e_'+process.env.GITHUB_RUN_ID+'_'+process.env.GITHUB_RUN_ATTEMPT,password=crypto.randomBytes(32).toString('base64url'),salt=crypto.randomBytes(16).toString('base64'),iterations=210000;
  fs.writeFileSync('/tmp/chennan-e2e.json',JSON.stringify({username,password}),{mode:0o600});
  verifier={action,salt,iterations,hash:crypto.pbkdf2Sync(password,Buffer.from(salt,'base64'),iterations,32,'sha256').toString('base64')};
 }
 const r=await fetch('https://afelbznpwltuebmqmqbh.supabase.co/functions/v1/workspace-e2e',{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_J548-tZcZAxnUF4HD-VPEA_Gepy26Ec',Authorization:'Bearer '+identity},body:JSON.stringify(verifier)});
 const data=await r.json();if(!r.ok||!data.ok)throw new Error(action+' HTTP '+r.status+': '+data.error);
 console.log(JSON.stringify({action,ok:true,username:data.username}));
 if(action==='cleanup')fs.rmSync('/tmp/chennan-e2e.json',{force:true});
})().catch(e=>{console.error(e.message);process.exitCode=1});
