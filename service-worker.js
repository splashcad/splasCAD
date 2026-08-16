const CACHE='splashcad-6-0-22-u012-black-margin-scroll-20260816175500';
const CORE=['/','/index.html','/hob.html','/window.html','/styles.css','/splashcad-app.js','/window-wall.js','/voice.js','/tablet.js','/manifest.webmanifest','/splashcad-icon.svg'];
const TABLET_PATCH=`
;(()=>{
  const BUILD='ALPHA 6.0.22 · UPDATE 012';
  document.title='SplashCAD — '+BUILD;
  const proof=document.querySelector('.alpha-proof');if(proof)proof.textContent=BUILD;
  const brand=document.querySelector('.brand p');if(brand)brand.textContent=BUILD+' · Locked Detection + Dimension Engine V2';

  const style=document.createElement('style');
  style.textContent='body.tablet-field-mode .workspace-shell{grid-template-columns:155px minmax(0,1fr) 300px!important;gap:8px!important;height:calc(100vh - 64px)!important;overflow:hidden!important}body.tablet-field-mode .sidebar{display:block!important;grid-column:1!important;overflow:hidden!important}body.tablet-field-mode .sidebar>*:not(#tabletProcedurePanel){display:none!important}#tabletProcedurePanel{display:none}body.tablet-field-mode #tabletProcedurePanel{display:block!important;margin:0!important;position:sticky;top:0;padding:10px!important}#tabletProcedurePanel h2{margin:0 0 9px;font-size:13px;color:#d1fae5}#tabletProcedurePanel .procedure-step{padding:8px 0;border-top:1px solid #263a34;font-size:11px;line-height:1.3;color:#cbd5e1}#tabletProcedurePanel .procedure-step strong{display:block;color:#6ee7b7;font-size:12px;margin-bottom:2px}body.tablet-field-mode .main-workspace{grid-column:2!important;height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch;padding-bottom:120px!important}body.tablet-field-mode .rightbar{grid-column:3!important;height:100%!important;max-height:none!important;min-height:0!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch;padding-bottom:120px!important}body.tablet-field-mode #photoStage,body.tablet-field-mode #photoOverlay,body.tablet-field-mode #wallPhoto{touch-action:none!important}body.tablet-field-mode .photo-stage,body.tablet-field-mode #wallPhoto{min-height:68vh!important;max-height:82vh!important}.pair-manual-controls{margin:8px 0;padding:9px;border:1px solid #245343;border-radius:10px;background:#0b1915}.pair-manual-tools{display:flex;gap:6px;flex-wrap:wrap}.pair-manual-tools button.active{background:#17d99a;color:#04120e}.pair-manual-status{font-size:11px;color:#a7f3d0;margin-top:7px;line-height:1.35}.pair-manual-overlay{position:absolute;inset:0;width:100%;height:100%;z-index:12;touch-action:none}.pair-entry-hidden{display:none!important}';
  document.head.appendChild(style);

  const sidebar=document.querySelector('.sidebar');
  if(sidebar&&!document.getElementById('tabletProcedurePanel')){
    const panel=document.createElement('section');panel.id='tabletProcedurePanel';panel.className='panel';
    panel.innerHTML='<h2>Procedure</h2><div class="procedure-step"><strong>1 · Photo</strong>Take a photo or choose one.</div><div class="procedure-step"><strong>2 · Scan</strong>Scan outline + sockets.</div><div class="procedure-step"><strong>3 · Edit</strong>Correct outline, sockets, notches and shapes.</div><div class="procedure-step"><strong>4 · Measure</strong>Widths first, then heights.</div>';
    sidebar.prepend(panel);
  }

  const oldStage=document.getElementById('photoStage');const scroller=document.querySelector('.main-workspace');
  if(oldStage&&scroller){
    const stage=oldStage.cloneNode(false);
    while(oldStage.firstChild)stage.appendChild(oldStage.firstChild);
    oldStage.replaceWith(stage);
    const photo=document.getElementById('wallPhoto');
    const insideRenderedPhoto=t=>{
      if(!photo||!photo.naturalWidth||!photo.naturalHeight)return false;
      const box=photo.getBoundingClientRect();
      const imageAspect=photo.naturalWidth/photo.naturalHeight;
      const boxAspect=box.width/box.height;
      let w,h,left,top;
      if(imageAspect>boxAspect){w=box.width;h=w/imageAspect;left=box.left;top=box.top+(box.height-h)/2;}
      else{h=box.height;w=h*imageAspect;top=box.top;left=box.left+(box.width-w)/2;}
      return t.clientX>=left&&t.clientX<=left+w&&t.clientY>=top&&t.clientY<=top+h;
    };
    let touch=null;
    stage.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];touch={startX:t.clientX,startY:t.clientY,lastY:t.clientY,scrolling:false,locked:insideRenderedPhoto(t)};},{capture:true,passive:true});
    stage.addEventListener('touchmove',e=>{if(!touch||e.touches.length!==1||touch.locked)return;const t=e.touches[0],dx=t.clientX-touch.startX,dy=t.clientY-touch.startY;if(!touch.scrolling){if(Math.abs(dy)<12||Math.abs(dy)<=Math.abs(dx))return;touch.scrolling=true;}const delta=t.clientY-touch.lastY;scroller.scrollTop-=delta;touch.lastY=t.clientY;e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});
    const finish=()=>{touch=null;};stage.addEventListener('touchend',finish,true);stage.addEventListener('touchcancel',finish,true);
  }

  const drawing=document.getElementById('drawingCanvas');const panel=document.getElementById('productionMeasurementPanel');const widthHost=document.getElementById('measurementSequence');const heightHost=document.getElementById('heightMeasurementSequence');
  if(drawing&&panel&&widthHost&&heightHost){
    document.querySelector('.manual-dim-controls')?.remove();document.querySelector('.manual-dim-overlay')?.remove();document.querySelector('.production-grid')?.classList.remove('manual-mode-hidden');
    widthHost.innerHTML='';heightHost.innerHTML='';localStorage.removeItem('splashcad-manual-stations-v1');
    const controls=document.createElement('div');controls.className='pair-manual-controls';
    controls.innerHTML='<div class="manual-dim-toggle"><button type="button" data-pair-mode="auto">Auto dimensions</button><button type="button" data-pair-mode="manual" class="active">Manual dimensions</button></div><div class="pair-manual-tools"><button type="button" data-pair-tool="width" class="active">1 · Touch all width pairs</button><button type="button" data-pair-tool="height">2 · Touch all height pairs</button><button type="button" data-pair-tool="enter">3 · Enter measurements</button><button type="button" data-pair-tool="delete">Delete last pair</button><button type="button" data-pair-tool="clear">Clear manual dims</button></div><div class="pair-manual-status">Width: touch point 1, then point 2 for each measurement. Add every width pair before heights.</div>';
    panel.querySelector('.help')?.insertAdjacentElement('afterend',controls);
    const wrap=drawing.closest('.manual-dim-wrap')||drawing.parentElement;wrap.style.position='relative';const overlay=document.createElement('canvas');overlay.className='pair-manual-overlay';wrap.appendChild(overlay);
    let tool='width',pending=null,widths=[],heights=[];const status=controls.querySelector('.pair-manual-status');
    const resize=()=>{const r=drawing.getBoundingClientRect(),d=window.devicePixelRatio||1;overlay.width=Math.round(r.width*d);overlay.height=Math.round(r.height*d);overlay.style.width=r.width+'px';overlay.style.height=r.height+'px';draw();};
    const point=e=>{const r=overlay.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};};
    const draw=()=>{const c=overlay.getContext('2d'),d=window.devicePixelRatio||1;c.clearRect(0,0,overlay.width,overlay.height);const groups=[['W',widths,'#16a34a'],['H',heights,'#0ea5e9']];groups.forEach(([prefix,list,col])=>list.forEach((p,i)=>{const a={x:p.a.x*overlay.width,y:p.a.y*overlay.height},b={x:p.b.x*overlay.width,y:p.b.y*overlay.height};c.strokeStyle=col;c.fillStyle=col;c.lineWidth=2*d;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();[a,b].forEach(q=>{c.beginPath();c.arc(q.x,q.y,5*d,0,Math.PI*2);c.fill();});c.font='800 '+(12*d)+'px sans-serif';c.fillText(prefix+(i+1),(a.x+b.x)/2+6*d,(a.y+b.y)/2-6*d);}));if(pending){const q={x:pending.x*overlay.width,y:pending.y*overlay.height};c.fillStyle='#f59e0b';c.beginPath();c.arc(q.x,q.y,7*d,0,Math.PI*2);c.fill();}};
    const update=()=>{const wp=widths.length,hp=heights.length;if(tool==='width')status.textContent='Widths: '+wp+' complete pair'+(wp===1?'':'s')+'. '+(pending?'Touch point 2 to complete this width.':'Touch point 1, then point 2.');else if(tool==='height')status.textContent='Heights: '+hp+' complete pair'+(hp===1?'':'s')+'. '+(pending?'Touch point 2 to complete this height.':'Touch point 1, then point 2.');else status.textContent='Ready to enter '+wp+' widths first, then '+hp+' heights.';};
    const rows=()=>{widthHost.innerHTML=widths.map((p,i)=>'<div class="measure-sequence-row"><div class="measure-seq-no">'+(i+1)+'</div><div class="measure-seq-label">Width '+(i+1)+'</div><input class="measure-seq-input pair-measure-input" data-w="'+i+'" inputmode="decimal" placeholder="mm"></div>').join('');heightHost.innerHTML=heights.map((p,i)=>'<div class="measure-sequence-row"><div class="measure-seq-no">'+(i+1)+'</div><div class="measure-seq-label">Height '+(i+1)+'</div><input class="height-seq-input pair-measure-input" data-h="'+i+'" inputmode="decimal" placeholder="mm"></div>').join('');const inputs=[...panel.querySelectorAll('.pair-measure-input')];inputs.forEach((input,i)=>input.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();if(inputs[i+1])inputs[i+1].focus();else input.blur();}));};
    overlay.addEventListener('pointerdown',e=>{if(tool!=='width'&&tool!=='height')return;e.preventDefault();e.stopPropagation();const p=point(e);if(!pending){pending=p;draw();update();return;}const rec={a:pending,b:p,value:null};if(tool==='width')widths.push(rec);else heights.push(rec);pending=null;draw();update();});
    controls.querySelectorAll('[data-pair-tool]').forEach(b=>b.addEventListener('click',()=>{const next=b.dataset.pairTool;if(next==='delete'){pending=null;if(tool==='height'&&heights.length)heights.pop();else if(tool==='width'&&widths.length)widths.pop();else if(heights.length)heights.pop();else widths.pop();draw();update();return;}if(next==='clear'){pending=null;widths=[];heights=[];widthHost.innerHTML='';heightHost.innerHTML='';draw();update();return;}if(next==='enter'){pending=null;tool='enter';controls.querySelectorAll('[data-pair-tool]').forEach(x=>x.classList.remove('active'));rows();update();panel.querySelector('.pair-measure-input')?.focus();return;}pending=null;tool=next;controls.querySelectorAll('[data-pair-tool]').forEach(x=>x.classList.toggle('active',x===b));update();draw();}));
    controls.querySelector('[data-pair-mode="auto"]').addEventListener('click',()=>location.reload());
    window.addEventListener('resize',resize);new ResizeObserver(resize).observe(drawing);setTimeout(resize,100);update();
  }
})();
`;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).pathname.startsWith('/api/'))return;
  const url=new URL(event.request.url);
  if(url.pathname==='/tablet.js'){
    event.respondWith(fetch(event.request).then(async response=>{const text=(await response.text()).replaceAll('UPDATE 006','UPDATE 012')+TABLET_PATCH;const fixed=new Response(text,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}});const copy=fixed.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return fixed;}).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('/index.html'))));
});