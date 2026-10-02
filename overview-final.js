/* 辰南撰写 · 全工作台统一设计稿（2026-10-03）
   按已确认的白灰金色 UI 统一全部内部页面；只调整视觉与布局，不改变人物、交易、持仓、云同步业务数据。 */
(function(){
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const app=$('.app'),sidebar=$('.sidebar'),main=$('.main'),nav=$('.nav'),overview=$('#overview');
if(!app||!sidebar||!main||!nav||!overview)return;

/* 固定导航：取消桌面伸缩，保留原功能入口。 */
app.classList.remove('nav-collapsed');
try{localStorage.removeItem('chennan-nav-collapsed')}catch{}
$('.nav-collapse')?.remove();

const labels={
  overview:'概览',
  people:'人物库',
  groups:'分组管理',
  tradeRecommend:'人物交易',
  holdingsV2:'持仓管理',
  trades:'交易计划',
  records:'人物记录',
  novel:'撰写',
  france70chat:'France 70',
  topics:'一致性检查'
};
const icons={
  overview:'⌂',people:'♙',groups:'☑',tradeRecommend:'▱',holdingsV2:'♧',
  trades:'↗',records:'▤',novel:'✎',france70chat:'♛',topics:'✓'
};
$$('button[data-page]',nav).forEach(btn=>{
  const span=$('span',btn),i=$('i',btn),page=btn.dataset.page;
  if(span&&labels[page])span.textContent=labels[page];
  if(i&&icons[page])i.textContent=icons[page];
});

/* 按设计稿固定桌面导航顺序。 */
['overview','people','groups','tradeRecommend','holdingsV2','trades','records','novel','france70chat','topics'].forEach(page=>{
  const btn=nav.querySelector('[data-page="'+page+'"]');
  if(btn)nav.appendChild(btn);
});
const logout=$('#logoutBtn');
if(logout){
  logout.classList.add('overview-logout');
  nav.appendChild(logout);
}


/* 左上品牌：保留金色“辰南”字色，只让蓝色电流在文字外部运动。 */
const brandNode=$('.brand');
if(brandNode){
  brandNode.innerHTML='<div class="cn-electric-logo" aria-label="辰南"><span class="cn-brush-logo-text">辰南</span><i class="cn-current cn-current-a" aria-hidden="true"></i><i class="cn-current cn-current-b" aria-hidden="true"></i><i class="cn-current cn-current-c" aria-hidden="true"></i></div>';
}

/* ESC 返回上一模块：输入/编辑与弹窗状态下不抢占 Esc。 */
const pageHistory=[];
let lastActivePage=$('.section.active')?.id||'overview';
let escReturning=false;
function syncPageHistory(){
  const current=$('.section.active')?.id;
  if(!current||current===lastActivePage)return;
  if(escReturning){
    lastActivePage=current;
    escReturning=false;
    return;
  }
  if(lastActivePage)pageHistory.push(lastActivePage);
  if(pageHistory.length>24)pageHistory.shift();
  lastActivePage=current;
}
new MutationObserver(syncPageHistory).observe(main,{subtree:true,attributes:true,attributeFilter:['class']});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||event.defaultPrevented)return;
  const target=event.target;
  if(target?.closest?.('input,textarea,select,[contenteditable="true"],.modal-wrap.show,dialog[open]'))return;
  const current=$('.section.active')?.id||'overview';
  let previous=pageHistory.pop();
  while(previous===current)previous=pageHistory.pop();
  if(!previous&&current!=='overview')previous='overview';
  if(!previous)return;
  const button=nav.querySelector('button[data-page="'+previous+'"]');
  if(!button)return;
  event.preventDefault();
  escReturning=true;
  button.click();
});

/* 全部内部页面取消顶部“搜索 / 同步 / 管理员”整排；页面直接从标题与主体开始。 */
const header=$('.app-global-header');
const overviewTop=$('#overview .topbar');
const overviewActions=overviewTop?.querySelector('.actions')||$('.overview-header-actions');
if(header)header.classList.remove('design-header');
if(overviewTop&&overviewActions&&overviewActions.parentElement!==overviewTop)overviewTop.appendChild(overviewActions);
if(overviewActions)overviewActions.classList.add('overview-header-actions');


/* 人物库第二页精简：移除说明条与“横向滑动”提示，不改人物数据。 */
const peopleSection=$('#people');
if(peopleSection){
  peopleSection.querySelector(':scope > .notice')?.remove();
}

/* 标题行：去掉旧介绍，改成设计稿中的实时资料状态。 */
if(overviewTop){
  overviewTop.classList.add('overview-titlebar');
  const titleBlock=overviewTop.firstElementChild;
  const oldSub=titleBlock?.querySelector('.sub');
  if(oldSub)oldSub.remove();
  if(titleBlock&&!$('.overview-title-row',titleBlock)){
    const h1=$('.page-title',titleBlock);
    if(h1){
      const row=document.createElement('div');
      row.className='overview-title-row';
      h1.parentNode.insertBefore(row,h1);
      row.appendChild(h1);
      const divider=document.createElement('span');
      divider.className='overview-title-divider';
      divider.setAttribute('aria-hidden','true');
      row.appendChild(divider);
      const summary=document.createElement('span');
      summary.className='overview-summary-inline';
      row.appendChild(summary);
    }
  }
}

/* 资料状态来自真实 seedNotice；只改变展示位置，不改数据。 */
const seed=$('#seedNotice');
function syncOverviewSummary(){
  const summary=$('.overview-summary-inline');
  if(!summary)return;
  const count=($('#metrics .metric strong')?.textContent||'').trim();
  const raw=(seed?.textContent||'').replace(/默认人物数据已就绪：/,'').trim();
  const clean=/\d+\s*位人物资料已加载/.test(raw)
    ? raw.replace(/\s*·\s*/g,' · ')
    : ((count||'70')+'位人物资料已加载 · 完整画像与工作区数据');
  summary.textContent=clean;
}
syncOverviewSummary();
if(seed){
  seed.classList.add('overview-seed-source');
  new MutationObserver(syncOverviewSummary).observe(seed,{childList:true,subtree:true,characterData:true});
}

/* 指标卡：保留 trade-dashboard 的真实计算结果，只增加设计稿图标与箭头。 */
const metricIcons={all:'♟',opened:'●',not_joined:'●',holding:'▣',unholding:'●',sell:'◷',buy:'▥',groups:'▤'};
function decorateMetrics(){
  const box=$('#metrics');if(!box)return;
  $$('.metric',box).forEach(card=>{
    if(card.dataset.designDecorated==='1')return;
    card.dataset.designDecorated='1';
    const key=card.dataset.dash||'all';
    const icon=document.createElement('span');
    icon.className='overview-metric-icon '+(key==='unholding'?'muted-icon':'');
    icon.textContent=metricIcons[key]||'●';
    card.insertBefore(icon,card.firstChild);
    const content=document.createElement('span');
    content.className='overview-metric-content';
    while(icon.nextSibling)content.appendChild(icon.nextSibling);
    card.appendChild(content);
    const arrow=document.createElement('span');
    arrow.className='overview-metric-arrow';
    arrow.textContent='›';
    card.appendChild(arrow);
  });
}
decorateMetrics();
const metrics=$('#metrics');
if(metrics)new MutationObserver(()=>requestAnimationFrame(decorateMetrics)).observe(metrics,{childList:true});

