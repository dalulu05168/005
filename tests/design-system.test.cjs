const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=p=>fs.readFileSync(p,'utf8');
const index=read('index.html');
const css=read('design-system.css');
const runtime=read('design-system.js');
const core=read('workspace-core.js');
const people=read('people-detail.js');

test('统一设计系统已作为最终样式层加载',()=>{
  assert.match(index,/design-system\.css\?v=20261003-module-rebuild-5/);
  assert.match(index,/design-system\.js\?v=20261003-final-system-4/);
  assert(index.lastIndexOf('design-system.js')>index.lastIndexOf('overview-final.js'));
  assert.match(runtime,/ensureStylesheetLast/);
  for(const legacy of ['workspace-glass.css','ui-shell.js','theme-ui.js'])assert(!index.includes(legacy),'legacy UI must not load: '+legacy);
});

test('设计 tokens 与通用组件标准存在',()=>{
  for(const token of ['--cn-bg','--cn-surface','--cn-border','--cn-ink','--cn-gold','--cn-radius-lg','--cn-control-h'])assert(css.includes(token),token);
  for(const selector of ['.btn.primary','.btn.ghost','.btn.danger','.modal','.empty:not(td)','table,.mini-table,.people-data-table'])assert(css.includes(selector),selector);
});

test('十个一级模块均纳入统一页面元数据',()=>{
  for(const id of ['overview','people','groups','tradeRecommend','holdingsV2','trades','records','novel','france70chat','topics'])assert(runtime.includes(id+':{')||runtime.includes(id+":{"),id);
});

test('动态二级页面采用同一系统',()=>{
  assert.match(runtime,/personDetailPage/);
  assert.match(css,/#personDetailPage \.detail-kpis/);
  assert.match(css,/#personDetailPage \.detail-bottom-grid/);
  assert.match(people,/detailBottomBlocks/);
  assert.match(people,/交易计划与推荐/);
  assert.match(people,/联系记录/);
});

test('分组页固定10个均衡小组且不再输出头像',()=>{
  assert.match(core,/balanced-10-v1/);
  assert.match(core,/Array\.from\(\{length:10\}/);
  assert.doesNotMatch(core,/balanced-member-avatar/);
  assert.match(css,/#groups \.balanced-member-avatar[\s\S]*display:none/);
});

test('母版视觉规则覆盖主要工作区',()=>{
  for(const id of ['#trades','#tradeRecommend','#holdingsV2','#records','#novel','#france70chat','#topics','#groups'])assert(css.includes(id),id);
  assert.match(css,/Parent surface \/ leaf surface motion contract/);
  assert.match(css,/Desktop 16:9 rhythm/);
});
