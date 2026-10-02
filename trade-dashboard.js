/* Trade dashboard, cloud password auth, holdings and daily trade planning. */
(function(){
'use strict';

const SALE_WARNING_MINUTES=120;
let tradeTab='sell';

function byId(id){return document.getElementById(id)}
function safe(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]})}
function localDate(d){const x=d?new Date(d):new Date();return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
function localDateTime(d){const x=new Date(d);if(Number.isNaN(x.getTime()))return'--';return x.toLocaleString('zh-CN',{hour12:false})}
function pLabel(p){return p?(p.name||p.frenchName||p.id):'未知人物'}
function opened(p){return !!(p&&p.account&&p.account.opened)}
function joined(p){return !!(p&&p.crm&&p.crm.joined_group)}

function ensureTradeState(){
  db.portfolio=db.portfolio&&typeof db.portfolio==='object'?db.portfolio:{};
  db.portfolio.holdings=Array.isArray(db.portfolio.holdings)?db.portfolio.holdings:[];
  db.portfolio.buyPlans=Array.isArray(db.portfolio.buyPlans)?db.portfolio.buyPlans:[];
  db.portfolio.settings=db.portfolio.settings&&typeof db.portfolio.settings==='object'?db.portfolio.settings:{};
  const s=db.portfolio.settings;
  if(!Number.isFinite(Number(s.todayTarget)))s.todayTarget=8;
  if(typeof s.includeHolding!=='boolean')s.includeHolding=false;
  if(!s.defaultSymbol)s.defaultSymbol='';
  if(!s.defaultStockName)s.defaultStockName='';
  if(!Number.isFinite(Number(s.warningMinutes)))s.warningMinutes=SALE_WARNING_MINUTES;
  db.people.forEach(function(p){
    p.trade_profile=p.trade_profile&&typeof p.trade_profile==='object'?p.trade_profile:{};
    if(!p.trade_profile.participation_frequency){
      const a=(p.customer_relation&&p.customer_relation.activity_level)||'中';
      p.trade_profile.participation_frequency=a==='高'?'HIGH':(a==='低'?'LOW':'MEDIUM');
    }
    if(typeof p.trade_profile.required_today!=='boolean')p.trade_profile.required_today=false;
  });
}

function activeHoldings(){ensureTradeState();return db.portfolio.holdings.filter(function(h){return h.status!=='sold'})}
function holdingIds(){return new Set(activeHoldings().map(function(h){return String(h.personId)}))}
function noHoldingPeople(){const set=holdingIds();return db.people.filter(function(p){return !set.has(String(p.id))})}
function todaySell(){
  const end=new Date();end.setHours(23,59,59,999);
  return activeHoldings().filter(function(h){return h.plannedSellAt&&new Date(h.plannedSellAt).getTime()<=end.getTime()}).sort(function(a,b){return String(a.plannedSellAt).localeCompare(String(b.plannedSellAt))});
}
function todayBuy(){const today=localDate();ensureTradeState();return db.portfolio.buyPlans.filter(function(x){return x.status==='planned'&&x.date===today})}
function dueSoon(h){
  if(!h.plannedSellAt)return false;
  const diff=new Date(h.plannedSellAt).getTime()-Date.now();
  return diff<=Number(db.portfolio.settings.warningMinutes||SALE_WARNING_MINUTES)*60000;
}
function countdown(h){
  if(!h.plannedSellAt)return'未设时间';
  const ms=new Date(h.plannedSellAt).getTime()-Date.now();
  if(ms<=0)return'已到计划时间';
  const m=Math.floor(ms/60000), hh=Math.floor(m/60), mm=m%60;
  return hh>0?hh+'小时'+mm+'分':mm+'分钟';
}
function seededScore(id,date){
  let x=2166136261;
  const s=String(id)+'|'+String(date);
  for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619)}
  return ((x>>>0)%100000)/100000;
}
function freqWeight(p){
  const f=p&&p.trade_profile&&p.trade_profile.participation_frequency;
  return f==='HIGH'?3:(f==='LOW'?1:2);
}

