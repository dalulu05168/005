/* Detailed people directory and dedicated second-page profile view. */
(function(){
'use strict';

function $id(id){return document.getElementById(id)}
function s(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'})[m]})}
function cash(v,currency='EUR'){
  const code=String(currency||'EUR').toUpperCase();
  try{return new Intl.NumberFormat('zh-CN',{style:'currency',currency:code,maximumFractionDigits:2}).format(Number(v||0))}
  catch(_){return code+' '+Number(v||0).toLocaleString('zh-CN',{maximumFractionDigits:2})}
}
function label(p){return p?(p.name||p.frenchName||p.id):'未知人物'}
function isOpened(p){return !!(p&&p.account&&p.account.opened)}
function isJoined(p){return !!(p&&p.crm&&p.crm.joined_group)}
function allHoldings(){return db.portfolio&&Array.isArray(db.portfolio.holdings)?db.portfolio.holdings:[]}
function allPlans(){return db.portfolio&&Array.isArray(db.portfolio.buyPlans)?db.portfolio.buyPlans:[]}
function personHoldings(p,includeSold){return allHoldings().filter(function(h){return String(h.personId)===String(p.id)&&(includeSold||h.status!=='sold')})}
function contactCount(p){
  const base=Math.max(0,Number(p?.crm?.contact_count)||0);
  const logged=db.records.filter(function(r){return String(r.personId)===String(p.id)&&r.type==='联系记录'}).length;
  return base+logged;
}
function participationCount(p){
  const holdings=allHoldings().filter(function(h){return String(h.personId)===String(p.id)});
  const coveredOffers=new Set(holdings.map(h=>String(h.offerId||'')).filter(Boolean));
  const orphanDone=allPlans().filter(function(x){return String(x.personId)===String(p.id)&&x.status==='done'&&(!x.offerId||!coveredOffers.has(String(x.offerId)))}).length;
  return holdings.length+orphanDone;
}
function holdingCurrency(h){
  if(h?.currency)return String(h.currency).toUpperCase();
  const sym=String(h?.symbol||'').toUpperCase();
  if(sym.endsWith('.PA'))return'EUR';if(sym.endsWith('.HK'))return'HKD';if(sym.endsWith('.SZ')||sym.endsWith('.SH'))return'CNY';
  return'USD';
}
function holdingCostMap(p){
  const map={};personHoldings(p,false).forEach(h=>{const c=holdingCurrency(h);map[c]=(map[c]||0)+(Number(h.buyPrice)||0)*(Number(h.quantity)||0)});return map;
}
function mapMoney(map){const xs=Object.entries(map||{}).filter(([,v])=>Number.isFinite(Number(v))&&Math.abs(Number(v))>1e-9);return xs.length?xs.map(([c,v])=>cash(v,c)).join(' / '):'—'}
function availableCapitalMap(p){
  const out={},src=p?.finance?.available_capital_by_currency;
  if(src&&typeof src==='object')Object.entries(src).forEach(([k,v])=>{if(Number.isFinite(Number(v)))out[String(k).toUpperCase()]=Number(v)});
  [['EUR','available_investment_capital_eur'],['USD','available_investment_capital_usd'],['HKD','available_investment_capital_hkd'],['CNY','available_investment_capital_cny']].forEach(([code,key])=>{const raw=p?.finance?.[key];if(out[code]==null&&raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw)))out[code]=Number(raw)});
  Object.entries(p?.trade_profile?.available_funds||{}).forEach(([code,value])=>{if(value!==null&&value!==''&&Number.isFinite(Number(value)))out[code]=Number(value)});
  return out;
}
function performanceText(pf){
  if(!pf)return'未录入';
  if(pf.multi){return Object.entries(pf.groups||{}).map(([code,g])=>{const r=g.cost?g.profit/g.cost*100:null;return code+' '+ratioText(r)}).join(' / ')||'未录入'}
  return ratioText(pf.ratio);
}
function profitMoneyText(pf){
  if(!pf)return'未录入';
  if(pf.multi)return Object.entries(pf.groups||{}).map(([code,g])=>cash(g.profit,code)).join(' / ');
  if(pf.profit==null)return'未录入';
  return cash(pf.profit,pf.currency||'EUR');
}
function tradingPerformance(p){
  const groups={};let known=0;
  personHoldings(p,true).forEach(h=>{const buy=Number(h.buyPrice),qty=Number(h.quantity),ref=h.status==='sold'?Number(h.soldPrice):Number(h.currentPrice);if(!(buy>0&&qty>0&&ref>0))return;const c=holdingCurrency(h),cost=buy*qty,profit=(ref-buy)*qty;groups[c]=groups[c]||{cost:0,profit:0};groups[c].cost+=cost;groups[c].profit+=profit;known++});
  const currencies=Object.keys(groups);if(!known)return null;
  if(currencies.length===1){const c=currencies[0],g=groups[c];return{currency:c,cost:g.cost,profit:g.profit,ratio:g.cost?g.profit/g.cost*100:null,groups}}
  return{multi:true,groups,ratio:null};
}
function performance(p){
  const trade=tradingPerformance(p);if(trade)return trade;
  p.performance=p.performance&&typeof p.performance==='object'?p.performance:{};
  const invested=Number(p.performance.invested_capital_eur)||0,profit=p.performance.total_profit_eur;
  if(profit===null||profit===undefined||profit==='')return{currency:'EUR',invested,profit:null,ratio:null,manual:true};
  const pn=Number(profit);return{currency:'EUR',invested,profit:pn,ratio:invested>0?pn/invested*100:null,manual:true};
}
function ratioText(r){return r==null?'未录入':(r>=0?'+':'')+Number(r).toFixed(2)+'%'}
function freq(p){const f=p&&p.trade_profile&&p.trade_profile.participation_frequency;return f==='HIGH'?'高':f==='LOW'?'低':'中'}
function currentList(){
  const q=($id('personSearch')?.value||'').trim().toLowerCase(),sort=$id('personSort')?.value||'id';
  const sg=systemGroup($id('systemGroupFilter')?.value||'all'),cgid=$id('customGroupFilter')?.value||'all',cg=customGroup(cgid);
  let list=db.people.filter(function(p){return sg.test(p)&&(!cg||cg.members.includes(String(p.id)))&&(!q||personSearchBlob(p).includes(q))});
  list.sort(function(a,b){
    if(sort==='name')return pName(a).localeCompare(pName(b),'fr');
    if(sort==='enthusiasm')return pEnthusiasm(b)-pEnthusiasm(a);
    if(sort==='assets')return pAssets(b)-pAssets(a);
    return String(a.id).localeCompare(String(b.id),undefined,{numeric:true});
  });
  return list;
}

function ensureUI(){
  if(!$id('personDetailPage')){
    const sec=document.createElement('section');sec.id='personDetailPage';sec.className='section';
    sec.innerHTML='<div id="personDetailContent"></div>';
    const trades=$id('trades'),main=document.querySelector('.main');
    if(trades&&trades.nextSibling)main.insertBefore(sec,trades.nextSibling);else main.appendChild(sec);
  }
  if(!$id('peopleDetailStyles')){
    const st=document.createElement('style');st.id='peopleDetailStyles';
    st.textContent='.people-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:13px}.people-data-table{width:100%;border-collapse:collapse;min-width:1420px;background:#fff}.people-data-table th,.people-data-table td{padding:11px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;vertical-align:middle}.people-data-table th{position:sticky;top:0;background:#f8fafc;color:var(--muted);font-size:11px;font-weight:800;z-index:1}.people-data-table tbody tr{cursor:pointer;transition:.18s}.people-data-table tbody tr:hover{background:#f7f9ff}.people-data-table .namecell{font-weight:800}.profit-pos{color:var(--green);font-weight:800}.profit-neg{color:var(--red);font-weight:800}.detail-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}.detail-identity{display:flex;gap:14px;align-items:center}.detail-avatar{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(135deg,#e8edff,#dce5ff);color:#3456bd;font-size:20px;font-weight:900}.detail-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:18px}.detail-kpi{padding:14px}.detail-kpi span{font-size:11px;color:var(--muted)}.detail-kpi strong{display:block;font-size:20px;margin-top:5px}.detail-columns{display:grid;grid-template-columns:1.05fr .95fr;gap:18px}.detail-card{padding:19px}.detail-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.detail-line{padding:10px;border:1px solid var(--line);border-radius:10px;background:#fafbfe}.detail-line span{display:block;color:var(--muted);font-size:11px}.detail-line b{display:block;margin-top:3px}.journey{display:grid}.journey-item{display:grid;grid-template-columns:105px 18px 1fr;gap:10px;min-height:64px}.journey-date{font-size:12px;color:var(--muted);padding-top:4px;text-align:right}.journey-rail{position:relative}.journey-rail:before{content:"";position:absolute;left:5px;top:7px;width:8px;height:8px;border-radius:50%;background:var(--blue)}.journey-rail:after{content:"";position:absolute;left:8px;top:18px;bottom:0;width:2px;background:var(--line)}.journey-item:last-child .journey-rail:after{display:none}.journey-body b{display:block}.journey-body small{color:var(--muted)}@media(max-width:1200px){.detail-kpis{grid-template-columns:repeat(3,1fr)}.detail-columns{grid-template-columns:1fr}}@media(max-width:700px){.detail-kpis{grid-template-columns:repeat(2,1fr)}.detail-list{grid-template-columns:1fr}.detail-head{flex-direction:column}.journey-item{grid-template-columns:82px 14px 1fr}}';
    document.head.appendChild(st);
  }
}

let peoplePage=1;
const PEOPLE_PAGE_SIZE=18;
let peoplePageSignature='';

renderPeople=function(){
  const host=$id('peopleList');if(!host)return;
  const list=currentList();
  const signature=[
    $id('personSearch')?.value||'',
    $id('personSort')?.value||'id',
    $id('systemGroupFilter')?.value||'all',
    $id('customGroupFilter')?.value||'all',
    list.length
  ].join('|');
  if(signature!==peoplePageSignature){
    peoplePage=1;
    peoplePageSignature=signature;
  }
  const totalPages=Math.max(1,Math.ceil(list.length/PEOPLE_PAGE_SIZE));
  peoplePage=Math.min(Math.max(1,peoplePage),totalPages);
  const pageStart=(peoplePage-1)*PEOPLE_PAGE_SIZE;
  const pageRows=list.slice(pageStart,pageStart+PEOPLE_PAGE_SIZE);
  const count=$id('peopleCount');
  if(count){
    const from=list.length?pageStart+1:0;
    const to=Math.min(pageStart+PEOPLE_PAGE_SIZE,list.length);
    count.textContent='当前显示 '+from+'-'+to+' / '+list.length+' 人';
  }
  const colgroup='<colgroup>'+
    '<col style="width:4.5%"><col style="width:17%"><col style="width:4%"><col style="width:4%">'+
    '<col style="width:5.5%"><col style="width:5.5%"><col style="width:5.5%"><col style="width:5.5%">'+
    '<col style="width:6%"><col style="width:6%"><col style="width:5%"><col style="width:9%">'+
    '<col style="width:7%"><col style="width:15.5%">'+
  '</colgroup>';
  const pager=totalPages>1?'<div class="people-pagination" aria-label="人物列表分页">'+
    Array.from({length:totalPages},function(_,i){
      const page=i+1;
      return '<button type="button" class="people-page-btn'+(page===peoplePage?' active':'')+'" data-people-page="'+page+'">'+page+'</button>';
    }).join('')+
  '</div>':'';

  host.innerHTML='<div class="people-table-wrap"><table class="people-data-table">'+colgroup+'<thead><tr><th>编号</th><th>姓名</th><th>性别</th><th>年龄</th><th>新/老</th><th>VIP</th><th>开户</th><th>入群</th><th>联系记录</th><th>参与次数</th><th>持仓</th><th>可投资资产</th><th>盈利占比</th><th>操作</th></tr></thead><tbody>'+
  pageRows.map(function(p){
    const hs=personHoldings(p,false),pf=performance(p);
    const relation=pRelationCode(p)==='OLD'?'relation-old':'relation-new';
    const vipClass=pVip(p)?' is-vip':'';
    return '<tr class="'+relation+vipClass+'" data-open-person="'+s(p.id)+'"><td>'+s(pCode(p))+'</td><td class="namecell"><span class="table-person"><span class="table-avatar">'+pAvatar(p)+'</span><span class="table-name">'+s(label(p))+'<small class="person-category" data-category="'+s(genderRelationLabel(p))+'">'+s(genderRelationLabel(p))+'</small></span></span></td><td>'+s(pGender(p)||'--')+'</td><td>'+s(p.age||'--')+'</td><td>'+s(pRelationName(p)||'--')+'</td><td class="vip-cell">'+(pVip(p)?'<span class="vip-level vip-level-'+s(String(p.vip?.level||'VIP').replace(/\D/g,'')||'x')+'">'+s(p.vip?.level||'VIP')+'</span>':'<span class="vip-none">—</span>')+'</td><td>'+(isOpened(p)?'已开户':'未开户')+'</td><td>'+(isJoined(p)?'已入群':'未入群')+'</td><td>'+contactCount(p)+'</td><td>'+participationCount(p)+'</td><td>'+(hs.length?hs.length+' 笔':'无')+'</td><td>'+cash(p.finance?.estimated_investable_assets_eur||0)+'</td><td class="'+(pf.ratio==null?'':(pf.ratio>=0?'profit-pos':'profit-neg'))+'">'+s(pf.multi?'多币种':ratioText(pf.ratio))+'</td><td><span class="people-actions"><button class="link-btn view-person" data-id="'+s(p.id)+'">详情</button><button class="link-btn" data-trade-pref="'+s(p.id)+'">交易设置</button><button class="link-btn edit-person" data-id="'+s(p.id)+'">编辑</button><button class="link-btn danger delete-person" data-id="'+s(p.id)+'">删除</button></span></td></tr>';
  }).join('')+'</tbody></table></div>'+pager;

  host.querySelectorAll('[data-open-person]').forEach(function(row){row.onclick=function(e){if(e.target.closest('button'))return;openDetail(row.dataset.openPerson)}});
  host.querySelectorAll('.view-person').forEach(function(b){b.onclick=function(e){e.stopPropagation();openDetail(b.dataset.id)}});
  host.querySelectorAll('[data-trade-pref]').forEach(function(b){b.onclick=function(e){e.stopPropagation();editTradePrefLocal(b.dataset.tradePref)}});
  host.querySelectorAll('.edit-person').forEach(function(b){b.onclick=function(e){e.stopPropagation();openPerson(b.dataset.id)}});
  host.querySelectorAll('.delete-person').forEach(function(b){b.onclick=function(e){e.stopPropagation();deletePerson(b.dataset.id)}});
  host.querySelectorAll('[data-people-page]').forEach(function(b){
    b.onclick=function(){
      peoplePage=Number(b.dataset.peoplePage)||1;
      peoplePageSignature=signature;
      renderPeople();
      host.querySelector('.people-table-wrap')?.scrollTo({top:0,left:0,behavior:'auto'});
    };
  });
};

function editTradePrefLocal(id){
  const p=person(id);if(!p)return;
  p.trade_profile=p.trade_profile&&typeof p.trade_profile==='object'?p.trade_profile:{participation_frequency:'MEDIUM',required_today:false};
  p.trade_profile.available_funds=p.trade_profile.available_funds&&typeof p.trade_profile.available_funds==='object'?p.trade_profile.available_funds:{};
  openModal('交易参与设置 · '+label(p),'<div class="form-grid"><div class="field"><label>参与频率</label><select class="select" name="freq"><option value="HIGH" '+(p.trade_profile.participation_frequency==='HIGH'?'selected':'')+'>高</option><option value="MEDIUM" '+(p.trade_profile.participation_frequency==='MEDIUM'?'selected':'')+'>中</option><option value="LOW" '+(p.trade_profile.participation_frequency==='LOW'?'selected':'')+'>低</option></select></div><div class="field"><label>今天强制参与</label><select class="select" name="required"><option value="0" '+(!p.trade_profile.required_today?'selected':'')+'>否</option><option value="1" '+(p.trade_profile.required_today?'selected':'')+'>是</option></select></div><div class="field"><label>USD 可用资金</label><input class="input" type="number" min="0" step="0.01" name="usd" value="'+s(p.trade_profile.available_funds.USD??'')+'" placeholder="未填写则推荐时标记待确认"></div><div class="field"><label>HKD 可用资金</label><input class="input" type="number" min="0" step="0.01" name="hkd" value="'+s(p.trade_profile.available_funds.HKD??'')+'"></div><div class="field"><label>CNY 可用资金</label><input class="input" type="number" min="0" step="0.01" name="cny" value="'+s(p.trade_profile.available_funds.CNY??'')+'"></div><div class="field"><label>EUR 可用资金</label><input class="input" type="number" min="0" step="0.01" name="eur" value="'+s(p.trade_profile.available_funds.EUR??p.finance?.available_investment_capital_eur??'')+'"></div></div>',function(fd){p.trade_profile.participation_frequency=String(fd.get('freq'));p.trade_profile.required_today=fd.get('required')==='1';[['USD','usd'],['HKD','hkd'],['CNY','cny'],['EUR','eur']].forEach(([c,k])=>{const raw=String(fd.get(k)||'').trim();if(raw==='')delete p.trade_profile.available_funds[c];else p.trade_profile.available_funds[c]=Math.max(0,Number(raw)||0)})});
}

function journey(p){
  const rows=[],add=function(date,title,detail){if(date)rows.push({date:String(date).slice(0,10),title:title,detail:detail||''})};
  add(p.customer_relation?.first_contact_date,'首次联系','客户关系建立');
  add(p.account?.opened_date,'完成开户',p.account?.status||'已开户');
  add(p.crm?.group_joined_date,'加入群组','进入运营群组');
  db.records.filter(function(r){return String(r.personId)===String(p.id)}).forEach(function(r){add(r.date,r.title||r.type,r.content||'')});
  allPlans().filter(function(x){return String(x.personId)===String(p.id)&&x.status==='done'}).forEach(function(x){add(x.doneAt||x.date,'完成买入计划',(x.symbol||'')+' '+(x.stockName||''))});
  allHoldings().filter(function(h){return String(h.personId)===String(p.id)}).forEach(function(h){
    add(h.buyAt,'建立持仓',(h.symbol||'')+' '+(h.name||'')+' · 数量 '+(h.quantity||0));
    if(h.status==='sold')add(h.soldAt,'完成卖出',(h.symbol||'')+' '+(h.name||''));
  });
  return rows.sort(function(a,b){return String(b.date).localeCompare(String(a.date))}).slice(0,50);
}
function line(k,v){return '<div class="detail-line"><span>'+s(k)+'</span><b>'+s(v)+'</b></div>'}
function detailHoldingList(p){
  const rows=personHoldings(p,false).slice(0,5);
  if(!rows.length)return'<div class="empty">暂无当前持仓</div>';
  return'<div class="detail-compact-list">'+rows.map(function(h){
    const code=holdingCurrency(h),amount=(Number(h.buyPrice)||0)*(Number(h.quantity)||0);
    return'<div class="detail-compact-row"><div><b>'+s(h.symbol||'--')+' '+s(h.name||'')+'</b><small>'+s(h.quantity||0)+' 股 · '+s(cash(amount,code))+'</small></div><span>'+s(h.plannedSellAt?new Date(h.plannedSellAt).toLocaleDateString('zh-CN'):'未设卖出日')+'</span></div>';
  }).join('')+'</div>';
}
function detailPlanList(p){
  const pid=String(p.id),rows=[];
  const offers=db.tradeSim&&Array.isArray(db.tradeSim.offers)?db.tradeSim.offers:[];
  const recs=db.tradeSim&&Array.isArray(db.tradeSim.recommendations)?db.tradeSim.recommendations:[];
  recs.forEach(function(rec){
    const cand=(rec.candidates||[]).find(x=>String(x.personId)===pid);
    if(!cand)return;
    const offer=offers.find(x=>x.id===rec.offerId);
    rows.push({
      date:rec.date||rec.createdAt||'',
      title:(offer?.symbol||'股票计划')+' '+(offer?.name||''),
      detail:'推荐状态：'+(cand.status==='pending'?'待确认':cand.status==='invited'?'已邀请':cand.status==='rejected'?'已拒绝':cand.status==='bought'?'已确认买入':cand.status||'未知')
    });
  });
  allPlans().filter(x=>String(x.personId)===pid).forEach(function(x){
    rows.push({date:x.date||x.doneAt||'',title:(x.symbol||'股票计划')+' '+(x.stockName||''),detail:'计划状态：'+(x.status==='done'?'已完成':x.status==='planned'?'待执行':x.status||'未知')});
  });
  rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  if(!rows.length)return'<div class="empty">暂无交易计划或推荐</div>';
  return'<div class="detail-compact-list">'+rows.slice(0,5).map(function(x){
    return'<div class="detail-compact-row"><div><b>'+s(x.title)+'</b><small>'+s(x.detail)+'</small></div><span>'+s(String(x.date||'--').slice(0,10))+'</span></div>';
  }).join('')+'</div>';
}
function detailContactList(p){
  const rows=db.records.filter(function(r){return String(r.personId)===String(p.id)&&r.type==='联系记录'}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))});
  if(!rows.length)return'<div class="empty">暂无联系记录</div>';
  return'<div class="detail-compact-list">'+rows.slice(0,5).map(function(r){
    return'<div class="detail-compact-row"><div><b>'+s(r.title||'联系记录')+'</b><small>'+s(r.content||'')+'</small></div><span>'+s(r.date||'--')+'</span></div>';
  }).join('')+'</div>';
}
function detailBottomBlocks(p){
  return '<div class="detail-bottom-grid">'+
    '<div class="card detail-card detail-bottom-card"><div class="panel-head"><h2>当前持仓</h2><span class="muted">'+personHoldings(p,false).length+' 笔</span></div>'+detailHoldingList(p)+'</div>'+
    '<div class="card detail-card detail-bottom-card"><div class="panel-head"><h2>交易计划与推荐</h2><span class="muted">人物参与状态</span></div>'+detailPlanList(p)+'</div>'+
    '<div class="card detail-card detail-bottom-card"><div class="panel-head"><h2>联系记录</h2><span class="muted">'+contactCount(p)+' 次</span></div>'+detailContactList(p)+'</div>'+
  '</div>';
}

