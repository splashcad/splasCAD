(() => {
  const BUILD_LABEL='ALPHA 6.0.22 · UPDATE 005';
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

  /* LOCKED TABLET PHOTO / SCAN CONTROLS — DO NOT ALTER DETECTION */
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
      const cameraOverlay=document.createElement('div');
      cameraOverlay.className='tablet-camera-overlay';
      cameraOverlay.innerHTML=`<div class="tablet-camera-panel"><video autoplay playsinline muted></video><div class="tablet-camera-actions"><button type="button" class="secondary" data-camera-cancel>Cancel</button><button type="button" class="primary" data-camera-capture>Use photo</button></div></div>`;
      document.body.appendChild(cameraOverlay);
      const video=cameraOverlay.querySelector('video');
      const close=()=>{try{stream?.getTracks().forEach(t=>t.stop())}catch{}cameraOverlay.remove()};
      cameraOverlay.querySelector('[data-camera-cancel]').addEventListener('click',close);
      try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=stream;await video.play();}
      catch(error){close();if(cameraInput){cameraInput.accept='image/jpeg';cameraInput.click();}return;}
      cameraOverlay.querySelector('[data-camera-capture]').addEventListener('click',()=>{
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

  /* MANUAL DIMENSIONS — UPDATE 005
     Capture all point pairs first. Enter all widths, then all heights.
     Rendering follows Hob Wall Dimension Engine V2 visual conventions.
     This overlay annotates only; it never changes scan, outline or notch geometry. */
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
      .manual-dim-controls{margin:8px 0 10px;padding:9px;border:1px solid rgba(118,255,197,.28);border-radius:10px;background:rgba(8,22,18,.55)}
      .manual-dim-toggle,.manual-dim-tools{display:flex;gap:6px;flex-wrap:wrap}
      .manual-dim-toggle button,.manual-dim-tools button{min-height:36px;padding:7px 9px}
      .manual-dim-controls button.active{background:#17d99a;color:#04120e;border-color:#17d99a}
      .manual-dim-help,.manual-dim-status{font-size:11px;line-height:1.3;opacity:.86;margin:7px 0 0}
      .manual-dim-entry{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;margin-top:7px;align-items:end}
      .manual-dim-entry label{font-size:11px;margin:0}.manual-dim-entry input{width:100%;min-height:38px;font-size:18px;padding:6px 8px}
      .manual-dim-entry button{min-height:38px;padding:6px 10px}
      .manual-dim-entry[hidden]{display:none!important}
      .manual-dim-overlay{position:absolute;inset:0;width:100%;height:100%;z-index:8;touch-action:none;user-select:none;-webkit-user-select:none}
      .manual-dim-wrap{position:relative}.manual-mode-hidden{display:none!important}
      .manual-dim-controls.manual-entering .manual-dim-tools,.manual-dim-controls.manual-entering .manual-dim-help{display:none!important}
      .manual-dim-controls.manual-entering{padding:7px;margin:5px 0}
      .manual-dim-controls.manual-entering .manual-dim-status{margin-top:4px}
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
        <label><span data-entry-label>Measurement mm</span><input data-manual-value type="text" inputmode="decimal" autocomplete="off" placeholder="mm"></label>
        <button type="button" data-manual-voice title="Use SplashCAD voice measuring">🎤 Voice</button>
        <button type="button" data-manual-apply class="primary">Next</button>
      </div>
      <div class="manual-dim-help">Touch every width pair first. Then every height pair. Press Enter measurements only when all points are placed. Values are requested widths first, then heights.</div>`;
    productionPanel.querySelector('.help')?.insertAdjacentElement('afterend',controls);

    const toolbar=controls.querySelector('.manual-dim-tools');
    const status=controls.querySelector('.manual-dim-status');
    const entry=controls.querySelector('.manual-dim-entry');
    const entryLabel=controls.querySelector('[data-entry-label]');
    const valueInput=controls.querySelector('[data-manual-value]');
    const applyValue=controls.querySelector('[data-manual-apply]');
    const voiceValue=controls.querySelector('[data-manual-voice]');
    const autoButton=controls.querySelector('[data-dim-mode="auto"]');
    const manualButton=controls.querySelector('[data-dim-mode="manual"]');

    const wrap=document.createElement('div');wrap.className='manual-dim-wrap';
    drawingCanvas.parentNode.insertBefore(wrap,drawingCanvas);wrap.appendChild(drawingCanvas);
    const overlay=document.createElement('canvas');overlay.className='manual-dim-overlay';wrap.appendChild(overlay);overlay.hidden=true;

    const storageKey='splashcad-manual-dimensions-v4';
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

    const line=(ctx,x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
    const tickVertical=(ctx,x,y,size)=>line(ctx,x,y-size,x,y+size);
    const tickHorizontal=(ctx,x,y,size)=>line(ctx,x-size,y,x+size,y);
    const knockoutText=(ctx,text,x,y,baseline='middle')=>{
      ctx.textBaseline=baseline;ctx.textAlign='center';
      const m=ctx.measureText(text),h=18*Math.max(1,window.devicePixelRatio||1);
      ctx.save();ctx.fillStyle='#fff';ctx.fillRect(x-m.width/2-6,y-h/2,m.width+12,h);ctx.restore();
      ctx.fillText(text,x,y);
    };

    function draw(){
      const ctx=overlay.getContext('2d');ctx.clearRect(0,0,overlay.width,overlay.height);if(!manualActive)return;
      const dpr=Math.max(1,window.devicePixelRatio||1),red='#b91c1c',witness='#94a3b8';
      ctx.font=`800 ${13*dpr}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
      ctx.lineWidth=1.5*dpr;
      const entered=dimensions.filter(d=>Number(d.value)>0);

      // Hob Wall width convention: each width gets its own horizontal lane above
      // the touched features. Witness lines terminate at the touched points.
      widths().forEach((d,i)=>{
        const a=toPx(d.p1),b=toPx(d.p2);
        const top=Math.min(a.y,b.y);
        const y=Math.max(18*dpr,top-(28+(i*27))*dpr);
        ctx.strokeStyle=witness;ctx.setLineDash([3*dpr,3*dpr]);ctx.lineWidth=1*dpr;
        line(ctx,a.x,a.y,a.x,y);line(ctx,b.x,b.y,b.x,y);
        ctx.setLineDash([]);ctx.strokeStyle=red;ctx.fillStyle=red;ctx.lineWidth=2*dpr;
        line(ctx,a.x,y,b.x,y);tickVertical(ctx,a.x,y,5*dpr);tickVertical(ctx,b.x,y,5*dpr);
        const label=Number(d.value)>0?`${i+1}  ${Math.round(Number(d.value))} mm`:`W${i+1}`;
        knockoutText(ctx,label,(a.x+b.x)/2,y);
      });

      // Hob Wall height convention: measured feature -> datum witness, then label
      // below the drawing in dedicated lanes so labels do not cut through glass/notches.
      heights().forEach((d,i)=>{
        const a=toPx(d.p1),b=toPx(d.p2);
        const feature=a.y<b.y?a:b;
        const datum=a.y<b.y?b:a;
        const lane=i%3;
        const labelY=Math.min(overlay.height-18*dpr,Math.max(a.y,b.y)+(34+(lane*34))*dpr);
        let labelX=feature.x;
        if(i%2===0&&heights().length>2)labelX-=18*dpr;
        else if(heights().length>2)labelX+=18*dpr;
        ctx.strokeStyle=witness;ctx.lineWidth=1*dpr;ctx.setLineDash([3*dpr,3*dpr]);
        line(ctx,feature.x,feature.y,feature.x,datum.y);
        line(ctx,feature.x,datum.y,feature.x,labelY-9*dpr);
        if(Math.abs(labelX-feature.x)>2)line(ctx,feature.x,labelY-9*dpr,labelX,labelY-9*dpr);
        ctx.setLineDash([]);ctx.strokeStyle=red;ctx.fillStyle=red;ctx.lineWidth=1.5*dpr;
        tickHorizontal(ctx,feature.x,feature.y,5*dpr);tickHorizontal(ctx,feature.x,datum.y,5*dpr);
        const label=Number(d.value)>0?`${i+1}  ${Math.round(Number(d.value))} mm`:`H${i+1}`;
        knockoutText(ctx,label,labelX,labelY,'top');
      });

      // Green is used only as a temporary touch marker. It disappears as soon as
      // the pair is complete and never becomes part of the finished drawing.
      if(pending){const p=toPx(pending);ctx.fillStyle='#17d99a';ctx.beginPath();ctx.arc(p.x,p.y,7*dpr,0,Math.PI*2);ctx.fill();}
    }

    const refreshStatus=()=>{
      if(!manualActive){status.hidden=true;return;}
      status.hidden=false;
      const w=widths().length,h=heights().length;
      if(entryIndex>=0){const order=entryOrder(),d=order[entryIndex];status.textContent=d?`${d.type==='width'?'Width':'Height'} ${d.type==='width'?widths().indexOf(d)+1:heights().indexOf(d)+1} · ${entryIndex+1} of ${order.length}`:'Measurements complete';}
      else if(tool==='width')status.textContent=`Width pairs: ${w} · keep touching width points.`;
      else if(tool==='height')status.textContent=`Widths: ${w} · Height pairs: ${h} · keep touching height points.`;
      else status.textContent=`Width pairs: ${w} · Height pairs: ${h}.`;
    };

    const showEntry=()=>{
      const order=entryOrder();
      if(entryIndex<0||entryIndex>=order.length)return;
      const d=order[entryIndex];
      const n=d.type==='width'?widths().indexOf(d)+1:heights().indexOf(d)+1;
      entryLabel.textContent=`${d.type==='width'?'Width':'Height'} ${n} mm`;
      valueInput.value=d.value||'';
      entry.hidden=false;controls.classList.add('manual-entering');
      refreshStatus();
      setTimeout(()=>{valueInput.focus();valueInput.select?.();entry.scrollIntoView?.({block:'nearest',behavior:'smooth'});},40);
    };

    const setTool=next=>{
      tool=next;pending=null;entryIndex=-1;entry.hidden=true;controls.classList.remove('manual-entering');valueInput.value='';
      toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.classList.toggle('active',b.dataset.manualTool===tool));refreshStatus();draw();
    };
    const setManual=active=>{
      manualActive=active;autoButton.classList.toggle('active',!active);manualButton.classList.toggle('active',active);toolbar.hidden=!active;overlay.hidden=!active;
      [autoWidthSeq,autoHeightSeq,directionBlock,productionGrid,countBadge?.closest('.measure-group-title')].forEach(el=>el?.classList.toggle('manual-mode-hidden',active));
      if(prodStatus)prodStatus.textContent=active?'MANUAL DIMENSIONS — touch all width pairs, all height pairs, then enter widths followed by heights.':'Measurement count is calculated from the edited splashback.';
      if(!active){tool=null;pending=null;entryIndex=-1;entry.hidden=true;controls.classList.remove('manual-entering');}refreshStatus();setTimeout(resizeOverlay,50);
    };

    controls.querySelectorAll('[data-dim-mode]').forEach(b=>b.addEventListener('click',()=>setManual(b.dataset.dimMode==='manual')));
    toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.addEventListener('click',()=>{
      const next=b.dataset.manualTool;
      if(next==='delete'){
        if(dimensions.length){dimensions.pop();save();}pending=null;entryIndex=-1;entry.hidden=true;controls.classList.remove('manual-entering');refreshStatus();draw();return;
      }
      if(next==='clear'){
        if(dimensions.length&&confirm('Clear all manually placed dimensions?')){dimensions=[];save();}pending=null;entryIndex=-1;entry.hidden=true;controls.classList.remove('manual-entering');refreshStatus();draw();return;
      }
      if(next==='measure'){
        if(!entryOrder().length)return;
        entryIndex=0;tool=null;pending=null;toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.classList.remove('active'));showEntry();return;
      }
      setTool(next);
    }));

    const advanceEntry=()=>{
      const order=entryOrder();if(entryIndex<0||entryIndex>=order.length)return;
      const d=order[entryIndex],v=Number(String(valueInput.value).replace(',','.'));
      if(!Number.isFinite(v)||v<=0){valueInput.focus();return;}
      d.value=Math.round(v*10)/10;save();draw();entryIndex++;
      if(entryIndex>=order.length){entryIndex=-1;entry.hidden=true;controls.classList.remove('manual-entering');valueInput.value='';refreshStatus();return;}
      showEntry();
    };
    applyValue.addEventListener('click',advanceEntry);
    valueInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();advanceEntry();}});

    // Reuse the existing SplashCAD voice engine. It already enters a spoken number
    // into the currently focused field; this button simply starts it for manual entry.
    voiceValue.addEventListener('click',()=>{
      valueInput.focus();valueInput.select?.();
      const voiceButton=document.querySelector('.voice-command-button');
      if(voiceButton){voiceButton.click();setTimeout(()=>valueInput.focus(),80);}
    });

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