function ensureTradeUI(){
  const nav=document.querySelector('.nav');
  if(nav&&!document.querySelector('[data-page="trades"]')){
    const b=document.createElement('button');
    b.dataset.page='trades';b.innerHTML='<i>◈</i><span>交易计划</span>';
    const groups=document.querySelector('[data-page="groups"]');
    if(groups&&groups.nextSibling)nav.insertBefore(b,groups.nextSibling);else nav.appendChild(b);
    b.onclick=function(){go('trades');tradeTab='sell';renderTrades()};
  }
  if(nav&&!byId('logoutBtn')){const out=document.createElement('button');out.id='logoutBtn';out.innerHTML='<i>↪</i><span>退出登录</span>';out.onclick=async function(){try{await window.ChenNanCloud.logout();location.reload()}catch(err){console.error('Logout failed',err);toast('退出未完成：请先确认云端保存成功')}};nav.appendChild(out)}
  if(!byId('trades')){
    const s=document.createElement('section');s.id='trades';s.className='section';
    s.innerHTML='<div class="topbar"><div><div class="eyebrow">TRADE PLAN</div><h1 class="page-title">交易计划</h1><p class="sub">统一管理今日待售、待买、全部持仓、未持仓人员与自动生成规则。</p></div><div class="actions"><button class="btn ghost" id="generateBuyList">生成 / 重算今日买入名单</button><button class="btn primary" id="addHolding">＋ 新增持仓</button></div></div><div id="tradeSummary" class="trade-summary-grid"></div><div class="trade-tabs" id="tradeTabs"></div><div id="tradePanel"></div>';
    const records=byId('records');records.parentNode.insertBefore(s,records);
  }
  const overview=byId('overview');
  if(overview&&!byId('tradeOverview')){
    const block=document.createElement('div');block.id='tradeOverview';block.style.marginTop='18px';
    overview.appendChild(block);
  }
  if(!byId('tradeExtraStyles')){
    const st=document.createElement('style');st.id='tradeExtraStyles';
    st.textContent=".app-lock{visibility: hidden;}\n.trade-tabs{display: flex; gap: 8px; flex-wrap: wrap; margin: 0px 0px 16px;}\n.trade-tab{padding: 9px 13px; border-radius: 10px; background: rgb(255, 255, 255); border: 1px solid var(--line); font-weight: 750; color: var(--muted);}\n.trade-tab.active{background: var(--blue); border-color: var(--blue); color: rgb(255, 255, 255);}\n.click-card{cursor: pointer; transition: 0.2s;}\n.click-card:hover{transform: translateY(-2px); box-shadow: rgba(31, 52, 86, 0.11) 0px 14px 32px;}\n.trade-grid{display: grid; grid-template-columns: repeat(2, minmax(0px, 1fr)); gap: 18px;}\n.trade-list{display: grid; gap: 10px;}\n.trade-item{display: grid; grid-template-columns: minmax(0px, 1fr) auto; gap: 12px; padding: 13px; border: 1px solid var(--line); border-radius: 13px; background: rgb(255, 255, 255);}\n.trade-item.due{border-color: rgb(241, 194, 123); background: rgb(255, 250, 240);}\n.trade-item.overdue{border-color: rgb(231, 168, 172); background: rgb(255, 245, 245);}\n.trade-meta{color: var(--muted); font-size: 12px; margin-top: 4px;}\n.trade-actions{display: flex; gap: 7px; align-items: center; flex-wrap: wrap;}\n.pill{font-size: 11px; padding: 4px 8px; border-radius: 999px; background: rgb(242, 244, 248); color: rgb(91, 102, 120);}\n.pill.hot{background: var(--amber-weak); color: var(--amber);}\n.pill.good{background: var(--green-weak); color: var(--green);}\n@keyframes pulseMark { \n  50% { transform: scale(1.06); box-shadow: rgba(96, 129, 255, 0.06) 0px 0px 0px 18px, rgba(96, 129, 255, 0.02) 0px 0px 0px 36px; }\n}\n@media (max-width: 900px){\n.trade-grid{width: 100%; grid-template-columns: minmax(0px, 1fr) !important;}\n.trade-grid > *{min-width: 0px; max-width: 100%;}\n}\n";
    document.head.appendChild(st);
  }
}
function tabButton(id,label){return '<button class="trade-tab '+(tradeTab===id?'active':'')+'" data-trade-tab="'+id+'">'+label+'</button>'}
function renderTabs(){
  const t=byId('tradeTabs');if(!t)return;
  t.innerHTML=tabButton('sell','今日待售')+tabButton('buy','今日待买')+tabButton('holdings','全部持仓')+tabButton('unholding','未持仓人员')+tabButton('settings','规则设置');
  t.querySelectorAll('[data-trade-tab]').forEach(function(b){b.onclick=function(){tradeTab=b.dataset.tradeTab;renderTrades()}});
}

