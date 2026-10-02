
const STORAGE_KEY='growth-workspace-db';
const DATA_URL='./data/people.json';
const DEFAULT_DATASET_VERSION='3.0';
const emptyDB={people:[],records:[],docs:[],dailyDocs:{},customGroups:[],meta:{}};
let db=loadLocal();
let selectedDocId=db.docs[0]?.id||null;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function loadLocal(){
  let raw=null;try{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch(_){}
  const out=raw&&typeof raw==='object'?raw:{...emptyDB};
  out.people=Array.isArray(out.people)?out.people:[];
  out.records=Array.isArray(out.records)?out.records:[];
  out.docs=Array.isArray(out.docs)?out.docs:[];
  out.dailyDocs=out.dailyDocs&&typeof out.dailyDocs==='object'&&!Array.isArray(out.dailyDocs)?out.dailyDocs:{};
  out.customGroups=Array.isArray(out.customGroups)?out.customGroups:[];
  out.meta=out.meta&&typeof out.meta==='object'?out.meta:{};
  out.people=out.people.map(normalizePerson);
  return out;
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(db))}
function toast(t){const x=$('#toast');x.textContent=t;x.classList.add('show');setTimeout(()=>x.classList.remove('show'),2400)}
function today(){return new Date().toISOString().slice(0,10)}
function pCode(p){const m=String(p?.id||'').match(/^(?:FR0*|C\.)(\d+)$/i);return m&&Number(m[1])>=1&&Number(m[1])<=70?'C.'+String(Number(m[1])).padStart(2,'0'):String(p?.id||'')}
function person(id){const key=String(id).trim().toUpperCase();return db.people.find(p=>String(p.id).toUpperCase()===key||pCode(p).toUpperCase()===key)||null}
function pAvatar(p){const m=pCode(p).match(/^C\.(\d+)$/);const n=m?Number(m[1])-1:-1;if(n<0||n>=70)return '<img class="person-portrait" src="./assets/brand/chennan-logo.jpg" alt="">';return '<span class="person-portrait" role="img" aria-label="'+esc(pName(p))+'的虚构头像" style="--portrait-x:'+((n%10)/9*100)+'%;--portrait-y:'+((Math.floor(n/10))/6*100)+'%"></span>'}

function pName(p){return p?.name||p?.frenchName||'未命名'}
function pGender(p){return p?.gender||((p?.genderAge||'').includes('女')?'女':(p?.genderAge||'').includes('男')?'男':'')}
function pRelationCode(p){return p?.customer_relation?.type_code||((p?.genderAge||'').includes('老')?'OLD':(p?.genderAge||'').includes('新')?'NEW':'')}
function pRelationName(p){return p?.customer_relation?.type||(pRelationCode(p)==='OLD'?'老客户':pRelationCode(p)==='NEW'?'新客户':'未分类')}
function pVip(p){return !!(p?.vip?.is_vip)}
function pOpened(p){return !!(p?.account?.opened)}
function pJoined(p){return !!(p?.crm?.joined_group)}
function pEnthusiasm(p){return Number(p?.investment_profile?.stock_enthusiasm_index??((Number(p?.heat)||0)*10))||0}
function pAssets(p){return Number(p?.finance?.estimated_investable_assets_eur)||0}
function initials(n){return String(n||'人').trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}
function genderRelationLabel(p){const rel=pRelationCode(p)==='OLD'?'老':pRelationCode(p)==='NEW'?'新':'';return rel+(pGender(p)||'')}
function normalizePerson(raw={}){
  const p=JSON.parse(JSON.stringify(raw||{}));
  p.id=String(p.id??p.legacy_id??'').trim();
  p.legacy_id=String(p.legacy_id??p.id??'').trim();
  p.name=p.name||p.frenchName||'';
  p.gender=p.gender||((p.genderAge||'').includes('女')?'女':(p.genderAge||'').includes('男')?'男':'');
  p.gender_code=p.gender_code||(p.gender==='女'?'F':p.gender==='男'?'M':'');
  p.age=Number(p.age)||null;
  p.age_group=p.age_group||'';
  p.customer_relation=p.customer_relation&&typeof p.customer_relation==='object'?p.customer_relation:{type:(p.genderAge||'').includes('老')?'老客户':'新客户',type_code:(p.genderAge||'').includes('老')?'OLD':'NEW'};
  p.vip=p.vip&&typeof p.vip==='object'?p.vip:{is_vip:false,level:null,reason:null};
  p.account=p.account&&typeof p.account==='object'?p.account:{opened:false,status:'未开户',status_code:'NOT_OPENED',opened_date:null};
  p.location=p.location&&typeof p.location==='object'?p.location:{country:'法国',country_code:'FR',city:'',region:''};
  p.occupation=p.occupation&&typeof p.occupation==='object'?p.occupation:{title_fr:'',title_zh:'',industry_fr:'',industry_zh:'',employment_status:'',years_in_role:null,education:'',career_stage:''};
  p.family=p.family&&typeof p.family==='object'?p.family:{};
  p.finance=p.finance&&typeof p.finance==='object'?p.finance:{annual_income_eur:0,estimated_investable_assets_eur:0,estimated_liquid_assets_eur:0,available_investment_capital_eur:0};
  p.finance.available_capital_by_currency=p.finance.available_capital_by_currency&&typeof p.finance.available_capital_by_currency==='object'&&!Array.isArray(p.finance.available_capital_by_currency)?p.finance.available_capital_by_currency:{};
  [['EUR','available_investment_capital_eur'],['USD','available_investment_capital_usd'],['HKD','available_investment_capital_hkd'],['CNY','available_investment_capital_cny']].forEach(function(pair){const v=Number(p.finance[pair[1]]);if(Number.isFinite(v)&&v>0&&p.finance.available_capital_by_currency[pair[0]]==null)p.finance.available_capital_by_currency[pair[0]]=v});
  p.investment_profile=p.investment_profile&&typeof p.investment_profile==='object'?p.investment_profile:{stock_enthusiasm_index:Number(p.heat||0)*10,stock_enthusiasm_level:'',risk_tolerance:'',preferred_sectors:[]};
  p.personality=p.personality&&typeof p.personality==='object'?p.personality:{summary:'',traits:[]};
  p.communication=p.communication&&typeof p.communication==='object'?p.communication:{};
  p.lifestyle=p.lifestyle&&typeof p.lifestyle==='object'?p.lifestyle:{};
  p.tags=Array.isArray(p.tags)?p.tags:[];
  p.crm=p.crm&&typeof p.crm==='object'?p.crm:{joined_group:false,group_joined_date:null,notes:p.note||'',contact_count:0};
  if(typeof p.crm.joined_group!=='boolean')p.crm.joined_group=false;
  p.crm.contact_count=Math.max(0,Number(p.crm.contact_count)||0);
  return p;
}
async function seedDefaultPeople(){
  try{
    const res=await fetch(DATA_URL,{cache:'no-store'});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const dataset=await res.json();
    const list=Array.isArray(dataset)?dataset:Array.isArray(dataset.people)?dataset.people:[];
    if(!list.length)throw new Error('数据文件没有 people 数组');
    if(db.meta.defaultDatasetVersion!==DEFAULT_DATASET_VERSION){
      const existing=new Map(db.people.map(p=>[String(p.id),p]));
      let added=0;
      list.map(normalizePerson).forEach(p=>{if(!existing.has(String(p.id))){db.people.push(p);added++}});
      db.meta.defaultDatasetVersion=DEFAULT_DATASET_VERSION;
      db.meta.defaultDatasetName=dataset.dataset_name||'法国人物70位';
      save();
      $('#seedNotice').textContent=`默认人物数据已就绪：${list.length} 人；本次补充 ${added} 人。`;
    }else{
      $('#seedNotice').textContent=`默认人物数据已载入；当前人物库 ${db.people.length} 人。`;
    }
  }catch(err){
    $('#seedNotice').className='notice warn';
    $('#seedNotice').textContent=`默认数据载入失败：${err.message}。仍可使用“导入 JSON / CSV”手动导入。`;
  }
  render();
}

