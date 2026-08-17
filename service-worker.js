const CACHE='splashcad-6-0-22-u025-width-fitting-recovery-20260817174500';
const CORE=['/','/index.html','/hob.html','/window.html','/styles.css','/splashcad-app.js','/window-wall.js','/voice.js','/tablet.js','/manifest.webmanifest','/splashcad-icon.svg'];
const TABLET_PATCH=`
;(()=>{
  const BUILD='ALPHA 6.0.22 · UPDATE 025';
  document.title='SplashCAD — '+BUILD;
  const proof=document.querySelector('.alpha-proof'); if(proof) proof.textContent=BUILD;
  const brand=document.querySelector('.brand p'); if(brand) brand.textContent=BUILD+' · Locked Detection + Dimension Engine V2';
  const style=document.createElement('style');
  style.textContent='body.tablet-field-mode .workspace-shell{grid-template-columns:155px minmax(0,1fr) 300px!important;gap:8px!important;height:calc(100vh - 64px)!important;overflow:hidden!important}body.tablet-field-mode .sidebar{display:block!important;grid-column:1!important;overflow:hidden!important}body.tablet-field-mode .sidebar>*:not(#tabletProcedurePanel){display:none!important}#tabletProcedurePanel{display:none}body.tablet-field-mode #tabletProcedurePanel{display:block!important;margin:0!important;position:sticky;top:0;padding:10px!important}#tabletProcedurePanel h2{margin:0 0 9px;font-size:13px;color:#d1fae5}#tabletProcedurePanel .procedure-step{padding:8px 0;border-top:1px solid #263a34;font-size:11px;line-height:1.3;color:#cbd5e1}#tabletProcedurePanel .procedure-step strong{display:block;color:#6ee7b7;font-size:12px;margin-bottom:2px}body.tablet-field-mode .main-workspace{grid-column:2!important;height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch;padding-bottom:120px!important}body.tablet-field-mode .rightbar{grid-column:3!important;height:100%!important;max-height:none!important;min-height:0!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch;padding-bottom:120px!important}body.tablet-field-mode #photoOverlay{touch-action:none!important}body.tablet-field-mode .photo-stage,body.tablet-field-mode #wallPhoto{min-height:68vh!important;max-height:82vh!important}';
  document.head.appendChild(style);
  const sidebar=document.querySelector('.sidebar');
  if(sidebar&&!document.getElementById('tabletProcedurePanel')){const panel=document.createElement('section');panel.id='tabletProcedurePanel';panel.className='panel';panel.innerHTML='<h2>Procedure</h2><div class="procedure-step"><strong>1 · Photo</strong>Take a photo or choose one.</div><div class="procedure-step"><strong>2 · Scan</strong>Scan outline + sockets.</div><div class="procedure-step"><strong>3 · Edit</strong>Correct outline, sockets, notches and shapes.</div><div class="procedure-step"><strong>4 · Measure</strong>Widths first, then heights.</div>';sidebar.prepend(panel);}
  document.querySelectorAll('.edge-manual-controls,.edge-manual-overlay,.manual-dim-controls,.manual-dim-overlay,.pair-manual-controls,.pair-manual-overlay,.height-layout-overlay,.witness-measure-overlay').forEach(el=>el.remove());
  document.querySelector('.production-grid')?.classList.remove('manual-mode-hidden');
  ['splashcad-manual-stations-v1','splashcad-manual-dimensions-v2','splashcad-manual-dimensions-v3','splashcad-manual-dimensions-v4'].forEach(k=>localStorage.removeItem(k));
  const overlay=document.getElementById('photoOverlay'),scroller=document.querySelector('.main-workspace');
  if(overlay&&scroller){let gesture=null;overlay.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;gesture={id:e.pointerId,startY:e.clientY,lastY:e.clientY,scrolling:false};},true);overlay.addEventListener('pointermove',e=>{if(!gesture||gesture.id!==e.pointerId||e.pointerType!=='touch')return;const total=e.clientY-gesture.startY,delta=e.clientY-gesture.lastY;if(!gesture.scrolling&&Math.abs(total)>10)gesture.scrolling=true;if(!gesture.scrolling)return;scroller.scrollTop-=delta;gesture.lastY=e.clientY;e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});const end=e=>{if(gesture&&gesture.id===e.pointerId)gesture=null;};overlay.addEventListener('pointerup',end,true);overlay.addEventListener('pointercancel',end,true);}
})();
`;
const patchSplashcadApp=(source)=>{
  source=source.replace(
    '    return raw.map((f,i)=>({...f,seq:i+1,key:widthFeatureKey(f)}));',
    `    // UPDATE 025 — recovery rule: add at most ONE genuinely unmatched internal\n    // vertical transition. UPDATE 001 force-added every transition and inflated\n    // this benchmark from the approved 10 widths to 13.\n    if(state.shoulderNotchesEnabled && raw.length<10){\n      const pts2=state.points||[];\n      const xs2=pts2.map(p=>Number(p.x)).filter(Number.isFinite);\n      if(pts2.length>=3 && xs2.length){\n        const minX2=Math.min(...xs2),maxX2=Math.max(...xs2);\n        const candidates2=[];\n        for(let i=0;i<pts2.length;i++){\n          const a=pts2[i],b=pts2[(i+1)%pts2.length];\n          if(!a||!b)continue;\n          const ax=Number(a.x),ay=Number(a.y),bx=Number(b.x),by=Number(b.y);\n          if(![ax,ay,bx,by].every(Number.isFinite))continue;\n          const dx=Math.abs(bx-ax),dy=Math.abs(by-ay);\n          if(!(dy>8 && dx<=Math.max(4,dy*.16)))continue;\n          const x=(ax+bx)/2;\n          if(Math.abs(x-minX2)<8||Math.abs(x-maxX2)<8)continue;\n          const nearest=Math.min(...raw.map(f=>Math.abs(Number(f.x)-x)).filter(Number.isFinite),Infinity);\n          if(nearest<8)continue;\n          candidates2.push({type:'outline-x',segmentIndex:i,x,nearest});\n        }\n        candidates2.sort((a,b)=>b.nearest-a.nearest);\n        if(candidates2[0])raw.push(candidates2[0]);\n      }\n    }\n\n    return raw.map((f,i)=>({...f,seq:i+1,key:widthFeatureKey(f)}));`
  );
  source=source.replace(
    '      const drawWidth = (useVertical ? editH : editW) * effectiveScale;\n      const drawHeight = (useVertical ? editW : editH) * effectiveScale;',
    `      // UPDATE 025 — fittings are real millimetre objects. Do not multiply\n      // their mm sizes by the photo-outline pixel scale. Scale them against the\n      // job/entered dimensions so 145x85, 85x85 and 85x145 stay proportional.\n      const fittingReferenceWidth = Number(productionOnly && state.productionModificationsApplied ? state.productionAdjustedMeasurements?.overallWidth : state.productionMeasurements?.overallWidth) || Number($("widthInput")?.value) || Math.max(1,maxX-minX);\n      const fittingHeightValues = (productionOnly && state.productionModificationsApplied ? (state.productionAdjustedMeasurements?.heights||[]) : (state.productionMeasurements?.heights||[]).map(item=>Number(item?.value))).map(Number).filter(v=>v>0);\n      const fittingReferenceHeight = Math.max(...fittingHeightValues, Number($("heightInput")?.value)||0, 1);\n      const fittingScaleX = ((maxX-minX)*effectiveScale) / fittingReferenceWidth;\n      const fittingScaleY = ((maxY-minY)*effectiveScale) / fittingReferenceHeight;\n      const drawWidth = (useVertical ? editH : editW) * fittingScaleX;\n      const drawHeight = (useVertical ? editW : editH) * fittingScaleY;`
  );
  return source;
};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).pathname.startsWith('/api/'))return;
  const url=new URL(event.request.url);
  if(url.pathname==='/tablet.js'){
    event.respondWith(fetch(event.request).then(async response=>{const text=(await response.text()).replaceAll('UPDATE 006','UPDATE 025')+TABLET_PATCH;const fixed=new Response(text,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}});const copy=fixed.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return fixed;}).catch(()=>caches.match(event.request)));
    return;
  }
  if(url.pathname==='/splashcad-app.js'){
    event.respondWith(fetch(event.request).then(async response=>{const text=patchSplashcadApp(await response.text());const fixed=new Response(text,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}});const copy=fixed.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return fixed;}).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('/index.html'))));
});