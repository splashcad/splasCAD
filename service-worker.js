const CACHE='splashcad-6-0-22-u026-locked-auto-fitting-recovery-20260817181500';
const CORE=['/','/index.html','/hob.html','/window.html','/styles.css','/splashcad-app.js','/window-wall.js','/voice.js','/tablet.js','/manifest.webmanifest','/splashcad-icon.svg'];

const TABLET_PATCH=`
;(()=>{
  const BUILD='ALPHA 6.0.22 · UPDATE 026';
  document.title='SplashCAD — '+BUILD;
  const proof=document.querySelector('.alpha-proof'); if(proof) proof.textContent=BUILD;
  const brand=document.querySelector('.brand p'); if(brand) brand.textContent=BUILD+' · Locked Detection + Dimension Engine V2';

  const style=document.createElement('style');
  style.textContent='body.tablet-field-mode .workspace-shell{grid-template-columns:155px minmax(0,1fr) 300px!important;gap:8px!important;height:calc(100vh - 64px)!important;overflow:hidden!important}body.tablet-field-mode .sidebar{display:block!important;grid-column:1!important;overflow:hidden!important}body.tablet-field-mode .sidebar>*:not(#tabletProcedurePanel){display:none!important}#tabletProcedurePanel{display:none}body.tablet-field-mode #tabletProcedurePanel{display:block!important;margin:0!important;position:sticky;top:0;padding:10px!important}#tabletProcedurePanel h2{margin:0 0 9px;font-size:13px;color:#d1fae5}#tabletProcedurePanel .procedure-step{padding:8px 0;border-top:1px solid #263a34;font-size:11px;line-height:1.3;color:#cbd5e1}#tabletProcedurePanel .procedure-step strong{display:block;color:#6ee7b7;font-size:12px;margin-bottom:2px}body.tablet-field-mode .main-workspace{grid-column:2!important;height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch;padding-bottom:120px!important}body.tablet-field-mode .rightbar{grid-column:3!important;height:100%!important;max-height:none!important;min-height:0!important;overflow-y:auto!important;overscroll-behavior-y:contain!important;-webkit-overflow-scrolling:touch;padding-bottom:120px!important}body.tablet-field-mode #photoOverlay{touch-action:none!important}body.tablet-field-mode .photo-stage,body.tablet-field-mode #wallPhoto{min-height:68vh!important;max-height:82vh!important}';
  document.head.appendChild(style);

  const sidebar=document.querySelector('.sidebar');
  if(sidebar&&!document.getElementById('tabletProcedurePanel')){
    const panel=document.createElement('section');
    panel.id='tabletProcedurePanel';
    panel.className='panel';
    panel.innerHTML='<h2>Procedure</h2><div class="procedure-step"><strong>1 · Photo</strong>Take a photo or choose one.</div><div class="procedure-step"><strong>2 · Scan</strong>Scan outline + sockets.</div><div class="procedure-step"><strong>3 · Edit</strong>Correct outline, sockets, notches and shapes.</div><div class="procedure-step"><strong>4 · Measure</strong>Widths first, then heights.</div>';
    sidebar.prepend(panel);
  }

  // Manual Dimensions remains isolated from the locked automatic workflow.
  document.querySelectorAll('.edge-manual-controls,.edge-manual-overlay,.manual-dim-controls,.manual-dim-overlay,.pair-manual-controls,.pair-manual-overlay,.height-layout-overlay,.witness-measure-overlay').forEach(el=>el.remove());
  document.querySelector('.production-grid')?.classList.remove('manual-mode-hidden');
  ['splashcad-manual-stations-v1','splashcad-manual-dimensions-v2','splashcad-manual-dimensions-v3','splashcad-manual-dimensions-v4'].forEach(k=>localStorage.removeItem(k));

  // Preserve proven tablet centre-column scrolling.
  const overlay=document.getElementById('photoOverlay');
  const scroller=document.querySelector('.main-workspace');
  if(overlay&&scroller){
    let gesture=null;
    overlay.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;gesture={id:e.pointerId,startY:e.clientY,lastY:e.clientY,scrolling:false};},true);
    overlay.addEventListener('pointermove',e=>{
      if(!gesture||gesture.id!==e.pointerId||e.pointerType!=='touch')return;
      const total=e.clientY-gesture.startY,delta=e.clientY-gesture.lastY;
      if(!gesture.scrolling&&Math.abs(total)>10)gesture.scrolling=true;
      if(!gesture.scrolling)return;
      scroller.scrollTop-=delta;
      gesture.lastY=e.clientY;
      e.preventDefault();
      e.stopImmediatePropagation();
    },{capture:true,passive:false});
    const end=e=>{if(gesture&&gesture.id===e.pointerId)gesture=null;};
    overlay.addEventListener('pointerup',end,true);
    overlay.addEventListener('pointercancel',end,true);
  }
})();
`;