const SYSTEM_GROUPS=[
  {id:'all',name:'全部人物',test:p=>true},
  {id:'new_male',name:'新男',test:p=>pRelationCode(p)==='NEW'&&pGender(p)==='男'},
  {id:'new_female',name:'新女',test:p=>pRelationCode(p)==='NEW'&&pGender(p)==='女'},
  {id:'old_male',name:'老男',test:p=>pRelationCode(p)==='OLD'&&pGender(p)==='男'},
  {id:'old_female',name:'老女',test:p=>pRelationCode(p)==='OLD'&&pGender(p)==='女'},
  {id:'vip',name:'VIP',test:p=>pVip(p)},
  {id:'male',name:'男性',test:p=>pGender(p)==='男'},
  {id:'female',name:'女性',test:p=>pGender(p)==='女'},
  {id:'opened',name:'已开户',test:p=>pOpened(p)},
  {id:'not_opened',name:'未开户',test:p=>!pOpened(p)},
  {id:'joined',name:'已入群',test:p=>pJoined(p)},
  {id:'not_joined',name:'未入群',test:p=>!pJoined(p)}
];
function systemGroup(id){return SYSTEM_GROUPS.find(g=>g.id===id)||SYSTEM_GROUPS[0]}
function customGroup(id){return db.customGroups.find(g=>g.id===id)||null}

/* 固定 10 组：70人平均分组。当前70人结构可做到每组 老女1 + 新女2 + 老男2 + 新男2。 */
function balancedGroupCategory(p){
  const rel=pRelationCode(p),gender=pGender(p);
  if(rel==='OLD'&&gender==='女')return'old_female';
  if(rel==='NEW'&&gender==='女')return'new_female';
  if(rel==='OLD'&&gender==='男')return'old_male';
  if(rel==='NEW'&&gender==='男')return'new_male';
  return'other';
}
function balancedGroupSignature(){
  return [...db.people].sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}))
    .map(p=>String(p.id)+':'+balancedGroupCategory(p)).join('|');
}
function ensureTenBalancedGroups(){
  const version='balanced-10-v1';
  const signature=balancedGroupSignature();
  const valid=Array.isArray(db.customGroups)&&db.customGroups.length===10&&
    db.customGroups.every((g,i)=>g&&g.id==='balanced-'+String(i+1).padStart(2,'0')&&Array.isArray(g.members))&&
    db.meta?.balancedGroupVersion===version&&db.meta?.balancedGroupSignature===signature;
  if(valid)return false;

  const preserveNames=new Map();
  if(db.meta?.balancedGroupVersion===version){
    (db.customGroups||[]).forEach(g=>{
      if(/^balanced-\d{2}$/.test(String(g.id||'')))preserveNames.set(g.id,String(g.name||'').trim());
    });
  }
  const buckets={old_female:[],new_female:[],old_male:[],new_male:[],other:[]};
  [...db.people].sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}))
    .forEach(p=>buckets[balancedGroupCategory(p)].push(p));

  const groups=Array.from({length:10},(_,i)=>({
    id:'balanced-'+String(i+1).padStart(2,'0'),
    name:preserveNames.get('balanced-'+String(i+1).padStart(2,'0'))||('第'+String(i+1).padStart(2,'0')+'组'),
    leader:'',
    members:[],
    balanced:true,
    lockedMembers:true,
    updated:today()
  }));
  ['old_female','new_female','old_male','new_male'].forEach(key=>{
    buckets[key].forEach((p,i)=>groups[i%10].members.push(String(p.id)));
  });
  buckets.other.forEach(p=>{
    const target=groups.slice().sort((a,b)=>a.members.length-b.members.length||a.id.localeCompare(b.id))[0];
    target.members.push(String(p.id));
  });
  groups.forEach(g=>g.members.sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})));
  db.customGroups=groups;
  db.meta=db.meta&&typeof db.meta==='object'?db.meta:{};
  db.meta.balancedGroupVersion=version;
  db.meta.balancedGroupSignature=signature;
  return true;
}

function ensureRecordDetailPage(){
  let sec=$('#recordDetailPage');
  if(sec)return sec;
  sec=document.createElement('section');
  sec.id='recordDetailPage';
  sec.className='section';
  sec.dataset.uiParent='records';
  sec.innerHTML='<div id="recordDetailContent"></div>';
  const records=$('#records');
  if(records&&records.parentNode)records.parentNode.insertBefore(sec,records.nextSibling);
  else $('.main')?.appendChild(sec);
  return sec;
}
function renderRecordDetail(id){
  const r=(db.records||[]).find(x=>String(x.id)===String(id));if(!r)return;
  const p=person(r.personId);
  ensureRecordDetailPage();
  const host=$('#recordDetailContent');if(!host)return;
  host.innerHTML=
    '<div class="detail-head cn-page-header">'+
      '<div class="detail-identity"><div class="cn-detail-mark">R</div><div><div class="eyebrow">RECORD DETAIL</div><h1 class="page-title">'+esc(r.title||r.type||'人物记录')+'</h1>'+
      '<p class="sub">'+esc(r.date||'--')+' · '+esc(r.type||'记录')+(p?' · '+esc(pCode(p))+' · '+esc(pName(p)):'')+'</p></div></div>'+
      '<div class="actions"><button class="btn ghost" id="recordDetailBack">← 返回人物记录</button><button class="btn primary" id="recordDetailEdit">编辑记录</button></div>'+
    '</div>'+
    '<div class="cn-record-detail-grid">'+
      '<div class="card panel"><div class="panel-head"><h2>记录内容</h2><span class="muted">'+esc(r.type||'记录')+'</span></div><div class="cn-record-content">'+esc(r.content||'--')+'</div>'+
      '<div class="tags" style="margin-top:12px">'+(r.topics||[]).map(t=>'<span class="tag"># '+esc(t)+'</span>').join('')+'</div></div>'+
      '<div class="card panel"><div class="panel-head"><h2>关联人物</h2><span class="muted">'+(p?'已关联':'无人物')+'</span></div>'+
      (p?'<div class="cn-linked-person"><b>'+esc(pCode(p))+' · '+esc(pName(p))+'</b><span>'+esc(genderRelationLabel(p)||'--')+' · '+esc(p.age||'--')+'岁 · '+esc(p.account?.status||'--')+'</span><button class="btn ghost small" id="recordPersonOpen">查看人物详情</button></div>':'<div class="empty">未找到关联人物</div>')+
      '</div>'+
    '</div>';
  go('recordDetailPage');
  $('#recordDetailBack').onclick=()=>go('records');
  $('#recordDetailEdit').onclick=()=>openRecord(r.id);
  if(p&&$('#recordPersonOpen'))$('#recordPersonOpen').onclick=()=>viewPerson(p.id);
}
function eventHTML(r){
  const p=person(r.personId);
  return `<div class="timeline-item" data-record-id="${esc(r.id)}"><div class="date">${esc(r.date||'')}</div><div class="dotline"></div><div class="event"><div class="event-head"><div><span class="event-title">${esc(r.title)}</span><div class="muted" style="font-size:12px;margin-top:2px">${p?`${esc(pCode(p))} · ${esc(genderRelationLabel(p)||'未分类')} · ${esc(pName(p))}`:'未知人物'}</div></div><span class="type ${r.type==='发言记录'?'talk':''}">${esc(r.type)}</span></div><p>${esc(r.content)}</p><div class="tags">${(r.topics||[]).map(t=>`<span class="tag"># ${esc(t)}</span>`).join('')}<button class="link-btn view-record" data-id="${esc(r.id)}">详情</button><button class="link-btn edit-record" data-id="${esc(r.id)}">编辑</button></div></div></div>`;
}

