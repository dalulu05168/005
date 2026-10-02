
(function(){
'use strict';
var V6_URL='./data/france70-v6.1.json';
var canon=null,lastSelected=[];
var q=function(s){return document.querySelector(s)};
var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]})};
function ensureState(){
  db.meta=db.meta&&typeof db.meta==='object'?db.meta:{};
  var s=db.meta.france70Chat&&typeof db.meta.france70Chat==='object'?db.meta.france70Chat:{};
  s.sessions=Array.isArray(s.sessions)?s.sessions:[];
  s.memory=s.memory&&typeof s.memory==='object'?s.memory:{};
  s.schemaVersion='6.1';
  db.meta.france70Chat=s;
  return s;
}
async function loadCanon(){
  if(canon)return canon;
  var r=await fetch(V6_URL,{cache:'no-store'});
  if(!r.ok)throw new Error('v6.1角色库加载失败 HTTP '+r.status);
  canon=await r.json();
  if(!Array.isArray(canon.people)||canon.people.length!==70)throw new Error('v6.1角色数量异常');
  return canon;
}
function low(v){return String(v||'').toLocaleLowerCase('fr-FR')}
function topics(text){
  var map={
    taux:['taux','rendement','obligation','利率','债券'],
    banques:['banque','banques','银行'],
    energie:['énergie','energie','pétrole','petrole','能源','油价'],
    tech_ia:['tech','technologie',' ia ','ai','人工智能','科技'],
    inflation:['inflation','通胀'],luxe:['luxe','奢侈品'],assurance:['assurance','保险'],
    consommation:['consommation','消费'],resultats:['résultats','resultats','财报','业绩'],
    liquidite:['liquidité','liquidite','流动性'],valorisation:['valorisation','估值']
  },src=' '+low(text)+' ',out=[];
  Object.keys(map).forEach(function(k){if(map[k].some(function(w){return src.indexOf(low(w))>=0}))out.push(k)});
  return out.length?out:['marche'];
}
function memFor(id){
  var m=ensureState().memory[id]||{};
  return {recent:(m.recent||[]).slice(-12),medium:(m.medium||[]).slice(-8),long:(m.long||[]).slice(-8),opinions:m.opinions||{}};
}
function blob(p){
  return low(JSON.stringify({
    sectors:p.investment_profile&&p.investment_profile.preferred_sectors,
    occupation:p.occupation,tags:p.tags,
    traction:p.novel_profile&&p.novel_profile.conversation_traction,
    canon:p.novel_profile&&p.novel_profile.author_canon
  }));
}
function pick(text,max,reuse){
  var ts=topics(text),root=ensureState(),prev=root.sessions[0]&&root.sessions[0].selectedIds||[],prevSet=new Set(reuse?prev:[]);
  var order=['DATA_SKEPTIC','CAUTIOUS_OBSERVER','SOCIAL_QUESTIONER','EXECUTOR_FAMILY','MARKET_CONTRARIAN','PRACTICAL_BUSINESS','BALANCED_MEDIATOR','EMOTIONAL_REACTOR'];
  var scored=canon.people.map(function(p){
    var c=p.novel_profile&&p.novel_profile.style_cluster||'',score=50,b=blob(p);
    if(c==='SOCIAL_QUESTIONER'||c==='MARKET_CONTRARIAN')score+=6;
    if(c==='CAUTIOUS_OBSERVER')score-=4;
    ts.forEach(function(t){if(b.indexOf(low(t.replace('_',' ')))>=0)score+=10});
    if(prevSet.has(p.id))score+=25;
    return {p:p,cluster:c,score:score};
  }).sort(function(a,b){return b.score-a.score||String(a.p.id).localeCompare(String(b.p.id))});
  var out=[],used=new Set(),counts={};
  order.forEach(function(c){
    if(out.length>=max)return;
    var x=scored.find(function(v){return v.cluster===c&&!used.has(v.p.id)});
    if(x){out.push(x.p);used.add(x.p.id);counts[c]=1}
  });
  scored.forEach(function(x){
    if(out.length>=max||used.has(x.p.id)||(counts[x.cluster]||0)>=4)return;
    out.push(x.p);used.add(x.p.id);counts[x.cluster]=(counts[x.cluster]||0)+1;
  });
  return {people:out,topics:ts};
}
function compact(p){
  return {
    id:p.id,name:p.name,age:p.age,gender:p.gender,location:p.location,occupation:p.occupation,
    family:p.family,investment_profile:p.investment_profile,personality:p.personality,
    communication:p.communication,lifestyle:p.lifestyle,vip:p.vip,account:p.account,
    novel_profile:{
      style_cluster:p.novel_profile&&p.novel_profile.style_cluster,
      style_label_zh:p.novel_profile&&p.novel_profile.style_label_zh,
      group_role:p.novel_profile&&p.novel_profile.group_role,
      author_canon:p.novel_profile&&p.novel_profile.author_canon,
      appearance_life_texture:p.novel_profile&&p.novel_profile.appearance_life_texture,
      voice_dna:p.novel_profile&&p.novel_profile.voice_dna,
      conversation_traction:p.novel_profile&&p.novel_profile.conversation_traction,
      family_value_lens:p.novel_profile&&p.novel_profile.family_value_lens,
      character_arc:p.novel_profile&&p.novel_profile.character_arc,
      participation_policy:p.novel_profile&&p.novel_profile.participation_policy
    }
  };
}
function relationSubset(ids){
  var set=new Set(ids);
  return (canon.relationship_graph&&canon.relationship_graph.edges||[]).filter(function(e){return set.has(e.a)&&set.has(e.b)});
}
function sourceKind(){return q('#fr70KindAssistant').classList.contains('active')?'assistant':'professor'}
function buildPrompt(){
  var text=q('#fr70Source').value.trim();
  if(!text){toast('请先填写助理或教授内容');return}
  var max=Math.max(5,Math.min(20,Number(q('#fr70Count').value)||20));
  var selected=pick(text,max,q('#fr70Reuse').checked);
  lastSelected=selected.people.map(function(p){return p.id});
  var dynamic={};lastSelected.forEach(function(id){dynamic[id]=memFor(id)});
  var payload={
    source:{kind:sourceKind(),text:text},topics:selected.topics,
    selected_characters:selected.people.map(compact),
    relationships:relationSubset(lastSelected),
    dynamic_memory:dynamic,
    recent_sessions:ensureState().sessions.slice(0,2),
    output_schema:{
      messages:[{speaker_id:'FR0001',text_fr:'...',reaction_only:false,reply_to_speaker_id:null}],
      memory_events:[{person_id:'FR0001',event_type:'opinion',topic:'...',summary_zh:'...',stance_after:'...',evidence_fr:'...',importance:3}]
    }
  };
  var rules=[
    '你是 France 70 法国群像小说引擎。所有人物均为虚构角色。请根据下面 JSON 生成一轮自然的法语群聊，并且只返回 JSON。',
    '',
    '必须遵守：',
    '1. 不要求所有候选人发言；真人群聊允许沉默、表情、短回复、追问、反驳和长短不一。',
    '2. 直接问句控制在整轮发言约25%-35%，不要把牵引性写成人人提问。',
    '3. 推进方式混合使用 question / statement / condition / counterpoint / experience / reply / reaction / silence。',
    '4. 同时允许质疑者、观望者、提问者、认可者、执行者、市场反向型、现实经营型、协调者、情绪反应型。',
    '5. 质疑者推进到证据；观望者推进到确认条件；执行者推进到行动边界；现实经营型推进到现金/成本/需求；市场型推进到price-in/催化剂。',
    '6. 推进不等于买入、开户或统一结论。',
    '7. 执行/信随型人物可以从家庭价值出发表达，但只有author_canon或dynamic_memory已经记录的实际结果，才能说因此改善家庭生活或旅行。禁止临时编造盈利故事。',
    '8. 法语长度混合：0-3词反应、4-12词短回复、13-30词普通发言、31-55词展开、56-90词只占极少数。',
    '9. 不要频繁使用分号；不要中式直译；不要让所有人共享同一口头禅。',
    '10. 当前城市不等于出生地，不要为了地域感乱加方言。',
    '11. 可引用author_canon；不得新增重大亏损、家庭变故、职业经历、具体持仓、具体买卖价格或收益率。',
    '12. 关系网必须影响回复对象、熟悉度和反驳力度。',
    '13. memory_events只记录本轮实际发生且值得跨天记住的内容，不要给每条消息都造记忆。',
    '14. evidence_fr必须能在本轮发言中找到依据。',
    '15. 输出只允许一个JSON对象，不要Markdown，不要解释。',
    '',
    'INPUT_JSON:',
    JSON.stringify(payload,null,2)
  ];
  q('#fr70Prompt').value=rules.join('\n');
  q('#fr70Selected').innerHTML=selected.people.map(function(p){
    var n=p.novel_profile||{};
    return '<span>'+esc(p.name)+' · '+esc(n.style_label_zh||n.group_role||'')+'</span>';
  }).join('');
  q('#fr70PromptStatus').textContent='已选 '+selected.people.length+' 人 · '+selected.topics.join(' / ')+' · 问句目标25%-35%';
}
async function copyPrompt(){
  if(!q('#fr70Prompt').value)buildPrompt();
  if(!q('#fr70Prompt').value)return;
  try{await navigator.clipboard.writeText(q('#fr70Prompt').value);toast('提示词已复制，直接粘贴到ChatGPT')}
  catch(e){q('#fr70Prompt').select();document.execCommand('copy');toast('提示词已复制')}
}
function parseResult(){
  var raw=q('#fr70Result').value.trim();
  if(!raw)throw new Error('请先粘贴ChatGPT返回的JSON');
  var tick=String.fromCharCode(96),fence=tick+tick+tick;
  if(raw.slice(0,3)===fence){
    raw=raw.slice(3);
    if(raw.toLowerCase().indexOf('json')===0)raw=raw.slice(4);
    raw=raw.trim();
    if(raw.slice(-3)===fence)raw=raw.slice(0,-3).trim();
  }
  var obj=JSON.parse(raw);
  if(!Array.isArray(obj.messages)||!obj.messages.length)throw new Error('JSON缺少messages');
  return obj;
}
function compactOld(m){
  var now=Date.now(),day=86400000,r=[],md=[];
  m.recent=Array.isArray(m.recent)?m.recent:[];m.medium=Array.isArray(m.medium)?m.medium:[];m.long=Array.isArray(m.long)?m.long:[];
  m.recent.forEach(function(e){var age=(now-Date.parse(e.at||e.date||0))/day;(Number.isFinite(age)&&age>15?m.medium:r).push(e)});
  m.medium.forEach(function(e){var age=(now-Date.parse(e.at||e.date||0))/day;if(Number.isFinite(age)&&age>90){if(Number(e.importance)>=4)m.long.push(e)}else md.push(e)});
  m.recent=r.slice(-40);m.medium=md.slice(-60);m.long=m.long.slice(-60);
}
function normalizeLine(s){
  return low(String(s||'')).replace(/[’']/g,"'").replace(/[^a-zà-öø-ÿœæ0-9' -]+/g,' ').replace(/\s+/g,' ').trim();
}
function validateResult(obj){
  var ids=new Set(canon.people.map(function(p){return p.id}));
  var rawMessages=Array.isArray(obj.messages)?obj.messages:[];
  var valid=rawMessages.filter(function(m){return ids.has(m.speaker_id)&&String(m.text_fr||'').trim()});
  var unknown=rawMessages.filter(function(m){return !ids.has(m.speaker_id)}).map(function(m){return m.speaker_id});
  var questions=valid.filter(function(m){return /[?？]/.test(String(m.text_fr||''))}).length;
  var ratio=valid.length?questions/valid.length:0;
  var semicolons=valid.reduce(function(n,m){return n+(String(m.text_fr||'').match(/[;；]/g)||[]).length},0);
  var exact={},starts={};
  valid.forEach(function(m){
    var n=normalizeLine(m.text_fr); if(n) exact[n]=(exact[n]||0)+1;
    var start=n.split(' ').slice(0,4).join(' '); if(start) starts[start]=(starts[start]||0)+1;
  });
  var duplicateExact=Object.keys(exact).filter(function(k){return exact[k]>1});
  var repeatedStarts=Object.keys(starts).filter(function(k){return starts[k]>=3});
  var tooLong=valid.filter(function(m){return normalizeLine(m.text_fr).split(' ').filter(Boolean).length>90}).length;
  var events=Array.isArray(obj.memory_events)?obj.memory_events:[];
  var badEvents=events.filter(function(e){return !ids.has(e.person_id)||!String(e.summary_zh||'').trim()||!String(e.evidence_fr||'').trim()}).length;
  var warnings=[];
  if(valid.length>=6 && (ratio<.25||ratio>.35)) warnings.push('直接问句比例 '+Math.round(ratio*100)+'%，目标约25%–35%');
  if(semicolons>1) warnings.push('分号 '+semicolons+' 个，法国即时群聊建议更少');
  if(duplicateExact.length) warnings.push('存在 '+duplicateExact.length+' 组完全重复发言');
  if(repeatedStarts.length) warnings.push('存在 '+repeatedStarts.length+' 组高频相同开头');
  if(tooLong) warnings.push(tooLong+' 条发言超过90词');
  if(unknown.length) warnings.push('发现未知人物ID：'+Array.from(new Set(unknown)).join(', '));
  if(badEvents) warnings.push(badEvents+' 条记忆事件字段不完整，将不会写入');
  return {valid:valid,questionRatio:ratio,questions:questions,total:valid.length,semicolons:semicolons,duplicateExact:duplicateExact,repeatedStarts:repeatedStarts,tooLong:tooLong,badEvents:badEvents,warnings:warnings};
}
function renderQa(report){
  var box=q('#fr70Qa');if(!box)return;
  if(!report){box.innerHTML='';return}
  var cls=report.warnings.length?'notice warn':'notice success';
  var headline=report.warnings.length?'已完成 QA · 有 '+report.warnings.length+' 项提醒':'QA 通过 · 未发现明显结构问题';
  var details=[
    '有效发言 '+report.total+' 条',
    '直接问句 '+report.questions+' 条（'+Math.round(report.questionRatio*100)+'%）',
    '分号 '+report.semicolons+' 个'
  ];
  box.innerHTML='<div class="'+cls+'" style="margin-top:12px"><b>'+esc(headline)+'</b><br>'+esc(details.join(' · '))+(report.warnings.length?'<br>'+report.warnings.map(function(w){return '· '+esc(w)}).join('<br>'):'')+'</div>';
}
function saveResult(){
  var obj;
  try{obj=parseResult()}catch(e){toast(e.message);return}
  var ids=new Set(canon.people.map(function(p){return p.id}));
  var report=validateResult(obj);renderQa(report);
  var messages=report.valid.slice(0,40);
  if(!messages.length){toast('没有找到有效角色发言');return}
  var s=ensureState(),now=new Date().toISOString(),sessionId='fr70_'+Date.now();
  var events=Array.isArray(obj.memory_events)?obj.memory_events.filter(function(e){
    return ids.has(e.person_id)&&String(e.summary_zh||'').trim()&&String(e.evidence_fr||'').trim();
  }):[];
  events.forEach(function(e){
    var m=s.memory[e.person_id]||(s.memory[e.person_id]={recent:[],medium:[],long:[],opinions:{}});
    compactOld(m);
    m.recent.push(Object.assign({},e,{at:now,sessionId:sessionId}));
    if(e.stance_after)m.opinions[e.topic||'general']=e.stance_after;
  });
  var selectedIds=lastSelected.length?lastSelected:Array.from(new Set(messages.map(function(m){return m.speaker_id})));
  var sess={
    id:sessionId,createdAt:now,sourceKind:sourceKind(),sourceText:q('#fr70Source').value.trim(),
    selectedIds:selectedIds,messages:messages,topics:topics(q('#fr70Source').value),
    qa:{questionRatio:report.questionRatio,semicolons:report.semicolons,warnings:report.warnings}
  };
  s.sessions.unshift(sess);s.sessions=s.sessions.slice(0,60);
  save();renderSession(sess);renderHistory();renderMemoryList();renderStats();
  toast('已保存 '+messages.length+' 条发言、'+events.length+' 条动态记忆'+(report.warnings.length?'；QA有提醒':''));
}
function personById(id){return canon.people.find(function(p){return p.id===id})||db.people.find(function(p){return p.id===id})}
function initials(name){return String(name||'?').trim().split(/\s+/).map(function(x){return x[0]}).join('').slice(0,2).toUpperCase()}
function renderSession(sess){
  var box=q('#fr70Chat');if(!box)return;
  if(!sess){box.innerHTML='<div class="empty">还没有导入群聊结果</div>';return}
  box.innerHTML=sess.messages.map(function(m){
    var p=personById(m.speaker_id),name=p&&p.name||m.speaker_id,n=p&&p.novel_profile||{},style=n.style_label_zh||n.group_role||'';
    var target=m.reply_to_speaker_id&&personById(m.reply_to_speaker_id);
    var reply=m.reply_to_speaker_id?'<span>回复 '+esc(target&&target.name||m.reply_to_speaker_id)+'</span>':'';
    return '<div class="fr70-message"><div class="fr70-avatar">'+esc(initials(name))+'</div><div class="fr70-bubble"><div class="fr70-meta"><b>'+esc(name)+'</b><span>'+esc(style)+'</span>'+reply+'</div><p>'+esc(m.text_fr)+'</p></div></div>';
  }).join('');
}
function renderHistory(){
  var list=ensureState().sessions,box=q('#fr70History');if(!box)return;
  box.innerHTML=list.length?list.map(function(s){
    return '<button data-fr70-session="'+esc(s.id)+'"><b>'+(s.sourceKind==='assistant'?'助理':'教授')+' · '+new Date(s.createdAt).toLocaleString()+'</b><small>'+esc(s.sourceText.slice(0,72))+(s.sourceText.length>72?'…':'')+' · '+(s.messages&&s.messages.length||0)+'条</small></button>';
  }).join(''):'<div class="empty">暂无历史会话</div>';
  box.querySelectorAll('button').forEach(function(b){b.onclick=function(){var s=list.find(function(x){return x.id===b.dataset.fr70Session});if(s){renderSession(s);q('#fr70Source').value=s.sourceText}}});
}
function renderStats(){
  var s=ensureState(),count=Object.values(s.memory).reduce(function(n,m){return n+(m.recent&&m.recent.length||0)+(m.medium&&m.medium.length||0)+(m.long&&m.long.length||0)},0);
  q('#fr70SessionCount').textContent=s.sessions.length;
  q('#fr70MemoryCount').textContent=count;
  q('#fr70PeopleMem').textContent=Object.keys(s.memory).length;
}
function ensureFrance70PersonDetailPage(){
  var sec=q('#fr70PersonDetailPage');
  if(sec)return sec;
  sec=document.createElement('section');
  sec.id='fr70PersonDetailPage';
  sec.className='section';
  sec.dataset.uiParent='france70chat';
  sec.innerHTML='<div id="fr70PersonDetailContent"></div>';
  var base=q('#france70chat');
  if(base&&base.parentNode)base.parentNode.insertBefore(sec,base.nextSibling);
  else q('.main')?.appendChild(sec);
  return sec;
}
function memoryRowsFor(personId){
  var m=ensureState().memory[personId]||{};
  var rows=[];
  [['recent','近期记忆'],['medium','中期记忆'],['long','长期记忆']].forEach(function(pair){
    (m[pair[0]]||[]).forEach(function(x){
      rows.push({layer:pair[1],at:x.at||'',topic:x.topic||'general',summary:x.summary_zh||x.summary||'--',evidence:x.evidence_fr||''});
    });
  });
  return rows.sort(function(a,b){return String(b.at).localeCompare(String(a.at))});
}
function openFrance70PersonDetail(id){
  var p=personById(id);if(!p)return;
  ensureFrance70PersonDetailPage();
  var state=ensureState().memory[id]||{},rows=memoryRowsFor(id),profile=p.novel_profile||{},host=q('#fr70PersonDetailContent');
  if(!host)return;
  var recent=(state.recent||[]).length,medium=(state.medium||[]).length,long=(state.long||[]).length;
  host.innerHTML=
    '<div class="detail-head cn-page-header"><div class="detail-identity"><div class="cn-detail-mark">F70</div><div>'+
      '<div class="eyebrow">FRANCE 70 PERSONA</div><h1 class="page-title">'+esc(p.name||id)+'</h1>'+
      '<p class="sub">'+esc(id)+' · '+esc(profile.style_label_zh||profile.group_role||'人物档案')+'</p></div></div>'+
      '<div class="actions"><button class="btn ghost" id="fr70DetailBack">← 返回 France 70</button></div></div>'+
    '<div class="cn-detail-kpis">'+
      '<div class="card cn-detail-kpi"><span>近期记忆</span><strong>'+recent+'</strong></div>'+
      '<div class="card cn-detail-kpi"><span>中期记忆</span><strong>'+medium+'</strong></div>'+
      '<div class="card cn-detail-kpi"><span>长期记忆</span><strong>'+long+'</strong></div>'+
      '<div class="card cn-detail-kpi"><span>记忆总数</span><strong>'+rows.length+'</strong></div>'+
      '<div class="card cn-detail-kpi"><span>意见主题</span><strong>'+Object.keys(state.opinions||{}).length+'</strong></div>'+
    '</div>'+
    '<div class="cn-two-column-detail">'+
      '<div class="card panel"><div class="panel-head"><h2>人设与发言风格</h2><span class="muted">v6.1 主档</span></div>'+
        '<div class="cn-rule-list">'+
          '<div><span>群组角色</span><b>'+esc(profile.group_role||'--')+'</b></div>'+
          '<div><span>风格标签</span><b>'+esc(profile.style_label_zh||'--')+'</b></div>'+
          '<div><span>说话节奏</span><b>'+esc(profile.speech_rhythm_zh||profile.speech_rhythm||'--')+'</b></div>'+
          '<div><span>表达倾向</span><b>'+esc(profile.expression_tendency_zh||profile.expression_tendency||'--')+'</b></div>'+
        '</div>'+
        '<div class="panel-head" style="margin-top:12px"><h2>动态记忆</h2><span class="muted">'+rows.length+' 条</span></div>'+
        '<div class="cn-memory-detail-list">'+(rows.length?rows.slice(0,40).map(function(x){
          return '<div class="cn-memory-detail-row"><div><b>'+esc(x.layer)+' · '+esc(x.topic)+'</b><small>'+esc(x.at?new Date(x.at).toLocaleString():'--')+'</small></div><p>'+esc(x.summary)+'</p></div>';
        }).join(''):'<div class="empty">暂无动态记忆</div>')+'</div>'+
      '</div>'+
      '<div class="card panel"><div class="panel-head"><h2>结构化人物数据</h2><span class="muted">只读</span></div>'+
        '<pre class="cn-json-preview">'+esc(JSON.stringify({id:p.id,name:p.name,novel_profile:p.novel_profile||{},memory:state},null,2))+'</pre>'+
      '</div>'+
    '</div>';
  go('fr70PersonDetailPage');
  q('#fr70DetailBack').onclick=function(){go('france70chat')};
}

function renderMemoryList(){
  var box=q('#fr70MemoryList');if(!box)return;
  var s=ensureState();
  var rows=Object.keys(s.memory).map(function(id){
    var m=s.memory[id]||{},p=personById(id),recent=m.recent||[],medium=m.medium||[],long=m.long||[];
    var latest=recent[recent.length-1]||medium[medium.length-1]||long[long.length-1]||null;
    return {id:id,name:p&&p.name||id,total:recent.length+medium.length+long.length,latest:latest};
  }).sort(function(a,b){return b.total-a.total||a.name.localeCompare(b.name)}).slice(0,30);
  if(!rows.length){box.innerHTML='<div class="empty">暂无动态记忆</div>';return}
  box.innerHTML=rows.map(function(r){
    var summary=r.latest&&r.latest.summary_zh?String(r.latest.summary_zh):'已有历史记忆';
    return '<button class="fr70-memory-row" type="button" data-fr70-person="'+esc(r.id)+'"><b>'+esc(r.name)+'</b><span>'+r.total+' 条</span><small>'+esc(summary.slice(0,92))+(summary.length>92?'…':'')+'</small></button>';
  }).join('');
  box.querySelectorAll('[data-fr70-person]').forEach(function(b){b.onclick=function(){openFrance70PersonDetail(b.dataset.fr70Person)}});
}
function exportMemory(){
  var s=ensureState();
  var payload={
    schema_version:'6.1',
    exported_at:new Date().toISOString(),
    synthetic:true,
    sessions:s.sessions,
    memory:s.memory
  };
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='France70-群聊与记忆-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},1000);
  toast('群聊与人物记忆已导出');
}
function setKind(k){
  q('#fr70KindAssistant').classList.toggle('active',k==='assistant');
  q('#fr70KindProfessor').classList.toggle('active',k==='professor');
}
async function init(){
  if(!q('#france70chat'))return;
  try{
    await loadCanon();ensureState();
    q('#fr70KindAssistant').onclick=function(){setKind('assistant')};
    q('#fr70KindProfessor').onclick=function(){setKind('professor')};
    q('#fr70Build').onclick=buildPrompt;
    q('#fr70Copy').onclick=copyPrompt;
    q('#fr70Import').onclick=saveResult;
    q('#fr70Export').onclick=exportMemory;
    renderHistory();renderMemoryList();renderStats();renderSession(ensureState().sessions[0]||null);
    q('#fr70LoadStatus').textContent='v6.1角色库已加载 · 70人 · 单一记忆源';
    q('#fr70LoadStatus').className='notice success';
  }catch(e){
    q('#fr70LoadStatus').textContent='France 70加载失败：'+e.message;
    q('#fr70LoadStatus').className='notice warn';
  }
}
document.addEventListener('chennan:cloud-ready',function(){init()},{once:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){if(window.ChenNanCloud&&window.ChenNanCloud.hydrated)init()},{once:true});
else if(window.ChenNanCloud&&window.ChenNanCloud.hydrated)init();
window.France70Chat={init:init,buildPrompt:buildPrompt,saveResult:saveResult,openPersonDetail:openFrance70PersonDetail};
})();
