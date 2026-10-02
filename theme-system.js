/* 辰南撰写 · 固定参考图工作台主题 */
(function(){
 'use strict';
 function apply(){
  document.documentElement.dataset.theme='reference';
  document.body?.setAttribute?.('data-theme','reference');
  document.documentElement.classList.remove('theme-fade-out','theme-fade-in');
  return 'reference';
 }
 window.ChenNanTheme={
   apply,
   transitionTo:apply,
   get:()=> 'reference',
   labels:Object.freeze({reference:'高级灰工作台'}),
   options:()=>'<option value="reference">高级灰工作台</option>',
   buttons:()=>''
 };
 apply();
})();
