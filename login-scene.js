/* 独立场景渲染：湖面由纹理位移驱动，认证层隐藏后释放 GPU。 */
(function(){
'use strict';
function waterFallback(canvas,root,reduced){
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx){canvas.hidden=true;root.dataset.sceneRenderer='image-fallback';return}
 const image=new Image();let raf=0,ready=false,disposed=false,last=0;
 const resize=()=>{const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,8192/Math.max(r.width,r.height));canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));if(ready)draw(last)};
 function draw(now){const w=canvas.width,h=canvas.height,k=Math.max(w/image.naturalWidth,h/image.naturalHeight),sw=w/k,sh=h/k,sx=(image.naturalWidth-sw)/2,sy=(image.naturalHeight-sh)/2;ctx.drawImage(image,sx,sy,sw,sh,0,0,w,h);if(!reduced.matches){for(let y=Math.floor(h*.72);y<h;y+=5){const offset=Math.sin(y*.05-now*.0008)*w*.0015;ctx.drawImage(image,sx,sy+y/k,sw,Math.min(5,h-y)/k,offset,y,w,Math.min(5,h-y))}}root.dataset.sceneFrame=String(Math.round(now))}
 function tick(now){if(disposed||!ready)return;if(now-last>=32){last=now;draw(now)}if(!document.hidden&&!reduced.matches)raf=requestAnimationFrame(tick)}
 const restart=()=>{cancelAnimationFrame(raf);if(ready&&!disposed){last=0;draw(0);tick(performance.now())}};
 const observer=new ResizeObserver(resize);observer.observe(canvas);image.onload=()=>{ready=true;root.dataset.sceneRenderer='canvas2d';root.dataset.sceneSource=image.naturalWidth+'x'+image.naturalHeight;resize();restart()};image.src=innerWidth*(devicePixelRatio||1)>3840?'./assets/login/landscape-8k.webp':'./assets/login/landscape.webp';image.onerror=()=>{canvas.hidden=true};
 document.addEventListener('visibilitychange',restart);reduced.addEventListener('change',restart);const hidden=new MutationObserver(()=>{if(root.classList.contains('hidden')){disposed=true;cancelAnimationFrame(raf);observer.disconnect();hidden.disconnect();document.removeEventListener('visibilitychange',restart);reduced.removeEventListener('change',restart);root.dataset.sceneState='disposed'}});hidden.observe(root,{attributes:true,attributeFilter:['class']});
}
window.ChenNanScene={mount(root){
 const canvas=root.querySelector('.scene-lake');if(!canvas)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 // WebKitGTK/WPE can crash its GPU process on large animated textures; the 2D renderer retains independent lake motion.
 const linuxWebKit=(/Linux/.test(navigator.platform)||/Linux/.test(navigator.userAgent))&&/AppleWebKit/.test(navigator.userAgent)&&!/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent);
 if(linuxWebKit){waterFallback(canvas,root,reduced);return}
 const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'});
 if(!gl){waterFallback(canvas,root,reduced);return}
 const shader=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);return null}return s};
 const vert=shader(gl.VERTEX_SHADER,'attribute vec2 p; varying vec2 uv; void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}');
 const frag=shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 uv;uniform sampler2D art;uniform float t;uniform vec2 cover;
 void main(){vec2 q=(uv-.5)*cover+.5;float lake=1.-smoothstep(.22,.34,q.y);float edge=smoothstep(0.,.05,q.x)*smoothstep(0.,.05,1.-q.x);float wave=sin(q.y*155.-t*.8)+.45*sin(q.x*45.+q.y*68.-t*.6);q.x+=wave*.0018*lake*edge;q.y+=sin(q.x*68.+t*.5)*.0008*lake;vec4 c=texture2D(art,q);float glint=sin(q.y*260.-t*.9)*sin(q.x*38.+t*.4);c.rgb+=max(glint,0.)*.018*lake;gl_FragColor=c;}`);
 if(!vert||!frag){canvas.hidden=true;root.dataset.sceneRenderer='image-fallback';return}
 const program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){canvas.hidden=true;return}gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 const time=gl.getUniformLocation(program,'t'),cover=gl.getUniformLocation(program,'cover');let raf=0,ready=false,disposed=false,last=0;
 const image=new Image();image.decoding='async';image.onload=()=>{if(disposed)return;gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);const limit=gl.getParameter(gl.MAX_TEXTURE_SIZE);let upload=image;if(Math.max(image.naturalWidth,image.naturalHeight)>limit){upload=document.createElement('canvas');const k=limit/Math.max(image.naturalWidth,image.naturalHeight);upload.width=Math.round(image.naturalWidth*k);upload.height=Math.round(image.naturalHeight*k);upload.getContext('2d').drawImage(image,0,0,upload.width,upload.height)}gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,upload);ready=true;root.dataset.sceneRenderer='webgl';root.dataset.sceneSource=image.naturalWidth+'x'+image.naturalHeight;resize();tick(0)};
 image.onerror=()=>{canvas.hidden=true;root.dataset.sceneRenderer='image-fallback'};image.src=innerWidth*(devicePixelRatio||1)>3840&&gl.getParameter(gl.MAX_TEXTURE_SIZE)>=7680?'./assets/login/landscape-8k.webp':'./assets/login/landscape.webp';
 function resize(){if(disposed)return;const rect=canvas.getBoundingClientRect(),limit=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),ratio=Math.min(devicePixelRatio||1,limit/Math.max(rect.width,rect.height));canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.max(1,Math.round(rect.height*ratio));gl.viewport(0,0,canvas.width,canvas.height);const screen=canvas.width/canvas.height,art=image.naturalWidth/image.naturalHeight;gl.uniform2f(cover,screen>art?1:screen/art,screen>art?art/screen:1);if(ready)draw(last)}
 function draw(now){gl.uniform1f(time,reduced.matches?0:now/1000);gl.drawArrays(gl.TRIANGLES,0,6)}
 function tick(now){if(disposed||!ready)return;last=now;if(!document.hidden){draw(now);root.dataset.sceneFrame=String(Math.round(now))}if(!reduced.matches&&!document.hidden)raf=requestAnimationFrame(tick)}
 function restart(){cancelAnimationFrame(raf);if(!disposed&&ready)tick(performance.now())}
 const observer=new ResizeObserver(resize);observer.observe(canvas);document.addEventListener('visibilitychange',restart);reduced.addEventListener('change',restart);
 const hidden=new MutationObserver(()=>{if(root.classList.contains('hidden')){disposed=true;cancelAnimationFrame(raf);observer.disconnect();hidden.disconnect();document.removeEventListener('visibilitychange',restart);reduced.removeEventListener('change',restart);gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.deleteShader(vert);gl.deleteShader(frag);root.dataset.sceneState='disposed'}});hidden.observe(root,{attributes:true,attributeFilter:['class']});
 }};
})();
