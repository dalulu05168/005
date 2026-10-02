/* Dated evidence checks; changes in attitude are allowed when a transition is described. */
(function(root){
'use strict';
const text=v=>String(v||'').toLowerCase().replace(/\s+/g,'');
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null;
function inspect(person,content,day,records){
 const now=text(content),at=date(day),out=[];
 const history=records.filter(r=>String(r.personId)===String(person.id)&&date(r.date)&&!(r.source==='document'&&r.docDate===day)).sort((a,b)=>a.date.localeCompare(b.date));
 const report=(reason,r)=>out.push(reason+'\n历史依据：'+r.date+' · '+(r.title||r.type||'人物记录')+'\n'+r.content);
 const experience=t=>!/从未|从没|没有.*(?:买|交易)|未曾/.test(t)&&/买过股票|买入|参与过.*交易|交易获利|交易盈利/.test(t);
 if(/从未买过股票|从没交易过股票|从未参与(?:过)?大宗交易/.test(now)){
  const r=history.filter(r=>r.date<=at&&experience(text(r.content))).at(-1);if(r)report('成长轨迹冲突：此日期之前已有交易经历，不能直接写为“从未”。',r);
 }
 if(/第一次|首次/.test(now)){
  const r=history.filter(r=>r.date<at&&experience(now)&&experience(text(r.content))).at(-1);if(r)report('事件顺序提示：此前已有相似交易经历，请确认“第一次”的范围。',r);
 }
 const trust=t=>/不信任|不相信|怀疑|质疑/.test(t)?-1:/信任助理|相信助理/.test(t)?1:0;
 const stage=trust(now),prior=history.filter(r=>r.date<at&&trust(text(r.content))).at(-1);
 if(stage&&prior&&stage!==trust(text(prior.content))&&!/逐渐|后来|经历|因为|由于|经过|开始|转变|改变|重新|不再|如今|终于/.test(now))report('成长轨迹提示：态度发生变化，请补充导致转变的经历或原因。',prior);
 const age=now.match(/(?:我|今年|现在|年龄)(?:已经|是)?(\d{1,3})岁/);
 if(age&&at&&!/当年|那时|曾经|回忆|过去|小时候/.test(now)){
  const priorAge=history.filter(r=>r.date<at&&/(?:我|今年|现在|年龄)(?:已经|是)?(\d{1,3})岁/.test(text(r.content))).at(-1);
  if(priorAge){const previous=Number(text(priorAge.content).match(/(?:我|今年|现在|年龄)(?:已经|是)?(\d{1,3})岁/)[1]),current=Number(age[1]),years=Number(at.slice(0,4))-Number(priorAge.date.slice(0,4));if(current<previous||current-previous>years+1)report('成长轨迹冲突：年龄变化与经过的时间不符，请确认日期、回忆情节或人物编号。',priorAge)}
 }
 const relation=now.match(/(?:与|和)(c\.\d{2})是(父女|父子|母女|母子|夫妻|兄妹|姐弟|朋友|同事)/);
 if(relation){const previous=history.filter(r=>r.date<=at&&text(r.content).includes(relation[1])).at(-1),old=previous&&text(previous.content).match(/(?:与|和)(c\.\d{2})是(父女|父子|母女|母子|夫妻|兄妹|姐弟|朋友|同事)/);if(old&&old[2]!==relation[2]&&!/后来|因为|成为|转变|改变|结婚|离婚|误认|原来/.test(now))report('人物关系提示：与 '+relation[1].toUpperCase()+' 的关系描述发生变化，请确认人物或补充关系转变。',previous)}
 const mentioned=content.match(/\b(\d{4}-\d{2}-\d{2})\b/);
 if(mentioned&&at&&date(mentioned[1])>at&&!/计划|准备|将|预计|未来|预告/.test(now))out.push('事件顺序提示：写作日期为 '+at+'，文本中的 '+mentioned[1]+' 尚未发生；若是计划或倒叙，请明确说明。');
 const duplicate=history.find(r=>r.date<=at&&text(r.content)===now);if(duplicate)report('相似事件提示：此前已有相同内容，请确认是否为重述。',duplicate);
 return out;
}
root.ChenNanCharacterMemory={inspect};
if(typeof module==='object')module.exports={inspect};
})(typeof window==='object'?window:globalThis);