function render(){
  ensureTenBalancedGroups();
  if(db.people.length&&$('#seedNotice'))$('#seedNotice').textContent=`${db.people.length} 位人物资料已加载 · 完整画像与工作区数据`;
  renderOverview();renderPeopleFilters();renderPeople();renderGroups();fillSelect();renderRecords();renderTopics();renderDocs();bindDynamic();
}
function renderOverview(){
  const rs=[...db.records].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  $('#metrics').innerHTML=[
    ['总人物',db.people.length,'完整画像'],
    ['老客户',db.people.filter(p=>pRelationCode(p)==='OLD').length,'关系分层'],
    ['新客户',db.people.filter(p=>pRelationCode(p)==='NEW').length,'关系分层'],
    ['VIP 用户',db.people.filter(pVip).length,'金色标识'],
    ['已开户',db.people.filter(pOpened).length,'账户状态'],
    ['群组数量',db.customGroups.length,'均衡小组']
  ].map(([l,n,t])=>`<div class="card metric"><span class="label">${l}</span><strong>${n}</strong><span class="trend">${t}</span></div>`).join('');
  $('#recentTimeline').innerHTML=rs.slice(0,4).map(eventHTML).join('')||'<div class="empty">还没有重要记录</div>';
  const ids=['new_male','new_female','old_male','old_female','vip','opened','joined'];
  $('#groupOverview').innerHTML=ids.map(id=>{const g=systemGroup(id),n=db.people.filter(g.test).length;return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span>${esc(g.name)}</span><b>${n}</b></div>`}).join('');
}
function renderPeopleFilters(){
  const s=$('#systemGroupFilter'),old=s.value||'all';
  s.innerHTML=SYSTEM_GROUPS.map(g=>`<option value="${g.id}">${esc(g.name)} (${db.people.filter(g.test).length})</option>`).join('');
  s.value=SYSTEM_GROUPS.some(g=>g.id===old)?old:'all';
  const c=$('#customGroupFilter'),cold=c.value||'all';
  c.innerHTML='<option value="all">全部小组</option>'+db.customGroups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)} (${g.members?.length||0})</option>`).join('');
  c.value=db.customGroups.some(g=>g.id===cold)?cold:'all';
}
function personSearchBlob(p){
  return [p.id,pCode(p),p.legacy_id,pName(p),pGender(p),p.age,pRelationName(p),p.location?.city,p.location?.region,p.occupation?.title_zh,p.occupation?.title_fr,p.occupation?.industry_zh,p.personality?.summary,p.crm?.notes,...(p.tags||[])].join(' ').toLowerCase();
}
function renderPeople(){
  const q=($('#personSearch')?.value||'').trim().toLowerCase(),sort=$('#personSort')?.value||'id';
  const sg=systemGroup($('#systemGroupFilter')?.value||'all'),cgid=$('#customGroupFilter')?.value||'all',cg=customGroup(cgid);
  let list=db.people.filter(p=>sg.test(p)&&(!cg||cg.members.includes(String(p.id)))&&(!q||personSearchBlob(p).includes(q)));
  list.sort((a,b)=>sort==='name'?pName(a).localeCompare(pName(b),'fr'):sort==='enthusiasm'?pEnthusiasm(b)-pEnthusiasm(a):sort==='assets'?pAssets(b)-pAssets(a):String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
  $('#peopleCount').textContent=`当前显示 ${list.length} / ${db.people.length} 人`;
  $('#peopleList').innerHTML=list.map(p=>`<div class="profile-row">
    <div class="avatar">${pAvatar(p)}</div>
    <div class="person"><b>${esc(pCode(p))} · ${esc(pName(p))}</b><small>${esc(genderRelationLabel(p)||'未分类')} · ${esc(p.age||'--')}岁 · ${esc(p.location?.city||'城市未填')} · ${esc(p.occupation?.title_zh||p.occupation?.title_fr||'职业未填')}</small></div>
    ${pVip(p)?'<span class="status vip vip-level vip-level-'+esc(String(p.vip?.level||'VIP').replace(/\D/g,'')||'x')+'">'+esc(p.vip?.level||'VIP')+'</span>':''}
    <span class="status ${pOpened(p)?'good':'warn'}">${pOpened(p)?'已开户':'未开户'}</span>
    <span class="status ${pJoined(p)?'good':''}">${pJoined(p)?'已入群':'未入群'}</span>
    <span class="sort-badge">股票热情 ${pEnthusiasm(p)}</span>
    <button class="link-btn view-person" data-id="${esc(p.id)}">详情</button>
    <button class="link-btn edit-person" data-id="${esc(p.id)}">编辑</button>
    <button class="link-btn danger delete-person" data-id="${esc(p.id)}">删除</button>
  </div>`).join('')||'<div class="empty">没有匹配人物</div>';
}
function renderGroups(){
  ensureTenBalancedGroups();
  const system=$('#systemGroups');if(system)system.innerHTML='';
  const count=$('#customGroupCount');if(count)count.textContent='固定 10 组 · 每组 7 人 · 男女新老均衡';
  const host=$('#customGroups');if(!host)return;
  host.innerHTML=db.customGroups.map((g,index)=>{
    const members=(g.members||[]).map(id=>person(id)).filter(Boolean);
    const counts={old_female:0,new_female:0,old_male:0,new_male:0};
    members.forEach(p=>{const k=balancedGroupCategory(p);if(counts[k]!=null)counts[k]++});
    const memberHtml=members.map(p=>'<button class="balanced-member" type="button" data-person-detail="'+esc(p.id)+'"><span class="balanced-member-code">'+esc(pCode(p))+'</span><span class="balanced-member-name">'+esc(pName(p))+'</span><span class="balanced-member-type">'+esc(genderRelationLabel(p)||'未分类')+'</span><span class="balanced-member-vip">'+(pVip(p)?esc(p.vip?.level||'VIP'):'—')+'</span></button>').join('');
    return '<div class="card custom-group balanced-group-card" data-group-index="'+index+'">'+
      '<div class="balanced-group-head"><div><small>GROUP '+String(index+1).padStart(2,'0')+'</small><h3>'+esc(g.name)+'</h3></div><span class="balanced-group-total">'+members.length+'人</span></div>'+
      '<div class="balanced-composition"><span>老女 '+counts.old_female+'</span><span>新女 '+counts.new_female+'</span><span>老男 '+counts.old_male+'</span><span>新男 '+counts.new_male+'</span></div>'+
      '<div class="balanced-member-head"><span>编号</span><span>姓名</span><span>分类</span><span>VIP</span></div>'+
      '<div class="balanced-members">'+memberHtml+'</div>'+
      '<div class="button-row balanced-group-actions"><button class="btn ghost small open-custom-group" data-id="'+esc(g.id)+'">查看详情</button><button class="btn ghost small edit-group" data-id="'+esc(g.id)+'">修改名称</button></div>'+
    '</div>';
  }).join('');
  host.querySelectorAll('[data-person-detail]').forEach(b=>b.onclick=e=>{e.stopPropagation();viewPerson(b.dataset.personDetail)});
}
function fillSelect(){
  const s=$('#recordPerson'),old=s.value;
  s.innerHTML='<option value="all">全部人物</option>'+db.people.map(p=>`<option value="${esc(p.id)}">${esc(pCode(p))} · ${esc(pName(p))}</option>`).join('');
  s.value=[...s.options].some(o=>o.value===old)?old:'all';
}
function renderRecords(){
  const ps=$('#recordPerson').value||'all',ty=$('#recordType').value||'all',q=($('#recordSearch').value||'').toLowerCase();
  const all=[...db.records].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const rs=all.filter(r=>(ps==='all'||String(r.personId)===String(ps))&&(ty==='all'||r.type===ty)&&(`${r.title} ${r.content} ${(r.topics||[]).join(' ')}`).toLowerCase().includes(q));
  const summary=$('#recordSummary');
  if(summary){
    const important=all.filter(r=>r.type==='重要事件').length,talk=all.filter(r=>r.type==='发言记录').length,contact=all.filter(r=>r.type==='联系记录').length;
    const people=new Set(all.map(r=>String(r.personId||'')).filter(Boolean)).size;
    summary.innerHTML=
      '<div class="card record-summary-card"><span>全部记录</span><strong>'+all.length+'</strong><small>当前工作区记录</small></div>'+
      '<div class="card record-summary-card"><span>重要事件</span><strong>'+important+'</strong><small>关键事实与变化</small></div>'+
      '<div class="card record-summary-card"><span>发言记录</span><strong>'+talk+'</strong><small>历史发言与观点</small></div>'+
      '<div class="card record-summary-card"><span>联系记录</span><strong>'+contact+'</strong><small>跟进与沟通</small></div>'+
      '<div class="card record-summary-card"><span>涉及人物</span><strong>'+people+'</strong><small>已有历史人物</small></div>';
  }
  $('#allTimeline').innerHTML=rs.map(eventHTML).join('')||'<div class="empty">没有匹配记录</div>';
  document.querySelectorAll('.view-record').forEach(b=>b.onclick=()=>renderRecordDetail(b.dataset.id));
  document.querySelectorAll('.edit-record').forEach(b=>b.onclick=()=>openRecord(b.dataset.id));
}
function topicCounts(){const m={};db.records.forEach(r=>(r.topics||[]).forEach(t=>{if(t)m[t]=(m[t]||0)+1}));return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function renderTopics(){
  const ts=topicCounts();
  const summary=$('#consistencySummary');
  if(summary){
    const categories={
      newMale:db.people.filter(p=>pRelationCode(p)==='NEW'&&pGender(p)==='男').length,
      newFemale:db.people.filter(p=>pRelationCode(p)==='NEW'&&pGender(p)==='女').length,
      oldMale:db.people.filter(p=>pRelationCode(p)==='OLD'&&pGender(p)==='男').length,
      oldFemale:db.people.filter(p=>pRelationCode(p)==='OLD'&&pGender(p)==='女').length
    };
    const groupOk=Array.isArray(db.customGroups)&&db.customGroups.length===10&&db.customGroups.every(g=>(g.members||[]).length===7);
    summary.innerHTML=
      '<div class="card consistency-summary-card"><span>人物总数</span><strong>'+db.people.length+'</strong><small>主人物库</small></div>'+
      '<div class="card consistency-summary-card"><span>均衡小组</span><strong>'+db.customGroups.length+'</strong><small>'+(groupOk?'10×7 结构正常':'需要检查')+'</small></div>'+
      '<div class="card consistency-summary-card"><span>新客户</span><strong>'+(categories.newMale+categories.newFemale)+'</strong><small>男 '+categories.newMale+' / 女 '+categories.newFemale+'</small></div>'+
      '<div class="card consistency-summary-card"><span>老客户</span><strong>'+(categories.oldMale+categories.oldFemale)+'</strong><small>男 '+categories.oldMale+' / 女 '+categories.oldFemale+'</small></div>'+
      '<div class="card consistency-summary-card"><span>主题标签</span><strong>'+ts.length+'</strong><small>来自人物记录</small></div>';
  }
  $('#allTopics').innerHTML=ts.length?'<div class="topic-summary-list">'+ts.map(([t,n])=>'<div class="topic-summary-row"><span># '+esc(t)+'</span><b>'+n+'</b></div>').join('')+'</div>':'<div class="empty">暂未填写主题标签</div>';
}
function bindDynamic(){
  document.querySelectorAll('.edit-person').forEach(b=>b.onclick=()=>openPerson(b.dataset.id));
  document.querySelectorAll('.view-person').forEach(b=>b.onclick=()=>viewPerson(b.dataset.id));
  document.querySelectorAll('.delete-person').forEach(b=>b.onclick=()=>deletePerson(b.dataset.id));
  document.querySelectorAll('.view-record').forEach(b=>b.onclick=()=>renderRecordDetail(b.dataset.id));
  document.querySelectorAll('.edit-record').forEach(b=>b.onclick=()=>openRecord(b.dataset.id));
  document.querySelectorAll('.system-group-open').forEach(b=>b.onclick=()=>openSystemGroup(b.dataset.group));
  document.querySelectorAll('.edit-group').forEach(b=>b.onclick=()=>openGroup(b.dataset.id));
  document.querySelectorAll('.open-custom-group').forEach(b=>b.onclick=()=>openCustomGroup(b.dataset.id));
  document.querySelectorAll('.delete-group').forEach(b=>b.onclick=()=>deleteGroup(b.dataset.id));
}
let pageTransitionToken=0;
function go(page){
  const target=document.getElementById(page);
  if(!target)return;
  const token=++pageTransitionToken;
  const current=document.querySelector('.section.active');

  const activate=()=>{
    if(token!==pageTransitionToken)return;
    document.querySelectorAll('.section').forEach(s=>{
      s.classList.remove('active','section-leaving','section-entering');
    });
    target.classList.add('active','section-entering');
    document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    window.scrollTo({top:0,left:0,behavior:'auto'});
    requestAnimationFrame(()=>requestAnimationFrame(()=>target.classList.remove('section-entering')));
  };

  if(current&&current!==target){
    current.classList.add('section-leaving');
    setTimeout(activate,230);
  }else{
    activate();
  }
}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>go(b.dataset.page));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));document.addEventListener('click',e=>{const b=e.target.closest?.('.nav button[data-page]');if(b){e.preventDefault();go(b.dataset.page)}});
$('#personSearch').oninput=renderPeople;$('#personSort').onchange=renderPeople;$('#systemGroupFilter').onchange=renderPeople;$('#customGroupFilter').onchange=renderPeople;
['recordPerson','recordType','recordSearch'].forEach(id=>$('#'+id).addEventListener(id==='recordSearch'?'input':'change',renderRecords));

