/* Trading simulation v2: stock offer -> recommend people -> invite/reject -> buy -> holdings -> sell. */
(function(){
'use strict';

const OKEY='sim-v2';
let activeOfferId=null;

function el(id){return document.getElementById(id)}
function qsa(s){return [...document.querySelectorAll(s)]}
function h(v){return String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function day(d){const x=d?new Date(d):new Date();return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
function dt(d){if(!d)return'--';const x=new Date(d);return Number.isNaN(x.getTime())?'--':x.toLocaleString('zh-CN',{hour12:false})}
function nm(p){return p?(p.name||p.frenchName||p.id):'未知人物'}
function sex(p){return p?.gender||pGender(p)||''}
function rel(p){return pRelationName(p)||''}
function vip(p){return !!p?.vip?.is_vip}
function vipLevel(p){return vip(p)?String(p?.vip?.level||'VIP').toUpperCase():''}
function vipBadge(p){const level=vipLevel(p);if(!level)return'';const n=(level.match(/\d+/)||['x'])[0];return '<span class="vip-level vip-level-'+h(n)+'">'+h(level)+'</span>'}
function opened(p){return !!p?.account?.opened}
function initials(p){return nm(p).split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}
function money(v,currency='USD'){const n=Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});return currency==='EUR'?'€'+n:currency==='CNY'?'¥'+n:currency==='HKD'?'HK$'+n:'$'+n}
function ensure(){
  db.tradeSim=db.tradeSim&&typeof db.tradeSim==='object'?db.tradeSim:{};
  db.tradeSim.offers=Array.isArray(db.tradeSim.offers)?db.tradeSim.offers:[];
  db.tradeSim.recommendations=Array.isArray(db.tradeSim.recommendations)?db.tradeSim.recommendations:[];
  db.portfolio=db.portfolio&&typeof db.portfolio==='object'?db.portfolio:{};
  db.portfolio.holdings=Array.isArray(db.portfolio.holdings)?db.portfolio.holdings:[];
  db.portfolio.buyPlans=Array.isArray(db.portfolio.buyPlans)?db.portfolio.buyPlans:[];
}
function contactCount(p){const base=Math.max(0,Number(p?.crm?.contact_count)||0);return base+db.records.filter(r=>String(r.personId)===String(p.id)&&r.type==='联系记录').length}
function leaderFor(p){
  const gs=(db.customGroups||[]).filter(g=>(g.members||[]).includes(String(p.id)));
  return gs.map(g=>g.leader).filter(Boolean).join(' / ')||'未设置';
}
function todayPlans(){
  ensure();const d=day();
  return db.portfolio.buyPlans.filter(x=>x.date===d&&x.status==='planned');
}
function currentHoldings(pid){
  ensure();return db.portfolio.holdings.filter(x=>x.status!=='sold'&&(!pid||String(x.personId)===String(pid)));
}
function score(p){
  const freq=p.trade_profile?.participation_frequency;
  const f=freq==='HIGH'?30:freq==='LOW'?10:20;
  const noHold=currentHoldings(p.id).length?0:15;
  const required=p.trade_profile?.required_today?50:0;
  return required+f+noHold+(pEnthusiasm(p)||0)/10+Math.min(10,contactCount(p));
}
function offer(id){ensure();return db.tradeSim.offers.find(x=>x.id===id)||null}
function recommendationFor(offerId){ensure();return db.tradeSim.recommendations.find(x=>x.offerId===offerId&&x.date===day())||null}
function remaining(ms){
  if(ms<=0)return'已满足持有时限';
  const mins=Math.floor(ms/60000),days=Math.floor(mins/1440),hours=Math.floor((mins%1440)/60),m=mins%60;
  return (days?days+'天 ':'')+(hours?hours+'小时 ':'')+m+'分';
}
function sellAt(hd,buyAt){return new Date(new Date(buyAt).getTime()+Number(hd||0)*86400000).toISOString()}
function holdingStatus(hd){
  const end=hd.plannedSellAt?new Date(hd.plannedSellAt).getTime():Infinity;
  const left=end-Date.now();
  if(left<=0)return{key:'ready',label:'可卖出',left};
  if(left<=12*3600000)return{key:'soon',label:'临近到期',left};
  return{key:'holding',label:'持有中',left};
}
function stockKey(hd){return hd.batchId||hd.id||((hd.offerId||'legacy')+'|'+(hd.symbol||'')+'|'+String(hd.buyAt||''))}
// Currency values are independent; preference input takes precedence over imported finance.
function personBudget(p,currency){
  const code=String(currency||'USD').toUpperCase();
  const raw=p?.trade_profile?.available_funds?.[code] ?? p?.finance?.available_capital_by_currency?.[code] ?? p?.finance?.[({USD:'available_investment_capital_usd',EUR:'available_investment_capital_eur',CNY:'available_investment_capital_cny',HKD:'available_investment_capital_hkd'})[code]];
  return raw==null||raw===''||!Number.isFinite(Number(raw))?null:Number(raw);
}

function fundingState(p,o){const need=Number(o.minShares||0)*Number(o.unitPrice||0),budget=personBudget(p,o.currency||'USD');return{need,budget,ok:budget==null||budget>=need,known:budget!=null}}

function setupUI(){
  ensure();
  const nav=document.querySelector('.nav');
  // Keep manual planning accessible alongside simulated stock recommendations.
  if(nav&&!nav.querySelector('[data-page="tradeRecommend"]')){
    const a=document.createElement('button');a.dataset.page='tradeRecommend';a.innerHTML='<i>✦</i><span>人物交易列表</span>';a.onclick=()=>{go('tradeRecommend');renderRecommend()};
    const b=document.createElement('button');b.dataset.page='holdingsV2';b.innerHTML='<i>▥</i><span>持仓管理</span>';b.onclick=()=>{go('holdingsV2');renderHoldings()};
    const groups=nav.querySelector('[data-page="groups"]');if(groups){groups.after(b);groups.after(a)}else{nav.append(a,b)}
  }
  const main=document.querySelector('.main');
  if(!el('tradeRecommend')){
    const s=document.createElement('section');s.id='tradeRecommend';s.className='section';
    s.innerHTML='<div id="tradeRecommendBody"></div>';main.appendChild(s);
  }
  if(!el('holdingsV2')){
    const s=document.createElement('section');s.id='holdingsV2';s.className='section';
    s.innerHTML='<div id="holdingsV2Body"></div>';main.appendChild(s);
  }
  if(!el('simStyles')){
    const st=document.createElement('style');st.id='simStyles';
    st.textContent='.offer-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.offer-stat{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fafbfe}.offer-stat span{display:block;font-size:11px;color:var(--muted)}.offer-stat b{display:block;font-size:17px;margin-top:3px}.candidate-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.candidate-card{border:1px solid var(--line);border-radius:15px;padding:15px;background:#fff;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center}.gender-avatar{width:50px;height:50px;border-radius:16px;display:grid;place-items:center;font-weight:900;font-size:15px}.gender-avatar.f{background:#ffe7f2;color:#c24279}.gender-avatar.m{background:#e6efff;color:#3260c8}.candidate-card .meta{color:var(--muted);font-size:12px;margin-top:4px}.candidate-card .actions{justify-content:flex-end}.candidate-card.invited{border-color:#91d5bd;background:#f5fffb}.candidate-card.rejected{opacity:.58;background:#f7f7f8}.candidate-card.bought{border-color:#8fa7ff;background:#f6f8ff}.offer-list{display:grid;gap:10px}.offer-row{display:flex;justify-content:space-between;gap:15px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:12px}.offer-row.active{border-color:#9eb1ff;background:#f7f9ff}.stock-chart-heading{align-items:flex-start}.stock-chart-heading p{margin:8px 0 0;font-size:12px;max-width:680px}.stock-chart-axis{font-size:12px;color:var(--muted);margin-bottom:10px}.hold-chart{display:flex;align-items:flex-end;gap:16px;min-height:294px;padding:16px 12px 12px;border:1px solid var(--line);border-radius:14px;overflow-x:auto;background:var(--paper)}.hold-bar-wrap{flex:0 0 100px;display:flex;flex-direction:column;align-items:center}.hold-bar-count{font-size:14px;font-weight:800;color:var(--ink);margin-bottom:8px}.hold-bar{flex:none;width:54px;border-radius:6px 6px 0 0;background:var(--blue);transition:none}.hold-bar.ready{background:var(--green)}.hold-bar.soon{background:var(--amber)}.hold-bar-label{font-size:11px;text-align:center;margin-top:8px;width:100%;min-height:55px;overflow-wrap:anywhere}.hold-bar-label b,.hold-bar-label span{display:block}.hold-bar-label b{font-size:13px;color:var(--ink)}.hold-bar-label span{color:var(--muted);margin-top:2px}.stock-chart-legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;color:var(--muted);font-size:12px}.stock-ready{color:var(--green);font-weight:900}.stock-soon{color:var(--amber);font-weight:900}.stock-holding{color:var(--blue);font-weight:900}.batch-card{border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:10px}.batch-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.person-mini{display:flex;gap:9px;align-items:center;border:1px solid var(--line);border-radius:11px;padding:9px}.person-mini .gender-avatar{width:38px;height:38px;border-radius:12px}.person-mini-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:12px}@media(max-width:1100px){.candidate-grid{grid-template-columns:1fr}.person-mini-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.offer-grid{grid-template-columns:repeat(2,1fr)}.candidate-card{grid-template-columns:auto 1fr}.candidate-card .actions{grid-column:1/-1}.person-mini-grid{grid-template-columns:1fr}}';
    document.head.appendChild(st);
  }
}

function renderRecommend(){
  ensure();setupUI();
  const body=el('tradeRecommendBody');if(!body)return;
  const offers=[...db.tradeSim.offers].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  if(!activeOfferId&&offers[0])activeOfferId=offers[0].id;
  const o=offer(activeOfferId),rec=o?recommendationFor(o.id):null;
  const todayCount=todayPlans().length;
  const invited=rec?rec.candidates.filter(x=>x.status==='invited').length:0;
  const bought=rec?rec.candidates.filter(x=>x.status==='bought').length:0;

  const planRows=offers.length?offers.map(function(x){
    const active=x.id===activeOfferId?' active':'';
    return '<div class="trade-plan-row'+active+'" data-offer-row="'+h(x.id)+'">'+
      '<div class="trade-plan-main"><div class="trade-plan-title"><b>'+h(x.symbol)+'</b><span>'+h(x.name)+'</span></div>'+
      '<div class="trade-plan-meta"><span>'+h(x.market||'美股')+'</span><span>折扣 '+h(x.discountPct)+'%</span><span>单价 '+money(x.unitPrice,x.currency||'USD')+'</span><span>最低 '+h(x.minShares)+' 股</span><span>持有 '+h(x.holdDays)+' 天</span><span>目标 '+h(x.participantCount)+' 人</span></div></div>'+
      '<div class="trade-plan-actions"><button class="link-btn" data-offer-open="'+h(x.id)+'">打开</button><button class="link-btn" data-offer-edit="'+h(x.id)+'">编辑</button></div>'+
    '</div>';
  }).join(''):'<div class="empty">还没有股票计划</div>';

  body.innerHTML=
    '<div class="topbar"><div><div class="eyebrow">INVESTOR TRANSACTIONS</div><h1 class="page-title">人物交易</h1><p class="sub">管理股票计划、计划参数、推荐购买人物，以及邀请、拒绝和确认买入结果。</p></div><div class="actions"><button class="btn primary" id="newOffer">＋ 新建股票计划</button></div></div>'+
    '<div class="trade-recommend-top">'+
      '<section class="card panel trade-plan-panel"><div class="panel-head"><h2>股票计划</h2><span class="muted">'+offers.length+' 个计划</span></div><div class="trade-plan-list">'+planRows+'</div></section>'+
      '<section class="card panel trade-current-panel"><div class="panel-head"><h2>当前计划</h2><span class="muted">'+(o?'计划已选择':'未选择')+'</span></div>'+
        (o?offerInfo(o):'<div class="empty">请先新建或选择股票计划</div>')+
      '</section>'+
    '</div>'+
    '<section class="card panel trade-recommend-people">'+
      '<div class="panel-head"><div><h2>推荐购买人物</h2><p class="muted">基于开户、资金条件与今日待买名单生成推荐结果。</p></div>'+
      '<div class="trade-recommend-head-actions"><span class="trade-summary-chip">今日待买 '+todayCount+'</span><span class="trade-summary-chip">已邀请 '+invited+'</span><span class="trade-summary-chip">已买入 '+bought+'</span>'+
      (o?'<button class="btn primary" id="recommendPeople">一键推荐购买人物</button>':'')+'</div></div>'+
      (o?(rec?renderCandidates(o,rec):'<div class="empty">当前计划尚未生成推荐名单</div>'):'<div class="empty">选择股票计划后可生成推荐购买人物</div>')+
    '</section>';
  bindRecommend();
}
function offerInfo(o){
  const minMoney=Number(o.minShares||0)*Number(o.unitPrice||0);
  return '<div class="trade-current-summary"><div class="trade-current-title"><b>'+h(o.symbol)+'</b><span>'+h(o.name)+'</span></div>'+
    '<div class="offer-grid">'+
      stat('市场',o.market||'美股')+
      stat('币种',o.currency||'USD')+
      stat('折扣占比',o.discountPct+'%')+
      stat('单价',money(o.unitPrice,o.currency||'USD'))+
      stat('最低购买',o.minShares+' 股')+
      stat('持有时限',o.holdDays+' 天')+
      stat('购买人数',o.participantCount+' 人')+
      stat('最低资金',money(minMoney,o.currency||'USD'))+
    '</div></div>';
}
function stat(k,v){return'<div class="offer-stat"><span>'+h(k)+'</span><b>'+h(v)+'</b></div>'}
function renderCandidates(o,rec){
  const people=rec.candidates.map(c=>({c,p:person(c.personId)})).filter(x=>x.p);
  if(!people.length)return '<div class="empty">没有符合当前计划条件的人物</div>';
  return '<div class="trade-candidate-table"><div class="trade-candidate-head"><span>人物</span><span>分类</span><span>VIP</span><span>资金状态</span><span>推荐来源</span><span>当前状态</span><span>操作</span></div>'+
  people.map(({c,p})=>{
    const fs=fundingState(p,o),statusLabel=c.status==='pending'?'待确认':c.status==='invited'?'已邀请':c.status==='rejected'?'已拒绝':'已确认买入';
    const cls=c.status==='invited'?' invited':c.status==='rejected'?' rejected':c.status==='bought'?' bought':'';
    const fund=fs.known?(fs.ok?'资金满足':'资金不足'):'资金待确认';
    return '<div class="trade-candidate-row'+cls+'" data-ui-surface="leaf">'+
      '<div class="trade-candidate-person"><span class="trade-candidate-avatar">'+pAvatar(p)+'</span><span><b>'+h(pCode(p))+' · '+h(nm(p))+'</b><small>联系 '+contactCount(p)+' 次</small></span></div>'+
      '<div>'+h(genderRelationLabel(p)||'--')+'</div>'+
      '<div>'+(vip(p)?vipBadge(p):'<span class="vip-none">—</span>')+'</div>'+
      '<div><b class="'+(fs.known&&fs.ok?'fund-ok':fs.known?'fund-bad':'fund-wait')+'">'+h(fund)+'</b><small>'+h(money(fs.need,o.currency||'USD'))+'</small></div>'+
      '<div>'+h(c.source||'--')+'</div>'+
      '<div><span class="candidate-state candidate-state-'+h(c.status)+'">'+h(statusLabel)+'</span></div>'+
      '<div class="trade-candidate-actions">'+
        (c.status==='pending'?'<button class="link-btn danger" data-reject="'+h(p.id)+'">拒绝</button><button class="link-btn" data-invite="'+h(p.id)+'" '+(!fs.ok?'disabled':'')+'>邀请</button>':'')+
        (c.status==='invited'?'<button class="link-btn danger" data-reject="'+h(p.id)+'">拒绝</button><button class="link-btn" data-confirm-buy="'+h(p.id)+'">确认买入</button>':'')+
        (c.status==='rejected'?'<button class="link-btn" data-invite="'+h(p.id)+'" '+(!fs.ok?'disabled':'')+'>重新邀请</button>':'')+
        (c.status==='bought'?'<span class="pill good">已形成持仓</span>':'')+
      '</div>'+
    '</div>';
  }).join('')+'</div>';
}
function bindRecommend(){
  el('newOffer')?.addEventListener('click',()=>editOffer());
  qsa('[data-offer-open]').forEach(b=>b.onclick=()=>{activeOfferId=b.dataset.offerOpen;renderRecommend()});
  qsa('[data-offer-edit]').forEach(b=>b.onclick=()=>editOffer(b.dataset.offerEdit));
  el('recommendPeople')?.addEventListener('click',()=>makeRecommendations(activeOfferId));
  qsa('[data-invite]').forEach(b=>b.onclick=()=>setCandidate(activeOfferId,b.dataset.invite,'invited'));
  qsa('[data-reject]').forEach(b=>b.onclick=()=>setCandidate(activeOfferId,b.dataset.reject,'rejected'));
  qsa('[data-confirm-buy]').forEach(b=>b.onclick=()=>confirmBuy(activeOfferId,b.dataset.confirmBuy));
}
function editOffer(id){
  const o=id?offer(id):{id:'of'+crypto.randomUUID(),symbol:'DDD',name:'DDD',market:'美股',currency:'USD',discountPct:15,minShares:100,holdDays:3,unitPrice:65,participantCount:10,createdAt:new Date().toISOString()};
  openModal(id?'编辑股票计划':'新建股票计划','<div class="form-grid"><div class="field"><label>股票代码 *</label><input class="input" name="symbol" required value="'+h(o.symbol)+'"></div><div class="field"><label>股票名称 *</label><input class="input" name="name" required value="'+h(o.name)+'"></div><div class="field"><label>市场</label><input class="input" name="market" value="'+h(o.market||'美股')+'"></div><div class="field"><label>币种</label><select class="select" name="currency"><option value="USD" '+((o.currency||'USD')==='USD'?'selected':'')+'>USD 美元</option><option value="EUR" '+(o.currency==='EUR'?'selected':'')+'>EUR 欧元</option><option value="HKD" '+(o.currency==='HKD'?'selected':'')+'>HKD 港币</option><option value="CNY" '+(o.currency==='CNY'?'selected':'')+'>CNY 人民币</option></select></div><div class="field"><label>折扣占比 %</label><input class="input" type="number" min="0" max="99" step="0.01" name="discount" value="'+h(o.discountPct)+'"></div><div class="field"><label>最低购买股数</label><input class="input" type="number" min="1" name="shares" value="'+h(o.minShares)+'"></div><div class="field"><label>持有时间限制（天）</label><input class="input" type="number" min="0" name="days" value="'+h(o.holdDays)+'"></div><div class="field"><label>单价</label><input class="input" type="number" min="0" step="0.01" name="price" value="'+h(o.unitPrice)+'"></div><div class="field"><label>购买人数</label><input class="input" type="number" min="1" max="70" name="count" value="'+h(o.participantCount)+'"></div></div>',fd=>{
    o.symbol=String(fd.get('symbol')).trim().toUpperCase();o.name=String(fd.get('name')).trim();o.market=String(fd.get('market')).trim()||'美股';o.currency=String(fd.get('currency')||'USD');o.discountPct=Number(fd.get('discount'))||0;o.minShares=Math.max(1,Number(fd.get('shares'))||1);o.holdDays=Math.max(0,Number(fd.get('days'))||0);o.unitPrice=Math.max(0,Number(fd.get('price'))||0);o.participantCount=Math.max(1,Math.min(70,Number(fd.get('count'))||1));
    if(!id){db.tradeSim.offers.push(o);activeOfferId=o.id}else activeOfferId=id;setTimeout(renderRecommend,0);
  });
}
function makeRecommendations(offerId){
  const o=offer(offerId);if(!o)return;const existing=recommendationFor(offerId);if(existing){renderRecommend();toast('今日名单已生成，已保留邀请和成交状态');return}
  const planMap=new Map(todayPlans().map(x=>[String(x.personId),x])),eligible=db.people.filter(p=>opened(p)&&fundingState(p,o).ok);
  const fromToday=eligible.filter(p=>planMap.has(String(p.id))).sort((a,b)=>score(b)-score(a)),todayIds=new Set(fromToday.map(p=>String(p.id))),fill=eligible.filter(p=>!todayIds.has(String(p.id))).sort((a,b)=>score(b)-score(a)),chosen=fromToday.concat(fill).slice(0,o.participantCount);
  const rec={id:'rec'+crypto.randomUUID(),offerId:o.id,date:day(),createdAt:new Date().toISOString(),candidates:chosen.map(p=>({personId:String(p.id),status:'pending',source:todayIds.has(String(p.id))?'主看板今日待买':'已开户补充推荐'}))};
  db.tradeSim.recommendations=db.tradeSim.recommendations.filter(x=>!(x.offerId===o.id&&x.date===day()));db.tradeSim.recommendations.push(rec);save();renderRecommend();toast('已推荐 '+chosen.length+' 人；明确资金不足者已排除');
}
function setCandidate(offerId,pid,status){
  const rec=recommendationFor(offerId);if(!rec)return;const c=rec.candidates.find(x=>String(x.personId)===String(pid));if(!c||c.status==='bought'||!['invited','rejected'].includes(status))return;
  const o=offer(offerId),p=person(pid);if(!o||!p)return;if(status==='invited'&&!fundingState(p,o).ok){toast('该人物已明确资金不足，不能邀请');return}c.status=status;
  if(status==='invited'){const exists=db.portfolio.buyPlans.some(x=>x.date===day()&&String(x.personId)===String(pid)&&x.offerId===o.id&&x.status==='planned');if(!exists)db.portfolio.buyPlans.push({id:'bp'+crypto.randomUUID(),personId:String(pid),date:day(),symbol:o.symbol,stockName:o.name,currency:o.currency||'USD',reason:'模拟交易邀请',source:'recommendation',offerId:o.id,status:'planned'})}
  else db.portfolio.buyPlans=db.portfolio.buyPlans.filter(x=>!(x.date===day()&&String(x.personId)===String(pid)&&x.offerId===o.id&&x.status==='planned'));
  save();renderRecommend();
}
function executeBuy(offerId,pid,quantity){
  const o=offer(offerId),rec=recommendationFor(offerId),p=person(pid);if(!o||!rec||!p||!opened(p))return false;const c=rec.candidates.find(x=>String(x.personId)===String(pid));if(!c||c.status!=='invited')return false;
  const qty=Number(quantity);if(!Number.isInteger(qty)||qty<Number(o.minShares)||!(Number(o.unitPrice)>0))return false;const fs=fundingState(p,o),amount=qty*Number(o.unitPrice||0);if(fs.known&&amount>fs.budget)return false;if(db.portfolio.holdings.some(x=>x.offerId===o.id&&String(x.personId)===String(pid)&&x.status!=='sold'))return false;
  const buyAt=new Date().toISOString(),plannedSellAt=sellAt(o.holdDays,buyAt),plan=db.portfolio.buyPlans.find(x=>x.offerId===o.id&&String(x.personId)===String(pid)&&x.status==='planned');
  db.portfolio.holdings.push({id:'h'+crypto.randomUUID(),batchId:crypto.randomUUID(),offerId:o.id,buyPlanId:plan?.id||null,personId:String(pid),symbol:o.symbol,name:o.name,market:o.market,currency:o.currency||'USD',quantity:qty,buyPrice:o.unitPrice,buyAt,plannedSellAt,status:'holding',simulated:true});
  if(plan){plan.status='done';plan.doneAt=buyAt;plan.quantity=qty;plan.unitPrice=o.unitPrice;plan.currency=o.currency||'USD'}c.status='bought';save();return true;
}
function confirmBuy(offerId,pid){
  const o=offer(offerId),rec=recommendationFor(offerId),p=person(pid);if(!o||!rec||!p)return;const c=rec.candidates.find(x=>String(x.personId)===String(pid));if(!c||c.status!=='invited'||!opened(p))return;
  const fs=fundingState(p,o),budget=fs.known?money(fs.budget,o.currency||'USD'):'未录入 '+(o.currency||'USD')+' 可用资金';
  openModal('确认买入 · '+nm(p),'<div class="notice">'+h(o.symbol)+' · '+h(o.name)+'　单价 '+h(money(o.unitPrice,o.currency||'USD'))+'　最低 '+h(o.minShares)+' 股<br>该人物可用资金：'+h(budget)+'</div><div class="form-grid"><div class="field"><label>实际购买股数 *</label><input class="input" type="number" min="'+h(o.minShares)+'" step="1" name="quantity" value="'+h(o.minShares)+'" required></div></div>',fd=>{const qty=Number(fd.get('quantity'));if(!executeBuy(offerId,pid,qty)){alert('买入失败：请检查邀请状态、开户状态、资金或重复持仓。');return false}setTimeout(renderRecommend,0);toast(nm(p)+' 已确认买入 '+qty+' 股并形成持仓')});
}

function batches(){
  const map=new Map();
  currentHoldings().forEach(hd=>{
    const k=stockKey(hd);if(!map.has(k))map.set(k,{key:k,offerId:hd.offerId,symbol:hd.symbol,name:hd.name,currency:hd.currency||'USD',buyAt:hd.buyAt,rows:[]});
    map.get(k).rows.push(hd);
  });
  return [...map.values()].sort((a,b)=>String(a.buyAt).localeCompare(String(b.buyAt)));
}
function batchStatus(b){
  const states=b.rows.map(holdingStatus);
  if(states.every(x=>x.key==='ready'))return{key:'ready',label:'满足持有条件'};
  if(states.some(x=>x.key==='ready')||states.some(x=>x.key==='soon'))return{key:'soon',label:'部分临近/可卖'};
  return{key:'holding',label:'持有中'};
}
// Chart groups stock positions across purchase batches; each person counts once per stock.
function stockGroups(){
  const map=new Map();
  currentHoldings().forEach(row=>{
    const source=offer(row.offerId);
    const symbol=String(row.symbol||source?.symbol||'').trim().toUpperCase();
    const market=String(row.market||source?.market||'').trim();
    const currency=String(row.currency||source?.currency||'USD').trim().toUpperCase();
    const key=JSON.stringify([market,currency,symbol]);
    if(!map.has(key))map.set(key,{key,symbol,name:row.name||source?.name||'',market,currency,rows:[],people:new Set()});
    const group=map.get(key);group.rows.push(row);
    if(row.personId!=null&&String(row.personId).trim())group.people.add(String(row.personId).trim());
  });
  return [...map.values()].map(group=>({...group,count:group.people.size}))
    .sort((a,b)=>b.count-a.count||a.symbol.localeCompare(b.symbol)||a.key.localeCompare(b.key));
}
function renderStockChart(stocks){
  if(!stocks.length)return '<div class="empty">暂无持仓，确认买入后按股票显示持有人数</div>';
  const max=Math.max(1,...stocks.map(stock=>stock.count));
  return stocks.map(stock=>{
    const state=batchStatus(stock),height=Math.round(stock.count/max*180);
    const label=(stock.symbol||'未填写代码')+' · '+stock.name+' · '+(stock.market||'未填写市场')+' · '+stock.currency+' · '+stock.count+' 人 · '+state.label;
    return '<div class="hold-bar-wrap" role="listitem" aria-label="'+h(label)+'" data-tooltip="'+h((stock.symbol||'未填写代码')+' · '+(stock.name||'未填写名称')+'｜'+(stock.market||'未填写市场')+' · '+stock.currency+'｜当前 '+stock.count+' 人｜'+state.label)+'"><span class="hold-bar-count">'+stock.count+' 人</span><div class="hold-bar '+state.key+'" style="height:'+height+'px" aria-hidden="true"></div><div class="hold-bar-label"><b>'+h(stock.symbol||'未填写代码')+'</b><span>'+h(stock.market||'未填写市场')+' · '+h(stock.currency)+'</span><span>'+h(state.label)+'</span></div></div>';
  }).join('');
}
function renderHoldings(){
  ensure();setupUI();
  const body=el('holdingsV2Body');if(!body)return;
  const bs=batches(),stocks=stockGroups(),holdingRows=currentHoldings();
  const readyBatches=bs.filter(b=>batchStatus(b).key==='ready').length;
  const nextSell=holdingRows.length?holdingRows.slice().sort((a,b)=>new Date(a.plannedSellAt)-new Date(b.plannedSellAt))[0]:null;
  body.innerHTML=
    '<div class="topbar"><div><div class="eyebrow">PORTFOLIO HOLDINGS</div><h1 class="page-title">持仓管理</h1><p class="sub">查看当前持仓组合、股票批次、持有人、买入金额、最早卖出时间与持仓状态。</p></div><div class="actions"><button class="btn ghost" id="goRecommend">返回人物交易</button></div></div>'+
    '<div class="holding-kpis">'+
      '<div class="card holding-kpi"><span>持仓股票</span><strong>'+stocks.length+'</strong><small>当前股票种类</small></div>'+
      '<div class="card holding-kpi"><span>持仓记录</span><strong>'+holdingRows.length+'</strong><small>未卖出持仓</small></div>'+
      '<div class="card holding-kpi"><span>可卖批次</span><strong>'+readyBatches+'</strong><small>已满足持有条件</small></div>'+
      '<div class="card holding-kpi"><span>最近卖出节点</span><strong>'+(nextSell?h(dt(nextSell.plannedSellAt)):'--')+'</strong><small>'+(nextSell?h(remaining(new Date(nextSell.plannedSellAt).getTime()-Date.now())):'暂无计划')+'</small></div>'+
    '</div>'+
    '<div class="holding-main-grid">'+
      '<section class="card panel holding-chart-panel"><div class="panel-head stock-chart-heading"><div><h2>股票持仓组合</h2><p class="muted">每根柱子代表一只股票，柱高表示当前持有人数；同一人物多次买入只计 1 人。</p></div><span class="count">'+stocks.length+' 只股票</span></div>'+
      '<div class="stock-chart-axis">持有人数（人） · 0 至 '+Math.max(1,...stocks.map(x=>x.count))+' 人</div><div class="hold-chart" role="list" aria-label="按股票汇总的当前持有人数">'+renderStockChart(stocks)+'</div>'+
      '<div class="stock-chart-legend"><span>绿色：满足持有条件</span><span>橙色：临近卖出</span><span>金色：持有中</span></div></section>'+
      '<section class="card panel holding-next-panel"><div class="panel-head"><h2>卖出节点</h2><span class="muted">按时间排序</span></div>'+
        (holdingRows.length?'<div class="holding-next-list">'+holdingRows.slice().sort((a,b)=>new Date(a.plannedSellAt)-new Date(b.plannedSellAt)).slice(0,6).map(x=>{
          const p=person(x.personId),hs=holdingStatus(x);
          return '<div class="holding-next-row" data-ui-surface="leaf"><div><b>'+h(x.symbol||'--')+' · '+h(nm(p))+'</b><small>'+h(pCode(p))+' · '+h(x.quantity)+' 股 · '+h(money(x.buyPrice,x.currency||'USD'))+'</small></div><div><strong>'+h(dt(x.plannedSellAt))+'</strong><span class="holding-state-text '+h(hs.key)+'">'+h(remaining(hs.left))+'</span></div></div>';
        }).join('')+'</div>':'<div class="empty">暂无计划卖出节点</div>')+
      '</section>'+
    '</div>'+
    '<section class="card panel holding-detail-panel"><div class="panel-head"><h2>持仓明细</h2><span class="muted">'+holdingRows.length+' 笔</span></div>'+renderBatches(bs)+'</section>';
  el('goRecommend')?.addEventListener('click',()=>{go('tradeRecommend');renderRecommend()});
  qsa('[data-sell-batch]').forEach(b=>b.onclick=()=>openSellBatch(b.dataset.sellBatch));
}
function renderBatches(bs){
  if(!bs.length)return'<div class="empty">暂无持仓记录</div>';
  return bs.map(b=>{
    const st=batchStatus(b),next=Math.min(...b.rows.map(x=>new Date(x.plannedSellAt).getTime())),
      left=remaining(next-Date.now()),
      total=b.rows.reduce((sum,x)=>sum+(Number(x.buyPrice)||0)*(Number(x.quantity)||0),0),
      canSell=b.rows.some(x=>holdingStatus(x).key==='ready'),
      stateClass=st.key==='ready'?'ready':st.key==='soon'?'soon':'holding';
    return '<div class="batch-card holding-batch">'+
      '<div class="batch-top holding-batch-head"><div class="holding-batch-title">'+
        '<div class="stock-title-row"><b class="stock-title">'+h(b.symbol||'--')+' · '+h(b.name||'')+'</b><span class="holding-state '+stateClass+'">'+h(st.label)+'</span></div>'+
        '<div class="batch-summary-grid">'+
          '<span><em>买入时间</em><strong>'+h(dt(b.buyAt))+'</strong></span>'+
          '<span><em>持仓人数</em><strong>'+b.rows.length+' 人</strong></span>'+
          '<span><em>本批投入 · '+h(b.currency||'USD')+'</em><strong>'+h(money(total,b.currency||'USD'))+'</strong></span>'+
          '<span><em>下一节点</em><strong>'+h(left)+'</strong></span>'+
        '</div>'+
      '</div><button class="btn '+(st.key==='ready'?'primary':'ghost')+' small" data-sell-batch="'+h(b.key)+'" '+(canSell?'':'disabled')+'>卖出</button></div>'+
      '<div class="holding-person-grid">'+b.rows.map(x=>{
        const p=person(x.personId),hs=holdingStatus(x),currency=x.currency||b.currency||'USD',
          amount=(Number(x.buyPrice)||0)*(Number(x.quantity)||0),
          personState=hs.key==='ready'?'ready':hs.key==='soon'?'soon':'holding';
        return '<div class="holding-person-card">'+
          '<div class="gender-avatar '+(sex(p)==='女'?'f':'m')+'">'+pAvatar(p)+'</div>'+
          '<div class="holding-person-content">'+
            '<div class="holding-person-head"><b>'+h(pCode(p)+(genderRelationLabel(p)||'')+' · '+nm(p))+'</b>'+(vip(p)?vipBadge(p):'')+'</div>'+
            '<div class="holding-info-grid">'+
              '<div><span>买入股数</span><strong>'+h(x.quantity)+' 股</strong></div>'+
              '<div><span>买入价 · '+h(currency)+'</span><strong>'+h(money(x.buyPrice,currency))+'</strong></div>'+
              '<div><span>买入金额</span><strong>'+h(money(amount,currency))+'</strong></div>'+
              '<div><span>买入时间</span><strong>'+h(dt(x.buyAt||b.buyAt))+'</strong></div>'+
              '<div><span>最早卖出</span><strong>'+h(dt(x.plannedSellAt))+'</strong></div>'+
              '<div><span>持仓状态</span><strong class="holding-state-text '+personState+'">'+h(hs.label)+' · '+h(remaining(hs.left))+'</strong></div>'+
            '</div>'+
          '</div>'+
        '</div>';
      }).join('')+'</div>'+
    '</div>';
  }).join('');
}
function openSellBatch(key){
  const b=batches().find(x=>x.key===key);if(!b)return;const ready=b.rows.filter(x=>holdingStatus(x).key==='ready');if(!ready.length){toast('该批次尚未满足最低持有期限，不能卖出');return}
  const allReady=ready.length===b.rows.length,cards=b.rows.map(x=>{const p=person(x.personId),hs=holdingStatus(x),ok=hs.key==='ready';return'<label class="person-mini"><input type="checkbox" name="sellPerson" value="'+h(x.id)+'" '+(ok?'checked':'disabled')+'><div class="gender-avatar '+(sex(p)==='女'?'f':'m')+'">'+pAvatar(p)+'</div><div><b>'+h(nm(p))+'</b><small class="muted">'+h(hs.label)+' · '+h(remaining(hs.left))+(ok?'':' · 未到期锁定')+'</small></div></label>'}).join('');
  openModal('确认卖出 · '+b.symbol+' '+b.name,'<div class="notice '+(allReady?'success':'warn')+'">'+(allReady?'本批所有持仓均已满足持有时限。':'只有满足最低持有期限的人员可以卖出。')+'</div><div class="person-mini-grid">'+cards+'</div><div class="form-grid" style="margin-top:14px"><div class="field"><label>卖出价（'+h(b.currency||'USD')+'）</label><input class="input" name="soldPrice" type="number" min="0.01" step="0.01" required></div></div>',fd=>{const ids=qsa('#modalForm input[name="sellPerson"]:checked:not(:disabled)').map(x=>x.value);if(!ids.length){toast('至少选择一位已到期持仓人员');return false}const price=Number(fd.get('soldPrice'));if(!Number.isFinite(price)||price<=0){toast('请输入有效的卖出价格');return false}if(b.rows.some(x=>ids.includes(x.id)&&holdingStatus(x).key!=='ready')){toast('持仓尚未到期');return false}const now=new Date().toISOString();db.portfolio.holdings.forEach(x=>{if(ids.includes(x.id)){x.status='sold';x.soldAt=now;x.soldPrice=price}});save();setTimeout(renderHoldings,0);toast('已确认卖出 '+ids.length+' 位人员的持仓')});
}
function bindNav(){
  qsa('.nav button').forEach(b=>{
    if(b.dataset.page==='tradeRecommend')b.onclick=()=>{go('tradeRecommend');renderRecommend()};
    if(b.dataset.page==='holdingsV2')b.onclick=()=>{go('holdingsV2');renderHoldings()};
  });
}
if(typeof window!=='undefined')window.ChenNanTrading={sellHolding:id=>{const holding=db.portfolio.holdings.find(x=>x.id===id);if(holding)openSellBatch(stockKey(holding))}};
setupUI();bindNav();
})();