/* 最近事件：用真实已有事件 DOM 重排为设计稿表格风格。 */
function decorateEvents(){
  const timeline=$('#recentTimeline');if(!timeline||timeline.querySelector('.overview-event-head'))return;
  const items=$$('.timeline-item',timeline);
  if(!items.length)return;
  const rows=items.map(item=>{
    const date=$('.date',item)?.textContent?.trim()||'';
    const ev=$('.event',item);
    const person=ev?.querySelector('.muted')?.textContent?.trim()||'';
    const content=ev?.querySelector('p')?.textContent?.trim()||ev?.querySelector('.event-title')?.textContent?.trim()||'';
    const type=ev?.querySelector('.type')?.textContent?.trim()||'记录';
    return {date,person,content,type};
  });
  timeline.dataset.designTable='1';
  timeline.className='overview-events-table';
  timeline.innerHTML='<div class="overview-event-head"><span>时间</span><span>人物</span><span>内容摘要</span><span>类型</span></div>'+
    rows.map((r,idx)=>'<div class="overview-event-row"><span class="event-time">'+esc(r.date)+'</span><span class="event-person"><i>'+(idx+1)+'</i><b>'+esc(r.person.replace(/^[^·]*·\s*/,'')||'人物')+'</b></span><span class="event-summary">'+esc(r.content)+'</span><span class="event-type-chip">'+esc(r.type)+'</span></div>').join('');
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
decorateEvents();
const recent=$('#recentTimeline');
if(recent)new MutationObserver(()=>{if(recent.dataset.designTable!=='1')requestAnimationFrame(decorateEvents)}).observe(recent,{childList:true});

/* 系统分组概览：使用现有真实分组计数，呈现 2×2 设计卡。 */
function decorateGroups(){
  const box=$('#groupOverview');if(!box)return;
  const raw=$$(':scope > div',box).map(x=>{
    const span=x.querySelector('span'),b=x.querySelector('b');
    return {name:span?.textContent?.trim()||'',count:b?.textContent?.trim()||'0'};
  });
  if(!raw.length||box.querySelector('.overview-group-card'))return;
  const map=new Map(raw.map(x=>[x.name,x.count]));
  const groups=[
    ['老女','01 - 10',map.get('老女')||'10','5人VIP · 全部开户'],
    ['新女','11 - 30',map.get('新女')||'20','无VIP · 开户10人'],
    ['老男','31 - 50',map.get('老男')||'20','10人VIP · 全部开户'],
    ['新男','51 - 70',map.get('新男')||'20','无VIP · 开户10人']
  ];
  box.dataset.designGroups='1';
  box.className='overview-group-grid';
  box.innerHTML=groups.map((g,i)=>'<div class="overview-group-card"><span class="overview-group-avatar '+(i>1?'male':'')+'">♟</span><div><b>'+g[0]+' <small>'+g[1]+'</small></b><div class="overview-group-progress"><i></i></div><p>'+g[3]+'</p></div><em>'+g[2]+'人</em></div>').join('')+
    '<div class="overview-group-total"><span class="overview-total-icon">♟</span><strong>'+(map.get('全部人物')||$('#metrics .metric strong')?.textContent?.trim()||'70')+'</strong><div><b>法国投资者人物模型</b><small>完整画像 · 动态系统分组 · 自定义工作区</small></div><i>›</i></div>';
}
decorateGroups();
const groups=$('#groupOverview');
if(groups)new MutationObserver(()=>{if(groups.dataset.designGroups!=='1')requestAnimationFrame(decorateGroups)}).observe(groups,{childList:true});

/* 设计稿样式。 */
const old=$('#chennanOverviewFinalDesign');if(old)old.remove();
const st=document.createElement('style');
st.id='chennanOverviewFinalDesign';
st.textContent=`
:root{
 --ov-bg:#eef1f2;--ov-paper:#fbfcfb;--ov-line:#dde1df;--ov-ink:#111412;--ov-muted:#667078;
 --ov-gold:#c08a1c;--ov-gold-2:#e2b447;--ov-gold-soft:#fbf2d9;--ov-green:#0b8e56;--ov-shadow:0 8px 24px rgba(55,65,60,.055);
}
html,body{background:var(--ov-bg)!important}
.app.app-ready{background:linear-gradient(135deg,#edf1f3,#f3f4f3)!important}

/* 固定窄导航，无桌面伸缩。 */
@media(min-width:901px){
 .app.app-ready>.sidebar{
  width:204px!important;left:18px!important;top:8px!important;bottom:8px!important;height:auto!important;
  padding:20px 12px 18px!important;background:rgba(250,251,250,.92)!important;border:1px solid rgba(255,255,255,.9)!important;
  border-radius:22px!important;box-shadow:var(--ov-shadow)!important;overflow:hidden!important;backdrop-filter:blur(18px)!important
 }
 .app.app-ready>.sidebar:before{display:none!important}
 .app.app-ready>.sidebar .brand{
  position:relative!important;left:auto!important;top:auto!important;width:100%!important;height:82px!important;
  margin:0 0 10px!important;display:flex!important;align-items:center!important;justify-content:center!important
 }
 .app.app-ready>.sidebar .cn-wordmark{width:132px!important;height:78px!important;display:flex!important;align-items:center!important;justify-content:center!important}
 .app.app-ready>.sidebar .cn-brand-image{
  width:128px!important;height:72px!important;object-fit:contain!important;border-radius:0!important;box-shadow:none!important
 }
 .app.app-ready>.sidebar .brand-copy,.app.app-ready>.sidebar .side-note,.app.app-ready>.sidebar .nav-collapse{display:none!important}
 .app.app-ready>.sidebar .nav{
  margin:0!important;display:grid!important;gap:5px!important;max-height:none!important;overflow:visible!important
 }
 .app.app-ready>.sidebar .nav button{
  width:100%!important;margin:0!important;min-height:46px!important;padding:0 14px!important;
  display:grid!important;grid-template-columns:32px 1fr!important;gap:12px!important;align-items:center!important;
  border-radius:10px!important;background:transparent!important;color:#1e2320!important;font-weight:650!important
 }
 .app.app-ready>.sidebar .nav button:after{display:none!important}
 .app.app-ready>.sidebar .nav button i{
  width:28px!important;height:28px!important;margin:0!important;display:grid!important;place-items:center!important;
  background:transparent!important;border:0!important;color:#202522!important;font-size:18px!important
 }
 .app.app-ready>.sidebar .nav button span{font-size:14px!important;color:inherit!important}
 .app.app-ready>.sidebar .nav button:hover{background:#f6f2e7!important;color:#6c4a0b!important}
 .app.app-ready>.sidebar .nav button.active{
  background:linear-gradient(90deg,#fbf1d7,#ebc66d)!important;color:#161813!important;
  box-shadow:inset 0 0 0 1px rgba(190,138,28,.18)!important
 }
 .app.app-ready>.sidebar .nav button.active i{color:#111!important}
 .app.app-ready>.sidebar #logoutBtn{
  margin-top:4px!important;color:#7b6350!important;background:#faf7f1!important
 }
 .app.app-ready>.main{
  margin-left:236px!important;width:calc(100% - 236px)!important;padding:20px 16px 22px 10px!important;min-height:100vh!important
 }
}

/* 顶部搜索/账户/按钮同行。 */
.app.app-ready .app-global-header.design-header{
 height:98px!important;margin:0 0 4px!important;padding:16px 18px!important;position:relative!important;top:auto!important;
 display:grid!important;grid-template-columns:minmax(360px,1fr) auto auto!important;gap:18px!important;align-items:center!important;
 background:rgba(252,253,252,.92)!important;border:1px solid rgba(255,255,255,.95)!important;border-radius:18px!important;
 box-shadow:var(--ov-shadow)!important;backdrop-filter:blur(16px)!important
}
.app.app-ready .design-header .header-search{
 width:min(100%,570px)!important;height:54px!important;padding:0 16px!important;background:#fff!important;
 border:1px solid #d9dddb!important;border-radius:10px!important;color:#202522!important;box-shadow:none!important
}
.app.app-ready .design-header .header-search>span{font-size:21px!important;color:#111!important}
.app.app-ready .design-header .header-search input{font-size:14px!important;color:#2c332f!important}
.app.app-ready .design-header .header-right{display:flex!important;align-items:center!important;gap:15px!important}
.app.app-ready .design-header .cloud-chip{
 padding:10px 14px!important;background:#fff!important;border:1px solid #e1e4e2!important;color:#65706a!important;font-size:13px!important
}
.app.app-ready .design-header .cloud-chip i{background:#0dbb6b!important}
.app.app-ready .design-header .user-avatar{
 width:54px!important;height:54px!important;background:#272925!important;color:#e0b13e!important;font-size:20px!important;
 box-shadow:0 4px 10px rgba(0,0,0,.14)!important
}
.app.app-ready .design-header .header-user b{font-size:14px!important;color:#1c201e!important;font-weight:760!important}
.app.app-ready .design-header .header-user small{font-size:11px!important;color:#69716d!important}
.app.app-ready .overview-header-actions{display:flex!important;gap:12px!important;align-items:center!important;flex-wrap:nowrap!important}
.app.app-ready .overview-header-actions .btn{
 height:50px!important;min-height:50px!important;padding:0 19px!important;border-radius:9px!important;font-size:13px!important;white-space:nowrap!important
}
.app.app-ready .overview-header-actions .btn.ghost{
 background:#fff!important;color:#171a18!important;border:1px solid #eadfc9!important
}
.app.app-ready .overview-header-actions .btn.primary{
 background:linear-gradient(135deg,#ebb93d,#b77b12)!important;color:#fff!important;border:0!important;box-shadow:none!important
}

/* 概览标题卡。 */
.app.app-ready #overview{max-width:none!important}
.app.app-ready #overview .overview-titlebar{
 position:relative!important;min-height:122px!important;margin:0 0 14px!important;padding:18px 24px!important;
 display:block!important;overflow:hidden!important;background:rgba(252,253,252,.94)!important;border:1px solid rgba(255,255,255,.92)!important;
 border-radius:17px!important;box-shadow:var(--ov-shadow)!important
}
.app.app-ready #overview .overview-titlebar:after{
 content:"";position:absolute;right:-20px;bottom:-34px;width:430px;height:150px;opacity:.42;pointer-events:none;
 background:
  repeating-radial-gradient(ellipse at 55% 100%,transparent 0 8px,rgba(200,164,91,.17) 9px 10px,transparent 11px 16px);
 transform:rotate(-4deg)
}
.app.app-ready #overview .overview-titlebar>div{position:relative;z-index:1}
.app.app-ready #overview .eyebrow{
 color:#b47b10!important;font-size:11px!important;font-weight:800!important;letter-spacing:.16em!important
}
.app.app-ready #overview .overview-title-row{display:flex!important;align-items:center!important;gap:18px!important;margin-top:5px!important;min-width:0!important}
.app.app-ready #overview .page-title{
 margin:0!important;font-size:32px!important;line-height:1.2!important;font-weight:820!important;letter-spacing:-.025em!important;color:#111!important;white-space:nowrap!important
}
.app.app-ready #overview .overview-title-divider{width:1px!important;height:28px!important;background:#838a86!important;flex:0 0 auto!important}
.app.app-ready #overview .overview-summary-inline{
 color:#566069!important;font-size:14px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important
}
.app.app-ready #overview .overview-seed-source{display:none!important}

/* 指标 4×2，真实数据不变。 */
.app.app-ready #overview .dashboard{
 display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important;margin:0 0 14px!important
}
.app.app-ready #overview .metric{
 position:relative!important;min-height:138px!important;padding:18px 42px 18px 112px!important;
 display:flex!important;align-items:center!important;background:rgba(252,253,252,.95)!important;
 border:1px solid #e0e2df!important;border-radius:15px!important;box-shadow:var(--ov-shadow)!important;overflow:hidden!important
}
.app.app-ready #overview .metric:hover{transform:translateY(-2px)!important;border-color:#e6c77d!important}
.app.app-ready #overview .overview-metric-icon{
 position:absolute!important;left:28px!important;top:50%!important;transform:translateY(-50%)!important;
 width:62px!important;height:62px!important;border-radius:50%!important;display:grid!important;place-items:center!important;
 background:linear-gradient(145deg,#fff8e7,#f2dfae)!important;color:#b47a13!important;font-size:27px!important
}
.app.app-ready #overview .overview-metric-icon.muted-icon{background:#eef0f0!important;color:#50565a!important}
.app.app-ready #overview .overview-metric-content{display:block!important;min-width:0!important}
.app.app-ready #overview .metric .label{display:block!important;color:#222724!important;font-size:13px!important;margin:0!important}
.app.app-ready #overview .metric strong{display:block!important;color:#080b09!important;font-size:38px!important;font-weight:760!important;line-height:1!important;margin:8px 0!important}
.app.app-ready #overview .metric .trend{display:block!important;color:#a46b08!important;font-size:12px!important;font-weight:650!important}
.app.app-ready #overview .overview-metric-arrow{
 position:absolute!important;right:20px!important;top:50%!important;transform:translateY(-50%)!important;color:#9f6c10!important;font-size:28px!important;font-weight:300!important
}

/* 下方最近事件 / 分组。 */
.app.app-ready #overview>.grid{
 grid-template-columns:minmax(0,1.55fr) minmax(420px,1fr)!important;gap:14px!important;margin:0!important
}
.app.app-ready #overview>.grid>.panel{
 padding:16px!important;background:rgba(252,253,252,.96)!important;border:1px solid #e0e2df!important;border-radius:15px!important;box-shadow:var(--ov-shadow)!important
}
.app.app-ready #overview .panel-head{margin:0 0 8px!important}
.app.app-ready #overview .panel-head h2{font-size:18px!important;color:#121613!important;font-weight:780!important}
.app.app-ready #overview .panel-head h2:before{content:"◆";color:#c48b1b;margin-right:9px}
.app.app-ready #overview .panel-head .link-btn{color:#50657a!important;font-size:12px!important}

.app.app-ready #overview .overview-events-table{display:grid!important;gap:0!important;border-top:1px solid #edf0ed!important}
.app.app-ready #overview .overview-event-head,
.app.app-ready #overview .overview-event-row{
 display:grid!important;grid-template-columns:95px 150px minmax(0,1fr) 86px!important;align-items:center!important;min-height:40px!important;
 padding:0 8px!important;border-bottom:1px solid #ecefec!important;gap:10px!important
}
.app.app-ready #overview .overview-event-head{background:#f5f6f5!important;color:#6a7270!important;font-size:11px!important;min-height:34px!important}
.app.app-ready #overview .overview-event-row{font-size:12px!important;color:#59615d!important}
.app.app-ready #overview .event-person{display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important}
.app.app-ready #overview .event-person i{width:27px;height:27px;border-radius:50%;background:#efe6d3;color:#8c650f;display:grid;place-items:center;font-style:normal;font-size:10px}
.app.app-ready #overview .event-person b,.app.app-ready #overview .event-summary{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app.app-ready #overview .event-person b{color:#202522;font-weight:650}
.app.app-ready #overview .event-type-chip{
 justify-self:start;padding:4px 11px;border-radius:999px;background:#f7edd3;color:#a06b0d;font-size:11px;white-space:nowrap
}

.app.app-ready #overview .overview-group-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:9px!important}
.app.app-ready #overview .overview-group-card{
 position:relative;display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center;
 min-height:74px;padding:10px;border:1px solid #e7e7e3;border-radius:10px;background:#fff
}
.app.app-ready #overview .overview-group-avatar{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#fff3d8;color:#b47a13}
.app.app-ready #overview .overview-group-avatar.male{background:#eef0f0;color:#555b5f}
.app.app-ready #overview .overview-group-card b{font-size:12px;color:#131714}.app.app-ready #overview .overview-group-card b small{font-weight:500;color:#53605a;margin-left:5px}
.app.app-ready #overview .overview-group-card p{margin:5px 0 0;font-size:10px;color:#606966}
.app.app-ready #overview .overview-group-card em{font-style:normal;color:#67706c;font-size:10px}
.app.app-ready #overview .overview-group-progress{height:5px;background:#e4e6e4;border-radius:99px;margin-top:6px;overflow:hidden}
.app.app-ready #overview .overview-group-progress i{display:block;width:64%;height:100%;background:linear-gradient(90deg,#bd8619,#e8bc52);border-radius:99px}
.app.app-ready #overview .overview-group-total{
 grid-column:1/-1;min-height:64px;display:grid;grid-template-columns:48px auto 1fr 34px;gap:10px;align-items:center;
 padding:9px 13px;background:linear-gradient(90deg,#fff8e8,#fffdf7);border:1px solid #f0d596;border-radius:10px
}
.app.app-ready #overview .overview-total-icon{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#fff0c8;color:#a9700a}
.app.app-ready #overview .overview-group-total strong{font-size:30px;color:#111}
.app.app-ready #overview .overview-group-total div{display:grid;gap:2px}.app.app-ready #overview .overview-group-total b{font-size:12px}.app.app-ready #overview .overview-group-total small{font-size:10px;color:#69716d}
.app.app-ready #overview .overview-group-total>i{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;border:1px solid #d9aa4a;color:#8d5d08;font-style:normal;font-size:20px}

@media(max-width:1250px) and (min-width:901px){
 .app.app-ready>.sidebar{width:180px!important}
 .app.app-ready>.main{margin-left:208px!important;width:calc(100% - 208px)!important}
 .app.app-ready .app-global-header.design-header{grid-template-columns:minmax(300px,1fr) auto!important}
 .app.app-ready .overview-header-actions{grid-column:1/-1;justify-content:flex-end!important;margin-top:-8px}
 .app.app-ready #overview .overview-title-row{flex-wrap:wrap!important;gap:8px 14px!important}
 .app.app-ready #overview .overview-title-divider{display:none!important}
 .app.app-ready #overview .dashboard{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 .app.app-ready #overview>.grid{grid-template-columns:1fr!important}
}

/* 手机继续沿用现有底部“更多”导航，避免缩窄桌面稿直接压到手机。 */
@media(max-width:900px){
 .app.app-ready #overview .dashboard{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 .app.app-ready #overview .metric{padding:14px 26px 14px 82px!important;min-height:118px!important}
 .app.app-ready #overview .overview-metric-icon{left:16px!important;width:52px!important;height:52px!important}
 .app.app-ready #overview>.grid{grid-template-columns:1fr!important}
 .app.app-ready #overview .overview-title-row{display:block!important}
 .app.app-ready #overview .overview-title-divider,.app.app-ready #overview .overview-summary-inline{display:none!important}
}
`;
document.head.appendChild(st);


/* 全部内部模块统一为已确认的白灰金色体系。 */
const unifiedOld=$('#chennanUnifiedWorkspaceDesign');if(unifiedOld)unifiedOld.remove();
const unifiedStyle=document.createElement('style');
unifiedStyle.id='chennanUnifiedWorkspaceDesign';
unifiedStyle.textContent=`
html[data-theme="night"],html[data-theme="warm"],html[data-theme="light"]{
 color-scheme:light!important;
 --bg:#eef1f2!important;--paper:#fbfcfb!important;--ink:#111412!important;--muted:#68716d!important;
 --line:#dde1df!important;--accent:#c08a1c!important;--accent-ink:#9b680b!important;--accent-soft:#fbf2d9!important;
 --green:#0b8e56!important;--red:#b54b4b!important;--blue:#516b84!important;
 --header-bg:#fbfcfb!important;--sidebar-bg:#fafbfa!important;--nav-ink:#1e2320!important;
 --cn-glass-edge:#dde1df!important;--cn-depth-shadow:0 8px 24px rgba(55,65,60,.055)!important
}
html,body{background:#eef1f2!important;color:#111412!important}
.app.app-ready{background:linear-gradient(135deg,#edf1f3,#f4f5f4)!important;color:#111412!important}
.app.app-ready:before,.app.app-ready:after{display:none!important}
.app.app-ready .app-global-header{display:none!important}
.app.app-ready>.main{background:transparent!important;padding-top:8px!important;padding-bottom:22px!important}
.app.app-ready .section{max-width:none!important;color:#111412!important}
.app.app-ready .section .topbar{
 min-height:94px!important;margin:0 0 14px!important;padding:16px 20px!important;
 display:flex!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;
 background:rgba(252,253,252,.96)!important;border:1px solid rgba(255,255,255,.96)!important;
 border-radius:16px!important;box-shadow:0 8px 24px rgba(55,65,60,.055)!important
}
.app.app-ready .section .topbar>div:first-child{min-width:0!important}
.app.app-ready .section .eyebrow{color:#b47b10!important;font-size:10px!important;font-weight:800!important;letter-spacing:.16em!important}
.app.app-ready .section .page-title{
 margin:4px 0 5px!important;color:#111412!important;font-size:28px!important;line-height:1.2!important;
 font-weight:820!important;letter-spacing:-.022em!important
}
.app.app-ready .section .sub{margin:0!important;color:#68716d!important;font-size:12px!important;line-height:1.6!important}
.app.app-ready .section :is(h2,h3){color:#151916!important;text-shadow:none!important;letter-spacing:0!important}
.app.app-ready .section h2{font-size:17px!important;font-weight:780!important}
.app.app-ready .section h3{font-size:14px!important;font-weight:740!important}
.app.app-ready .section :is(.muted,.meta,small){color:#737c78!important;text-shadow:none!important}
.app.app-ready .section .actions,.app.app-ready .section .button-row{gap:9px!important}
.app.app-ready .section .btn{
 min-height:38px!important;padding:8px 14px!important;border-radius:9px!important;
 font-size:12px!important;font-weight:700!important;box-shadow:none!important
}
.app.app-ready .section .btn.primary{
 background:linear-gradient(135deg,#e4b13d,#b77b12)!important;color:#fff!important;border:1px solid #b98017!important
}
.app.app-ready .section .btn.primary:hover{filter:brightness(.98)!important;transform:translateY(-1px)}
.app.app-ready .section .btn.ghost{
 background:#fff!important;color:#1a1e1b!important;border:1px solid #dfe2df!important
}
.app.app-ready .section .btn.danger{background:#fff2f1!important;color:#a74646!important;border:1px solid #efd8d5!important}
.app.app-ready .section .link-btn{color:#8f620d!important;font-size:12px!important;font-weight:720!important}
.app.app-ready .section :is(.input,.select,textarea,input:not([type=checkbox]):not([type=radio]),select){
 background:#fff!important;color:#171b18!important;border:1px solid #d8ddda!important;
 border-radius:9px!important;min-height:40px!important;font-size:13px!important;box-shadow:none!important
}
.app.app-ready .section input::placeholder,.app.app-ready .section textarea::placeholder{color:#9ba39f!important}
.app.app-ready .section :is(.input,.select,textarea,input,select):focus{
 border-color:#d2ac59!important;box-shadow:0 0 0 3px rgba(217,177,87,.14)!important;outline:none!important
}
.app.app-ready .section :is(.card,.panel,.group-card,.profile-row,.event,.detail-box,.batch-card,.offer-card,.candidate-card,.mini-person,.person-mini,.person-buy-card,.holding-person,.holding-person-card,.offer-stat,.offer-row,.detail-line,.check-box,.member-picker,.doc-item,.custom-group,.trade-mini,.memory-person-card,.memory-row,.fr70-card,.fr70-stat,.fr70-bubble,.fr70-history button,.fr70-memory-row){
 background:#fbfcfb!important;color:#151916!important;border:1px solid #dfe3e0!important;
 box-shadow:0 6px 20px rgba(55,65,60,.045)!important;backdrop-filter:none!important
}
.app.app-ready .section :is(.card,.panel){border-radius:14px!important;padding:18px!important}
.app.app-ready .section :is(.group-card,.profile-row,.event,.detail-box,.batch-card,.offer-card,.candidate-card,.holding-person-card,.person-buy-card,.custom-group,.fr70-card,.fr70-stat){border-radius:12px!important}
.app.app-ready .section .panel-head{margin-bottom:14px!important;gap:12px!important}
.app.app-ready .section .toolbar{gap:10px!important;margin-bottom:12px!important}
.app.app-ready .section .notice{
 background:#fff8e8!important;color:#735a24!important;border:1px solid #f0dfb7!important;border-radius:10px!important;
 padding:10px 12px!important;font-size:11px!important
}
.app.app-ready .section .notice.success{background:#eef8f2!important;color:#316e53!important;border-color:#d5ebdf!important}
.app.app-ready .section .notice.warn{background:#fff6e6!important;color:#805c18!important;border-color:#efdfbd!important}
.app.app-ready .section :is(.status,.tag,.type,.count,.sort-badge,.pill){
 background:#f2f4f2!important;color:#59615d!important;border:1px solid #dfe3df!important;border-radius:999px!important;
 padding:3px 8px!important;font-size:10px!important
}
.app.app-ready .section :is(.status.vip,.vip-badge,.vip-chip){
 background:#fff1c9!important;color:#8b5c05!important;border-color:#e5c874!important;font-weight:800!important
}
.app.app-ready .section :is(.status.good,.pill.good,.stock-ready){background:#edf8f2!important;color:#0b7f4f!important;border-color:#cfe8db!important}
.app.app-ready .section :is(.status.warn,.stock-soon){background:#fff5df!important;color:#96640a!important;border-color:#ead7a5!important}
.app.app-ready .section :is(.danger,.profit-neg){color:#ad4d4d!important}
.app.app-ready .section .profit-pos{color:#0b8e56!important}

/* 人物库 / 通用表格 */
.app.app-ready #peopleList:before{color:#777f7b!important;font-size:11px!important;margin-bottom:8px!important}
.app.app-ready .section .table-wrap,.app.app-ready .people-table-wrap{border:1px solid #dfe3e0!important;border-radius:11px!important;background:#fff!important}
.app.app-ready .section :is(table,.mini-table,.people-data-table){
 width:100%;background:#fff!important;color:#1c211e!important;border-spacing:0!important
}
.app.app-ready .section :is(table,.mini-table,.people-data-table) :is(th,td){
 background:#fff!important;color:#313733!important;border-bottom:1px solid #ecefec!important;padding:11px 12px!important;
 font-size:12px!important;text-shadow:none!important
}
.app.app-ready .section :is(table,.mini-table,.people-data-table) th{
 background:#f5f6f5!important;color:#68716d!important;font-size:10px!important;font-weight:800!important;letter-spacing:.035em!important
}
.app.app-ready .people-data-table tbody tr:hover td{background:#fffaf0!important}
.app.app-ready .people-data-table .table-avatar{
 width:42px!important;height:42px!important;min-width:42px!important;background:#f1f3f1!important;border:1px solid #d7dcd8!important;box-shadow:none!important
}
.app.app-ready .people-data-table .table-name{color:#171b18!important;font-size:13px!important;font-weight:760!important}
.app.app-ready .people-data-table tr.is-vip .table-name{color:#8b610d!important}
.app.app-ready .people-data-table tr.relation-old:not(.is-vip) .table-name,
.app.app-ready .people-data-table tr.relation-new:not(.is-vip) .table-name{color:#171b18!important}
.app.app-ready .person-category{background:#f3f4f2!important;color:#505753!important;border-color:#d8ddda!important}
.app.app-ready [data-category="老女"],.app.app-ready [data-category="老男"]{background:#fff3d6!important;color:#805a10!important;border-color:#e5cd91!important}
.app.app-ready [data-category="新女"],.app.app-ready [data-category="新男"]{background:#f1f3f1!important;color:#4d5551!important;border-color:#d9deda!important}
.app.app-ready :is(.avatar,.gender-avatar,.detail-avatar){background:#f2f4f2!important;border:1px solid #d8ddda!important;box-shadow:none!important}

/* 分组 / 交易 / 持仓 */
.app.app-ready .section .group-grid{gap:12px!important}
.app.app-ready .section .system-group-open{background:#fff!important;color:#1a1f1b!important;padding:16px!important;min-height:118px!important}
.app.app-ready .section .system-group-open strong{color:#a86f0c!important;font-size:26px!important}
.app.app-ready .section .system-group-open:hover{background:#fff9ec!important}
.app.app-ready .section :is(.offer-stat,.detail-line,.trade-mini,.person-buy-card,.holding-person-card){background:#fff!important}
.app.app-ready .section .offer-row.active{background:#fff7e7!important;border-color:#dfbd6a!important}
.app.app-ready .section .candidate-card.bought{background:#eff8f3!important;border-color:#cce7d9!important}
.app.app-ready .section .candidate-card.rejected{background:#f7f7f6!important;opacity:.82}
.app.app-ready .section .hold-chart{
 background:repeating-linear-gradient(to top,#fff 0,#fff 43px,#e8ebe9 44px,#e8ebe9 45px)!important;
 border:1px solid #dfe3e0!important;border-radius:11px!important
}
.app.app-ready .section .hold-bar{background:#d5a43b!important;box-shadow:none!important}
.app.app-ready .section .hold-bar.ready{background:#59a47f!important}
.app.app-ready .section .hold-bar.soon{background:#e0ad4b!important}
.app.app-ready .section .hold-bar-count,.app.app-ready .section .hold-bar-label b{color:#202522!important}
.app.app-ready .section .hold-bar-label{color:#7a827e!important}

/* 撰写 / 记忆 */
.app.app-ready .section :is(.rich-editor,.editor,.editor-area,[contenteditable=true]){
 background:#fff!important;color:#171b18!important;border-color:#dfe3e0!important;font-size:14px!important;line-height:1.8!important
}
.app.app-ready .section .word-toolbar{background:#f7f8f7!important;border-color:#dfe3e0!important}
.app.app-ready .section .word-toolbar button{background:#fff!important;color:#4f5954!important;border-color:#e1e5e2!important}
.app.app-ready .section .person-token{background:#fff1ca!important;color:#875d0a!important}
.app.app-ready .section .logic-warning{background:#fff3ef!important;color:#94544c!important}
.app.app-ready .section .memory-row{border-left:2px solid #d3aa52!important}

/* France 70 */
.app.app-ready #france70chat .fr70-seg{background:#f3f4f2!important;border-color:#dde1df!important}
.app.app-ready #france70chat .fr70-seg button{color:#6d7571!important}
.app.app-ready #france70chat .fr70-seg button.active{background:#fff!important;color:#8d620d!important}
.app.app-ready #france70chat .fr70-bubble{background:#fff!important}
.app.app-ready #france70chat .fr70-note{background:#fff7e5!important;color:#6f603f!important;border-color:#ecd8a6!important}
.app.app-ready #france70chat .fr70-history button:hover,.app.app-ready #france70chat .fr70-memory-row:hover{background:#fff8e8!important;border-color:#ddbd72!important}

/* 弹窗与通用阅读面 */
.app.app-ready .modal{background:#fbfcfb!important;color:#171b18!important;border:1px solid #dfe3e0!important;box-shadow:0 22px 60px rgba(40,48,43,.16)!important}
.app.app-ready .modal-wrap{background:rgba(33,38,35,.24)!important}
.app.app-ready .field label{color:#626c67!important}
.app.app-ready .empty{color:#8a928e!important}

/* 概览操作按钮回到标题卡，不再占用一整条顶部工具栏。 */
.app.app-ready #overview .overview-titlebar{padding-right:330px!important}
.app.app-ready #overview .overview-titlebar .overview-header-actions{
 position:absolute!important;right:22px!important;top:50%!important;transform:translateY(-50%)!important;
 display:flex!important;align-items:center!important;gap:9px!important;z-index:2!important
}
.app.app-ready #overview .overview-titlebar .overview-header-actions .btn{height:42px!important;min-height:42px!important}
.app.app-ready #overview .overview-titlebar .overview-header-actions .btn.ghost{background:#fff!important;color:#171b18!important;border:1px solid #e3dfd5!important}
.app.app-ready #overview .overview-titlebar .overview-header-actions .btn.primary{background:linear-gradient(135deg,#e4b13d,#b77b12)!important;color:#fff!important}

/* 细滚动条，避免右侧出现醒目的黑色滚动轨。 */
.app.app-ready *{scrollbar-width:thin;scrollbar-color:#c9ceca transparent}
.app.app-ready *::-webkit-scrollbar{width:7px;height:7px}
.app.app-ready *::-webkit-scrollbar-track{background:transparent}
.app.app-ready *::-webkit-scrollbar-thumb{background:#c9ceca;border-radius:99px}
.app.app-ready *::-webkit-scrollbar-thumb:hover{background:#adb5b0}

@media(hover:hover) and (pointer:fine){
 .app.app-ready .section :is(.card,.group-card,.profile-row,.event,.batch-card,.offer-card,.candidate-card,.holding-person-card,.fr70-stat):hover{
  transform:translateY(-2px)!important;border-color:#e0c77f!important;box-shadow:0 10px 26px rgba(55,65,60,.075)!important
 }
}
@media(max-width:1250px) and (min-width:901px){
 .app.app-ready #overview .overview-titlebar{padding-right:20px!important}
 .app.app-ready #overview .overview-titlebar .overview-header-actions{
  position:static!important;transform:none!important;margin-top:12px!important;justify-content:flex-start!important
 }
}
@media(max-width:900px){
 .app.app-ready>.main{padding-top:12px!important}
 .app.app-ready .section .topbar{min-height:0!important;padding:14px!important}
 .app.app-ready .section .page-title{font-size:24px!important}
 .app.app-ready #overview .overview-titlebar{padding-right:14px!important}
 .app.app-ready #overview .overview-titlebar .overview-header-actions{
  position:static!important;transform:none!important;margin-top:12px!important;flex-wrap:wrap!important
 }
}
@media(max-width:700px){
 .app.app-ready .section .topbar{align-items:flex-start!important;flex-direction:column!important}
 .app.app-ready .section .actions{width:100%!important}
 .app.app-ready .section .actions .btn{flex:1 1 auto!important}
 .app.app-ready .section :is(.card,.panel){padding:14px!important}
}
`;
document.head.appendChild(unifiedStyle);


/* 2026-10-03 实机截图整改：桌面压缩为真正 16:9 一屏，手机逻辑保持原状。 */
const rectOld=$('#chennanDesktopRectification20261003');if(rectOld)rectOld.remove();
const rectStyle=document.createElement('style');
rectStyle.id='chennanDesktopRectification20261003';
rectStyle.textContent=`
@media(min-width:1180px) and (min-aspect-ratio:4/3){
 html,body{overflow:hidden!important}
 .app.app-ready{overflow:hidden!important}
 .app.app-ready>.main{
  left:auto!important;right:0!important;top:0!important;bottom:0!important;
  height:100%!important;min-height:0!important;overflow:hidden!important;
  margin-left:196px!important;width:calc(100% - 196px)!important;
  padding:8px 14px 12px 8px!important
 }
 .app.app-ready>.main>.section{
  height:100%!important;max-height:100%!important;min-height:0!important;
  overflow-y:auto!important;overflow-x:hidden!important;padding:0!important;
  scrollbar-width:none!important
 }
 .app.app-ready>.main>.section::-webkit-scrollbar{display:none!important}
 .app.app-ready>.main>#overview.active{overflow:hidden!important}

 /* 左栏由当前约 220px 继续缩到 176px；桌面不显示“更多”。 */
 .app.app-ready>.sidebar{
  width:176px!important;left:10px!important;top:8px!important;bottom:8px!important;
  padding:12px 10px 12px!important;border-radius:18px!important;
  overflow:hidden!important
 }
 .app.app-ready>.sidebar:before{display:none!important}
 .app.app-ready>.sidebar .brand{
  position:relative!important;left:auto!important;top:auto!important;
  width:100%!important;height:62px!important;margin:0 0 7px!important;
  display:grid!important;place-items:center!important;border:0!important;
  background:transparent!important;box-shadow:none!important
 }
 .app.app-ready>.sidebar .brand:before,.app.app-ready>.sidebar .brand:after,
 .app.app-ready>.sidebar .cn-wordmark:before,.app.app-ready>.sidebar .cn-wordmark:after{display:none!important}
 .app.app-ready>.sidebar .cn-wordmark{
  width:96px!important;height:58px!important;min-width:96px!important;
  display:grid!important;place-items:center!important;border:0!important;
  background:transparent!important;box-shadow:none!important;overflow:hidden!important
 }
 .app.app-ready>.sidebar .cn-brand-image{
  width:92px!important;height:54px!important;max-width:92px!important;
  object-fit:cover!important;object-position:center!important;border:0!important;
  outline:0!important;border-radius:0!important;background:transparent!important;
  box-shadow:none!important;animation:none!important
 }
 .app.app-ready>.sidebar .brand-copy,.app.app-ready>.sidebar .side-note,
 .app.app-ready>.sidebar .nav-collapse{display:none!important}
 .app.app-ready>.sidebar .nav{
  margin:0!important;display:grid!important;gap:2px!important;max-height:none!important;overflow:visible!important
 }
 .app.app-ready>.sidebar .nav button{
  width:100%!important;margin:0!important;min-height:40px!important;height:40px!important;
  padding:0 9px!important;display:grid!important;grid-template-columns:27px 1fr!important;
  gap:9px!important;align-items:center!important;border-radius:9px!important;
  font-size:13px!important;font-weight:650!important
 }
 .app.app-ready>.sidebar .nav button i{
  width:26px!important;height:26px!important;margin:0!important;display:grid!important;
  place-items:center!important;font-size:15px!important;line-height:1!important;
  background:transparent!important;border:0!important;color:#262b28!important
 }
 .app.app-ready>.sidebar .nav button span{font-size:13px!important;line-height:1.1!important}
 .app.app-ready>.sidebar #logoutBtn{height:40px!important;min-height:40px!important;margin-top:3px!important}
 .app.app-ready>.sidebar #mobileMoreBtn,
 .app.app-ready>.sidebar .mobile-more-button{display:none!important}

 /* 概览标题区压低，按钮保留在标题框内。 */
 .app.app-ready #overview .overview-titlebar{
  min-height:92px!important;height:92px!important;margin:0 0 9px!important;
  padding:12px 302px 12px 18px!important;border-radius:13px!important
 }
 .app.app-ready #overview .overview-titlebar:after{height:108px!important;opacity:.28!important}
 .app.app-ready #overview .eyebrow{font-size:9px!important;letter-spacing:.14em!important}
 .app.app-ready #overview .overview-title-row{gap:14px!important;margin-top:3px!important}
 .app.app-ready #overview .page-title{font-size:27px!important;line-height:1.12!important}
 .app.app-ready #overview .overview-title-divider{height:23px!important}
 .app.app-ready #overview .overview-summary-inline{font-size:12px!important}
 .app.app-ready #overview .overview-titlebar .overview-header-actions{
  right:16px!important;gap:8px!important
 }
 .app.app-ready #overview .overview-titlebar .overview-header-actions .btn{
  height:38px!important;min-height:38px!important;padding:0 14px!important;font-size:11px!important
 }

 /* 8 个指标卡缩高、缩间距，保留 4×2。 */
 .app.app-ready #overview .dashboard{
  grid-template-columns:repeat(4,minmax(0,1fr))!important;
  gap:9px!important;margin:0 0 9px!important
 }
 .app.app-ready #overview .metric{
  min-height:104px!important;height:104px!important;
  padding:10px 28px 10px 78px!important;border-radius:12px!important
 }
 .app.app-ready #overview .overview-metric-icon{
  left:18px!important;width:46px!important;height:46px!important;font-size:21px!important
 }
 .app.app-ready #overview .metric .label{font-size:11px!important}
 .app.app-ready #overview .metric strong{
  font-size:30px!important;line-height:1!important;margin:6px 0!important
 }
 .app.app-ready #overview .metric .trend{font-size:10px!important}
 .app.app-ready #overview .overview-metric-arrow{right:13px!important;font-size:21px!important}

 /* 下方两块只保留必要高度，空状态不再撑长页面。 */
 .app.app-ready #overview>.grid{
  grid-template-columns:minmax(0,1.55fr) minmax(355px,.95fr)!important;
  gap:9px!important;margin:0!important;height:246px!important
 }
 .app.app-ready #overview>.grid>.panel{
  height:246px!important;min-height:246px!important;padding:12px!important;
  border-radius:12px!important;overflow:hidden!important
 }
 .app.app-ready #overview .panel-head{margin:0 0 6px!important;min-height:28px!important}
 .app.app-ready #overview .panel-head h2{font-size:15px!important}
 .app.app-ready #overview .panel-head h2:before{margin-right:7px!important}
 .app.app-ready #overview .panel-head .link-btn{font-size:10px!important}
 .app.app-ready #overview .overview-event-head,
 .app.app-ready #overview .overview-event-row{
  grid-template-columns:78px 130px minmax(0,1fr) 72px!important;
  min-height:31px!important;padding:0 6px!important;gap:8px!important
 }
 .app.app-ready #overview .overview-event-head{min-height:29px!important;font-size:9px!important}
 .app.app-ready #overview .overview-event-row{font-size:10px!important}
 .app.app-ready #overview .event-person i{width:23px!important;height:23px!important;font-size:9px!important}
 .app.app-ready #overview .event-type-chip{padding:3px 8px!important;font-size:9px!important}
 .app.app-ready #overview .empty{padding:54px 8px!important;font-size:11px!important}

 .app.app-ready #overview .overview-group-grid{gap:6px!important}
 .app.app-ready #overview .overview-group-card{
  min-height:55px!important;height:55px!important;padding:7px!important;
  grid-template-columns:34px minmax(0,1fr) auto!important;gap:7px!important;border-radius:8px!important
 }
 .app.app-ready #overview .overview-group-avatar{width:30px!important;height:30px!important;font-size:13px!important}
 .app.app-ready #overview .overview-group-card b{font-size:10px!important}
 .app.app-ready #overview .overview-group-card b small{font-size:9px!important}
 .app.app-ready #overview .overview-group-card p{margin:3px 0 0!important;font-size:8px!important}
 .app.app-ready #overview .overview-group-progress{height:3px!important;margin-top:3px!important}
 .app.app-ready #overview .overview-group-card em{font-size:9px!important}
 .app.app-ready #overview .overview-group-total{
  min-height:48px!important;height:48px!important;
  grid-template-columns:34px auto 1fr 26px!important;padding:6px 9px!important;gap:7px!important;border-radius:8px!important
 }
 .app.app-ready #overview .overview-total-icon{width:30px!important;height:30px!important;font-size:13px!important}
 .app.app-ready #overview .overview-group-total strong{font-size:23px!important}
 .app.app-ready #overview .overview-group-total b{font-size:9px!important}
 .app.app-ready #overview .overview-group-total small{font-size:8px!important}
 .app.app-ready #overview .overview-group-total>i{width:24px!important;height:24px!important;font-size:16px!important}


 /* 底部新增：左侧持仓组合，右侧待卖出股票与时间。 */
 .app.app-ready #overview #tradeOverview{
  display:grid!important;grid-template-columns:minmax(0,1.25fr) minmax(350px,.9fr)!important;
  gap:9px!important;margin-top:9px!important
 }
 .app.app-ready #overview #tradeOverview .overview-bottom-panel{
  height:164px!important;min-height:164px!important;padding:11px!important;
  border-radius:12px!important;overflow:hidden!important
 }
 .app.app-ready #overview #tradeOverview .panel-head{
  min-height:24px!important;margin:0 0 6px!important
 }
 .app.app-ready #overview #tradeOverview .panel-head h2{
  font-size:14px!important;margin:0!important
 }
 .app.app-ready #overview #tradeOverview .panel-head .link-btn{
  font-size:9px!important
 }
 .app.app-ready #overview .hold-chart-overview{
  display:grid!important;gap:5px!important
 }
 .app.app-ready #overview .hold-chart-row{
  display:grid!important;grid-template-columns:112px minmax(0,1fr) 34px!important;
  gap:8px!important;align-items:center!important;min-height:17px!important
 }
 .app.app-ready #overview .hold-chart-label{
  min-width:0!important;display:flex!important;align-items:center!important;gap:5px!important
 }
 .app.app-ready #overview .hold-chart-label b{
  flex:0 0 auto!important;font-size:9px!important;color:#171b18!important;
  line-height:1.2!important
 }
 .app.app-ready #overview .hold-chart-label small{
  min-width:0!important;font-size:8px!important;color:#7a827e!important;
  white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important
 }
 .app.app-ready #overview .hold-chart-track{
  height:7px!important;border-radius:99px!important;background:#ecefea!important;overflow:hidden!important
 }
 .app.app-ready #overview .hold-chart-fill{
  display:block!important;height:100%!important;border-radius:99px!important;
  background:linear-gradient(90deg,#ddb956,#b88015)!important
 }
 .app.app-ready #overview .hold-chart-count{
  text-align:right!important;font-size:9px!important;font-weight:700!important;color:#313733!important
 }
 .app.app-ready #overview .overview-sell-list{
  display:grid!important;gap:5px!important
 }
 .app.app-ready #overview .overview-sell-item{
  min-height:24px!important;padding:4px 7px!important;display:grid!important;
  grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;
  border:1px solid #e6e9e5!important;border-radius:7px!important;background:#fff!important
 }
 .app.app-ready #overview .overview-sell-item.hot{
  background:#fff8e8!important;border-color:#e6cb87!important
 }
 .app.app-ready #overview .overview-sell-main{
  min-width:0!important;display:flex!important;align-items:center!important;gap:6px!important
 }
 .app.app-ready #overview .overview-sell-main b{
  flex:0 0 auto!important;font-size:9px!important;color:#181c19!important
 }
 .app.app-ready #overview .overview-sell-main small{
  min-width:0!important;font-size:8px!important;color:#76807a!important;
  white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important
 }
 .app.app-ready #overview .overview-sell-time{
  display:flex!important;align-items:center!important;gap:7px!important;white-space:nowrap!important
 }
 .app.app-ready #overview .overview-sell-time strong{
  font-size:8px!important;color:#222724!important;font-weight:650!important
 }
 .app.app-ready #overview .overview-sell-time span{
  font-size:8px!important;color:#9c690d!important
 }
 .app.app-ready #overview #tradeOverview .overview-empty{
  padding:38px 8px!important;font-size:10px!important
 }

 /* 页面边缘滚动条不外露；其他长页面在内容区内部滚动。 */
 .app.app-ready>.main,.app.app-ready>.main>.section{scrollbar-gutter:auto!important}
}

@media(min-width:901px) and (max-width:1179px){
 .app.app-ready>.sidebar #mobileMoreBtn,
 .app.app-ready>.sidebar .mobile-more-button{display:none!important}
 .app.app-ready>.sidebar .cn-brand-image{border:0!important;outline:0!important;box-shadow:none!important}
}
`;
document.head.appendChild(rectStyle);


/* 2026-10-03 最终细化：灰白渐变边线、底部齐线、导航铺满、金字蓝电流。 */
const polishOld=$('#chennanFinalPolish20261003');if(polishOld)polishOld.remove();
const polishStyle=document.createElement('style');
polishStyle.id='chennanFinalPolish20261003';
polishStyle.textContent=`
/* 品牌：不再使用黑底图片与黄色圆环。金色字本身不受蓝色电流影响。 */
.app.app-ready>.sidebar .brand{
 border:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important
}
.app.app-ready>.sidebar .cn-electric-logo{
 position:relative!important;width:116px!important;height:60px!important;display:grid!important;place-items:center!important;
 overflow:visible!important;isolation:isolate!important
}
.app.app-ready>.sidebar .cn-brush-logo-text{
 position:relative!important;z-index:2!important;display:block!important;
 color:#b77b12!important;
 font-family:"STKaiti","KaiTi","FangSong","Microsoft YaHei",serif!important;
 font-size:40px!important;font-weight:900!important;line-height:1!important;letter-spacing:-5px!important;
 transform:skew(-5deg) rotate(-2deg)!important;
 text-shadow:0 1px 0 #7a5008,0 2px 1px rgba(224,171,55,.55),0 0 2px rgba(183,123,18,.25)!important;
 white-space:nowrap!important
}
.app.app-ready>.sidebar .cn-current{
 position:absolute!important;z-index:1!important;display:block!important;pointer-events:none!important;
 opacity:.92!important;filter:drop-shadow(0 0 2px #86d9ff) drop-shadow(0 0 5px #279cff)!important
}
.app.app-ready>.sidebar .cn-current-a{
 inset:4px 2px 5px 1px!important;border-radius:48% 52% 44% 56%!important;
 border-top:2px solid #62c8ff!important;border-right:2px solid #2d9fff!important;
 border-left:2px solid transparent!important;border-bottom:2px solid transparent!important;
 animation:cnElectricA 1.55s linear infinite!important
}
.app.app-ready>.sidebar .cn-current-b{
 inset:8px 7px 1px 8px!important;border-radius:55% 45% 58% 42%!important;
 border-left:2px solid #8bdcff!important;border-bottom:2px solid #349fff!important;
 border-top:2px solid transparent!important;border-right:2px solid transparent!important;
 animation:cnElectricB 1.85s linear infinite!important
}
.app.app-ready>.sidebar .cn-current-c{
 right:2px!important;top:5px!important;width:24px!important;height:17px!important;
 background:linear-gradient(125deg,transparent 0 32%,#8adfff 33% 40%,transparent 41% 57%,#309fff 58% 66%,transparent 67%)!important;
 clip-path:polygon(0 48%,35% 36%,25% 72%,58% 51%,52% 86%,100% 22%,67% 34%,76% 0,43% 29%,49% 4%)!important;
 animation:cnElectricSpark 1.15s steps(2,end) infinite!important
}
@keyframes cnElectricA{0%{transform:rotate(-5deg) scale(.98);opacity:.45}50%{transform:rotate(5deg) scale(1.03);opacity:1}100%{transform:rotate(-5deg) scale(.98);opacity:.45}}
@keyframes cnElectricB{0%{transform:rotate(7deg);opacity:.95}50%{transform:rotate(-4deg);opacity:.35}100%{transform:rotate(7deg);opacity:.95}}
@keyframes cnElectricSpark{0%,100%{opacity:.25;transform:translate(0,0)}25%{opacity:1;transform:translate(-2px,1px)}55%{opacity:.45;transform:translate(2px,-1px)}75%{opacity:1;transform:translate(-1px,-2px)}}

/* 灰白渐变边线：主框保持白灰内层，只改变四周边缘层次。 */
.app.app-ready .section :is(
 .card,.panel,.metric,.group-card,.custom-group,.profile-row,.event,.detail-box,
 .batch-card,.offer-card,.candidate-card,.holding-person-card,.person-buy-card,.fr70-card,.fr70-stat
){
 border:1px solid rgba(187,194,190,.58)!important;
 box-shadow:
  inset 1px 1px 0 rgba(255,255,255,.98),
  inset -1px -1px 0 rgba(160,168,163,.14),
  0 0 0 1px rgba(246,248,247,.68),
  0 6px 18px rgba(52,62,56,.04)!important
}
.app.app-ready #overview .overview-titlebar{
 border:1px solid transparent!important;
 background:
  linear-gradient(rgba(252,253,252,.97),rgba(252,253,252,.97)) padding-box,
  linear-gradient(135deg,#f9faf9 0%,#c9cfcb 26%,#ffffff 50%,#bfc6c2 74%,#f6f8f7 100%) border-box!important
}
.app.app-ready>.sidebar{
 border:1px solid transparent!important;
 background:
  linear-gradient(rgba(250,251,250,.96),rgba(250,251,250,.96)) padding-box,
  linear-gradient(150deg,#fafcfb 0%,#c5ccc8 32%,#ffffff 58%,#bcc4bf 100%) border-box!important
}

/* 桌面导航：模块之间拉开，纵向铺满导航栏；名称略增字距。 */
@media(min-width:1180px) and (min-aspect-ratio:4/3){
 .app.app-ready>.sidebar .brand{
  height:62px!important;margin:0 0 7px!important
 }
 .app.app-ready>.sidebar .nav{
  height:calc(100% - 69px)!important;min-height:0!important;margin:0!important;
  display:flex!important;flex-direction:column!important;justify-content:space-between!important;
  gap:0!important;overflow:hidden!important
 }
 .app.app-ready>.sidebar .nav button{
  flex:0 0 45px!important;height:45px!important;min-height:45px!important;
  width:100%!important;margin:0!important;padding:0 9px!important
 }
 .app.app-ready>.sidebar .nav button span{letter-spacing:.045em!important}
 .app.app-ready>.sidebar #logoutBtn{margin:0!important}

 /* 概览本体改为严格四行网格；最后一行自动吃满剩余高度，底边与导航栏齐平。 */
 .app.app-ready>.main{padding:8px 14px 8px 8px!important}
 .app.app-ready #overview.active{
  display:grid!important;
  grid-template-rows:92px 217px 246px minmax(0,1fr)!important;
  gap:9px!important;height:100%!important;max-height:100%!important;min-height:0!important;
  overflow:hidden!important
 }
 .app.app-ready #overview .overview-titlebar{height:auto!important;min-height:0!important;margin:0!important}
 .app.app-ready #overview .dashboard{
  height:217px!important;min-height:0!important;margin:0!important;
  grid-template-rows:repeat(2,104px)!important
 }
 .app.app-ready #overview>.grid{
  height:246px!important;min-height:0!important;margin:0!important
 }
 .app.app-ready #overview>.grid>.panel{height:100%!important;min-height:0!important}
 .app.app-ready #overview #tradeOverview{
  height:100%!important;min-height:0!important;margin:0!important;
  align-self:stretch!important
 }
 .app.app-ready #overview #tradeOverview .overview-bottom-panel{
  height:100%!important;min-height:0!important;align-self:stretch!important
 }
}

/* 中型桌面也隐藏“更多”，但不强行使用16:9四行网格。 */
@media(min-width:901px) and (max-width:1179px){
 .app.app-ready>.sidebar #mobileMoreBtn,.app.app-ready>.sidebar .mobile-more-button{display:none!important}
}
@media(prefers-reduced-motion:reduce){
 .app.app-ready>.sidebar .cn-current{animation:none!important;opacity:.65!important}
}
`;
document.head.appendChild(polishStyle);


/* 人物库第二页：完整字段紧凑显示。 */
const peopleTightOld=$('#chennanPeoplePageTight20261003');if(peopleTightOld)peopleTightOld.remove();
const peopleTightStyle=document.createElement('style');
peopleTightStyle.id='chennanPeoplePageTight20261003';
peopleTightStyle.textContent=`
.app.app-ready #people>#peopleList:before,
.app.app-ready #people #peopleList:before{
 content:none!important;display:none!important
}
.app.app-ready #people>.notice{display:none!important}
.app.app-ready #people .topbar{margin-bottom:9px!important}
.app.app-ready #people>.card.panel{
 padding:13px 14px 12px!important
}
.app.app-ready #people .toolbar{
 display:grid!important;
 grid-template-columns:minmax(220px,1.18fr) minmax(145px,.74fr) minmax(145px,.74fr) minmax(150px,.76fr)!important;
 gap:8px!important;margin:0 0 7px!important;align-items:center!important
}
.app.app-ready #people .toolbar :is(.input,.select){
 min-width:0!important;max-width:none!important;height:38px!important;min-height:38px!important;
 padding:7px 10px!important;font-size:11px!important
}
.app.app-ready #people #peopleCount{
 margin:4px 0 7px!important;font-size:10px!important;line-height:1.35!important
}
.app.app-ready #people #peopleList{
 margin:0!important;min-width:0!important
}
.app.app-ready #people .people-table-wrap{
 width:100%!important;max-width:100%!important;overflow-x:auto!important;overflow-y:visible!important;
 border-radius:10px!important
}
.app.app-ready #people .people-data-table{
 width:100%!important;min-width:1138px!important;table-layout:fixed!important;
 border-collapse:collapse!important;font-size:10px!important
}
.app.app-ready #people .people-data-table :is(th,td){
 padding:7px 5px!important;height:46px!important;min-height:46px!important;
 font-size:10px!important;line-height:1.2!important;white-space:nowrap!important;
 overflow:hidden!important;text-overflow:ellipsis!important
}
.app.app-ready #people .people-data-table th{
 height:32px!important;min-height:32px!important;font-size:9px!important;
 letter-spacing:.015em!important;font-weight:760!important
}
/* 14 列按信息密度分配，姓名与操作保留更多空间。 */
.app.app-ready #people .people-data-table :is(th,td):nth-child(1){width:54px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(2){width:190px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(3){width:44px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(4){width:44px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(5){width:58px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(6){width:60px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(7){width:62px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(8){width:62px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(9){width:62px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(10){width:62px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(11){width:54px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(12){width:100px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(13){width:70px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(14){width:216px!important}

.app.app-ready #people .people-data-table .table-person{
 gap:7px!important;max-width:100%!important
}
.app.app-ready #people .people-data-table .table-avatar{
 width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important
}
.app.app-ready #people .people-data-table .table-name{
 min-width:0!important;max-width:140px!important;font-size:11px!important;line-height:1.15!important
}
.app.app-ready #people .people-data-table .table-name>small{
 margin-top:2px!important
}
.app.app-ready #people .person-category{
 padding:1px 5px!important;font-size:8px!important;line-height:1.25!important
}
.app.app-ready #people .vip-level,
.app.app-ready #people .vip-none{
 font-size:9px!important;padding:2px 6px!important
}
.app.app-ready #people .people-data-table td:nth-child(14){
 overflow:visible!important;text-overflow:clip!important
}
.app.app-ready #people .people-data-table td:nth-child(14) .link-btn{
 min-height:0!important;padding:2px 4px!important;margin:0!important;
 font-size:9px!important;line-height:1.25!important;white-space:nowrap!important
}
.app.app-ready #people .people-data-table td:nth-child(14) .link-btn+ .link-btn{
 margin-left:1px!important
}
.app.app-ready #people .people-data-table tbody tr:hover td{background:#fffaf0!important}

@media(min-width:1450px){
 .app.app-ready #people .people-data-table{min-width:0!important}
 .app.app-ready #people .people-table-wrap{overflow-x:hidden!important}
}
@media(min-width:1180px) and (max-width:1449px){
 .app.app-ready #people .people-data-table{min-width:1100px!important}
 .app.app-ready #people .people-data-table :is(th,td){padding-left:4px!important;padding-right:4px!important}
 .app.app-ready #people .people-data-table td:nth-child(14) .link-btn{font-size:8px!important;padding-inline:2px!important}
}
@media(max-width:900px){
 .app.app-ready #people .toolbar{grid-template-columns:1fr 1fr!important}
 .app.app-ready #people .people-data-table{min-width:1138px!important}
 .app.app-ready #people .people-table-wrap{overflow-x:auto!important}
}
`;
document.head.appendChild(peopleTightStyle);


/* 人物库最终清理：去黄线、去整块浮起、单行浮起、深蓝/深红操作色、全页深色文字。 */
const peopleFinalOld=$('#chennanPeopleFinalClean20261003');if(peopleFinalOld)peopleFinalOld.remove();
const peopleFinalStyle=document.createElement('style');
peopleFinalStyle.id='chennanPeopleFinalClean20261003';
peopleFinalStyle.textContent=`
/* 整个人物库不是悬浮模块：外层永远不抬升。 */
.app.app-ready #people>.card.panel,
.app.app-ready #people>.card.panel:hover,
.app.app-ready #people .people-table-wrap,
.app.app-ready #people .people-table-wrap:hover{
 transform:none!important;
 border-color:#d5dad7!important;
 box-shadow:
  inset 1px 1px 0 rgba(255,255,255,.96),
  inset -1px -1px 0 rgba(169,176,172,.10),
  0 0 0 1px rgba(247,249,248,.72),
  0 4px 14px rgba(52,62,56,.035)!important
}

/* 红框所示 VIP 行左侧竖黄线彻底取消。 */
.app.app-ready #people .people-data-table tr.is-vip td:first-child,
.app.app-ready #people .people-data-table tbody tr td:first-child{
 box-shadow:none!important;border-left:0!important
}
.app.app-ready #people .people-data-table tbody tr::before,
.app.app-ready #people .people-data-table tbody tr::after,
.app.app-ready #people .people-data-table td::before,
.app.app-ready #people .people-data-table td::after{
 content:none!important;display:none!important
}

/* 整页文字使用深色；不出现浅黄字或白字。 */
.app.app-ready #people,
.app.app-ready #people :is(
 h1,h2,h3,p,span,b,strong,small,label,td,th,option,
 .page-title,.sub,.muted,.table-name,.meta,.status,.tag,.count
){
 color:#202624!important
}
.app.app-ready #people .sub,
.app.app-ready #people .muted,
.app.app-ready #people small,
.app.app-ready #people #peopleCount{
 color:#66706b!important
}
.app.app-ready #people .eyebrow{
 color:#575f5b!important
}
.app.app-ready #people .btn{
 color:#202624!important
}
.app.app-ready #people .btn.primary{
 color:#202624!important;
 background:linear-gradient(135deg,#d8ad4a,#c49125)!important;
 border-color:#ba8a25!important
}
.app.app-ready #people .btn.ghost{
 color:#26302c!important;background:#fff!important
}

/* VIP 与新老标签允许浅金底，但文字必须深色，不再发浅黄。 */
.app.app-ready #people .vip-level-1,
.app.app-ready #people .vip-level-2,
.app.app-ready #people .vip-level-3,
.app.app-ready #people .vip-level-4{
 color:#4d3a10!important
}
.app.app-ready #people .vip-level-5{
 color:#271f0a!important;background:#d9bd78!important;border-color:#a9873d!important
}
.app.app-ready #people .person-category,
.app.app-ready #people [data-category]{
 color:#514523!important
}

/* 操作列：详情 / 交易设置 / 编辑 = 深蓝；删除 = 深红。 */
.app.app-ready #people .people-data-table td:nth-child(14) .link-btn,
.app.app-ready #people .people-data-table td:nth-child(14) .view-person,
.app.app-ready #people .people-data-table td:nth-child(14) [data-trade-pref],
.app.app-ready #people .people-data-table td:nth-child(14) .edit-person{
 color:#214f82!important;font-weight:720!important;text-decoration:none!important
}
.app.app-ready #people .people-data-table td:nth-child(14) .link-btn:hover,
.app.app-ready #people .people-data-table td:nth-child(14) .view-person:hover,
.app.app-ready #people .people-data-table td:nth-child(14) [data-trade-pref]:hover,
.app.app-ready #people .people-data-table td:nth-child(14) .edit-person:hover{
 color:#153a62!important
}
.app.app-ready #people .people-data-table td:nth-child(14) .delete-person,
.app.app-ready #people .people-data-table td:nth-child(14) .link-btn.danger{
 color:#8f2f2f!important;font-weight:760!important
}
.app.app-ready #people .people-data-table td:nth-child(14) .delete-person:hover,
.app.app-ready #people .people-data-table td:nth-child(14) .link-btn.danger:hover{
 color:#6f2020!important
}

/* 仅每个人物行有轻微浮起；不使用黄色 hover。 */
.app.app-ready #people .people-data-table tbody tr{
 position:relative!important;
 transition:transform .16s ease,filter .16s ease!important;
 transform:translateY(0)!important
}
.app.app-ready #people .people-data-table tbody tr:hover{
 transform:translateY(-1px)!important;
 filter:drop-shadow(0 3px 5px rgba(46,56,50,.08))!important
}
.app.app-ready #people .people-data-table tbody tr:hover td{
 background:#f7f9fa!important;
 border-top-color:#d8dddf!important;
 border-bottom-color:#d8dddf!important
}

/* 表头/数据严格落在上下框线中间，列间距收紧。 */
.app.app-ready #people .people-data-table{
 border-collapse:collapse!important;table-layout:fixed!important
}
.app.app-ready #people .people-data-table thead th{
 height:30px!important;min-height:30px!important;
 padding:5px 5px!important;vertical-align:middle!important;
 line-height:20px!important;color:#59625e!important;
 border-bottom:1px solid #d9deda!important;background:#f2f4f3!important
}
.app.app-ready #people .people-data-table tbody td{
 height:43px!important;min-height:43px!important;
 padding:5px 5px!important;vertical-align:middle!important;
 line-height:1.15!important;border-bottom:1px solid #e2e6e3!important;
 background:#fff!important
}
.app.app-ready #people .people-data-table :is(th,td){
 text-align:left!important;white-space:nowrap!important
}
.app.app-ready #people .people-data-table .table-person{
 gap:6px!important;align-items:center!important
}
.app.app-ready #people .people-data-table .table-avatar{
 width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important
}
.app.app-ready #people .people-data-table .table-name{
 font-size:10.5px!important;line-height:1.1!important;max-width:150px!important
}
.app.app-ready #people .people-data-table .table-name>small{
 margin-top:1px!important
}
.app.app-ready #people .person-category{
 padding:1px 4px!important;font-size:7.5px!important;line-height:1.2!important
}

/* 再压一次列宽，减少中间空白，但保留完整字段。 */
.app.app-ready #people .people-data-table :is(th,td):nth-child(1){width:48px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(2){width:184px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(3){width:40px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(4){width:40px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(5){width:54px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(6){width:56px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(7){width:58px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(8){width:58px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(9){width:58px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(10){width:58px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(11){width:50px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(12){width:96px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(13){width:68px!important}
.app.app-ready #people .people-data-table :is(th,td):nth-child(14){width:204px!important}

/* 筛选区与表头靠近，视觉更像一张连续信息表。 */
.app.app-ready #people>.card.panel{padding:11px 12px 10px!important}
.app.app-ready #people .toolbar{gap:7px!important;margin-bottom:5px!important}
.app.app-ready #people #peopleCount{margin:2px 0 5px!important}
.app.app-ready #people .people-table-wrap{border-radius:9px!important}

/* 宽屏直接显示完整 14 列。 */
@media(min-width:1450px){
 .app.app-ready #people .people-data-table{min-width:0!important;width:100%!important}
 .app.app-ready #people .people-table-wrap{overflow-x:hidden!important}
}
`;
document.head.appendChild(peopleFinalStyle);


/* 分组管理：10个固定均衡组，5×2桌面布局；成员固定，名称可改。 */
const balancedGroupsOld=$('#chennanBalancedGroupsPage20261003');if(balancedGroupsOld)balancedGroupsOld.remove();
const balancedGroupsStyle=document.createElement('style');
balancedGroupsStyle.id='chennanBalancedGroupsPage20261003';
balancedGroupsStyle.textContent=`
.app.app-ready #groups .topbar{margin-bottom:9px!important}
.app.app-ready #groups .balanced-groups-panel{
 height:calc(100% - 103px)!important;min-height:0!important;
 padding:12px!important;overflow:auto!important
}
.app.app-ready #groups .balanced-groups-panel>.panel-head{
 min-height:30px!important;margin:0 0 9px!important
}
.app.app-ready #groups .balanced-groups-panel>.panel-head h2{
 font-size:15px!important
}
.app.app-ready #groups .balanced-groups-grid{
 display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;
 gap:9px!important;align-items:stretch!important
}
.app.app-ready #groups .balanced-group-card{
 min-width:0!important;min-height:225px!important;padding:11px!important;
 display:flex!important;flex-direction:column!important;gap:8px!important;
 border-radius:11px!important;background:#fbfcfb!important;
 transform:none!important
}
.app.app-ready #groups .balanced-group-card:hover{
 transform:translateY(-1px)!important;
 border-color:#cfd5d1!important;
 box-shadow:0 8px 18px rgba(46,56,50,.055)!important
}
.app.app-ready #groups .balanced-group-head{
 display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:8px!important
}
.app.app-ready #groups .balanced-group-head>div{min-width:0!important}
.app.app-ready #groups .balanced-group-head small{
 display:block!important;font-size:8px!important;letter-spacing:.12em!important;
 color:#737c78!important;margin-bottom:2px!important
}
.app.app-ready #groups .balanced-group-head h3{
 margin:0!important;font-size:13px!important;line-height:1.2!important;color:#1e2421!important;
 white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important
}
.app.app-ready #groups .balanced-group-total{
 flex:0 0 auto!important;min-width:38px!important;height:25px!important;padding:0 8px!important;
 display:grid!important;place-items:center!important;border-radius:999px!important;
 background:#f0f2f0!important;border:1px solid #dce1dd!important;
 color:#39413d!important;font-size:9px!important;font-weight:760!important
}
.app.app-ready #groups .balanced-composition{
 display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:4px!important
}
.app.app-ready #groups .balanced-composition span{
 min-width:0!important;padding:4px 2px!important;text-align:center!important;
 border-radius:6px!important;background:#f5f6f5!important;border:1px solid #e1e5e2!important;
 color:#555f59!important;font-size:8px!important;white-space:nowrap!important
}
.app.app-ready #groups .balanced-members{
 display:grid!important;grid-template-columns:1fr 1fr!important;gap:4px!important;flex:1 1 auto!important
}
.app.app-ready #groups .balanced-member{
 min-width:0!important;min-height:35px!important;padding:3px 4px!important;
 display:grid!important;grid-template-columns:26px minmax(0,1fr)!important;gap:5px!important;align-items:center!important;
 border:1px solid #e4e8e5!important;border-radius:7px!important;background:#fff!important;text-align:left!important;
 transition:background .15s ease,border-color .15s ease,transform .15s ease!important
}
.app.app-ready #groups .balanced-member:hover{
 background:#f7f9fa!important;border-color:#cfd8d3!important;transform:translateY(-1px)!important
}
.app.app-ready #groups .balanced-member-avatar{
 width:26px!important;height:26px!important;border-radius:50%!important;overflow:hidden!important;
 display:block!important;background:#eef0ee!important
}
.app.app-ready #groups .balanced-member-avatar .person-portrait{
 width:100%!important;height:100%!important;min-width:100%!important;min-height:100%!important
}
.app.app-ready #groups .balanced-member>span:last-child{
 min-width:0!important;display:block!important
}
.app.app-ready #groups .balanced-member b{
 display:block!important;font-size:8px!important;line-height:1.1!important;color:#2b312e!important
}
.app.app-ready #groups .balanced-member small{
 display:block!important;font-size:7.5px!important;line-height:1.1!important;color:#727b76!important;
 white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important
}
.app.app-ready #groups .balanced-group-actions{
 margin-top:auto!important;display:grid!important;grid-template-columns:1fr 1fr!important;gap:5px!important
}
.app.app-ready #groups .balanced-group-actions .btn{
 width:100%!important;min-height:29px!important;height:29px!important;padding:0 6px!important;
 font-size:8.5px!important;color:#294e70!important;background:#fff!important;border-color:#dce2de!important
}
.app.app-ready #groups .balanced-group-actions .edit-group{
 color:#765919!important;background:#fffaf0!important;border-color:#e5d4aa!important
}

/* 本页不再显示旧系统分组/新增/删除概念。 */
.app.app-ready #groups #systemGroups,
.app.app-ready #groups #addGroup,
.app.app-ready #groups .delete-group{display:none!important}

@media(min-width:1180px) and (min-aspect-ratio:4/3){
 .app.app-ready #groups.active{
  height:100%!important;max-height:100%!important;min-height:0!important;overflow:hidden!important
 }
 .app.app-ready #groups .balanced-groups-panel{
  height:calc(100% - 103px)!important;overflow:hidden!important
 }
 .app.app-ready #groups .balanced-groups-grid{
  height:calc(100% - 39px)!important;grid-template-rows:repeat(2,minmax(0,1fr))!important
 }
 .app.app-ready #groups .balanced-group-card{
  min-height:0!important;height:100%!important
 }
}
@media(min-width:901px) and (max-width:1350px){
 .app.app-ready #groups .balanced-groups-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 .app.app-ready #groups .balanced-groups-panel{overflow:auto!important}
}
@media(max-width:900px){
 .app.app-ready #groups .balanced-groups-grid{grid-template-columns:1fr!important}
 .app.app-ready #groups .balanced-group-card{min-height:auto!important}
}
`;
document.head.appendChild(balancedGroupsStyle);


/* 人物库分页版：4页切换，放宽列宽，表头纯黑，尾列与筛选区右边缘对齐。 */
const peoplePaginationOld=$('#chennanPeoplePagination20261003');if(peoplePaginationOld)peoplePaginationOld.remove();
const peoplePaginationStyle=document.createElement('style');
peoplePaginationStyle.id='chennanPeoplePagination20261003';
peoplePaginationStyle.textContent=`
.app.app-ready #people .toolbar{
 width:100%!important;
 grid-template-columns:minmax(260px,1.28fr) minmax(175px,.82fr) minmax(175px,.82fr) minmax(180px,.84fr)!important;
 gap:8px!important
}
.app.app-ready #people .toolbar :is(.input,.select){
 width:100%!important;color:#111!important
}
.app.app-ready #people #peopleCount{
 color:#5f6863!important;font-size:9.5px!important
}

/* 桌面表格直接使用全部可用宽度，不再为塞列而过度压缩。 */
.app.app-ready #people .people-table-wrap{
 width:100%!important;max-width:100%!important;overflow-x:hidden!important;overflow-y:hidden!important
}
.app.app-ready #people .people-data-table{
 width:100%!important;min-width:0!important;table-layout:fixed!important
}
.app.app-ready #people .people-data-table col{width:auto}
.app.app-ready #people .people-data-table thead th{
 color:#050606!important;background:#f2f4f3!important;
 font-size:9px!important;font-weight:800!important;letter-spacing:0!important;
 padding:5px 7px!important;height:29px!important;line-height:19px!important;
 border-bottom:1px solid #cfd5d1!important
}
.app.app-ready #people .people-data-table tbody td{
 color:#111514!important;
 padding:4px 7px!important;height:32px!important;min-height:32px!important;
 font-size:9px!important;line-height:1.12!important
}
.app.app-ready #people .people-data-table td:first-child{
 color:#080a09!important;font-weight:700!important
}
.app.app-ready #people .people-data-table .table-person{
 gap:7px!important
}
.app.app-ready #people .people-data-table .table-avatar{
 width:26px!important;height:26px!important;min-width:26px!important;min-height:26px!important
}
.app.app-ready #people .people-data-table .table-name{
 max-width:none!important;color:#050606!important;font-size:9.5px!important;font-weight:760!important;
 line-height:1.05!important
}
.app.app-ready #people .people-data-table .table-name>small{
 margin-top:1px!important
}
.app.app-ready #people .person-category{
 font-size:7px!important;padding:1px 4px!important;color:#39352a!important
}
.app.app-ready #people .vip-level,
.app.app-ready #people .vip-none{
 font-size:8px!important;min-width:36px!important;height:20px!important;padding:0 5px!important
}

/* 操作列四项等距排开，并把最后一项贴近表格右侧边缘。 */
.app.app-ready #people .people-data-table td:nth-child(14){
 padding-left:6px!important;padding-right:7px!important;overflow:visible!important
}
.app.app-ready #people .people-actions{
 width:100%!important;display:flex!important;align-items:center!important;justify-content:space-between!important;
 gap:4px!important;white-space:nowrap!important
}
.app.app-ready #people .people-actions .link-btn{
 flex:0 0 auto!important;padding:1px 2px!important;margin:0!important;
 font-size:8px!important;line-height:1.15!important
}

/* 分页按钮 */
.app.app-ready #people .people-pagination{
 height:31px!important;margin-top:6px!important;
 display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important
}
.app.app-ready #people .people-page-btn{
 width:29px!important;height:27px!important;min-width:29px!important;padding:0!important;
 display:grid!important;place-items:center!important;
 border:1px solid #d8ddda!important;border-radius:7px!important;
 background:#fff!important;color:#26302c!important;
 font-size:10px!important;font-weight:700!important;
 transition:.15s ease!important
}
.app.app-ready #people .people-page-btn:hover{
 background:#f2f5f3!important;border-color:#c4ccc7!important
}
.app.app-ready #people .people-page-btn.active{
 background:#252a27!important;color:#fff!important;border-color:#252a27!important
}

/* 16:9 桌面：人物页固定在当前工作区高度内，不再整页向下无限滚。 */
@media(min-width:1180px) and (min-aspect-ratio:4/3){
 .app.app-ready #people.active{
  height:100%!important;max-height:100%!important;min-height:0!important;
  overflow:hidden!important;display:flex!important;flex-direction:column!important
 }
 .app.app-ready #people .topbar{
  flex:0 0 92px!important;min-height:92px!important;height:92px!important;margin:0 0 9px!important
 }
 .app.app-ready #people>.card.panel{
  flex:1 1 auto!important;min-height:0!important;height:auto!important;
  display:flex!important;flex-direction:column!important;overflow:hidden!important
 }
 .app.app-ready #people .toolbar{flex:0 0 38px!important}
 .app.app-ready #people #peopleCount{flex:0 0 14px!important}
 .app.app-ready #people #peopleList{
  flex:1 1 auto!important;min-height:0!important;
  display:flex!important;flex-direction:column!important
 }
 .app.app-ready #people .people-table-wrap{
  flex:1 1 auto!important;min-height:0!important
 }
 .app.app-ready #people .people-data-table{
  height:auto!important
 }
}

/* 窄桌面与手机仍允许横向滚动，避免列内容被硬截断。 */
@media(max-width:1179px){
 .app.app-ready #people .people-table-wrap{overflow-x:auto!important}
 .app.app-ready #people .people-data-table{min-width:1180px!important}
}
`;
document.head.appendChild(peoplePaginationStyle);


/* 分组页修正：不显示人物头像；整组卡不浮起，仅单个人物条目浮起。 */
const groupFixOld=$('#chennanBalancedGroupsNoAvatar20261003');if(groupFixOld)groupFixOld.remove();
const groupFixStyle=document.createElement('style');
groupFixStyle.id='chennanBalancedGroupsNoAvatar20261003';
groupFixStyle.textContent=`
.app.app-ready #groups .balanced-group-card,
.app.app-ready #groups .balanced-group-card:hover{
 transform:none!important;
 border-color:#d9dedb!important;
 box-shadow:
  inset 1px 1px 0 rgba(255,255,255,.96),
  inset -1px -1px 0 rgba(168,175,171,.08),
  0 4px 12px rgba(52,62,56,.03)!important
}
.app.app-ready #groups .balanced-members{
 display:grid!important;
 grid-template-columns:1fr!important;
 gap:4px!important
}
.app.app-ready #groups .balanced-member{
 min-width:0!important;min-height:27px!important;height:27px!important;
 padding:0 7px!important;
 display:grid!important;
 grid-template-columns:44px minmax(0,1fr) 34px!important;
 gap:7px!important;align-items:center!important;
 border:1px solid #e3e7e4!important;border-radius:7px!important;
 background:#fff!important;text-align:left!important;
 transform:translateY(0)!important;
 box-shadow:none!important;
 transition:transform .14s ease,background .14s ease,border-color .14s ease,box-shadow .14s ease!important
}
.app.app-ready #groups .balanced-member:hover{
 background:#f7f9fa!important;
 border-color:#cbd4cf!important;
 transform:translateY(-1px)!important;
 box-shadow:0 3px 8px rgba(45,55,49,.07)!important
}
.app.app-ready #groups .balanced-member-code{
 color:#111514!important;font-size:8px!important;font-weight:760!important;
 white-space:nowrap!important
}
.app.app-ready #groups .balanced-member-name{
 min-width:0!important;color:#202624!important;font-size:8px!important;font-weight:650!important;
 white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important
}
.app.app-ready #groups .balanced-member-type{
 justify-self:end!important;color:#5f6863!important;font-size:7.5px!important;
 white-space:nowrap!important
}
.app.app-ready #groups .balanced-member-avatar,
.app.app-ready #groups .balanced-member .person-portrait{
 display:none!important
}
`;
document.head.appendChild(groupFixStyle);


/* 分组页 hover 最终规则：任何整块容器都不浮起，仅单个人员行浮起。 */
const groupsHoverFinalOld=$('#chennanGroupsHoverFinal20261003');if(groupsHoverFinalOld)groupsHoverFinalOld.remove();
const groupsHoverFinalStyle=document.createElement('style');
groupsHoverFinalStyle.id='chennanGroupsHoverFinal20261003';
groupsHoverFinalStyle.textContent=`
@media(hover:hover) and (pointer:fine){
 .app.app-ready #groups :is(
  .balanced-groups-panel,
  .balanced-group-card,
  .card,
  .panel,
  .custom-group,
  .group-card
 ),
 .app.app-ready #groups :is(
  .balanced-groups-panel,
  .balanced-group-card,
  .card,
  .panel,
  .custom-group,
  .group-card
 ):hover{
  transform:none!important;
  translate:none!important;
  scale:1!important;
  filter:none!important;
 }
 .app.app-ready #groups .balanced-groups-panel,
 .app.app-ready #groups .balanced-groups-panel:hover{
  border-color:#d7dcd9!important;
  box-shadow:
   inset 1px 1px 0 rgba(255,255,255,.96),
   inset -1px -1px 0 rgba(168,175,171,.08),
   0 4px 12px rgba(52,62,56,.03)!important
 }
 .app.app-ready #groups .balanced-group-card,
 .app.app-ready #groups .balanced-group-card:hover{
  border-color:#d9dedb!important;
  box-shadow:
   inset 1px 1px 0 rgba(255,255,255,.96),
   inset -1px -1px 0 rgba(168,175,171,.08),
   0 4px 12px rgba(52,62,56,.03)!important
 }
 .app.app-ready #groups .balanced-member:hover{
  transform:translateY(-1px)!important;
  filter:none!important;
  background:#f7f9fa!important;
  border-color:#cbd4cf!important;
  box-shadow:0 3px 8px rgba(45,55,49,.07)!important
 }
}
`;
document.head.appendChild(groupsHoverFinalStyle);

/* 概览离开后，顶部操作按钮隐藏；返回概览恢复。 */
function syncHeaderActions(){
 const active=$('.section.active');
 if(overviewActions)overviewActions.style.display=active?.id==='overview'?'flex':'none';
}
syncHeaderActions();
new MutationObserver(syncHeaderActions).observe(main,{subtree:true,attributes:true,attributeFilter:['class']});

})();