function closeModal(){$('#modal').classList.remove('show')}
function openModal(title,body,submit,foot='保存'){
  $('#modalTitle').textContent=title;$('#modalForm').innerHTML=body+`<div class="modal-foot"><button type="button" class="btn ghost" id="cancelModal">取消</button>${submit?`<button class="btn primary">${foot}</button>`:''}</div>`;$('#modal').classList.add('show');$('#cancelModal').onclick=closeModal;
  $('#modalForm').onsubmit=e=>{e.preventDefault();if(!submit)return;const result=submit(new FormData(e.target));if(result!==false){closeModal();save();render();toast('已保存')}};
}
function viewPerson(id){
  const p=person(id);if(!p)return;
  const groups=db.customGroups.filter(g=>(g.members||[]).includes(String(p.id))).map(g=>g.name);
  const sectors=p.investment_profile?.preferred_sectors||[];
  openModal(`${pName(p)} · ${p.id}`,`<div class="profile-detail">
    <div class="detail-box"><span>系统分类</span><b>${esc(genderRelationLabel(p)||'未分类')}</b></div>
    <div class="detail-box"><span>年龄</span><b>${esc(p.age||'--')} 岁</b></div>
    <div class="detail-box"><span>城市</span><b>${esc(p.location?.city||'--')}</b></div>
    <div class="detail-box"><span>VIP</span><b>${pVip(p)?esc(p.vip?.level||'VIP'):'否'}</b></div>
    <div class="detail-box"><span>开户状态</span><b>${esc(p.account?.status|| (pOpened(p)?'已开户':'未开户'))}</b></div>
    <div class="detail-box"><span>入群状态</span><b>${pJoined(p)?`已入群${p.crm?.group_joined_date?' · '+esc(p.crm.group_joined_date):''}`:'未入群'}</b></div>
    <div class="section-label">职业与家庭</div>
    <div class="detail-box"><span>职业</span><b>${esc(p.occupation?.title_zh||p.occupation?.title_fr||'--')}</b></div>
    <div class="detail-box"><span>行业</span><b>${esc(p.occupation?.industry_zh||p.occupation?.industry_fr||'--')}</b></div>
    <div class="detail-box"><span>家庭</span><b>${esc(p.family?.summary||'--')}</b></div>
    <div class="section-label">财务与投资</div>
    <div class="detail-box"><span>年收入</span><b>€ ${Number(p.finance?.annual_income_eur||0).toLocaleString()}</b></div>
    <div class="detail-box"><span>可投资资产</span><b>€ ${Number(p.finance?.estimated_investable_assets_eur||0).toLocaleString()}</b></div>
    <div class="detail-box"><span>可用投资资金</span><b>€ ${Number(p.finance?.available_investment_capital_eur||0).toLocaleString()}</b></div>
    <div class="detail-box"><span>股票热情指数</span><b>${pEnthusiasm(p)}</b></div>
    <div class="detail-box"><span>风险偏好</span><b>${esc(p.investment_profile?.risk_tolerance||'--')}</b></div>
    <div class="detail-box"><span>偏好行业</span><b>${esc(sectors.join('、')||'--')}</b></div>
    <div class="section-label">性格与规划</div>
    <div class="detail-box" style="grid-column:1/-1"><span>性格</span><b>${esc(p.personality?.summary||'--')}</b></div>
    <div class="detail-box" style="grid-column:1/-1"><span>所属小组</span><b>${esc(groups.join('、')||'未加入小组')}</b></div>
    <div class="detail-box" style="grid-column:1/-1"><span>内部备注</span><b>${esc(p.crm?.notes||'--')}</b></div>
  </div>`,null);
}
function openPerson(id){
  const p=id?person(id):normalizePerson({id:'',name:'',gender:'',age:null,customer_relation:{type:'新客户',type_code:'NEW'},vip:{is_vip:false,level:null},account:{opened:false,status:'未开户',status_code:'NOT_OPENED'},crm:{joined_group:false,group_joined_date:null,notes:''}});
  if(!p)return;
  openModal(id?'编辑人物':'新增人物',`<div class="form-grid">
    <div class="field"><label>编号 *</label><input class="input" name="id" required value="${esc(p.id||nextPersonId())}" ${id?'readonly':''}></div>
    <div class="field"><label>姓名 *</label><input class="input" name="name" required value="${esc(pName(p)==='未命名'?'':pName(p))}"></div>
    <div class="field"><label>性别 *</label><select class="select" name="gender"><option value="女" ${pGender(p)==='女'?'selected':''}>女性</option><option value="男" ${pGender(p)==='男'?'selected':''}>男性</option></select></div>
    <div class="field"><label>年龄</label><input class="input" type="number" min="18" max="100" name="age" value="${esc(p.age||'')}"></div>
    <div class="field"><label>客户关系 *</label><select class="select" name="relation"><option value="NEW" ${pRelationCode(p)==='NEW'?'selected':''}>新客户</option><option value="OLD" ${pRelationCode(p)==='OLD'?'selected':''}>老客户</option></select></div>
    <div class="field"><label>城市</label><input class="input" name="city" value="${esc(p.location?.city||'')}"></div>
    <div class="field"><label>职业（中文）</label><input class="input" name="occupation" value="${esc(p.occupation?.title_zh||'')}"></div>
    <div class="field"><label>行业（中文）</label><input class="input" name="industry" value="${esc(p.occupation?.industry_zh||'')}"></div>
    <div class="field"><label>年收入 EUR</label><input class="input" type="number" min="0" name="income" value="${esc(p.finance?.annual_income_eur||0)}"></div>
    <div class="field"><label>可投资资产 EUR</label><input class="input" type="number" min="0" name="assets" value="${esc(p.finance?.estimated_investable_assets_eur||0)}"></div>
    <div class="field"><label>股票热情指数（0-100）</label><input class="input" type="number" min="0" max="100" name="enthusiasm" value="${esc(pEnthusiasm(p))}"></div>
    <div class="field"><label>风险偏好</label><input class="input" name="risk" value="${esc(p.investment_profile?.risk_tolerance||'')}"></div>
    <div class="field"><label>VIP</label><select class="select" name="vip"><option value="0" ${!pVip(p)?'selected':''}>否</option><option value="1" ${pVip(p)?'selected':''}>是</option></select></div>
    <div class="field"><label>VIP 等级</label><input class="input" name="vipLevel" value="${esc(p.vip?.level||'')}" placeholder="例如 VIP1"></div>
    <div class="field"><label>开户</label><select class="select" name="opened"><option value="0" ${!pOpened(p)?'selected':''}>未开户</option><option value="1" ${pOpened(p)?'selected':''}>已开户</option></select></div>
    <div class="field"><label>账户状态</label><input class="input" name="accountStatus" value="${esc(p.account?.status||'')}"></div>
    <div class="field"><label>入群</label><select class="select" name="joined"><option value="0" ${!pJoined(p)?'selected':''}>未入群</option><option value="1" ${pJoined(p)?'selected':''}>已入群</option></select></div>
    <div class="field"><label>入群日期</label><input class="input" type="date" name="joinedDate" value="${esc(p.crm?.group_joined_date||'')}"></div>
    <div class="field"><label>历史联系次数</label><input class="input" type="number" min="0" name="contactCount" value="${esc(p.crm?.contact_count||0)}"></div>
    <div class="field full"><label>内部备注</label><textarea name="notes" rows="3">${esc(p.crm?.notes||'')}</textarea></div>
    <div class="field full"><label>性格描述</label><textarea name="personality" rows="3">${esc(p.personality?.summary||'')}</textarea></div>
  </div>`,f=>{
    const pid=String(f.get('id')).trim();if(!id&&person(pid)){toast('编号已存在');return false}
    const x=id?p:normalizePerson({id:pid});
    x.id=pid;x.name=String(f.get('name')).trim();x.frenchName=x.name;
    x.gender=f.get('gender');x.gender_code=x.gender==='女'?'F':'M';x.age=Number(f.get('age'))||null;
    x.customer_relation=x.customer_relation||{};x.customer_relation.type_code=f.get('relation');x.customer_relation.type=x.customer_relation.type_code==='OLD'?'老客户':'新客户';
    x.location=x.location||{};x.location.country=x.location.country||'法国';x.location.country_code=x.location.country_code||'FR';x.location.city=String(f.get('city')).trim();
    x.occupation=x.occupation||{};x.occupation.title_zh=String(f.get('occupation')).trim();x.occupation.industry_zh=String(f.get('industry')).trim();
    x.finance=x.finance||{};x.finance.annual_income_eur=Number(f.get('income'))||0;x.finance.estimated_investable_assets_eur=Number(f.get('assets'))||0;
    x.investment_profile=x.investment_profile||{};x.investment_profile.stock_enthusiasm_index=Math.max(0,Math.min(100,Number(f.get('enthusiasm'))||0));x.investment_profile.risk_tolerance=String(f.get('risk')).trim();
    x.vip=x.vip||{};x.vip.is_vip=f.get('vip')==='1';x.vip.level=x.vip.is_vip?(String(f.get('vipLevel')).trim()||'VIP'):null;
    x.account=x.account||{};x.account.opened=f.get('opened')==='1';x.account.status=String(f.get('accountStatus')).trim()||(x.account.opened?'已开户':'未开户');x.account.status_code=x.account.opened?(x.account.status_code==='NOT_OPENED'?'ACCOUNT_OPENED':x.account.status_code||'ACCOUNT_OPENED'):'NOT_OPENED';
    x.crm=x.crm||{};x.crm.joined_group=f.get('joined')==='1';x.crm.group_joined_date=x.crm.joined_group?(f.get('joinedDate')||x.crm.group_joined_date||today()):null;x.crm.contact_count=Math.max(0,Number(f.get('contactCount'))||0);x.crm.notes=String(f.get('notes')).trim();
    x.personality=x.personality||{};x.personality.summary=String(f.get('personality')).trim();
    x.tags=rebuildTags(x);
    if(!id)db.people.push(x);
  });
}
function rebuildTags(p){
  const keep=(p.tags||[]).filter(t=>!['老客户','新客户','VIP','普通客户','已开户','未开户','已入群','未入群'].includes(t));
  return [...new Set([pRelationName(p),pVip(p)?'VIP':'普通客户',pOpened(p)?'已开户':'未开户',pJoined(p)?'已入群':'未入群',...keep])];
}
function nextPersonId(){
  const nums=db.people.map(p=>Number(String(p.id).match(/(\d+)$/)?.[1]||0));return 'FR'+String(Math.max(0,...nums)+1).padStart(4,'0');
}
function deletePerson(id){
  const p=person(id);if(!p)return;
  const linked=[...(db.records||[]),...(db.portfolio?.holdings||[]),...(db.portfolio?.buyPlans||[])].some(x=>String(x.personId)===String(id))||(db.tradeSim?.recommendations||[]).some(r=>(r.candidates||[]).some(x=>String(x.personId)===String(id)))||(db.docs||[]).some(d=>String(d.html||'').includes('data-person="'+id+'"'))||Object.values(db.dailyDocs||{}).some(d=>String(d.html||'').includes('data-person="'+id+'"'));
  if(linked){toast('该人物有关联记录、交易或文档，请保留人物以维护历史完整性');return}
  if(!confirm(`确定删除 ${pName(p)}（${p.id}）吗？\n该人物删除后，系统会重新校验并均衡分配其余小组成员。`))return;
  db.people=db.people.filter(x=>String(x.id)!==String(id));db.customGroups.forEach(g=>g.members=(g.members||[]).filter(x=>String(x)!==String(id)));save();render();toast('人物已删除');
}
function openSystemGroup(id){go('people');$('#systemGroupFilter').value=id;$('#customGroupFilter').value='all';renderPeople()}

