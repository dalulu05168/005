/* 辰南统一设计系统运行时 v2.0 · 2026-10-03 */
(function(){
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

function ensureStylesheetLast(){
  let link=$('#chennanDesignSystemStyles');
  if(!link){
    link=document.createElement('link');
    link.id='chennanDesignSystemStyles';
    link.rel='stylesheet';
    link.href='./design-system.css?v=20261003-unified-2';
  }
  document.head.appendChild(link);
}
ensureStylesheetLast();

const NAV_ICONS={
  overview:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>',
  people:'<circle cx="12" cy="8" r="3"/><path d="M6.5 20c.6-4 2.5-6 5.5-6s4.9 2 5.5 6"/>',
  groups:'<circle cx="8" cy="8" r="2.5"/><circle cx="16.5" cy="9" r="2"/><path d="M3.5 20c.4-4 2-6 4.5-6s4.1 2 4.5 6"/><path d="M14 15c2.9.2 4.6 1.8 5 5"/>',
  tradeRecommend:'<path d="M4 17 9 12l3 3 7-8"/><path d="M14 7h5v5"/>',
  holdingsV2:'<path d="M5 6h14v13H5z"/><path d="M8 10h8M8 14h8M9 3v3m6-3v3"/>',
  trades:'<path d="M4 7h12"/><path d="m13 4 3 3-3 3"/><path d="M20 17H8"/><path d="m11 14-3 3 3 3"/>',
  records:'<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  novel:'<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/><path d="m14.5 7.5 3 3"/>',
  france70chat:'<path d="M4 6h16v11H8l-4 3V6z"/><path d="M8 10h8M8 13h5"/>',
  topics:'<path d="m5 12 4 4L19 6"/>'
};

function svgIcon(inner){
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+inner+'</svg>';
}
function normalizeNavIcons(){
  document.querySelectorAll('.sidebar .nav button[data-page]').forEach(btn=>{
    const icon=btn.querySelector('i'),inner=NAV_ICONS[btn.dataset.page];
    if(icon&&inner&&icon.dataset.uiIcon!==btn.dataset.page){
      icon.innerHTML=svgIcon(inner);
      icon.dataset.uiIcon=btn.dataset.page;
    }
  });
  const logout=$('#logoutBtn i');
  if(logout&&logout.dataset.uiIcon!=='logout'){
    logout.innerHTML=svgIcon('<path d="M10 5H5v14h5"/><path d="M13 8l4 4-4 4"/><path d="M8 12h9"/>');
    logout.dataset.uiIcon='logout';
  }
}

const PAGE_META={
  overview:{eyebrow:'INVESTOR WORKSPACE',title:'投资者人物总览',sub:'70 位人物资料、分组、持仓与交易状态统一工作台。'},
  people:{eyebrow:'INVESTOR DIRECTORY',title:'人物库',sub:'查看、筛选、编辑人物完整资料，并进入人物详情与交易设置。'},
  groups:{eyebrow:'BALANCED GROUPS',title:'分组管理',sub:'70 位人物固定平均分为 10 组，每组 7 人；男女与新老客户比例均衡，小组名称可修改。'},
  tradeRecommend:{eyebrow:'INVESTOR TRANSACTIONS',title:'人物交易',sub:'管理股票计划、推荐购买人物，并记录邀请、拒绝与确认买入结果。'},
  holdingsV2:{eyebrow:'PORTFOLIO HOLDINGS',title:'持仓管理',sub:'按股票批次查看持有人、买入成本、计划卖出时间与当前持仓状态。'},
  trades:{eyebrow:'TRADING PLAN',title:'交易计划',sub:'集中管理今日待售、待买、持仓、未持仓人员与名单生成规则。'},
  records:{eyebrow:'INVESTOR RECORDS',title:'人物记录',sub:'统一记录人物重要事件、发言与联系信息，并辅助检查重复与状态冲突。'},
  novel:{eyebrow:'WRITING WORKSPACE',title:'撰写',sub:'每日文档、人物发言、长期记忆与一致性提醒统一写作工作台。'},
  france70chat:{eyebrow:'FRANCE 70',title:'France 70 群聊与长期记忆',sub:'使用既有人设、关系网、Voice DNA 与动态记忆组织群聊内容。'},
  topics:{eyebrow:'CONSISTENCY CHECK',title:'一致性检查',sub:'汇总人物数据规则、主题标签与逻辑检查信息，辅助保持长期内容一致。'}
};

const SECONDARY_PARENT={
  personDetailPage:'people',
  groupDetailPage:'groups',
  recordDetailPage:'records',
  fr70PersonDetailPage:'france70chat'
};

function normalizePrimaryHeader(section){
  if(!section||!PAGE_META[section.id])return;
  const meta=PAGE_META[section.id];
  const top=section.querySelector(':scope > .topbar')||section.querySelector('.topbar');
  if(!top)return;
  top.classList.add('cn-page-header');
  const left=top.firstElementChild;
  if(!left)return;
  let eyebrow=left.querySelector('.eyebrow');
  let title=left.querySelector('.page-title');
  let sub=left.querySelector('.sub');
  if(eyebrow&&eyebrow.textContent!==meta.eyebrow)eyebrow.textContent=meta.eyebrow;
  if(title&&title.textContent!==meta.title)title.textContent=meta.title;
  if(sub&&sub.textContent!==meta.sub)sub.textContent=meta.sub;
}

function tagSections(){
  $$('.main>.section').forEach(section=>{
    section.dataset.uiSystem='chennan-v1';
    normalizePrimaryHeader(section);
    if(section.id==='personDetailPage')section.dataset.uiPageType='detail';
    else if(['people','records'].includes(section.id))section.dataset.uiPageType='list';
    else if(['tradeRecommend','holdingsV2','trades','novel','france70chat','groups','topics'].includes(section.id))section.dataset.uiPageType='workspace';
    else section.dataset.uiPageType='dashboard';
  });
}

function normalizeButtons(root=document){
  $$('.btn',root).forEach(btn=>{
    if(btn.classList.contains('danger'))btn.dataset.uiTone='danger';
    else if(btn.classList.contains('primary'))btn.dataset.uiTone='primary';
    else btn.dataset.uiTone='secondary';
  });
  $$('.link-btn.danger,.delete-person',root).forEach(el=>el.dataset.uiTone='danger');
}

function normalizeTables(root=document){
  $$('table',root).forEach(table=>{
    table.dataset.uiTable='standard';
    const wrap=table.closest('.table-wrap,.people-table-wrap');
    if(wrap)wrap.dataset.uiSurface='table';
  });
}

function normalizeEmptyStates(root=document){
  $$('.empty',root).forEach(node=>{
    node.dataset.uiEmpty='true';
    if(!node.getAttribute('role'))node.setAttribute('role','status');
    if(node.tagName==='TD'||node.dataset.uiEmptyStructured==='1')return;
    if(node.children.length===0){
      const raw=(node.textContent||'暂无内容').trim()||'暂无内容';
      node.innerHTML='<span class="cn-empty-icon" aria-hidden="true">◇</span><b class="cn-empty-title">暂无内容</b><span class="cn-empty-desc"></span>';
      const desc=node.querySelector('.cn-empty-desc');if(desc)desc.textContent=raw;
      node.dataset.uiEmptyStructured='1';
    }
  });
}
function modalEyebrow(title){
  const t=String(title||'');
  if(/小组|分组/.test(t))return'GROUP SETTINGS';
  if(/记录|事件|发言/.test(t))return'RECORD EDITOR';
  if(/股票|交易|买入|卖出|持仓/.test(t))return'TRANSACTION DETAIL';
  if(/人物|资金|盈利|参与/.test(t))return'PERSON SETTINGS';
  return'DETAIL EDITOR';
}
function normalizeModals(root=document){
  $$('.modal',root).forEach(m=>{
    m.dataset.uiSurface='modal';
    const title=m.querySelector('#modalTitle,h2');
    if(title&&!m.querySelector('.cn-modal-eyebrow')){
      const eye=document.createElement('div');
      eye.className='cn-modal-eyebrow';
      eye.textContent=modalEyebrow(title.textContent);
      title.before(eye);
    }else if(title&&m.querySelector('.cn-modal-eyebrow')){
      m.querySelector('.cn-modal-eyebrow').textContent=modalEyebrow(title.textContent);
    }
  });
  $$('dialog',root).forEach(d=>{
    d.dataset.uiSurface='dialog';
    const h=d.querySelector('h2,h3');
    if(h&&!d.querySelector('.cn-modal-eyebrow')){
      const eye=document.createElement('div');eye.className='cn-modal-eyebrow';eye.textContent='WORKSPACE NOTICE';h.before(eye);
    }
  });
}
function removeGroupPortraitLeaks(){
  $$('#groups .balanced-member-avatar,#groups .balanced-member .person-portrait').forEach(n=>n.remove());
}
function normalizeDetailPages(){
  Object.keys(SECONDARY_PARENT).forEach(id=>{
    const sec=$('#'+id);if(!sec)return;
    sec.dataset.uiPageType='detail';
    sec.dataset.uiParent=SECONDARY_PARENT[id];
    sec.classList.add('cn-secondary-page');
    const head=sec.querySelector('.detail-head');
    if(head)head.classList.add('cn-page-header');
  });
  const person=$('#personDetailPage');
  const eyebrow=person?.querySelector('.detail-head .eyebrow');
  if(eyebrow&&eyebrow.textContent!=='PERSON PROFILE')eyebrow.textContent='PERSON PROFILE';
}
function syncSecondaryNav(){
  const active=$('.main>.section.active');if(!active)return;
  const parent=active.dataset.uiParent||SECONDARY_PARENT[active.id];
  if(!parent)return;
  $$('.sidebar .nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===parent));
}
function normalizeSurfaceRoles(root=document){
  $$('.section>.card,.section>.panel,.section>.grid>.card,.section>.grid>.panel',root).forEach(x=>x.dataset.uiSurface='parent');
  $$('.profile-row,.candidate-card,.holding-person-card,.trade-item,.doc-item,.event,.balanced-member,.fr70-memory-row',root).forEach(x=>x.dataset.uiSurface='leaf');
  $$('.trade-tabs,.fr70-seg,.daily-tabs',root).forEach(x=>x.dataset.uiControl='segmented');
}

function normalizeAll(root=document){
  normalizeNavIcons();
  tagSections();
  normalizeButtons(root);
  normalizeTables(root);
  normalizeEmptyStates(root);
  normalizeModals(root);
  normalizeDetailPages();
  normalizeSurfaceRoles(root);
  removeGroupPortraitLeaks();
  syncSecondaryNav();
}
normalizeAll();

/* Re-apply after dynamic pages replace their innerHTML. */
let queued=false;
const observer=new MutationObserver(records=>{
  if(queued)return;
  if(!records.some(r=>r.type==='childList'||(r.type==='attributes'&&r.attributeName==='class')))return;
  queued=true;
  requestAnimationFrame(()=>{
    queued=false;
    ensureStylesheetLast();
    normalizeAll();
  });
});
observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

/* Consistent secondary-page return behavior. */
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||event.defaultPrevented)return;
  const active=$('.main>.section.active');
  if(!active)return;

  const openDialog=$('dialog[open]');
  if(openDialog){
    event.preventDefault();
    openDialog.close();
    return;
  }
  const modal=$('.modal-wrap.show');
  if(modal){
    const cancel=modal.querySelector('#cancelModal,[data-close-modal],.modal-close');
    event.preventDefault();
    if(cancel)cancel.click();
    else modal.classList.remove('show');
    return;
  }

  const parent=active.dataset.uiParent||SECONDARY_PARENT[active.id];
  if(parent){
    event.preventDefault();
    if(typeof window.go==='function')window.go(parent);
    else document.querySelector('.nav button[data-page="'+parent+'"]')?.click();
    return;
  }

  if(active.id==='holdingsV2'){
    event.preventDefault();
    document.querySelector('.nav button[data-page="tradeRecommend"]')?.click();
  }
});

