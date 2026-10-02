/* 辰南文档中心：每日独立保存、人物发言频次、人物记忆、逻辑一致性检查、离线 DOCX。 */
(function(){
'use strict';
let activeDate=dateKey(), currentPersonId=null, autosaveTimer=null;
const shownWarnings=new Set();
const E=id=>document.getElementById(id), QA=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const pname=p=>p?(p.name||p.frenchName||p.id):'未知人物';
const pnum=p=>String(p?.legacy_id||String(p?.id||'').replace(/\D/g,'')).replace(/^0+/,'')||'0';
const pcl=p=>(pRelationCode(p)==='OLD'?'老':'新')+(pGender(p)||'');
function dateKey(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function byNumber(n){const x=String(n||'').replace(/^0+/,'')||'0';return db.people.find(p=>pnum(p)===x)||null}
function norm(s){return String(s||'').toLowerCase().replace(/[\s，。！？、,.!?"“”‘’'：:；;（）()\[\]{}]/g,'')}
function h32(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16)}
function ensureDocs(){
  db.dailyDocs=db.dailyDocs&&typeof db.dailyDocs==='object'&&!Array.isArray(db.dailyDocs)?db.dailyDocs:{};
  db.meta=db.meta&&typeof db.meta==='object'?db.meta:{};
  if(!db.meta.dailyDocsMigrated&&Array.isArray(db.docs)&&db.docs.length){
    db.docs.forEach((d,i)=>{
      let k=/^\d{4}-\d{2}-\d{2}$/.test(d.updated||'')?d.updated:dateKey();
      if(db.dailyDocs[k])k=k+'-'+String(i+1).padStart(2,'0');
      db.dailyDocs[k]={date:k,title:d.title||'历史文档',html:d.html||textHtml(d.content||''),content:d.content||'',updatedAt:new Date().toISOString(),migratedFrom:d.id||null};
    });
    db.meta.dailyDocsMigrated=true;
  }
  if(!db.dailyDocs[activeDate])db.dailyDocs[activeDate]={date:activeDate,title:'',html:'<div><br></div>',content:'',updatedAt:null};
}
function speechCount(p){return db.records.filter(r=>String(r.personId)===String(p.id)&&r.type==='发言记录').length}
function ranking(){return [...db.people].sort((a,b)=>speechCount(b)-speechCount(a)||Number(pnum(a))-Number(pnum(b)))}
function memRows(p){
  const a=[],add=(d,t,x,k)=>{if(d)a.push({d:String(d).slice(0,10),t,x:x||'',k:k||''})};
  add(p.customer_relation?.first_contact_date,'首次联系','建立客户关系','系统');
  add(p.account?.opened_date,'开户',p.account?.status||'已开户','系统');
  add(p.crm?.group_joined_date,'入群','加入群组','系统');
  db.records.filter(r=>String(r.personId)===String(p.id)).forEach(r=>add(r.date,r.title||r.type,r.content,r.type));
  (db.portfolio?.holdings||[]).filter(x=>String(x.personId)===String(p.id)).forEach(x=>{add(x.buyAt,'买入 '+(x.symbol||''),(x.name||'')+' · '+(x.quantity||0)+'股','交易');if(x.status==='sold')add(x.soldAt,'卖出 '+(x.symbol||''),(x.name||'')+' · 卖出价 '+(x.soldPrice||'未录入'),'交易')});
  return a.sort((x,y)=>String(y.d).localeCompare(String(x.d))).slice(0,60);
}
function statements(text){
  const out=[];String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).forEach(line=>{
    const m=line.match(/^(?:C\.)?0*(\d{1,3})(?:新男|新女|老男|老女)?(?:\s*[·\-]\s*[^：:]+)?[：:]\s*(.+)$/);
    if(m){const p=byNumber(m[1]);if(p)out.push({p,content:m[2].trim()})}
  });return out;
}
const has=(t,a)=>a.some(x=>t.includes(x));
function detect(p,content){
  const now=norm(content), issues=[], past=db.records.filter(r=>String(r.personId)===String(p.id)&&!(r.source==='document'&&r.docDate===activeDate)).map(r=>norm(r.content));
  const opened=!!p.account?.opened&&(!p.account?.opened_date||p.account.opened_date<=activeDate),joined=!!p.crm?.joined_group&&(!p.crm?.group_joined_date||p.crm.group_joined_date<=activeDate),isVip=!!p.vip?.is_vip,activeHoldings=(db.portfolio?.holdings||[]).filter(x=>String(x.personId)===String(p.id)&&x.status!=='sold'),tradeHistory=(db.portfolio?.holdings||[]).filter(x=>String(x.personId)===String(p.id));
  if(opened&&has(now,['未开户','没有开户','从未开户','没有账户','从来没有开过账户']))issues.push('开户状态冲突：系统当前为已开户，文本却描述为未开户/没有账户。');
  if(!opened&&has(now,['已开户','有账户','账户已开','已经开户']))issues.push('开户状态冲突：系统当前为未开户，文本却描述为已开户。');
  if(joined&&has(now,['未入群','没有入群','从未入群','没进群','从来没有加入过群']))issues.push('入群状态冲突：系统当前为已入群，文本却描述为未入群。');
  if(!joined&&has(now,['已入群','已经入群','进群了','加入了群']))issues.push('入群状态冲突：系统当前为未入群，文本却描述为已入群。');
  if(isVip&&has(now,['不是vip','非vip','没有vip','不是会员']))issues.push('VIP状态冲突：系统当前为VIP，文本却描述为非VIP。');
  if(!isVip&&has(now,['是vip','已经是vip','vip客户','vip会员']))issues.push('VIP状态冲突：系统当前为非VIP，文本却描述为VIP。');
  if(activeHoldings.length&&has(now,['没有持仓','无持仓','目前没股票','没有股票','没有任何股票持仓']))issues.push('持仓状态冲突：系统当前仍有 '+activeHoldings.length+' 笔未卖出持仓。');
  if(!activeHoldings.length&&has(now,['目前持仓','现在持有股票','还有持仓']))issues.push('持仓状态提示：系统当前没有未卖出持仓，请确认文本是否描述历史情节。');
  if(tradeHistory.length&&has(now,['从未买过股票','没有买过股票','从没交易过股票']))issues.push('交易经历冲突：系统已有交易/持仓历史，但文本称从未买过或交易过股票。');
  // Match denials first so the positive substring inside a denial is not treated as evidence.
  const deniedTrade=t=>has(t,['从未参与大宗交易','从未参与过大宗交易','从来没有参与过大宗交易','从没参与过大宗交易','没有参与过大宗交易','没有参与大宗交易','没参与过大宗交易','从未参与交易']);
  const affirmedTrade=t=>!deniedTrade(t)&&has(t,['参与过大宗交易','参加过大宗交易','参与大宗交易','参加大宗交易','大宗交易获利','大宗交易盈利']);
  if(deniedTrade(now)&&(tradeHistory.length||past.some(affirmedTrade)))issues.push('经历冲突：历史中曾参与大宗交易，当前却称从未参与。');
  if(affirmedTrade(now)&&past.some(deniedTrade))issues.push('经历冲突：历史中曾称未参与大宗交易，当前文本与之相反。');
  const opposed=t=>has(t,['不信任助理','怀疑助理','反驳助理','质疑助理','不相信助理']);
  const trusted=t=>!opposed(t)&&has(t,['信任助理','很信任助理','相信助理','完全相信助理']);
  if(trusted(now)&&past.some(opposed))issues.push('态度变化：历史存在怀疑/反驳，当前突然明显信任，请补充转变原因。');
  if(opposed(now)&&past.some(trusted))issues.push('态度变化：历史存在信任，当前突然怀疑/反驳，请补充触发原因。');
  const ps=norm((p.personality?.summary||'')+' '+(Array.isArray(p.personality?.traits)?p.personality.traits.join(' '):''));
  if(has(ps,['谨慎','审慎','风险敏感','慢热'])&&has(now,['毫不犹豫','完全相信','立刻决定','不考虑风险','马上全仓']))issues.push('性格差异：人物画像偏谨慎/风险敏感，但当前表现为无条件快速决策。');
  if(has(ps,['独立','自主','果断'])&&has(now,['完全依赖助理','没有主见','全部听助理']))issues.push('性格差异：人物画像偏独立自主，但当前表现为完全依赖他人。');
  if(db.records.some(r=>String(r.personId)===String(p.id)&&r.source!=='document'&&norm(r.content)===now))issues.push('重复记忆：历史记录中已有相同内容。');
  const dated=window.ChenNanCharacterMemory?.inspect(p,content,activeDate,db.records)||[];
  // Dated growth checks replace unconditional comparisons against all past attitudes.
  const grounded=issues.filter(x=>!x.startsWith('态度变化：')&&!x.startsWith('经历冲突：历史中曾称'));
  return [...new Set([...grounded,...dated])];
}
function allIssues(rows){return rows.flatMap(x=>detect(x.p,x.content).map(reason=>({p:x.p,reason,content:x.content})))}
function issueText(xs){return xs.slice(0,10).map((x,i)=>(i+1)+'. '+pCode(x.p)+pcl(x.p)+' · '+pname(x.p)+'\n'+x.reason+'\n文本：'+x.content).join('\n\n')}
function textHtml(t){return String(t||'').split(/\n/).map(x=>'<div>'+esc(x||' ')+'</div>').join('')}
function cleanHtml(markup){
  const src=new DOMParser().parseFromString(String(markup||''),'text/html'),allowed=new Set(['DIV','P','BR','B','STRONG','I','EM','U','S','SPAN','H1','H2','H3','UL','OL','LI','BLOCKQUOTE','HR']);
  function clean(n){
    if(n.nodeType===Node.TEXT_NODE)return document.createTextNode(n.textContent||'');
    if(n.nodeType!==Node.ELEMENT_NODE||!allowed.has(n.tagName))return document.createTextNode(n.textContent||'');
    const o=document.createElement(n.tagName.toLowerCase());
    if(n.tagName==='SPAN'&&n.classList.contains('person-token')&&/^[-\w]+$/.test(n.dataset.person||'')){o.className='person-token';o.contentEditable='false';o.dataset.person=n.dataset.person}
    const al=(n.style?.textAlign||'').toLowerCase();if(['left','center','right','justify'].includes(al))o.style.textAlign=al;
    n.childNodes.forEach(c=>o.appendChild(clean(c)));return o;
  }
  const box=document.createElement('div');src.body.childNodes.forEach(n=>box.appendChild(clean(n)));return box.innerHTML;
}
function cur(){ensureDocs();return db.dailyDocs[activeDate]}
function setDate(d){if(!d)return;saveDaily(false,true);activeDate=d;ensureDocs();renderTabs();loadEditor();renderRank();if(currentPersonId)renderMemory(currentPersonId)}
function renderTabs(){
  const keys=[...new Set([dateKey(),...Object.keys(db.dailyDocs||{})])].filter(k=>/^\d{4}-\d{2}-\d{2}/.test(k)).sort().reverse().slice(0,7);
  E('dailyTabs').innerHTML=keys.map(k=>'<button class="daily-tab '+(k===activeDate?'active':'')+'" data-day="'+esc(k)+'">'+esc(k)+'</button>').join('');
  QA('[data-day]').forEach(b=>b.onclick=()=>setDate(b.dataset.day));E('dailyDatePicker').value=activeDate.slice(0,10);
}
function renderRank(){
  const host=E('speechRanking');if(!host)return;
  host.innerHTML=ranking().map(p=>'<button class="speech-row '+(String(p.id)===String(currentPersonId)?'active':'')+'" data-sp="'+esc(p.id)+'">'+pAvatar(p)+'<div><b>'+esc(pCode(p))+'</b><span class="speech-name">'+esc(pname(p))+'</span><small class="person-category" data-category="'+esc(pcl(p))+'">'+esc(pcl(p))+'</small></div><em>'+speechCount(p)+'次</em></button>').join('');
  QA('[data-sp]').forEach(b=>b.onclick=()=>{currentPersonId=b.dataset.sp;renderRank();renderMemory(currentPersonId)});
}
function refreshWorkspace(){ensureDocs();renderTabs();loadEditor();renderRank();if(currentPersonId&&person(currentPersonId))renderMemory(currentPersonId);else renderMemory(null);}
function setup(){
  ensureDocs();const sec=E('novel');if(!sec)return;
  sec.innerHTML='<div class="topbar"><div><div class="eyebrow">WRITING WORKSPACE</div><h1 class="page-title">撰写工作台</h1><p class="sub">按日期管理每日文档、人物发言、长期记忆与逻辑一致性，并支持离线导出 DOCX。</p></div><div class="actions"><button class="btn ghost" id="docxExport">导出 DOCX</button><button class="btn primary" id="saveDaily">保存今日</button></div></div><div class="writing-summary-grid"><div class="card writing-summary-card"><span>当前日期</span><strong id="writingDateSummary">--</strong><small>每日独立保存</small></div><div class="card writing-summary-card"><span>当前字数</span><strong id="writingWordSummary">0</strong><small>正文实时统计</small></div><div class="card writing-summary-card"><span>当前人物</span><strong id="writingPersonSummary">未选择</strong><small>人物记忆联动</small></div><div class="card writing-summary-card"><span>逻辑提示</span><strong id="writingIssueSummary">0</strong><small>一致性风险</small></div></div><div class="daily-doc-layout"><aside class="card speech-panel"><div class="speech-head"><b>人物频次</b><small>高→低</small></div><div id="speechRanking"></div></aside><section class="card editor-card"><div class="daily-tabs-wrap"><div id="dailyTabs" class="daily-tabs"></div><div class="daily-pick"><input id="dailyDatePicker" type="date"><button class="btn ghost small" id="openDate">打开</button></div></div><div class="rich-title-row"><input class="input" id="dailyTitle" placeholder="当日记录标题（可选）"><span id="dailyStatus">未保存</span></div><div class="word-toolbar" id="wordToolbar"><button data-cmd="undo">↶</button><button data-cmd="redo">↷</button><span></span><button data-cmd="bold"><b>B</b></button><button data-cmd="italic"><i>I</i></button><button data-cmd="underline"><u>U</u></button><button data-cmd="strikeThrough"><s>S</s></button><span></span><button data-block="h1">H1</button><button data-block="h2">H2</button><button data-block="p">正文</button><button data-block="blockquote">引用</button><span></span><button data-cmd="insertUnorderedList">•</button><button data-cmd="insertOrderedList">1.</button><button data-cmd="justifyLeft">左</button><button data-cmd="justifyCenter">中</button><button data-cmd="justifyRight">右</button><button data-cmd="removeFormat">清格式</button></div><div id="personSuggest" class="doc-suggest"></div><div id="dailyEditor" class="rich-editor" contenteditable="true" spellcheck="false"></div><div class="editor-foot"><span>输入编号如 <b>21</b>，回车插入对应人物。</span><span id="wordCount">0 字</span></div></section><aside class="card memory-panel"><div class="panel-head"><h2>人物记忆</h2><span id="personFrequency" class="muted">未选择</span></div><div id="memoryPerson"></div><div id="logicWarnings"></div><div id="memoryTimeline" class="memory-timeline"></div></aside></div>';
  if(!E('dailyDocStyles')){const st=document.createElement('style');st.id='dailyDocStyles';st.textContent='.daily-doc-layout{display:grid;grid-template-columns:136px minmax(0,1fr) 310px;gap:14px}.speech-panel{padding:10px 8px;max-height:720px;overflow:auto}.speech-head{display:flex;justify-content:space-between;align-items:center;padding:4px 4px 9px;border-bottom:1px solid var(--line);font-size:11px}.speech-head small{color:var(--muted)}.speech-row{width:100%;display:grid;grid-template-columns:27px 1fr auto;gap:4px;align-items:center;padding:7px 4px;border-radius:7px;color:#657386;font-size:11px;text-align:left}.speech-row:hover,.speech-row.active{background:#f1f5f8;color:#344e68}.speech-row b{font-size:11px}.speech-row span{border-radius:999px;padding:2px 3px;text-align:center;font-size:9px}.speech-row .female{background:#f8eef2;color:#a37184}.speech-row .male{background:#edf3f7;color:#66829a}.speech-row em{font-style:normal;color:#8b96a3;font-size:9px}.editor-card,.memory-panel{padding:14px;min-width:0}.rich-title-row .input{min-width:0}.rich-editor{overflow-wrap:anywhere}.daily-tabs{min-width:0}.daily-tabs-wrap{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px}.daily-tabs{display:flex;gap:5px;overflow:auto}.daily-tab{padding:6px 8px;border:1px solid var(--line);border-radius:7px;color:#7c8998;background:#fff;font-size:10px;white-space:nowrap}.daily-tab.active{background:#eef3f7;color:#45647f;border-color:#dbe4ec}.daily-pick{display:flex;gap:5px}.daily-pick input{border:1px solid var(--line);border-radius:7px;padding:5px;color:#758293}.rich-title-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}.rich-title-row .input{flex:1}.rich-title-row #dailyStatus{font-size:10px;color:#84919e;white-space:nowrap}.word-toolbar{display:flex;gap:4px;align-items:center;flex-wrap:wrap;padding:7px;border:1px solid var(--line);border-radius:9px 9px 0 0;background:#fafbfc}.word-toolbar button{padding:5px 7px;border:1px solid #e8edf2;background:#fff;border-radius:6px;color:#667689;font-size:10px}.word-toolbar span{width:1px;height:19px;background:var(--line)}.rich-editor{min-height:560px;padding:24px 28px;border:1px solid var(--line);border-top:0;border-radius:0 0 9px 9px;background:#fff;outline:0;line-height:1.85;font-size:14px}.person-token{background:#eef3f8;color:#4f708c;border-radius:5px;padding:1px 4px;font-weight:750}.doc-suggest{display:none;padding:7px 9px;border:1px solid #d7e1ea;background:#f7f9fb;font-size:10px;color:#60768c}.doc-suggest.show{display:block}.editor-foot{display:flex;justify-content:space-between;color:#929daa;font-size:9px;padding-top:7px}.memory-person-card{padding:11px;border:1px solid var(--line);border-radius:10px;background:#fbfcfd}.memory-person-card b,.memory-person-card small{display:block}.memory-person-card small{color:var(--muted);margin-top:2px}.memory-person-card p{font-size:11px;color:#697789}.logic-warning{margin-top:10px;padding:10px;border-radius:9px;background:#faf2f2;color:#9b666a;font-size:10px}.memory-timeline{display:grid;gap:7px;margin-top:11px;max-height:520px;overflow:auto}.memory-row{border-left:2px solid #dce5ec;padding:6px 8px;background:#fbfcfd}.memory-row b,.memory-row small{display:block}.memory-row b{font-size:10px}.memory-row small{color:#9aa4ae}.memory-row p{margin:3px 0 0;font-size:10px;color:#687687}@media(max-width:1100px){.daily-doc-layout{grid-template-columns:120px minmax(0,1fr)}.memory-panel{grid-column:1/-1}}@media(max-width:720px){.daily-doc-layout{grid-template-columns:minmax(0,1fr)}.daily-tabs-wrap{flex-direction:column;align-items:stretch}.daily-tabs{max-width:100%}.daily-pick{flex-wrap:wrap}.daily-pick input{min-width:0;max-width:100%}.rich-title-row{flex-wrap:wrap}.rich-title-row .input{flex-basis:100%}.editor-foot{flex-wrap:wrap;gap:6px}.speech-panel{max-height:210px}.rich-editor{min-height:440px;padding:18px 14px}}';document.head.appendChild(st)}
  bind();renderTabs();renderRank();loadEditor();renderMemory(null);
}
function bind(){
  document.addEventListener('click',event=>{if(event.target.closest?.('.nav button,[data-day],#openDate'))E('growthNotice')?.close()},true);
  E('saveDaily').onclick=()=>saveDaily(true,false);E('docxExport').onclick=exportDocx;E('openDate').onclick=()=>setDate(E('dailyDatePicker').value);
  E('dailyTitle').oninput=()=>{saveDaily(false,true,false);schedule()};E('dailyEditor').addEventListener('input',()=>{saveDaily(false,true,false);schedule();suggest();wordCount();renderWarnings()});E('dailyEditor').addEventListener('keyup',suggest);E('dailyEditor').addEventListener('keydown',keyDown);E('dailyEditor').addEventListener('click',()=>{const p=selectionPerson();if(p){currentPersonId=p.id;renderRank();renderMemory(p.id)}});
  QA('#wordToolbar [data-cmd]').forEach(b=>b.onclick=()=>{document.execCommand(b.dataset.cmd,false,null);E('dailyEditor').focus();schedule()});
  QA('#wordToolbar [data-block]').forEach(b=>b.onclick=()=>{document.execCommand('formatBlock',false,b.dataset.block);E('dailyEditor').focus();schedule()});
}
function loadEditor(){const d=cur();E('dailyTitle').value=d.title||'';E('dailyEditor').innerHTML=cleanHtml(d.html||textHtml(d.content||''));E('dailyStatus').textContent=d.updatedAt?'已保存 '+new Date(d.updatedAt).toLocaleTimeString('zh-CN',{hour12:false}):'新建内容';wordCount();renderWarnings()}
function schedule(){E('dailyStatus').textContent='正在编辑…';clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>saveDaily(false,true),300)}
function wordCount(){const n=E('dailyEditor').innerText.replace(/\s/g,'').length;E('wordCount').textContent=n+' 字';if(E('writingWordSummary'))E('writingWordSummary').textContent=n;if(E('writingDateSummary'))E('writingDateSummary').textContent=activeDate||'--'}
function saveDaily(showToast=false,silentWarnings=false,notify=true){
  clearTimeout(autosaveTimer);
  if(!E('dailyEditor'))return false;const d=cur(),text=E('dailyEditor').innerText,rows=statements(text),issues=allIssues(rows);
  if(!silentWarnings&&showToast&&issues.length&&!confirm('保存前发现人物逻辑/塑造风险：\n\n'+issueText(issues)+'\n\n仍要保存今日内容吗？'))return false;
  const title=E('dailyTitle').value.trim(),html=cleanHtml(E('dailyEditor').innerHTML);
  if((!d.updatedAt&&!title&&!text.trim())||(d.title===title&&d.html===html&&d.content===text)){renderWarnings();if(notify)notifyGrowth(issues);return true;}
  d.title=title;d.html=html;d.content=text;d.updatedAt=new Date().toISOString();
  db.records=db.records.filter(r=>!(r.source==='document'&&r.docDate===activeDate));
  rows.forEach(x=>db.records.push({id:'docmem-'+activeDate+'-'+x.p.id+'-'+h32(x.content),personId:x.p.id,date:activeDate,type:'发言记录',source:'document',docDate:activeDate,title:'每日文档 · '+(d.title||activeDate),content:x.content,topics:['文档记忆']}));
  save();if(notify)notifyGrowth(issues);E('dailyStatus').textContent='本地已保存，等待云端 '+new Date().toLocaleTimeString('zh-CN',{hour12:false});renderRank();renderWarnings();if(currentPersonId)renderMemory(currentPersonId);if(showToast)toast('今日文档已保存到本地，正在同步云端');return true;
}
function currentBlock(){const s=window.getSelection();if(!s||!s.rangeCount)return null;let n=s.anchorNode;if(n?.nodeType===3)n=n.parentElement;while(n&&n!==E('dailyEditor')&&n.parentElement!==E('dailyEditor'))n=n.parentElement;return n||null}
function suggest(){const b=currentBlock(),box=E('personSuggest');if(!b||!box)return;const m=b.innerText.trim().match(/^(?:C\.)?0*(\d{1,3})$/i),p=m?byNumber(m[1]):null;if(p){box.className='doc-suggest show';box.innerHTML='Enter 插入：<b>'+esc(pCode(p)+pcl(p)+' · '+pname(p))+'</b>　发言 '+speechCount(p)+'次';currentPersonId=p.id;renderRank();renderMemory(p.id)}else box.className='doc-suggest'}
function caretEnd(n){const r=document.createRange(),s=window.getSelection();r.selectNodeContents(n);r.collapse(false);s.removeAllRanges();s.addRange(r)}
function keyDown(e){if(e.key!=='Enter')return;const b=currentBlock();if(!b)return;const t=b.innerText.trim(),m=t.match(/^(?:C\.)?0*(\d{1,3})$/i);if(m){const p=byNumber(m[1]);if(p){e.preventDefault();b.innerHTML='<span class="person-token" contenteditable="false" data-person="'+esc(p.id)+'">'+esc(pCode(p)+pcl(p)+' · '+pname(p))+'</span>：&nbsp;';caretEnd(b);currentPersonId=p.id;renderRank();renderMemory(p.id);E('personSuggest').className='doc-suggest';schedule();return}}const is=allIssues(statements(t));if(is.length&&!confirm('人物逻辑/塑造提示：\n\n'+issueText(is)+'\n\n继续换行吗？'))e.preventDefault()}
function selectionPerson(){const s=window.getSelection();if(!s||!s.rangeCount)return null;let n=s.anchorNode;if(n?.nodeType===3)n=n.parentElement;const t=n?.closest?.('.person-token');return t?person(t.dataset.person):null}
function renderMemory(pid){
  const p=pid?person(pid):null;if(!p){E('memoryPerson').innerHTML='<div class="empty">点击左侧人物，或输入编号查看记忆</div>';E('memoryTimeline').innerHTML='';E('personFrequency').textContent='未选择';if(E('writingPersonSummary'))E('writingPersonSummary').textContent='未选择';return}
  E('personFrequency').textContent='发言 '+speechCount(p)+'次';if(E('writingPersonSummary'))E('writingPersonSummary').textContent=pname(p);E('memoryPerson').innerHTML='<div class="memory-person-card"><b>'+esc(pCode(p)+pcl(p)+' · '+pname(p))+'</b><small>'+esc(p.age||'--')+'岁 · '+esc(p.account?.status||'--')+' · '+(pVip(p)?esc(p.vip?.level||'VIP'):'非VIP')+'</small><p>'+esc(p.personality?.summary||'暂无性格描述')+'</p></div>';
  E('memoryTimeline').innerHTML=memRows(p).map(x=>'<div class="memory-row"><b>'+esc(x.d)+' · '+esc(x.t)+'</b><small>'+esc(x.k)+'</small><p>'+esc(x.x)+'</p></div>').join('')||'<div class="empty">暂无历史记忆</div>';
}
function notifyGrowth(issues){
 if(!E('novel')?.classList.contains('active'))return;
 const fresh=issues.filter(x=>!shownWarnings.has(activeDate+'|'+x.p.id+'|'+x.reason));if(!fresh.length)return;
 fresh.forEach(x=>shownWarnings.add(activeDate+'|'+x.p.id+'|'+x.reason));
 let box=E('growthNotice');if(!box){box=document.createElement('dialog');box.id='growthNotice';box.className='growth-notice';document.body.appendChild(box)}
 box.innerHTML='<h3>人物成长与顺序提醒</h3><p>草稿已保存。请核对历史依据；若是回忆或正常成长，请在文中补充日期、原因。</p><div>'+fresh.slice(0,3).map(x=>'<p><b>'+esc(pCode(x.p)+' · '+pname(x.p))+'</b><br>'+esc(x.reason).replace(/\n/g,'<br>')+'</p>').join('')+'</div><button type="button" class="btn ghost">知道了，继续撰写</button>';
 box.querySelector('button').onclick=()=>box.close();if(!box.open)box.show();
}
function renderWarnings(){const host=E('logicWarnings');if(!host)return;const is=allIssues(statements(E('dailyEditor')?.innerText||''));if(E('writingIssueSummary'))E('writingIssueSummary').textContent=is.length;host.innerHTML=is.length?'<div class="logic-warning"><b>逻辑一致性提示 · '+is.length+'条</b><br>'+is.slice(0,3).map(x=>esc(pCode(x.p)+pcl(x.p)+'：'+x.reason)).join('<br>')+'</div>':''}

/* 无 CDN 的最小 DOCX，保留段落/标题/粗体/斜体/下划线/删除线/对齐。 */
function xml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function crc32(b){let c=-1;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xEDB88320:0)}return(c^-1)>>>0}
const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
function cat(parts){const l=parts.reduce((s,x)=>s+x.length,0),o=new Uint8Array(l);let p=0;parts.forEach(x=>{o.set(x,p);p+=x.length});return o}
function zip(files){const e=new TextEncoder(),ls=[],cs=[];let off=0;files.forEach(f=>{const n=e.encode(f.name),d=typeof f.data==='string'?e.encode(f.data):f.data,c=crc32(d),lh=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(c),...u32(d.length),...u32(d.length),...u16(n.length),...u16(0),...n]);ls.push(lh,d);cs.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(c),...u32(d.length),...u32(d.length),...u16(n.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off),...n]));off+=lh.length+d.length});const cd=cat(cs),end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cd.length),...u32(off),...u16(0)]);return cat([...ls,cd,end])}
function run(n,p={}){if(n.nodeType===Node.TEXT_NODE){if(!n.textContent)return'';const r=(p.b?'<w:b/>':'')+(p.i?'<w:i/>':'')+(p.u?'<w:u w:val="single"/>':'')+(p.s?'<w:strike/>':'');return'<w:r>'+(r?'<w:rPr>'+r+'</w:rPr>':'')+'<w:t xml:space="preserve">'+xml(n.textContent)+'</w:t></w:r>'}if(n.nodeType!==Node.ELEMENT_NODE)return'';const q={...p,b:p.b||['B','STRONG'].includes(n.tagName),i:p.i||['I','EM'].includes(n.tagName),u:p.u||n.tagName==='U',s:p.s||n.tagName==='S'};if(n.tagName==='BR')return'<w:r><w:br/></w:r>';return[...n.childNodes].map(x=>run(x,q)).join('')}
function docXml(){const box=document.createElement('div');box.innerHTML=cleanHtml(E('dailyEditor').innerHTML);let body='';[...box.childNodes].forEach(n=>{const tag=n.tagName||'',al=n.style?.textAlign||'';let pr='';if(['center','right','justify'].includes(al))pr+='<w:jc w:val="'+al+'"/>';if(tag==='H1')pr+='<w:pStyle w:val="Heading1"/>';if(tag==='H2')pr+='<w:pStyle w:val="Heading2"/>';body+='<w:p>'+(pr?'<w:pPr>'+pr+'</w:pPr>':'')+(tag==='LI'?'<w:r><w:t>• </w:t></w:r>':'')+run(n)+'</w:p>'});return'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr/></w:body></w:document>'}
function exportDocx(){if(saveDaily(true,false)===false)return;const d=cur(),files=[{name:'[Content_Types].xml',data:'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'},{name:'_rels/.rels',data:'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},{name:'word/document.xml',data:docXml()}],blob=new Blob([zip(files)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(activeDate+(d.title?'_'+d.title:'')+'.docx').replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('DOCX 已离线导出')}
window.ChenNanDocumentWorkspace={refresh:refreshWorkspace,saveDraft:()=>saveDaily(false,true)};
document.addEventListener('chennan:cloud-saved',()=>{if(E('dailyStatus'))E('dailyStatus').textContent='云端已保存'});
document.addEventListener('chennan:cloud-error',()=>{if(E('dailyStatus'))E('dailyStatus').textContent='云端未保存，请重试'});
const documentRenderBase=render;render=function(){documentRenderBase();renderRank();if(currentPersonId)renderMemory(currentPersonId);};
setup();
})();
