const assert=require('node:assert/strict');
async function contrastAudit(page,scope='.section.active'){
 const failures=await page.evaluate(scope=>{const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number),lum=a=>a.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);return [...document.querySelectorAll(scope+' *')].filter(e=>e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>{let parent=e,bg;while(parent){const c=rgb(getComputedStyle(parent).backgroundColor);if(c.length===3||c[3]===1){bg=c;break}parent=parent.parentElement}if(!bg)return null;const fg=rgb(getComputedStyle(e).color),l1=lum(fg),l2=lum(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);return ratio<4.5?{class:e.className,text:e.textContent.slice(0,55),ratio}:null}).filter(Boolean)},scope);
 assert.deepEqual(failures,[],'text contrast below 4.5:1 in '+scope);
}
module.exports={contrastAudit};