/* Keep page header and main surfaces aligned after navigation. */
document.addEventListener('click',event=>{
  const nav=event.target.closest?.('.nav button[data-page],[data-go]');
  if(!nav)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>normalizeAll()));
},true);

/* Expose a tiny QA helper without touching business data. */
window.ChenNanDesignSystem={
  version:'2.0.0',
  expectedPrimary:['overview','people','groups','tradeRecommend','holdingsV2','trades','records','novel','france70chat','topics'],
  expectedSecondary:['personDetailPage','groupDetailPage','recordDetailPage','fr70PersonDetailPage'],
  audit(){
    const sections=$$('.main>.section').map(s=>({
      id:s.id,
      pageType:s.dataset.uiPageType||'unknown',
      parent:s.dataset.uiParent||null,
      hasHeader:!!(s.querySelector(':scope > .topbar,.detail-head')),
      cards:s.querySelectorAll('.card,.panel').length,
      tables:s.querySelectorAll('table').length,
      empties:s.querySelectorAll('.empty').length,
      modals:s.querySelectorAll('.modal').length
    }));
    const ids=new Set(sections.map(x=>x.id));
    return {
      version:this.version,
      primary:this.expectedPrimary.map(id=>({id,present:ids.has(id)})),
      secondary:this.expectedSecondary.map(id=>({id,present:ids.has(id)})),
      sections
    };
  },
  refresh:normalizeAll
}

})();