const patchSplashcadApp=(source)=>{
  // LOCK 1 — automatic width recovery. Add no more than one truly unmatched
  // internal vertical transition. This preserves the recovered 10-width benchmark
  // and prevents the old 13-width regression.
  source=source.replace(
    '    return raw.map((f,i)=>({...f,seq:i+1,key:widthFeatureKey(f)}));',
    `    if(state.shoulderNotchesEnabled && raw.length<10){\n      const pts2=state.points||[];\n      const xs2=pts2.map(p=>Number(p.x)).filter(Number.isFinite);\n      if(pts2.length>=3 && xs2.length){\n        const minX2=Math.min(...xs2),maxX2=Math.max(...xs2);\n        const candidates2=[];\n        for(let i=0;i<pts2.length;i++){\n          const a=pts2[i],b=pts2[(i+1)%pts2.length];\n          if(!a||!b)continue;\n          const ax=Number(a.x),ay=Number(a.y),bx=Number(b.x),by=Number(b.y);\n          if(![ax,ay,bx,by].every(Number.isFinite))continue;\n          const dx=Math.abs(bx-ax),dy=Math.abs(by-ay);\n          if(!(dy>8 && dx<=Math.max(4,dy*.16)))continue;\n          const x=(ax+bx)/2;\n          if(Math.abs(x-minX2)<8||Math.abs(x-maxX2)<8)continue;\n          const nearest=Math.min(...raw.map(f=>Math.abs(Number(f.x)-x)).filter(Number.isFinite),Infinity);\n          if(nearest<8)continue;\n          candidates2.push({type:'outline-x',segmentIndex:i,x,nearest});\n        }\n        candidates2.sort((a,b)=>b.nearest-a.nearest);\n        if(candidates2[0])raw.push(candidates2[0]);\n      }\n    }\n    return raw.map((f,i)=>({...f,seq:i+1,key:widthFeatureKey(f)}));`
  );

  // LOCK 2 — standard faceplates always begin from the approved real sizes.
  // Detection rectangle size is photo-only. It must never become CAD geometry.
  source=source.replace(
    /const fittingFaceplateSize = \(socket\) => \{[\s\S]*?\n  \};/,
    `const fittingFaceplateSize = (socket) => {\n    const spec = cutoutSpec(socket);\n    if(socket?.type === "hole") {\n      const diameter = Number(socket.editDiameter) > 0 ? Number(socket.editDiameter) : spec.width;\n      return { width: diameter, height: diameter };\n    }\n    const variable = ["multiple","custom"].includes(socket?.type);\n    const explicitlyEdited = Boolean(socket?._sizeEdited);\n    const useEdit = variable || explicitlyEdited;\n    const width = useEdit && Number(socket.editWidth) > 0 ? Number(socket.editWidth) : spec.width;\n    const height = useEdit && Number(socket.editHeight) > 0 ? Number(socket.editHeight) : spec.height;\n    return { width, height };\n  };`
  );

  // Socket edit is the ONLY way a standard fitting becomes a non-standard size.
  source=source.replace(
    '    state.sockets[i].editWidth = w;\n    state.sockets[i].editHeight = h;',
    '    state.sockets[i].editWidth = w;\n    state.sockets[i].editHeight = h;\n    state.sockets[i]._sizeEdited = true;'
  );

  // Route every drawing calculation through the locked faceplate-size helper.
  source=source.replaceAll(
    'const measuredW=Number(socket.editWidth)>0?Number(socket.editWidth):spec.width;',
    'const measuredW=fittingFaceplateSize(socket).width;'
  );
  source=source.replaceAll(
    'const measuredH=Number(socket.editHeight)>0?Number(socket.editHeight):spec.height;',
    'const measuredH=fittingFaceplateSize(socket).height;'
  );
  source=source.replaceAll(
    'const measuredW = Number(socket.editWidth) > 0 ? Number(socket.editWidth) : spec.width;',
    'const measuredW = fittingFaceplateSize(socket).width;'
  );
  source=source.replaceAll(
    'const measuredH = Number(socket.editHeight) > 0 ? Number(socket.editHeight) : spec.height;',
    'const measuredH = fittingFaceplateSize(socket).height;'
  );

  // Width/height fitting anchors use the same entered-mm scale as the fitting box.
  source=source.replace(
    'const drawW=(vertical?measuredH:measuredW)*effectiveScale;',
    'const drawW=(vertical?measuredH:measuredW)*(drawingWidthPx/Math.max(W,1));'
  );
  source=source.replace(
    'const drawH=(vertical?measuredW:measuredH)*effectiveScale;',
    'const drawH=(vertical?measuredW:measuredH)*(drawingWidthPx/Math.max(W,1));'
  );

  // LOCK 3 — fitting CAD boxes are compact and keep the true faceplate aspect ratio.
  // One uniform mm scale is used for width and height, based on entered overall width.
  source=source.replace(
    '      const drawWidth = (useVertical ? editH : editW) * effectiveScale;\n      const drawHeight = (useVertical ? editW : editH) * effectiveScale;',
    `      const fittingReferenceWidth = Number(productionOnly && state.productionModificationsApplied\n        ? state.productionAdjustedMeasurements?.overallWidth\n        : state.productionMeasurements?.overallWidth) || Number($("widthInput")?.value) || Math.max(1,maxX-minX);\n      const drawingWidthPx = Math.max(1,(maxX-minX)*effectiveScale);\n      const trueScale = drawingWidthPx / Math.max(1,fittingReferenceWidth);\n      const readableScale = Math.max(trueScale,0.14);\n      const fittingScale = Math.min(readableScale,0.24);\n      const drawWidth = (useVertical ? editH : editW) * fittingScale;\n      const drawHeight = (useVertical ? editW : editH) * fittingScale;`
  );

  return source;
};

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).pathname.startsWith('/api/'))return;
  const url=new URL(event.request.url);

  if(url.pathname==='/tablet.js'){
    event.respondWith(fetch(event.request).then(async response=>{
      const text=(await response.text()).replaceAll('UPDATE 006','UPDATE 026')+TABLET_PATCH;
      const fixed=new Response(text,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}});
      const copy=fixed.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return fixed;
    }).catch(()=>caches.match(event.request)));
    return;
  }

  if(url.pathname==='/splashcad-app.js'){
    event.respondWith(fetch(event.request).then(async response=>{
      const text=patchSplashcadApp(await response.text());
      const fixed=new Response(text,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}});
      const copy=fixed.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return fixed;
    }).catch(()=>caches.match(event.request)));
    return;
  }

  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('/index.html')))
  );
});