function holdingTable(p){
  const rows=personHoldings(p,true);
  if(!rows.length)return'<div class="empty">暂无持仓记录</div>';
  return'<div class="table-wrap"><table class="mini-table"><thead><tr><th>状态</th><th>股票</th><th>币种</th><th>数量</th><th>买入价</th><th>当前/卖出价</th><th>收益</th><th>买入时间</th><th>计划卖出</th></tr></thead><tbody>'+rows.map(function(h){const code=holdingCurrency(h),buy=Number(h.buyPrice)||0,ref=h.status==='sold'?Number(h.soldPrice):Number(h.currentPrice),qty=Number(h.quantity)||0,profit=buy>0&&ref>0?(ref-buy)*qty:null,ratio=buy>0&&ref>0?(ref-buy)/buy*100:null;return'<tr><td>'+(h.status==='sold'?'已售':'持仓')+'</td><td>'+s(h.symbol||'--')+' '+s(h.name||'')+'</td><td>'+s(code)+'</td><td>'+s(qty)+'</td><td>'+s(buy?cash(buy,code):'--')+'</td><td>'+s(ref?cash(ref,code):'未录入')+'</td><td class="'+(ratio==null?'':ratio>=0?'profit-pos':'profit-neg')+'">'+s(profit==null?'未录入':cash(profit,code)+' / '+ratioText(ratio))+'</td><td>'+s(h.buyAt?new Date(h.buyAt).toLocaleString('zh-CN',{hour12:false}):'--')+'</td><td>'+s(h.plannedSellAt?new Date(h.plannedSellAt).toLocaleString('zh-CN',{hour12:false}):'--')+'</td></tr>'}).join('')+'</tbody></table></div>';
}
function openDetail(id){
  const p=person(id);if(!p)return;
  const hs=personHoldings(p,false),pf=performance(p),costMap=holdingCostMap(p),contacts=contactCount(p),parts=participationCount(p),tl=journey(p);
  const groups=db.customGroups.filter(function(g){return(g.members||[]).includes(String(p.id))}).map(function(g){return g.name});
  go('personDetailPage');
  const host=$id('personDetailContent');if(!host)return;
  host.innerHTML='<div class="detail-head"><div class="detail-identity"><div class="detail-avatar">'+pAvatar(p)+'</div><div><div class="eyebrow">PERSON PROFILE</div><h1 class="page-title" style="margin-bottom:5px">'+s(label(p))+'</h1><p class="sub">'+s(pCode(p))+' · '+s(pGender(p)||'--')+' · '+s(p.age||'--')+'岁 · '+s(pRelationName(p)||'--')+' · '+s(p.location?.city||'--')+'</p></div></div><div class="actions"><button class="btn ghost" id="detailBack">← 返回人物列表</button><button class="btn ghost" id="editPerformance">资金/盈利维护</button><button class="btn primary" id="detailEdit">编辑人物</button></div></div>'+
  '<div class="detail-kpis"><div class="card detail-kpi"><span>联系记录</span><strong>'+contacts+'</strong></div><div class="card detail-kpi"><span>参与次数</span><strong>'+parts+'</strong></div><div class="card detail-kpi"><span>当前持仓</span><strong>'+hs.length+' 笔</strong></div><div class="card detail-kpi"><span>持仓成本</span><strong>'+s(mapMoney(costMap))+'</strong></div><div class="card detail-kpi"><span>盈利占比</span><strong class="'+(!pf?.multi&&pf?.ratio!=null?(pf.ratio>=0?'profit-pos':'profit-neg'):'')+'">'+s(performanceText(pf))+'</strong></div><div class="card detail-kpi"><span>股票热情</span><strong>'+s(pEnthusiasm(p))+'</strong></div></div>'+
  '<div class="detail-columns"><div class="card detail-card"><div class="panel-head"><h2>人物与资金详情</h2><span class="muted">画像 + 系统记录</span></div><div class="detail-list">'+
  line('系统分类',genderRelationLabel(p)||'--')+line('VIP',pVip(p)?(p.vip?.level||'VIP'):'否')+line('账户状态',p.account?.status||(isOpened(p)?'已开户':'未开户'))+line('群组状态',isJoined(p)?'已入群':'未入群')+
  line('职业',p.occupation?.title_zh||p.occupation?.title_fr||'--')+line('行业',p.occupation?.industry_zh||p.occupation?.industry_fr||'--')+
  line('年收入',cash(p.finance?.annual_income_eur||0,'EUR'))+line('可投资资产',cash(p.finance?.estimated_investable_assets_eur||0,'EUR'))+line('流动资产',cash(p.finance?.estimated_liquid_assets_eur||0,'EUR'))+line('可用投资资金',mapMoney(availableCapitalMap(p)))+
  line('交易/档案盈利',profitMoneyText(pf))+line('收益计算来源',pf?.manual?'手工档案（无可计算交易时）':'实际持仓/卖出价格')+
  line('当前持仓成本',mapMoney(costMap))+line('风险偏好',p.investment_profile?.risk_tolerance||'--')+line('参与频率',freq(p))+line('所属小组',groups.join('、')||'无')+
  '<div class="detail-line" style="grid-column:1/-1"><span>家庭情况</span><b>'+s(p.family?.summary||'--')+'</b></div><div class="detail-line" style="grid-column:1/-1"><span>性格</span><b>'+s(p.personality?.summary||'--')+'</b></div><div class="detail-line" style="grid-column:1/-1"><span>内部备注</span><b>'+s(p.crm?.notes||'--')+'</b></div></div></div>'+
  '<div class="card detail-card"><div class="panel-head"><h2>人物发展历程</h2><span class="muted">'+tl.length+' 个节点</span></div><div class="journey">'+(tl.length?tl.map(function(x){return'<div class="journey-item"><div class="journey-date">'+s(x.date)+'</div><div class="journey-rail"></div><div class="journey-body"><b>'+s(x.title)+'</b><small>'+s(x.detail)+'</small></div></div>'}).join(''):'<div class="empty">暂无发展历程记录</div>')+'</div></div></div>'+
  detailBottomBlocks(p)+
  '<div class="card detail-card detail-holdings-table"><div class="panel-head"><h2>持仓明细</h2><span class="muted">实际录入的持仓记录</span></div>'+holdingTable(p)+'</div>';
  $id('detailBack').onclick=function(){go('people');renderPeople()};
  $id('detailEdit').onclick=function(){openPerson(p.id)};
  $id('editPerformance').onclick=function(){editPerformance(p.id)};
}
function editPerformance(id){
  const p=person(id);if(!p)return;
  p.performance=p.performance&&typeof p.performance==='object'?p.performance:{};
  const pf=performance(p);
  openModal('资金与盈利维护 · '+label(p),'<div class="form-grid"><div class="field"><label>累计投入资金 EUR</label><input class="input" type="number" min="0" step="0.01" name="invested" value="'+s(p.performance.invested_capital_eur??(pf.invested||''))+'"></div><div class="field"><label>累计盈利 EUR</label><input class="input" type="number" step="0.01" name="profit" value="'+s(p.performance.total_profit_eur??'')+'" placeholder="亏损可输入负数"></div><div class="field full"><div class="notice">盈利占比 = 累计盈利 ÷ 累计投入资金。系统不会自动伪造价格或收益；未录入盈利时显示“未录入”。</div></div></div>',function(f){p.performance.invested_capital_eur=Number(f.get('invested'))||0;const raw=String(f.get('profit')||'').trim();p.performance.total_profit_eur=raw===''?null:Number(raw);setTimeout(function(){openDetail(p.id)},0)});
}
viewPerson=openDetail;
['personSearch','personSort','systemGroupFilter','customGroupFilter'].forEach(function(id){
  const el=$id(id);if(!el)return;el.dataset.peopleDetailFilterBound='1';
  if(id==='personSearch')el.oninput=renderPeople;else el.onchange=renderPeople;
});

function refreshBindings(){
  document.querySelectorAll('#peopleList [data-trade-pref]').forEach(function(b){
    if(b.dataset.boundDetail)return;b.dataset.boundDetail='1';
    b.addEventListener('click',function(e){e.stopPropagation()});
  });
}
function afterRender(){
  ensureUI();renderPeople();bindDynamic();refreshBindings();
}
ensureUI();
afterRender();
})();