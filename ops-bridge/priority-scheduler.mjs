/* Pure scheduling rules for transparent Assistant/Professor priority messages.
 * Only process Telegram-originated, validated tasks. Never interrupt an active
 * or partially acknowledged multi-group send, and never bypass VERIFYING.
 */
const DONE=new Set(['ACKED','FAILED','CANCELLED']);
const PRIORITY=new Set(['ASSISTANT','PROFESSOR']);
const PENDING=new Set(['WAITING','SENDING','VERIFYING']);

export function isPriorityRole(role){
  return PRIORITY.has(String(role||'').toUpperCase());
}
export function selectNextDispatchTask(tasks){
  const pending=(Array.isArray(tasks)?tasks:[]).filter(t=>t&&!DONE.has(t.status));
  if(!pending.length)return null;
  // Unconfirmed deliveries always block new work, including priority messages.
  const uncertain=pending.find(t=>t.status==='VERIFYING'||
    (t.targets||[]).some(x=>x.status==='VERIFYING'));
  if(uncertain)return uncertain;
  const active=pending.find(t=>t.status==='SENDING'||
    (t.targets||[]).some(x=>x.status==='SENDING'));
  if(active)return active;
  // Multi-target task may be WAITING on another group after previous ACK.
  // It must finish atomically before another message can move ahead.
  const partial=pending.find(t=>(t.targets||[]).some(x=>x.status==='ACKED'));
  if(partial)return partial;
  // Equal priority Assistant and Professor preserve arrival order.
  // Ordinary messages preserve their original sequence when no priority waits.
  return pending.find(t=>isPriorityRole(t.role))||pending[0];
}

/* The seven-seat plan is separate from dispatch, which remains sequential.
 * 'pinned' means Assistant1/Professor1 are preferred for long-term reuse;
 * no seat may be evicted during SENDING or VERIFYING. */
export function planPrioritySeat(seats, account, maxSeats=7){
  if(!account?.id)return {action:'BLOCKED',reason:'ACCOUNT_NOT_CONFIGURED'};
  if(account.authorized!==true)return {action:'BLOCKED',reason:'ACCOUNT_NOT_AUTHORIZED'};
  const active=Array.isArray(seats)?seats:[];
  const cap=Math.min(7,Math.max(1,Number(maxSeats)||7));
  if(active.some(x=>x.accountId===account.id))return {action:'REUSE',accountId:account.id};
  if(active.length<cap)return {action:'FILL',accountId:account.id};
  if(!isPriorityRole(account.role))return {action:'WAIT',reason:'NO_FREE_SEAT'};
  const reclaim=active.find(x=>x.pinned!==true&&
    x.inFlight!==true&&x.verifying!==true&&x.pendingTargets!==true&&
    x.releasable===true);
  if(!reclaim)return {action:'WAIT',reason:'NO_SAFE_SEAT_TO_RELEASE'};
  return {action:'REPLACE_AFTER_RELEASE',accountId:account.id,releaseAccountId:reclaim.accountId};
}
