// Deterministic rolling-seat decisions. No WhatsApp operations or messages here.
// Server may protect SENDING/VERIFYING accounts; a protected account is never evicted.
export function planSeatMoves({active=[],desired=[],protectedIds=[],maxActive=7}={}){
  const cap=Math.max(1,Math.min(7,Number(maxActive)||7));
  const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
  const uniq=xs=>[...new Set((Array.isArray(xs)?xs:[]).filter(valid))];
  const running=uniq(active);
  const target=uniq(desired).slice(0,cap);
  const protectedSet=new Set(uniq(protectedIds));
  const keep=new Set(target);
  const release=running.filter(id=>!keep.has(id)&&!protectedSet.has(id));
  const remain=running.filter(id=>!release.includes(id));
  const available=Math.max(0,cap-remain.length);
  const fill=target.filter(id=>!remain.includes(id)).slice(0,available);
  const blocked=target.filter(id=>!remain.includes(id)&&!fill.includes(id));
  return {release,fill,blocked,cap};
}