function buildHoldingMixRows(holds){
  const map=new Map();
  holds.forEach(function(row){
    const symbol=String(row.symbol||'').trim().toUpperCase()||'--';
    const name=String(row.name||row.stockName||symbol||'未命名股票').trim();
    const key=symbol+'|'+name;
    if(!map.has(key))map.set(key,{symbol:symbol,name:name,people:new Set(),count:0});
    const item=map.get(key);
    item.count+=1;
    if(row.personId!=null&&String(row.personId).trim())item.people.add(String(row.personId).trim());
  });
  const rows=[...map.values()].map(function(item){
    return {symbol:item.symbol,name:item.name,count:item.people.size||item.count};
  }).sort(function(a,b){return b.count-a.count||a.symbol.localeCompare(b.symbol)});
  const max=Math.max(1,...rows.map(function(x){return x.count}));
  return rows.slice(0,6).map(function(row){
    return {symbol:row.symbol,name:row.name,count:row.count,width:Math.max(10,Math.round(row.count/max*100))};
  });
}
function renderHoldingMixChart(holds){
  const rows=buildHoldingMixRows(holds);
  if(!rows.length)return '<div class="empty overview-empty">暂无持仓数据</div>';
  return '<div class="hold-chart-overview">'+rows.map(function(row){
    return '<div class="hold-chart-row">'+
      '<div class="hold-chart-label"><b>'+safe(row.symbol)+'</b><small>'+safe(row.name)+'</small></div>'+
      '<div class="hold-chart-track"><i class="hold-chart-fill" style="width:'+row.width+'%"></i></div>'+
      '<span class="hold-chart-count">'+row.count+'人</span>'+
    '</div>';
  }).join('')+'</div>';
}
function renderOverviewSellList(rows){
  if(!rows.length)return '<div class="empty overview-empty">今天没有待卖出股票</div>';
  return '<div class="overview-sell-list">'+rows.slice(0,6).map(function(h){
    const p=person(h.personId),hot=dueSoon(h)?' hot':'';
    return '<div class="overview-sell-item'+hot+'">'+
      '<div class="overview-sell-main"><b>'+safe(h.symbol||h.name||'未命名股票')+'</b><small>'+safe(pCode(p))+' · '+safe(pLabel(p))+'</small></div>'+
      '<div class="overview-sell-time"><strong>'+safe(localDateTime(h.plannedSellAt))+'</strong><span>'+safe(countdown(h))+'</span></div>'+
    '</div>';
  }).join('')+'</div>';
}

function renderDashboard(){
  ensureTradeState();
  const holds=activeHoldings(),hid=holdingIds(),sell=todaySell(),buy=todayBuy();
  const openedCount=db.people.filter(opened).length;
  const notJoined=db.people.filter(function(p){return !joined(p)}).length;
  const holdingPeopleCount=hid.size;
  const noHold=db.people.filter(function(p){return !hid.has(String(p.id))}).length;
  const metrics=byId('metrics');
  if(metrics){
    metrics.innerHTML=
      '<div class="card metric click-card" data-dash="all"><span class="label">人物总数</span><strong>'+db.people.length+'</strong><span class="trend">完整人物画像</span></div>'+
      '<div class="card metric click-card" data-dash="opened"><span class="label">已开户人员</span><strong>'+openedCount+'</strong><span class="trend">点击查看人物</span></div>'+
      '<div class="card metric click-card" data-dash="not_joined"><span class="label">未入群人员</span><strong>'+notJoined+'</strong><span class="trend">点击查看名单</span></div>'+
      '<div class="card metric click-card" data-dash="holding"><span class="label">持仓人员</span><strong>'+holdingPeopleCount+'</strong><span class="trend">'+holds.length+' 笔持仓</span></div>'+
      '<div class="card metric click-card" data-dash="unholding"><span class="label">未持仓人员</span><strong>'+noHold+'</strong><span class="trend">点击查看名单</span></div>'+
      '<div class="card metric click-card" data-dash="sell"><span class="label">今日待售</span><strong>'+sell.length+'</strong><span class="trend">'+sell.filter(dueSoon).length+' 笔临近/到时</span></div>'+
      '<div class="card metric click-card" data-dash="buy"><span class="label">今日待买人员</span><strong>'+buy.length+'</strong><span class="trend">按规则生成</span></div>'+
      '<div class="card metric click-card" data-dash="groups"><span class="label">均衡小组</span><strong>'+db.customGroups.length+'</strong><span class="trend">人员规划</span></div>';
  }
  const ov=byId('tradeOverview');
  if(ov){
    ov.innerHTML=
      '<div class="card panel overview-bottom-panel">'+
        '<div class="panel-head"><h2>股票持仓组合图</h2><button class="link-btn" data-dash="holding">持仓管理 →</button></div>'+
        renderHoldingMixChart(holds)+
      '</div>'+
      '<div class="card panel overview-bottom-panel">'+
        '<div class="panel-head"><h2>今日待卖出股票</h2><button class="link-btn" data-dash="sell">交易计划 →</button></div>'+
        renderOverviewSellList(sell)+
      '</div>';
  }
  document.querySelectorAll('[data-dash]').forEach(function(el){el.onclick=function(){openDash(el.dataset.dash)}});
  document.querySelectorAll('[data-person-detail]').forEach(function(el){el.onclick=function(){viewPerson(el.dataset.personDetail)}});
}
function openDash(type){
  if(type==='opened'||type==='not_joined'||type==='all'){
    go('people');
    const f=byId('systemGroupFilter');
    if(f){f.value=type==='opened'?'opened':(type==='not_joined'?'not_joined':'all');renderPeople()}
    return;
  }
  if(type==='groups'){go('groups');return}
  const target=type==='buy'||type==='unholding'?'tradeRecommend':'holdingsV2';
  const button=document.querySelector('.nav button[data-page="'+target+'"]');
  if(button)button.click();
}

