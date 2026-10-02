const {test}=require('node:test');const assert=require('node:assert/strict');const {inspect}=require('../character-memory.js');
const person={id:'p'};const records=[{personId:'p',date:'2026-01-01',content:'不信任助理',title:'初次接触'},{personId:'p',date:'2026-02-01',content:'参与过大宗交易',title:'首次交易'}];
test('growth warning includes the date and evidence of the previous attitude',()=>{const issues=inspect(person,'完全信任助理','2026-03-01',records);assert.match(issues.join(' '),/2026-01-01.*初次接触/s)});
test('an explained growth transition is allowed',()=>assert.deepEqual(inspect(person,'经过交易成功后逐渐信任助理','2026-03-01',records),[]));
test('future experience does not invalidate an earlier inexperienced character',()=>assert.deepEqual(inspect(person,'从未参与大宗交易','2026-01-20',records),[]));
test('denial after actual experience cites the dated event',()=>assert.match(inspect(person,'从未参与大宗交易','2026-03-01',records).join(' '),/2026-02-01/));
test('future events require an explicit plan rather than a completed assertion',()=>{assert.ok(inspect(person,'2026-04-01 已经开户','2026-03-01',[]).length);assert.deepEqual(inspect(person,'计划在2026-04-01开户','2026-03-01',[]),[])});
test('normal aging is allowed but age regression cites the previous date',()=>{const old=[{personId:'p',date:'2025-01-01',content:'我35岁'}];assert.deepEqual(inspect(person,'我36岁','2026-03-01',old),[]);assert.match(inspect(person,'我32岁','2026-03-01',old).join(' '),/2025-01-01/);assert.deepEqual(inspect(person,'回忆那时我32岁','2026-03-01',old),[])});
test('relationship changes require explanation and preserve person references',()=>{const old=[{personId:'p',date:'2025-01-01',content:'我与C.02是朋友'}];assert.match(inspect(person,'我与C.02是夫妻','2026-03-01',old).join(' '),/C.02/);assert.deepEqual(inspect(person,'后来结婚，我与C.02是夫妻','2026-03-01',old),[])});