function ensureGroupDetailPage(){
  let sec=$('#groupDetailPage');
  if(sec)return sec;
  sec=document.createElement('section');
  sec.id='groupDetailPage';
  sec.className='section';
  sec.dataset.uiParent='groups';
  sec.innerHTML='<div id="groupDetailContent"></div>';
  const groups=$('#groups');
  if(groups&&groups.parentNode)groups.parentNode.insertBefore(sec,groups.nextSibling);
  else $('.main')?.appendChild(sec);
  return sec;
}
function renderGroupDetail(id){
  const g=customGroup(id);if(!g)return;
  ensureGroupDetailPage();
  const members=(g.members||[]).map(pid=>person(pid)).filter(Boolean);
  const counts={old_female:0,new_female:0,old_male:0,new_male:0};
  members.forEach(p=>{const k=balancedGroupCategory(p);if(counts[k]!=null)counts[k]++});
  const holdings=(db.portfolio?.holdings||[]).filter(h=>h.status!=='sold'&&(g.members||[]).includes(String(h.personId)));
  const opened=members.filter(pOpened).length;
  const vip=members.filter(pVip).length;
  const joined=members.filter(pJoined).length;
  const host=$('#groupDetailContent');if(!host)return;
  host.innerHTML=
    '<div class="detail-head cn-page-header">'+
      '<div class="detail-identity"><div class="cn-detail-mark">G'+esc(String(db.customGroups.findIndex(x=>x.id===g.id)+1).padStart(2,'0'))+'</div><div>'+
        '<div class="eyebrow">GROUP PROFILE</div><h1 class="page-title">'+esc(g.name)+'</h1>'+
        '<p class="sub">固定均衡小组 · '+members.length+' 人 · 老女 '+counts.old_female+' / 新女 '+counts.new_female+' / 老男 '+counts.old_male+' / 新男 '+counts.new_male+'</p>'+
      '</div></div>'+
      '<div class="actions"><button class="btn ghost" id="groupDetailBack">← 返回分组管理</button><button class="btn ghost" id="groupDetailPeople">人物库筛选</button><button class="btn primary" id="groupDetailRename">修改名称</button></div>'+
    '</div>'+
    '<div class="cn-detail-kpis">'+
      '<div class="card cn-detail-kpi"><span>成员人数</span><strong>'+members.length+'</strong></div>'+
      '<div class="card cn-detail-kpi"><span>已开户</span><strong>'+opened+'</strong></div>'+
      '<div class="card cn-detail-kpi"><span>VIP</span><strong>'+vip+'</strong></div>'+
      '<div class="card cn-detail-kpi"><span>已入群</span><strong>'+joined+'</strong></div>'+
      '<div class="card cn-detail-kpi"><span>当前持仓</span><strong>'+holdings.length+' 笔</strong></div>'+
    '</div>'+
    '<div class="cn-two-column-detail">'+
      '<div class="card panel"><div class="panel-head"><h2>小组成员</h2><span class="muted">'+members.length+' 人</span></div>'+
        '<div class="table-wrap"><table class="mini-table"><thead><tr><th>编号</th><th>姓名</th><th>分类</th><th>VIP</th><th>开户</th><th>入群</th><th>可投资资产</th><th>操作</th></tr></thead><tbody>'+
        members.map(p=>'<tr><td>'+esc(pCode(p))+'</td><td><b>'+esc(pName(p))+'</b></td><td>'+esc(genderRelationLabel(p)||'--')+'</td><td>'+(pVip(p)?esc(p.vip?.level||'VIP'):'—')+'</td><td>'+(pOpened(p)?'已开户':'未开户')+'</td><td>'+(pJoined(p)?'已入群':'未入群')+'</td><td>€ '+Number(pAssets(p)||0).toLocaleString()+'</td><td><button class="link-btn group-person-detail" data-id="'+esc(p.id)+'">详情</button></td></tr>').join('')+
        '</tbody></table></div>'+
      '</div>'+
      '<div class="card panel"><div class="panel-head"><h2>小组规则</h2><span class="muted">系统固定</span></div>'+
        '<div class="cn-rule-list">'+
          '<div><span>分组数量</span><b>固定 10 组</b></div>'+
          '<div><span>单组人数</span><b>固定 7 人</b></div>'+
          '<div><span>男女结构</span><b>3 女 / 4 男</b></div>'+
          '<div><span>新老结构</span><b>3 老 / 4 新</b></div>'+
          '<div><span>成员维护</span><b>系统自动保持均衡</b></div>'+
          '<div><span>允许修改</span><b>小组名称</b></div>'+
        '</div>'+
        '<div class="notice" style="margin-top:12px">当前 70 人结构可精确保持每组：老女 1、新女 2、老男 2、新男 2。人物属性变化后系统重新校验均衡分配。</div>'+
      '</div>'+
    '</div>';
  go('groupDetailPage');
  $('#groupDetailBack').onclick=()=>go('groups');
  $('#groupDetailPeople').onclick=()=>{go('people');$('#systemGroupFilter').value='all';$('#customGroupFilter').value=g.id;renderPeople()};
  $('#groupDetailRename').onclick=()=>openGroup(g.id);
  document.querySelectorAll('.group-person-detail').forEach(b=>b.onclick=()=>viewPerson(b.dataset.id));
}
function openCustomGroup(id){renderGroupDetail(id)}

