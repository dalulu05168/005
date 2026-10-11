/* Daily queue-to-account seat planning. No network calls or messages.
 * The account IDs are server-owned routing decisions; account owner enrollment
 * must still be checked by the local connector before starting Chromium.
 */
import {identifySourceRole} from './telegram-collector.mjs';
const DONE=new Set(['ACKED','FAILED','CANCELLED']);
const PRIORITY=new Set(['ASSISTANT','PROFESSOR']);
export function resolveAccountForRole(role,accounts){
  const all=Array.isArray(accounts)?accounts:[];
  if(role.role==='ASSISTANT'||role.role==='PROFESSOR'){
    const matches=all.filter(a=>a.kind===role.role&&a.slot==='PRIMARY');
    return matches.length===1?matches[0]:null;
  }
  const id=String(Number(role.auxCode||0));
  const matches=all.filter(a=>a.kind==='AUXILIARY'&&a.slot==='PRIMARY'&&
    ([String(Number(a.auxCode||0)),...(Array.isArray(a.personaCodes)?a.personaCodes:[])
      .map(x=>String(Number(x)))].includes(id)));
  if(matches.length!==1)return null;
  const a=matches[0];
  if(a.identity!==role.identity)return null;
  return a;
}
export function createDailySeatPlan(items,accounts,{maxSeats=7}={}){
  if(!Array.isArray(items)||items.length<1||items.length>2000)
    throw Error('SEAT_PLAN_LENGTH_INVALID');
  const cap=Number(maxSeats);
  if(!Number.isInteger(cap)||cap<1||cap>7)throw Error('SEAT_CAPACITY_INVALID');
  const entries=items.map((raw,index)=>{
    const item=String(raw??'').trim();
    const header=item.endsWith('：')?item:item+'：';
    const role=identifySourceRole(header);
    if(!role)throw Error('SEAT_PLAN_ROLE_INVALID_AT_'+(index+1));
    const a=resolveAccountForRole(role,accounts);
    if(!a)throw Error('SEAT_PLAN_ACCOUNT_UNMAPPED_AT_'+(index+1));
    return {id:'step-'+(index+1),index,
      label:header.slice(0,-1),accountId:a.id,role:role.role,
      auxCode:role.auxCode||'',identity:role.identity||'',
      status:'WAITING_MESSAGE',taskIds:[]};
  });
  return {enabled:true,maxSeats:cap,cursor:0,entries};
}
export function findSeatPlanStep(plan,parsed){
  if(!plan?.enabled)return null;
  const pending=(plan.entries||[]).filter(x=>x.status==='WAITING_MESSAGE');
  if(!pending.length)return null;
  const matches=x=>x.role===parsed.role&&
    (x.role!=='AUXILIARY'||(x.auxCode===parsed.auxCode&&x.identity===parsed.identity));
  if(PRIORITY.has(parsed.role))return pending.find(matches)||null;
  return matches(pending[0])?pending[0]:null;
}
export function markSeatPlanReceived(step,taskIds){
  if(!step||step.status!=='WAITING_MESSAGE'||!Array.isArray(taskIds)||!taskIds.length)
    throw Error('SEAT_PLAN_STEP_NOT_RECEIVABLE');
  step.taskIds=[...new Set(taskIds)];
  step.status='IN_FLIGHT';
}
export function reconcileSeatPlan(plan,tasks){
  if(!plan?.enabled)return plan;
  const byId=new Map((Array.isArray(tasks)?tasks:[]).map(t=>[t.id,t]));
  for(const step of plan.entries||[]){
    if(step.status!=='IN_FLIGHT'||!step.taskIds?.length)continue;
    const members=step.taskIds.map(id=>byId.get(id));
    // Missing task != success; never advance on lost state.
    if(members.some(x=>!x))continue;
    if(members.every(t=>t.status==='ACKED'))step.status='ACKED';
    else if(members.some(t=>t.status==='FAILED'||t.status==='CANCELLED'))step.status='BLOCKED';
  }
  while(plan.cursor<plan.entries.length&&plan.entries[plan.cursor].status==='ACKED')plan.cursor++;
  return plan;
}
export function desiredSeatAccounts(plan,accounts,tasks){
  if(!plan?.enabled)return {enabled:false,desired:[],protectedAccountIds:[]};
  const cap=Math.max(1,Math.min(7,Number(plan.maxSeats)||7));
  const remaining=(plan.entries||[]).slice(plan.cursor).filter(x=>x.status!=='ACKED');
  const ids=[],add=id=>{if(id&&!ids.includes(id)&&ids.length<cap)ids.push(id)};
  // Keep high-frequency primary roles warm whenever they recur later today.
  for(const role of ['ASSISTANT','PROFESSOR']){
    if(remaining.some(x=>x.role===role)){
      const a=(accounts||[]).find(x=>x.kind===role&&x.slot==='PRIMARY');
      if(a)add(a.id);
    }
  }
  for(const step of remaining)add(step.accountId);
  const protectedIds=new Set();
  for(const t of tasks||[]){
    if(DONE.has(t.status))continue;
    const progress=(t.targets||[]).some(x=>x.status==='SENDING'||x.status==='VERIFYING'||x.status==='ACKED');
    if(!progress)continue;
    if(t.activeSenderId)protectedIds.add(t.activeSenderId);
    for(const x of t.targets||[])if(x.senderAccountId)protectedIds.add(x.senderAccountId);
  }
  return {enabled:true,desired:ids,protectedAccountIds:[...protectedIds],
    maxSeats:cap,cursor:plan.cursor,total:plan.entries.length};
}
