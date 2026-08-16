(() => {
  const BUILD_LABEL='ALPHA 6.0.22 · UPDATE 004';
  const button=document.getElementById('tabletModeButton');
  const key='splashcad-tablet-field-mode';

  document.title=`SplashCAD — ${BUILD_LABEL}`;
  const proof=document.querySelector('.alpha-proof');
  if(proof) proof.textContent=BUILD_LABEL;
  const brandLine=document.querySelector('.brand p');
  if(brandLine) brandLine.textContent=`${BUILD_LABEL} · Locked Detection + Dimension Engine V2`;

  const apply=active=>{
    document.body.classList.toggle('tablet-field-mode',active);
    if(button)button.textContent=active?'Exit field view':'Tablet field view';
    localStorage.setItem(key,active?'1':'0');
    setTimeout(()=>window.dispatchEvent(new Event('resize')),80);
  };
  if(button){
    apply(localStorage.getItem(key)==='1');
    button.addEventListener('click',()=>apply(!document.body.classList.contains('tablet-field-mode')));
  }

  const tabletChoosePhotoButton=document.getElementById('tabletChoosePhotoButton');
  const tabletTakePhotoButton=document.getElementById('tabletTakePhotoButton');
  const tabletScanButton=document.getElementById('tabletScanButton');
  const libraryInput=document.getElementById('libraryInput');
  const cameraInput=document.getElementById('cameraInput');
  const oneClickDetectButton=document.getElementById('oneClickDetectButton');
  if(tabletChoosePhotoButton){
    tabletChoosePhotoButton.addEventListener('click',()=>{(libraryInput||cameraInput)?.click();});
    const showPhotoLoading=()=>{
      tabletChoosePhotoButton.disabled=true;
      tabletChoosePhotoButton.textContent='Loading photo…';
      tabletChoosePhotoButton.classList.add('scan-working');
    };
    const finishPhotoLoading=()=>{
      tabletChoosePhotoButton.disabled=false;
      tabletChoosePhotoButton.textContent='Choose / change photo';
      tabletChoosePhotoButton.classList.remove('scan-working');
    };
    libraryInput?.addEventListener('change',()=>{
      if(!libraryInput.files?.length)return;
      showPhotoLoading();
      const started=Date.now();
      const timer=setInterval(()=>{
        const photo=document.getElementById('wallPhoto');
        if((photo?.complete&&photo?.naturalWidth>0&&Date.now()-started>500)||Date.now()-started>60000){clearInterval(timer);finishPhotoLoading();}
      },200);
    });
  }

  if(tabletTakePhotoButton){
    tabletTakePhotoButton.addEventListener('click',async()=>{
      if(!navigator.mediaDevices?.getUserMedia){if(cameraInput){cameraInput.accept='image/jpeg';cameraInput.click();}return;}
      let stream;
      const overlay=document.createElement('div');
      overlay.className='tablet-camera-overlay';
      overlay.innerHTML=`<div class="tablet-camera-panel"><video autoplay playsinline muted></video><div class="tablet-camera-actions"><button type="button" class="secondary" data-camera-cancel>Cancel</button><button type="button" class="primary" data-camera-capture>Use photo</button></div></div>`;
      document.body.appendChild(overlay);
      const video=overlay.querySelector('video');
      const close=()=>{try{stream?.getTracks().forEach(t=>t.stop())}catch{}overlay.remove()};
      overlay.querySelector('[data-camera-cancel]').addEventListener('click',close);
      try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=stream;await video.play();}
      catch(error){close();if(cameraInput){cameraInput.accept='image/jpeg';cameraInput.click();}return;}
      overlay.querySelector('[data-camera-capture]').addEventListener('click',()=>{
        const width=video.videoWidth||1920,height=video.videoHeight||1080;
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,width,height);
        canvas.toBlob(blob=>{
          if(!blob){close();return;}
          const file=new File([blob],`SplashCAD_${Date.now()}.jpg`,{type:'image/jpeg'});
          try{const dt=new DataTransfer();dt.items.add(file);cameraInput.files=dt.files;cameraInput.dispatchEvent(new Event('change',{bubbles:true}));}
          catch{const reader=new FileReader();reader.onload=()=>{const photo=document.getElementById('wallPhoto');if(photo)photo.src=String(reader.result||'');};reader.readAsDataURL(file);}
          close();
        },'image/jpeg',0.92);
      });
    });
  }

  if(tabletScanButton){
    tabletScanButton.addEventListener('click',()=>{
      if(!oneClickDetectButton)return;
      const originalText='Scan outline + sockets';
      tabletScanButton.disabled=true;tabletScanButton.textContent='Scanning… please wait';tabletScanButton.classList.add('scan-working');
      oneClickDetectButton.click();
      const started=Date.now();
      const timer=setInterval(()=>{
        const edgeButton=document.getElementById('detectEdgesButton');
        const fittingButton=document.getElementById('detectFittingsButton');
        const working=edgeButton?.disabled||fittingButton?.disabled;
        if((!working&&Date.now()-started>1500)||Date.now()-started>90000){
          clearInterval(timer);tabletScanButton.disabled=false;tabletScanButton.textContent=originalText;tabletScanButton.classList.remove('scan-working');
        }
      },250);
    });
  }

  /* MANUAL DIMENSIONS — UPDATE 004
     Point capture first: all widths, then all heights.
     Measurement entry starts only after point capture is complete.
     Scan/detection and edited outline are untouched. */
  const drawingCanvas=document.getElementById('drawingCanvas');
  const productionPanel=document.getElementById('productionMeasurementPanel');
  const autoWidthSeq=document.getElementById('measurementSequence');
  const autoHeightSeq=document.getElementById('heightMeasurementSequence');
  const directionBlock=document.querySelector('.measure-direction');
  const productionGrid=document.querySelector('.production-grid');
  const countBadge=document.getElementById('measurementCountBadge');
  const prodStatus=document.getElementById('productionMeasurementStatus');

  if(drawingCanvas&&productionPanel){
    const style=document.createElement('style');
    style.textContent=`
      .manual-dim-controls{margin:10px 0 12px;padding:10px;border:1px solid rgba(118,255,197,.28);border-radius:10px;background:rgba(8,22,18,.55)}
      .manual-dim-toggle,.manual-dim-tools{display:flex;gap:7px;flex-wrap:wrap}
      .manual-dim-toggle button,.manual-dim-tools button{min-height:38px;padding:8px 11px}
      .manual-dim-controls button.active{background:#17d99a;color:#04120e;border-color:#17d99a}
      .manual-dim-help,.manual-dim-status{font-size:12px;opacity:.86;margin:8px 0 0}
      .manual-dim-entry{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:9px;align-items:end}
      .manual-dim-entry label{font-size:12px}.manual-dim-entry input{width:100%}
      .manual-dim-entry[hidden]{display:none!important}
      .manual-dim-overlay{position:absolute;inset:0;width:100%;height:100%;z-index:8;touch-action:none;user-select:none;-webkit-user-select:none}
      .manual-dim-wrap{position:relative}.manual-mode-hidden{display:none!important}
    `;
    document.head.appendChild(style);

    const controls=document.createElement('div');
    controls.className='manual-dim-controls';
    controls.innerHTML=`
      <div class="manual-dim-toggle">
        <button type="button" data-dim-mode="auto" class="active">Auto dimensions</button>
        <button type="button" data-dim-mode="manual">Manual dimensions</button>
      </div>
      <div class="manual-dim-tools" hidden>
        <button type="button" data-manual-tool="width">1 · Touch all width points</button>
        <button type="button" data-manual-tool="height">2 · Touch all height points</button>
        <button type="button" data-manual-tool="measure">3 · Enter measurements</button>
        <button type="button" data-manual-tool="delete">Delete last pair</button>
        <button type="button" data-manual-tool="clear">Clear manual dims</button>
      </div>
      <div class="manual-dim-status" hidden></div>
      <div class="manual-dim-entry" hidden>
        <label><span data-entry-label>Measurement mm</span><input data-manual-value type="number" inputmode="decimal" min="0" step="1" placeholder="Enter measurement"></label>
        <button type="button" data-manual-apply>Next</button>
      </div>
      <div class="manual-dim-help">Touch every width pair first. Then touch every height pair. When all points are placed, press Enter measurements. SplashCAD asks for all widths first, then all heights.</div>`;
    productionPanel.querySelector('.help')?.insertAdjacentElement('afterend',controls);

    const toolbar=controls.querySelector('.manual-dim-tools');
    const status=controls.querySelector('.manual-dim-status');
    const entry=controls.querySelector('.manual-dim-entry');
    const entryLabel=controls.querySelector('[data-entry-label]');
    const valueInput=controls.querySelector('[data-manual-value]');
    const applyValue=controls.querySelector('[data-manual-apply]');
    const autoButton=controls.querySelector('[data-dim-mode="auto"]');
    const manualButton=controls.querySelector('[data-dim-mode="manual"]');

    const wrap=document.createElement('div');wrap.className='manual-dim-wrap';
    drawingCanvas.parentNode.insertBefore(wrap,drawingCanvas);wrap.appendChild(drawingCanvas);
    const overlay=document.createElement('canvas');overlay.className='manual-dim-overlay';wrap.appendChild(overlay);overlay.hidden=true;

    const storageKey='splashcad-manual-dimensions-v3';
    let manualActive=false,tool=null,pending=null,entryIndex=-1;
    let dimensions=[];
    try{dimensions=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(dimensions))dimensions=[];}catch{dimensions=[];}
    const save=()=>localStorage.setItem(storageKey,JSON.stringify(dimensions));
    const widths=()=>dimensions.filter(d=>d.type==='width');
    const heights=()=>dimensions.filter(d=>d.type==='height');
    const entryOrder=()=>[...widths(),...heights()];

    const resizeOverlay=()=>{
      const r=drawingCanvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1);
      overlay.width=Math.max(1,Math.round(r.width*dpr));overlay.height=Math.max(1,Math.round(r.height*dpr));
      overlay.style.width=`${r.width}px`;overlay.style.height=`${r.height}px`;draw();
    };
    const pointFromEvent=e=>{const r=overlay.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};};
    const toPx=p=>({x:p.x*overlay.width,y:p.y*overlay.height});
    const drawArrow=(ctx,x,y,angle)=>{
      const dpr=Math.max(1,window.devicePixelRatio||1),size=9*dpr;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-size*Math.cos(angle-.45),y-size*Math.sin(angle-.45));ctx.moveTo(x,y);ctx.lineTo(x-size*Math.cos(angle+.45),y-size*Math.sin(angle+.45));ctx.stroke();
    };

    function draw(){
      const ctx=overlay.getContext('2d');ctx.clearRect(0,0,overlay.width,overlay.height);if(!manualActive)return;
      const dpr=Math.max(1,window.devicePixelRatio||1),red='#d84b4b';
      ctx.lineWidth=1.5*dpr;ctx.font=`${13*dpr}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      let wi=0,hi=0;
      dimensions.forEach(d=>{
        const a=toPx(d.p1),b=toPx(d.p2),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        let a2={...a},b2={...b},label={...mid};
        ctx.strokeStyle=red;ctx.fillStyle=red;ctx.setLineDash([4*dpr,4*dpr]);
        if(d.type==='width'){
          wi++;const y=Math.min(a.y,b.y)-(28+((wi-1)%4)*18)*dpr;a2.y=y;b2.y=y;label.y=y-12*dpr;
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x,y);ctx.moveTo(b.x,b.y);ctx.lineTo(b.x,y);ctx.stroke();
        }else{
          hi++;const x=Math.max(a.x,b.x)+(30+((hi-1)%4)*18)*dpr;a2.x=x;b2.x=x;label.x=x+24*dpr;
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(x,a.y);ctx.moveTo(b.x,b.y);ctx.lineTo(x,b.y);ctx.stroke();
        }
        ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(a2.x,a2.y);ctx.lineTo(b2.x,b2.y);ctx.stroke();
        const angle=Math.atan2(b2.y-a2.y,b2.x-a2.x);drawArrow(ctx,a2.x,a2.y,angle+Math.PI);drawArrow(ctx,b2.x,b2.y,angle);
        const n=d.type==='width'?widths().indexOf(d)+1:heights().indexOf(d)+1;
        ctx.fillText(d.value?`${d.value} mm`:`${d.type==='width'?'W':'H'}${n}`,label.x,label.y);
      });
      if(pending){const p=toPx(pending);ctx.fillStyle='#17d99a';ctx.beginPath();ctx.arc(p.x,p.y,7*dpr,0,Math.PI*2);ctx.fill();}
    }

    const refreshStatus=()=>{
      if(!manualActive){status.hidden=true;return;}
      status.hidden=false;
      const w=widths().length,h=heights().length;
      if(entryIndex>=0){const order=entryOrder(),d=order[entryIndex];status.textContent=d?`Entering measurements: ${entryIndex+1} of ${order.length}`:'Measurements complete';}
      else if(tool==='width')status.textContent=`Width pairs captured: ${w}. Keep touching width points.`;
      else if(tool==='height')status.textContent=`Width pairs: ${w} · Height pairs captured: ${h}. Keep touching height points.`;
      else status.textContent=`Width pairs: ${w} · Height pairs: ${h}.`;
    };
    const setTool=next=>{
      tool=next;pending=null;entryIndex=-1;entry.hidden=true;valueInput.value='';
      toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.classList.toggle('active',b.dataset.manualTool===tool));refreshStatus();draw();
    };
    const setManual=active=>{
      manualActive=active;autoButton.classList.toggle('active',!active);manualButton.classList.toggle('active',active);toolbar.hidden=!active;overlay.hidden=!active;
      [autoWidthSeq,autoHeightSeq,directionBlock,productionGrid,countBadge?.closest('.measure-group-title')].forEach(el=>el?.classList.toggle('manual-mode-hidden',active));
      if(prodStatus)prodStatus.textContent=active?'MANUAL DIMENSIONS — capture all points first, then enter widths followed by heights.':'Measurement count is calculated from the edited splashback.';
      if(!active){tool=null;pending=null;entryIndex=-1;entry.hidden=true;}refreshStatus();setTimeout(resizeOverlay,50);
    };

    controls.querySelectorAll('[data-dim-mode]').forEach(b=>b.addEventListener('click',()=>setManual(b.dataset.dimMode==='manual')));
    toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.addEventListener('click',()=>{
      const next=b.dataset.manualTool;
      if(next==='delete'){
        if(dimensions.length){dimensions.pop();save();}pending=null;entryIndex=-1;entry.hidden=true;refreshStatus();draw();return;
      }
      if(next==='clear'){
        if(dimensions.length&&confirm('Clear all manually placed dimensions?')){dimensions=[];save();}pending=null;entryIndex=-1;entry.hidden=true;refreshStatus();draw();return;
      }
      if(next==='measure'){
        const order=entryOrder();
        if(!order.length)return;
        entryIndex=0;tool=null;pending=null;toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.classList.remove('active'));
        const d=order[0],number=d.type==='width'?1:1;entryLabel.textContent=`${d.type==='width'?'Width':'Height'} ${number} mm`;
        valueInput.value=d.value||'';entry.hidden=false;refreshStatus();setTimeout(()=>valueInput.focus(),30);return;
      }
      setTool(next);
    }));

    const advanceEntry=()=>{
      const order=entryOrder();if(entryIndex<0||entryIndex>=order.length)return;
      const d=order[entryIndex],v=Number(valueInput.value);if(!Number.isFinite(v)||v<=0){valueInput.focus();return;}
      d.value=Math.round(v*10)/10;save();draw();entryIndex++;
      if(entryIndex>=order.length){entryIndex=-1;entry.hidden=true;valueInput.value='';refreshStatus();return;}
      const next=order[entryIndex];
      const sameTypeBefore=order.slice(0,entryIndex).filter(x=>x.type===next.type).length;
      entryLabel.textContent=`${next.type==='width'?'Width':'Height'} ${sameTypeBefore+1} mm`;
      valueInput.value=next.value||'';refreshStatus();setTimeout(()=>valueInput.focus(),20);
    };
    applyValue.addEventListener('click',advanceEntry);
    valueInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();advanceEntry();}});

    overlay.addEventListener('pointerdown',e=>{
      if(!manualActive||entryIndex>=0||(tool!=='width'&&tool!=='height'))return;
      e.preventDefault();e.stopPropagation();const p=pointFromEvent(e);
      if(!pending){pending=p;draw();return;}
      dimensions.push({type:tool,p1:pending,p2:p,value:null});pending=null;save();refreshStatus();draw();
    });

    window.addEventListener('resize',resizeOverlay);const ro=new ResizeObserver(()=>resizeOverlay());ro.observe(drawingCanvas);setTimeout(resizeOverlay,100);
  }

  if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  const indicator=document.createElement('div');indicator.className='tablet-save-indicator';indicator.textContent='Job saved';document.body.appendChild(indicator);
  let timer;document.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{indicator.classList.add('show');setTimeout(()=>indicator.classList.remove('show'),900)},500)},true);
})();