function openGroup(id){
  const g=customGroup(id);if(!g)return;
  openModal('修改小组名称','<div class="form-grid"><div class="field full"><label>小组名称 *</label><input class="input" name="name" required maxlength="30" value="'+esc(g.name||'')+'" placeholder="输入新的小组名称"></div><div class="field full"><div class="notice">成员由系统按性别与新老属性均衡分配，每组固定 7 人；这里只修改名称。</div></div></div>',f=>{
    const name=String(f.get('name')).trim();if(!name)return false;
    g.name=name;g.updated=today();
    setTimeout(()=>{if($('#groupDetailPage')?.classList.contains('active'))renderGroupDetail(g.id)},0);
  });
}
function deleteGroup(id){const g=customGroup(id);if(!g)return;toast('当前为固定10组，不能删除小组；可以修改小组名称')}

function normalize(s){return String(s).toLowerCase().replace(/[\s，。！？、,.!?"“”‘’'：:；;（）()\[\]{}]/g,'')}
function similarity(a,b){const x=normalize(a),y=normalize(b);if(!x||!y)return 0;const longer=x.length>=y.length?x:y,shorter=x.length>=y.length?y:x;if(longer.includes(shorter))return shorter.length/longer.length;let prev=Array(y.length+1).fill(0).map((_,i)=>i);for(let i=1;i<=x.length;i++){let cur=[i];for(let j=1;j<=y.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));prev=cur}return 1-prev[y.length]/longer.length}
function stateKeys(s){const t=String(s).toLowerCase(),keys=[];[['账户','有账户','没有账户'],['婚姻','已婚','未婚'],['工作','有工作','没有工作'],['记忆','记得','不记得'],['住处','住在','不住在']].forEach(([k,pos,neg])=>{const negative=t.includes(neg);if(negative)keys.push({k,v:'负'});if(t.replaceAll(neg,'').includes(pos))keys.push({k,v:'正'})});return keys}
function checks(personId,content,ignoreId){const same=db.records.filter(r=>String(r.personId)===String(personId)&&r.id!==ignoreId),exact=same.find(r=>normalize(r.content)===normalize(content)),near=same.filter(r=>similarity(r.content,content)>=.72),states=stateKeys(content),conflicts=[];states.forEach(s=>same.filter(r=>stateKeys(r.content).some(old=>old.k===s.k&&old.v!==s.v)).forEach(r=>conflicts.push({r,now:s})));return{exact,near,conflicts}}
function openRecord(id){
  const r=id?db.records.find(x=>x.id===id):{};openModal(id?'编辑重要记录':'新增重要记录',`<div class="form-grid"><div class="field"><label>人物 *</label><select class="select" name="personId" required>${db.people.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(r.personId)?'selected':''}>${esc(pCode(p))} · ${esc(pName(p))}</option>`).join('')}</select></div><div class="field"><label>日期 *</label><input class="input" type="date" name="date" required value="${esc(r.date||today())}"></div><div class="field"><label>记录类型</label><select class="select" name="type"><option ${r.type==='重要事件'?'selected':''}>重要事件</option><option ${r.type==='发言记录'?'selected':''}>发言记录</option><option ${r.type==='联系记录'?'selected':''}>联系记录</option></select></div><div class="field"><label>主题标签</label><input class="input" name="topics" value="${esc((r.topics||[]).join('、'))}" placeholder="用顿号分隔"></div><div class="field full"><label>标题 *</label><input class="input" name="title" required value="${esc(r.title||'')}"></div><div class="field full"><label>人物事实 / 发言内容 *</label><textarea name="content" rows="5" required>${esc(r.content||'')}</textarea></div></div>`,f=>{const personId=f.get('personId'),content=String(f.get('content')).trim(),c=checks(personId,content,id);if(c.exact){alert('已阻止保存：该人物已有完全重复内容。');return false}if(c.near.length||c.conflicts.length){if(!confirm('发现高相似度或状态冲突记录，确认复核后仍要保存吗？'))return false}const x={id:id||'r'+Date.now(),personId,date:f.get('date'),type:f.get('type'),title:String(f.get('title')).trim(),content,topics:String(f.get('topics')).split(/[、,，]/).map(s=>s.trim()).filter(Boolean)};if(id)db.records=db.records.map(a=>a.id===id?x:a);else db.records.push(x)});
}
function currentDoc(){return db.docs.find(d=>d.id===selectedDocId)||null}
function renderDocs(){if(!$('#docList'))return;if(!db.docs.length){selectedDocId=null;$('#docList').innerHTML='<div class="empty">还没有文档</div>';$('#docTitle').value='';$('#editor').value='';$('#docStatus').textContent='点击“新建文档”开始写作';return}if(!selectedDocId||!currentDoc())selectedDocId=db.docs[0].id;const d=currentDoc();$('#docList').innerHTML=db.docs.map(x=>`<button class="doc-item ${x.id===selectedDocId?'active':''}" data-doc="${esc(x.id)}"><b>${esc(x.title)}</b><small>更新于 ${esc(x.updated||today())}</small></button>`).join('');$('#docTitle').value=d.title;$('#editor').value=d.content;$('#docStatus').textContent=`已在本地保存 · ${d.content.length} 字`;document.querySelectorAll('.doc-item').forEach(b=>b.onclick=()=>{selectedDocId=b.dataset.doc;renderDocs()})}
function saveDoc(){const d=currentDoc();if(!d)return;d.title=$('#docTitle').value.trim()||'未命名文档';d.content=$('#editor').value;d.updated=today();save();renderDocs();toast('文档已保存')}
function createDoc(){const d={id:'d'+Date.now(),title:'新小说文档',content:'',updated:today()};db.docs.unshift(d);selectedDocId=d.id;save();renderDocs();$('#docTitle').focus()}
function renameDoc(){const d=currentDoc();if(!d)return toast('请先新建文档');const name=prompt('输入新文档标题',d.title);if(name!==null){d.title=name.trim()||d.title;save();renderDocs()}}
function insertPerson(){const d=currentDoc();if(!d)return toast('请先新建文档');if(!db.people.length)return toast('人物库为空');const id=prompt('输入人物编号');if(id===null)return;const p=person(id.trim());if(!p)return alert(`未找到人物编号 ${id.trim()}`);const text=$('#editor').value,add=`${p.id} · ${genderRelationLabel(p)||'未分类'} · ${pName(p)}：`,pos=$('#editor').selectionStart;$('#editor').value=text.slice(0,pos)+add+text.slice(pos);$('#editor').focus()}
$('#editor').addEventListener('keydown',e=>{if(e.key!=='Enter')return;const el=e.currentTarget,pos=el.selectionStart,lineStart=el.value.lastIndexOf('\n',pos-1)+1,raw=el.value.slice(lineStart,pos),m=raw.match(/^\s*([^\s]+)\s+(.+)$/);if(!m)return;const p=person(m[1]);if(!p)return;e.preventDefault();const formatted=`${p.id} · ${genderRelationLabel(p)||'未分类'} · ${pName(p)}：${m[2]}`;el.value=el.value.slice(0,lineStart)+formatted+'\n'+el.value.slice(pos);const np=lineStart+formatted.length+1;el.selectionStart=el.selectionEnd=np;$('#docStatus').textContent='已格式化人物发言，请保存文档'});

function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#importBtn').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const text=await file.text();let arr;if(file.name.toLowerCase().endsWith('.json')){const parsed=JSON.parse(text);arr=Array.isArray(parsed)?parsed:parsed.people}else{const lines=text.split(/\r?\n/).filter(Boolean),head=lines.shift().split(',').map(x=>x.trim());arr=lines.map(line=>{const vals=line.split(','),o={};head.forEach((h,i)=>o[h]=vals[i]||'');return o})}if(!Array.isArray(arr))throw Error('JSON 应为人物数组，或顶层包含 people 数组');let added=0,updated=0;arr.map(normalizePerson).forEach(x=>{if(!x.id)return;const old=person(x.id);if(old){const crm=old.crm;Object.assign(old,x);old.crm=x.crm||crm;updated++}else{db.people.push(x);added++}});save();render();toast(`导入完成：新增 ${added}，更新 ${updated}`)}catch(err){alert('导入失败：'+err.message)}e.target.value=''};
$('#addPerson').onclick=()=>openPerson();const addGroupBtn=$('#addGroup');if(addGroupBtn)addGroupBtn.onclick=()=>toast('当前固定为10个均衡小组，不支持新增小组');
$('#addRecord').onclick=()=>{if(!db.people.length)return alert('人物库为空');openRecord()};$('#quickAdd').onclick=()=>{go('records');if(db.people.length)openRecord()};
$('#newDoc').onclick=createDoc;$('#saveDoc').onclick=saveDoc;$('#renameDoc').onclick=renameDoc;$('#insertPerson').onclick=insertPerson;
$('#docTitle').oninput=()=>$('#docStatus').textContent='标题有未保存修改';$('#editor').oninput=()=>$('#docStatus').textContent='文档有未保存修改';
$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};
$('#exportBtn').onclick=()=>download('投资者人物工作台_全部数据.json',JSON.stringify(db,null,2),'application/json');