function renderTrades(){
  ensureTradeState();renderTabs();
  const summary=byId('tradeSummary');
  if(summary){
    const sell=todaySell(),buy=todayBuy(),holds=activeHoldings(),unholding=noHoldingPeople();
    const soon=sell.filter(dueSoon).length;
    summary.innerHTML=
      '<div class="card trade-summary-card"><span>今日待售</span><strong>'+sell.length+'</strong><small>'+soon+' 笔临近/到时</small></div>'+
      '<div class="card trade-summary-card"><span>今日待买</span><strong>'+buy.length+'</strong><small>按规则生成名单</small></div>'+
      '<div class="card trade-summary-card"><span>当前持仓</span><strong>'+holds.length+'</strong><small>未卖出记录</small></div>'+
      '<div class="card trade-summary-card"><span>未持仓人员</span><strong>'+unholding.length+'</strong><small>可继续规划</small></div>';
  }
  const panel=byId('tradePanel');if(!panel)return;
  if(tradeTab==='sell')panel.innerHTML=renderSell();
  else if(tradeTab==='buy')panel.innerHTML=renderBuy();
  else if(tradeTab==='holdings')panel.innerHTML=renderHoldings();
  else if(tradeTab==='unholding')panel.innerHTML=renderUnholding();
  else panel.innerHTML=renderSettings();
  bindTradeActions();
}
function renderSell(){
  const rows=todaySell();
  if(!rows.length)return '<div class="card panel"><div class="panel-head"><h2>今日待售股票</h2><span class="muted">临近提醒 '+Number(db.portfolio.settings.warningMinutes||SALE_WARNING_MINUTES)+' 分钟</span></div><div class="empty">今天没有计划卖出的持仓</div></div>';
  return '<div class="card panel"><div class="panel-head"><h2>今日待售股票</h2><span class="muted">'+rows.length+' 笔 · 临近 '+Number(db.portfolio.settings.warningMinutes||SALE_WARNING_MINUTES)+' 分钟高亮</span></div>'+
    '<div class="trade-plan-table"><div class="trade-plan-table-head"><span>股票</span><span>人物</span><span>数量</span><span>买入价</span><span>计划卖出</span><span>状态</span><span>操作</span></div>'+
    rows.map(function(h){
      const p=person(h.personId),over=new Date(h.plannedSellAt).getTime()<=Date.now(),cl=over?' overdue':(dueSoon(h)?' due':'');
      return '<div class="trade-plan-table-row'+cl+'" data-ui-surface="leaf"><div><b>'+safe(h.symbol||'--')+'</b><small>'+safe(h.name||'')+'</small></div><div><b>'+safe(pCode(p))+'</b><small>'+safe(pLabel(p))+'</small></div><div>'+safe(h.quantity||0)+'</div><div>'+safe(h.buyPrice||'--')+'</div><div><b>'+safe(localDateTime(h.plannedSellAt))+'</b><small>'+safe(countdown(h))+'</small></div><div><span class="pill '+(dueSoon(h)?'hot':'')+'">'+(over?'已到时':(dueSoon(h)?'临近卖出':'待售'))+'</span></div><div class="trade-table-actions"><button class="link-btn" data-person-detail="'+safe(h.personId)+'">人物</button><button class="link-btn" data-edit-holding="'+safe(h.id)+'">编辑</button><button class="link-btn" data-sold="'+safe(h.id)+'">确认卖出</button></div></div>';
    }).join('')+'</div></div>';
}
function renderBuy(){
  const rows=todayBuy();
  return '<div class="card panel"><div class="panel-head"><div><h2>今日待买入人员</h2><p class="muted">根据参与频率、持仓状态和规则排序生成。</p></div><div class="button-row"><button class="btn ghost small" id="addManualBuy">＋ 手工加入</button><button class="btn primary small" id="generateBuyListInline">生成 / 重算</button></div></div>'+
    (rows.length?'<div class="trade-plan-table buy-table"><div class="trade-plan-table-head"><span>人物</span><span>股票</span><span>参与频率</span><span>持仓状态</span><span>来源/原因</span><span>指定</span><span>操作</span></div>'+
      rows.map(function(x){
        const p=person(x.personId),isHold=holdingIds().has(String(x.personId));
        return '<div class="trade-plan-table-row" data-ui-surface="leaf"><div><b>'+safe(pCode(p))+' · '+safe(pLabel(p))+'</b><small>'+safe(genderRelationLabel(p)||'--')+'</small></div><div><b>'+safe(x.symbol||'股票待定')+'</b><small>'+safe(x.stockName||'')+'</small></div><div>'+safe(freqLabel(p))+'</div><div>'+(isHold?'已有持仓':'未持仓')+'</div><div>'+safe(x.reason||'规则生成')+'</div><div>'+(p&&p.trade_profile&&p.trade_profile.required_today?'<span class="pill hot">指定参与</span>':'—')+'</div><div class="trade-table-actions"><button class="link-btn" data-person-detail="'+safe(x.personId)+'">详情</button><button class="link-btn" data-buy-done="'+safe(x.id)+'">已买</button><button class="link-btn danger" data-buy-remove="'+safe(x.id)+'">移除</button></div></div>';
      }).join('')+'</div>':'<div class="empty">尚未生成今天的买入人员名单</div>')+'</div>';
}
function renderHoldings(){
  const rows=activeHoldings();
  return '<div class="card panel"><div class="panel-head"><h2>全部持仓</h2><div class="button-row"><span class="muted">'+rows.length+' 笔</span><button class="btn primary small" id="addHoldingInline">＋ 新增持仓</button></div></div>'+
    (rows.length?'<div class="table-wrap"><table class="mini-table"><thead><tr><th>人物</th><th>股票</th><th>数量</th><th>买入价</th><th>买入时间</th><th>计划卖出</th><th>状态</th><th>操作</th></tr></thead><tbody>'+
      rows.map(function(h){const p=person(h.personId),soon=dueSoon(h);return'<tr><td><button class="link-btn" data-person-detail="'+safe(h.personId)+'">'+safe(pCode(p))+' · '+safe(pLabel(p))+'</button></td><td><b>'+safe(h.symbol||'--')+'</b> '+safe(h.name||'')+'</td><td>'+safe(h.quantity||0)+'</td><td>'+safe(h.buyPrice||'--')+'</td><td>'+safe(localDateTime(h.buyAt))+'</td><td>'+safe(localDateTime(h.plannedSellAt))+'</td><td><span class="pill '+(soon?'hot':'')+'">'+(soon?'临近':'持有中')+'</span></td><td><button class="link-btn" data-edit-holding="'+safe(h.id)+'">编辑</button> <button class="link-btn danger" data-delete-holding="'+safe(h.id)+'">删除</button></td></tr>'}).join('')+
      '</tbody></table></div>':'<div class="empty">暂无持仓</div>')+'</div>';
}
function renderUnholding(){
  const rows=noHoldingPeople();
  return '<div class="card panel"><div class="panel-head"><h2>未持仓人员</h2><span class="muted">'+rows.length+' 人</span></div>'+
    (rows.length?'<div class="unholding-grid">'+rows.map(function(p){return'<div class="unholding-row" data-ui-surface="leaf"><div class="person"><b>'+safe(pCode(p))+' · '+safe(pLabel(p))+'</b><small>'+safe(genderRelationLabel(p)||'--')+' · '+(opened(p)?'已开户':'未开户')+' · '+(joined(p)?'已入群':'未入群')+'</small></div><div><span>参与频率</span><b>'+safe(freqLabel(p))+'</b></div><div class="trade-table-actions"><button class="link-btn" data-person-detail="'+safe(p.id)+'">详情</button><button class="link-btn" data-trade-pref="'+safe(p.id)+'">交易设置</button></div></div>'}).join('')+'</div>':'<div class="empty">当前没有未持仓人员</div>')+'</div>';
}
function renderSettings(){
  const s=db.portfolio.settings;
  return '<div class="trade-settings-layout"><div class="card panel"><div class="panel-head"><h2>今日名单生成规则</h2><span class="muted">自动同步云端</span></div><form id="tradeSettingsForm" class="form-grid"><div class="field"><label>目标人数</label><input class="input" type="number" min="1" max="70" name="target" value="'+safe(s.todayTarget)+'"></div><div class="field"><label>持仓人员继续参与</label><select class="select" name="includeHolding"><option value="0" '+(!s.includeHolding?'selected':'')+'>否，优先未持仓</option><option value="1" '+(s.includeHolding?'selected':'')+'>是，可继续参与</option></select></div><div class="field"><label>默认股票代码</label><input class="input" name="symbol" value="'+safe(s.defaultSymbol)+'" placeholder="例如 AIR.PA"></div><div class="field"><label>默认股票名称</label><input class="input" name="stockName" value="'+safe(s.defaultStockName)+'" placeholder="例如 Airbus"></div><div class="field"><label>卖出临近提醒（分钟）</label><input class="input" type="number" min="5" max="1440" name="warning" value="'+safe(s.warningMinutes)+'"></div><div class="field full"><button class="btn primary">保存规则</button></div></form></div>'+
    '<div class="card panel"><div class="panel-head"><h2>规则说明</h2><span class="muted">执行顺序</span></div><div class="cn-rule-list"><div><span>第一优先级</span><b>用户指定今日参与人员</b></div><div><span>候选范围</span><b>已开户人物</b></div><div><span>排序因素</span><b>参与频率 / 持仓 / 稳定随机分</b></div><div><span>名单稳定性</span><b>同一天名单固定</b></div><div><span>重算</span><b>按当前规则重新生成</b></div><div><span>个人规则</span><b>可在人物交易设置中调整</b></div></div></div></div>';
}
function freqLabel(p){const f=p&&p.trade_profile&&p.trade_profile.participation_frequency;return f==='HIGH'?'高':(f==='LOW'?'低':'中')}

