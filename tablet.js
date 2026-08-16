(() => {
  const BUILD_LABEL='ALPHA 6.0.22 · UPDATE 003';
  const button=document.getElementById('tabletModeButton');
  const key='splashcad-tablet-field-mode';

  // Visible build proof on every deployment.
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

  // Tablet field mode hides the desktop sidebar, so mirror the essential
  // photo/AI scan controls beside the photo instead of skipping detection.
  const tabletChoosePhotoButton=document.getElementById('tabletChoosePhotoButton');
  const tabletTakePhotoButton=document.getElementById('tabletTakePhotoButton');
  const tabletScanButton=document.getElementById('tabletScanButton');
  const libraryInput=document.getElementById('libraryInput');
  const cameraInput=document.getElementById('cameraInput');
  const oneClickDetectButton=document.getElementById('oneClickDetectButton');
  if(tabletChoosePhotoButton){
    tabletChoosePhotoButton.addEventListener('click',()=>{
      (libraryInput||cameraInput)?.click();
    });

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
      if(!libraryInput.files?.length) return;
      showPhotoLoading();
      const started=Date.now();
      const timer=setInterval(()=>{
        const photo=document.getElementById('wallPhoto');
        if((photo?.complete && photo?.naturalWidth>0 && Date.now()-started>500) || Date.now()-started>60000){
          clearInterval(timer);
          finishPhotoLoading();
        }
      },200);
    });
  }

  if(tabletTakePhotoButton){
    tabletTakePhotoButton.addEventListener('click',async()=>{
      if(!navigator.mediaDevices?.getUserMedia){
        if(cameraInput){cameraInput.accept='image/jpeg';cameraInput.click();}
        return;
      }
      let stream;
      const overlay=document.createElement('div');
      overlay.className='tablet-camera-overlay';
      overlay.innerHTML=`<div class="tablet-camera-panel"><video autoplay playsinline muted></video><div class="tablet-camera-actions"><button type="button" class="secondary" data-camera-cancel>Cancel</button><button type="button" class="primary" data-camera-capture>Use photo</button></div></div>`;
      document.body.appendChild(overlay);
      const video=overlay.querySelector('video');
      const close=()=>{try{stream?.getTracks().forEach(t=>t.stop())}catch{} overlay.remove()};
      overlay.querySelector('[data-camera-cancel]').addEventListener('click',close);
      try{
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        video.srcObject=stream;
        await video.play();
      }catch(error){
        close();
        if(cameraInput){cameraInput.accept='image/jpeg';cameraInput.click();}
        return;
      }
      overlay.querySelector('[data-camera-capture]').addEventListener('click',()=>{
        const width=video.videoWidth||1920, height=video.videoHeight||1080;
        const canvas=document.createElement('canvas');
        canvas.width=width; canvas.height=height;
        canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,width,height);
        canvas.toBlob(blob=>{
          if(!blob){close(); return;}
          const file=new File([blob],`SplashCAD_${Date.now()}.jpg`,{type:'image/jpeg'});
          try{
            const dt=new DataTransfer();
            dt.items.add(file);
            cameraInput.files=dt.files;
            cameraInput.dispatchEvent(new Event('change',{bubbles:true}));
          }catch{
            const reader=new FileReader();
            reader.onload=()=>{
              const photo=document.getElementById('wallPhoto');
              if(photo) photo.src=String(reader.result||'');
            };
            reader.readAsDataURL(file);
          }
          close();
        },'image/jpeg',0.92);
      });
    });
  }

  if(tabletScanButton){
    tabletScanButton.addEventListener('click',()=>{
      if(!oneClickDetectButton) return;
      const originalText='Scan outline + sockets';
      tabletScanButton.disabled=true;
      tabletScanButton.textContent='Scanning… please wait';
      tabletScanButton.classList.add('scan-working');
      oneClickDetectButton.click();
      const started=Date.now();
      const timer=setInterval(()=>{
        const edgeButton=document.getElementById('detectEdgesButton');
        const fittingButton=document.getElementById('detectFittingsButton');
        const working=edgeButton?.disabled || fittingButton?.disabled;
        if((!working && Date.now()-started>1500) || Date.now()-started>90000){
          clearInterval(timer);
          tabletScanButton.disabled=false;
          tabletScanButton.textContent=originalText;
          tabletScanButton.classList.remove('scan-working');
        }
      },250);
    });
  }

  /* ==========================================================
     MANUAL DIMENSIONS — UPDATE 003
     Scan/detection and the edited cyan outline are untouched.
     Two point capture only; entered dimensions use the normal
     red drawing convention rather than a separate green layer.
     ========================================================== */
  const drawingCanvas=document.getElementById('drawingCanvas');
  const productionPanel=document.getElementById('productionMeasurementPanel');
  const autoWidthSeq=document.getElementById('measurementSequence');
  const autoHeightSeq=document.getElementById('heightMeasurementSequence');
  const directionBlock=document.querySelector('.measure-direction');
  const productionGrid=document.querySelector('.production-grid');
  const countBadge=document.getElementById('measurementCountBadge');
  const prodStatus=document.getElementById('productionMeasurementStatus');

  if(drawingCanvas && productionPanel){
    const style=document.createElement('style');
    style.textContent=`
      .manual-dim-controls{margin:10px 0 12px;padding:10px;border:1px solid rgba(118,255,197,.28);border-radius:10px;background:rgba(8,22,18,.55)}
      .manual-dim-toggle,.manual-dim-tools{display:flex;gap:7px;flex-wrap:wrap}
      .manual-dim-toggle button,.manual-dim-tools button{min-height:38px;padding:8px 11px}
      .manual-dim-controls button.active{background:#17d99a;color:#04120e;border-color:#17d99a}
      .manual-dim-help{font-size:12px;opacity:.82;margin:8px 0 0}
      .manual-dim-entry{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:9px;align-items:end}
      .manual-dim-entry label{font-size:12px}.manual-dim-entry input{width:100%}
      .manual-dim-entry[hidden]{display:none!important}
      .manual-dim-overlay{position:absolute;inset:0;width:100%;height:100%;z-index:8;touch-action:none;user-select:none;-webkit-user-select:none}
      .manual-dim-wrap{position:relative}
      .manual-mode-hidden{display:none!important}
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
        <button type="button" data-manual-tool="width">Touch width points</button>
        <button type="button" data-manual-tool="height">Touch height points</button>
        <button type="button" data-manual-tool="delete">Delete last</button>
        <button type="button" data-manual-tool="clear">Clear manual dims</button>
      </div>
      <div class="manual-dim-entry" hidden>
        <label>Measurement mm<input data-manual-value type="number" inputmode="decimal" min="0" step="1" placeholder="Enter measurement"></label>
        <button type="button" data-manual-apply>Apply</button>
      </div>
      <div class="manual-dim-help">Choose width or height, touch the two measurement points, then enter the measurement and press Enter or Apply.</div>
    `;
    const firstHelp=productionPanel.querySelector('.help');
    firstHelp?.insertAdjacentElement('afterend',controls);

    const toolbar=controls.querySelector('.manual-dim-tools');
    const entry=controls.querySelector('.manual-dim-entry');
    const valueInput=controls.querySelector('[data-manual-value]');
    const applyValue=controls.querySelector('[data-manual-apply]');
    const autoButton=controls.querySelector('[data-dim-mode="auto"]');
    const manualButton=controls.querySelector('[data-dim-mode="manual"]');

    const wrap=document.createElement('div');
    wrap.className='manual-dim-wrap';
    drawingCanvas.parentNode.insertBefore(wrap,drawingCanvas);
    wrap.appendChild(drawingCanvas);
    const overlay=document.createElement('canvas');
    overlay.className='manual-dim-overlay';
    wrap.appendChild(overlay);
    overlay.hidden=true;

    const storageKey='splashcad-manual-dimensions-v2';
    let manualActive=false;
    let tool=null;
    let pending=null;
    let awaiting=null;
    let dimensions=[];
    try{dimensions=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(dimensions))dimensions=[];}catch{dimensions=[];}

    const save=()=>localStorage.setItem(storageKey,JSON.stringify(dimensions));
    const resizeOverlay=()=>{
      const r=drawingCanvas.getBoundingClientRect();
      const dpr=Math.max(1,window.devicePixelRatio||1);
      overlay.width=Math.max(1,Math.round(r.width*dpr));
      overlay.height=Math.max(1,Math.round(r.height*dpr));
      overlay.style.width=`${r.width}px`;
      overlay.style.height=`${r.height}px`;
      draw();
    };
    const pointFromEvent=e=>{
      const r=overlay.getBoundingClientRect();
      return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
    };
    const toPx=p=>({x:p.x*overlay.width,y:p.y*overlay.height});
    const drawArrow=(ctx,x,y,angle)=>{
      const dpr=Math.max(1,window.devicePixelRatio||1);
      const size=9*dpr;
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.lineTo(x-size*Math.cos(angle-.45),y-size*Math.sin(angle-.45));
      ctx.moveTo(x,y);
      ctx.lineTo(x-size*Math.cos(angle+.45),y-size*Math.sin(angle+.45));
      ctx.stroke();
    };

    function draw(){
      const ctx=overlay.getContext('2d');
      ctx.clearRect(0,0,overlay.width,overlay.height);
      if(!manualActive)return;
      const dpr=Math.max(1,window.devicePixelRatio||1);
      const red='#d84b4b';
      ctx.lineWidth=1.5*dpr;
      ctx.font=`${13*dpr}px Arial, sans-serif`;
      ctx.textAlign='center';
      ctx.textBaseline='middle';

      dimensions.forEach(d=>{
        const a=toPx(d.p1),b=toPx(d.p2);
        const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        let a2={...a},b2={...b},label={...mid};
        ctx.strokeStyle=red;ctx.fillStyle=red;
        ctx.setLineDash([4*dpr,4*dpr]);
        if(d.type==='width'){
          const y=Math.min(a.y,b.y)-30*dpr;
          a2.y=y;b2.y=y;label.y=y-13*dpr;
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x,y);ctx.moveTo(b.x,b.y);ctx.lineTo(b.x,y);ctx.stroke();
        }else{
          const x=Math.max(a.x,b.x)+30*dpr;
          a2.x=x;b2.x=x;label.x=x+25*dpr;
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(x,a.y);ctx.moveTo(b.x,b.y);ctx.lineTo(x,b.y);ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.beginPath();ctx.moveTo(a2.x,a2.y);ctx.lineTo(b2.x,b2.y);ctx.stroke();
        const angle=Math.atan2(b2.y-a2.y,b2.x-a2.x);
        drawArrow(ctx,a2.x,a2.y,angle+Math.PI);
        drawArrow(ctx,b2.x,b2.y,angle);
        ctx.fillText(`${d.value} mm`,label.x,label.y);
      });

      if(pending){
        const p=toPx(pending);
        ctx.fillStyle='#17d99a';
        ctx.beginPath();ctx.arc(p.x,p.y,7*dpr,0,Math.PI*2);ctx.fill();
      }
      if(awaiting){
        const a=toPx(awaiting.p1),b=toPx(awaiting.p2);
        ctx.fillStyle='#17d99a';
        [a,b].forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,7*dpr,0,Math.PI*2);ctx.fill();});
      }
    }

    const setTool=next=>{
      tool=next;pending=null;awaiting=null;entry.hidden=true;valueInput.value='';
      toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.classList.toggle('active',b.dataset.manualTool===tool));
      draw();
    };
    const setManual=active=>{
      manualActive=active;
      autoButton.classList.toggle('active',!active);
      manualButton.classList.toggle('active',active);
      toolbar.hidden=!active;
      overlay.hidden=!active;
      [autoWidthSeq,autoHeightSeq,directionBlock,productionGrid,countBadge?.closest('.measure-group-title')].forEach(el=>el?.classList.toggle('manual-mode-hidden',active));
      if(prodStatus)prodStatus.textContent=active?'MANUAL DIMENSIONS — touch width or height points, then enter each measurement.':'Measurement count is calculated from the edited splashback.';
      if(!active){tool=null;pending=null;awaiting=null;entry.hidden=true;}
      setTimeout(resizeOverlay,50);
    };

    controls.querySelectorAll('[data-dim-mode]').forEach(b=>b.addEventListener('click',()=>setManual(b.dataset.dimMode==='manual')));
    toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.addEventListener('click',()=>{
      const next=b.dataset.manualTool;
      if(next==='delete'){
        if(awaiting){awaiting=null;entry.hidden=true;}else if(dimensions.length){dimensions.pop();save();}
        pending=null;draw();return;
      }
      if(next==='clear'){
        if(dimensions.length && confirm('Clear all manually entered dimensions?')){dimensions=[];save();}
        pending=null;awaiting=null;entry.hidden=true;draw();return;
      }
      setTool(next);
    }));

    const commitMeasurement=()=>{
      if(!awaiting)return;
      const v=Number(valueInput.value);
      if(!Number.isFinite(v)||v<=0){valueInput.focus();return;}
      dimensions.push({type:awaiting.type,p1:awaiting.p1,p2:awaiting.p2,value:Math.round(v*10)/10});
      save();awaiting=null;pending=null;entry.hidden=true;valueInput.value='';draw();
    };
    applyValue.addEventListener('click',commitMeasurement);
    valueInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitMeasurement();}});

    overlay.addEventListener('pointerdown',e=>{
      if(!manualActive || awaiting || (tool!=='width'&&tool!=='height'))return;
      e.preventDefault();e.stopPropagation();
      const p=pointFromEvent(e);
      if(!pending){pending=p;draw();return;}
      awaiting={type:tool,p1:pending,p2:p};
      pending=null;entry.hidden=false;valueInput.value='';draw();
      setTimeout(()=>valueInput.focus(),30);
    });

    window.addEventListener('resize',resizeOverlay);
    const ro=new ResizeObserver(()=>resizeOverlay());
    ro.observe(drawingCanvas);
    setTimeout(resizeOverlay,100);
  }

  if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  const indicator=document.createElement('div');
  indicator.className='tablet-save-indicator';indicator.textContent='Job saved';document.body.appendChild(indicator);
  let timer;
  document.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{indicator.classList.add('show');setTimeout(()=>indicator.classList.remove('show'),900)},500)},true);
})();