function bindTradeActions(){
  document.querySelectorAll('[data-person-detail]').forEach(function(b){b.onclick=function(){viewPerson(b.dataset.personDetail)}});
  document.querySelectorAll('[data-sold]').forEach(function(b){b.onclick=function(){const h=db.portfolio.holdings.find(function(x){return x.id===b.dataset.sold});if(h)window.ChenNanTrading?.sellHolding(h.id)}});
  document.querySelectorAll('[data-buy-done]').forEach(function(b){b.onclick=function(){const x=db.portfolio.buyPlans.find(function(v){return v.id===b.dataset.buyDone});if(x){x.status='done';x.doneAt=new Date().toISOString();save();render()}}});
  document.querySelectorAll('[data-buy-remove]').forEach(function(b){b.onclick=function(){db.portfolio.buyPlans=db.portfolio.buyPlans.filter(function(x){return x.id!==b.dataset.buyRemove});save();render()}});
  document.querySelectorAll('[data-edit-holding]').forEach(function(b){b.onclick=function(){openHolding(b.dataset.editHolding)}});
  document.querySelectorAll('[data-delete-holding]').forEach(function(b){b.onclick=function(){if(confirm('删除这笔持仓？')){db.portfolio.holdings=db.portfolio.holdings.filter(function(x){return x.id!==b.dataset.deleteHolding});save();render()}}});
  document.querySelectorAll('[data-trade-pref]').forEach(function(b){if(b.closest('#peopleList'))return;b.onclick=function(){openTradePrefs(b.dataset.tradePref)}});
  const add=byId('addHoldingInline');if(add)add.onclick=function(){openHolding()};
  const add2=byId('addHolding');if(add2)add2.onclick=function(){openHolding()};
  const gen=byId('generateBuyListInline');if(gen)gen.onclick=generateBuyList;
  const gen2=byId('generateBuyList');if(gen2)gen2.onclick=generateBuyList;
  const manual=byId('addManualBuy');if(manual)manual.onclick=openManualBuy;
  const form=byId('tradeSettingsForm');if(form)form.onsubmit=function(e){e.preventDefault();const f=new FormData(form),s=db.portfolio.settings;s.todayTarget=Math.max(1,Math.min(70,Number(f.get('target'))||8));s.includeHolding=f.get('includeHolding')==='1';s.defaultSymbol=String(f.get('symbol')||'').trim();s.defaultStockName=String(f.get('stockName')||'').trim();s.warningMinutes=Math.max(5,Math.min(1440,Number(f.get('warning'))||SALE_WARNING_MINUTES));save();render();toast('交易规则已保存')};
}

function openHolding(id){
  ensureTradeState();
  const h=id?db.portfolio.holdings.find(function(x){return x.id===id}):{id:'h'+crypto.randomUUID(),personId:'',symbol:'',name:'',quantity:0,buyPrice:'',buyAt:new Date().toISOString().slice(0,16),plannedSellAt:new Date(Date.now()+3*86400000).toISOString().slice(0,16),status:'holding'};
  if(!h)return;
  const opts=db.people.filter(opened).map(function(p){return'<option value="'+safe(p.id)+'" '+(String(p.id)===String(h.personId)?'selected':'')+'>'+safe(pCode(p))+' · '+safe(pLabel(p))+'</option>'}).join('');
  openModal(id?'编辑持仓':'新增持仓','<div class="form-grid"><div class="field"><label>持仓人员 *</label><select class="select" name="personId" required><option value="">请选择</option>'+opts+'</select></div><div class="field"><label>股票代码 *</label><input class="input" name="symbol" required value="'+safe(h.symbol||'')+'"></div><div class="field"><label>股票名称</label><input class="input" name="name" value="'+safe(h.name||'')+'"></div><div class="field"><label>数量</label><input class="input" type="number" min="0" step="0.0001" name="quantity" value="'+safe(h.quantity||0)+'"></div><div class="field"><label>买入价</label><input class="input" type="number" min="0" step="0.0001" name="buyPrice" value="'+safe(h.buyPrice||'')+'"></div><div class="field"><label>买入时间</label><input class="input" type="datetime-local" name="buyAt" value="'+safe(String(h.buyAt||'').slice(0,16))+'"></div><div class="field"><label>计划卖出时间 *</label><input class="input" type="datetime-local" required name="plannedSellAt" value="'+safe(String(h.plannedSellAt||'').slice(0,16))+'"></div></div>',function(f){const quantity=Number(f.get('quantity')),price=Number(f.get('buyPrice')),buy=new Date(String(f.get('buyAt'))),sell=new Date(String(f.get('plannedSellAt')));if(!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(price)||price<=0||!Number.isFinite(buy.getTime())||!Number.isFinite(sell.getTime())||sell<buy){toast('数量和买入价必须为正数，卖出时间不能早于买入时间');return false}const x=h;x.personId=String(f.get('personId'));x.symbol=String(f.get('symbol')).trim();x.name=String(f.get('name')).trim();x.quantity=Number(f.get('quantity'))||0;x.buyPrice=Number(f.get('buyPrice'))||0;x.buyAt=f.get('buyAt')?new Date(String(f.get('buyAt'))).toISOString():new Date().toISOString();x.plannedSellAt=new Date(String(f.get('plannedSellAt'))).toISOString();x.status='holding';if(!id)db.portfolio.holdings.push(x)});
}
function openTradePrefs(id){
  const p=person(id);if(!p)return;ensureTradeState();
  openModal('交易参与设置 · '+pLabel(p),'<div class="form-grid"><div class="field"><label>参与频率</label><select class="select" name="freq"><option value="HIGH" '+(p.trade_profile.participation_frequency==='HIGH'?'selected':'')+'>高</option><option value="MEDIUM" '+(p.trade_profile.participation_frequency==='MEDIUM'?'selected':'')+'>中</option><option value="LOW" '+(p.trade_profile.participation_frequency==='LOW'?'selected':'')+'>低</option></select></div><div class="field"><label>今天强制参与</label><select class="select" name="required"><option value="0" '+(!p.trade_profile.required_today?'selected':'')+'>否</option><option value="1" '+(p.trade_profile.required_today?'selected':'')+'>是</option></select></div></div>',function(f){p.trade_profile.participation_frequency=String(f.get('freq'));p.trade_profile.required_today=f.get('required')==='1'});
}
function openManualBuy(){
  const opts=db.people.filter(opened).map(function(p){return'<option value="'+safe(p.id)+'">'+safe(pCode(p))+' · '+safe(pLabel(p))+'</option>'}).join('');
  openModal('手工加入今日买入名单','<div class="form-grid"><div class="field"><label>人员 *</label><select class="select" name="personId" required><option value="">请选择</option>'+opts+'</select></div><div class="field"><label>股票代码</label><input class="input" name="symbol" value="'+safe(db.portfolio.settings.defaultSymbol||'')+'"></div><div class="field"><label>股票名称</label><input class="input" name="stockName" value="'+safe(db.portfolio.settings.defaultStockName||'')+'"></div><div class="field full"><label>原因</label><input class="input" name="reason" value="用户手工指定"></div></div>',function(f){const date=localDate();db.portfolio.buyPlans.push({id:'bp'+crypto.randomUUID(),personId:String(f.get('personId')),date:date,symbol:String(f.get('symbol')||'').trim(),stockName:String(f.get('stockName')||'').trim(),reason:String(f.get('reason')||'手工指定'),source:'manual',status:'planned'})});
}
function generateBuyList(){
  ensureTradeState();
  const date=localDate(),s=db.portfolio.settings,hids=holdingIds();
  let candidates=db.people.filter(opened);
  const required=candidates.filter(function(p){return p.trade_profile&&p.trade_profile.required_today});
  if(!s.includeHolding)candidates=candidates.filter(function(p){return !hids.has(String(p.id))});
  const requiredIds=new Set(required.map(function(p){return String(p.id)}));
  candidates=candidates.filter(function(p){return !requiredIds.has(String(p.id))});
  candidates.sort(function(a,b){
    const as=freqWeight(a)*10+(hids.has(String(a.id))?-4:4)+seededScore(a.id,date);
    const bs=freqWeight(b)*10+(hids.has(String(b.id))?-4:4)+seededScore(b.id,date);
    return bs-as;
  });
  const target=Math.max(Number(s.todayTarget)||8,required.length);
  const selected=required.concat(candidates.slice(0,Math.max(0,target-required.length)));
  db.portfolio.buyPlans=db.portfolio.buyPlans.filter(function(x){return x.date!==date||x.source==='manual'||x.status!=='planned'});
  selected.forEach(function(p){db.portfolio.buyPlans.push({id:'bp'+Date.now()+Math.random().toString(16).slice(2),personId:String(p.id),date:date,symbol:s.defaultSymbol||'',stockName:s.defaultStockName||'',reason:(p.trade_profile&&p.trade_profile.required_today)?'用户指定参与':'系统规则生成',source:'auto',status:'planned'})});
  save();tradeTab='buy';render();toast('今日买入名单已生成：'+selected.length+' 人');
}

function enhancePeopleRows(){
  document.querySelectorAll('#peopleList .profile-row').forEach(function(row){
    const edit=row.querySelector('.edit-person');if(!edit||row.querySelector('.trade-pref-btn'))return;
    const b=document.createElement('button');b.className='link-btn trade-pref-btn';b.textContent='交易设置';b.dataset.tradePref=edit.dataset.id;b.onclick=function(){openTradePrefs(b.dataset.tradePref)};
    row.insertBefore(b,edit);
  });
}

function wrapRender(){
  const core=render;
  render=function(){ensureTradeState();core();ensureTradeUI();renderDashboard();renderTrades();enhancePeopleRows();bindTradeActions()};
  const tradeSaveBase=save;save=function(){tradeSaveBase();renderDashboard();};
}


function boot(){
  try{ensureTradeState();ensureTradeUI();wrapRender();render()}catch(err){console.error('Workspace initial render failed',err)}
  setInterval(function(){if(byId('trades')&&byId('trades').classList.contains('active'))renderTrades();if(byId('overview')&&byId('overview').classList.contains('active'))renderDashboard()},60000);
}
boot();
})();
