(() => {
  const BUILD_LABEL='ALPHA 6.0.22 · UPDATE 006';
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

  /* MANUAL DIMENSIONS — UPDATE 006
     ONE tap = ONE measurement station.
     Width datum comes from selected left/right side.
     Height datum is always the bottom.
     Numbers are entered in normal Hob Wall-style rows: widths first, heights second.
     Scan/detection and outline geometry remain untouched. */
  const drawingCanvas=document.getElementById('drawingCanvas');
  const productionPanel=document.getElementById('productionMeasurementPanel');
  const widthHost=document.getElementById('measurementSequence');
  const heightHost=document.getElementById('heightMeasurementSequence');
  const productionGrid=document.querySelector('.production-grid');
  const countBadge=document.getElementById('measurementCountBadge');
  const prodStatus=document.getElementById('productionMeasurementStatus');

  if(drawingCanvas&&productionPanel&&widthHost&&heightHost){
    const style=document.createElement('style');
    style.textContent=`
      .manual-dim-controls{margin:8px 0 10px;padding:9px;border:1px solid rgba(118,255,197,.28);border-radius:10px;background:rgba(8,22,18,.55)}
      .manual-dim-toggle,.manual-dim-tools{display:flex;gap:6px;flex-wrap:wrap}
      .manual-dim-toggle button,.manual-dim-tools button{min-height:36px;padding:7px 9px}
      .manual-dim-controls button.active{background:#17d99a;color:#04120e;border-color:#17d99a}
      .manual-dim-help,.manual-dim-status{font-size:11px;line-height:1.3;opacity:.86;margin:7px 0 0}
      .manual-dim-overlay{position:absolute;inset:0;width:100%;height:100%;z-index:8;touch-action:none;user-select:none;-webkit-user-select:none}
      .manual-dim-wrap{position:relative}
      .manual-mode-hidden{display:none!important}
      .manual-station-dot{pointer-events:none}
      body.manual-keyboard-open .photo-card{display:none!important}
      body.manual-keyboard-open .drawing-card{margin-top:0!important}
      body.manual-keyboard-open .production-drawing-card{display:none!important}
      body.manual-keyboard-open .main-workspace{align-self:start!important}
      @media (orientation:landscape){body.manual-keyboard-open .drawing-card canvas{max-height:42vh!important}}
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
        <button type="button" data-manual-tool="enter">3 · Enter measurements</button>
        <button type="button" data-manual-tool="delete">Delete last point</button>
        <button type="button" data-manual-tool="clear">Clear manual dims</button>
      </div>
      <div class="manual-dim-status" hidden></div>
      <div class="manual-dim-help">One tap is one station. Touch every width point first, then every height point. Enter measurements afterwards: all widths first, then all heights. Voice works through the normal Voice measure control.</div>`;
    productionPanel.querySelector('.help')?.insertAdjacentElement('afterend',controls);

    const toolbar=controls.querySelector('.manual-dim-tools');
    const status=controls.querySelector('.manual-dim-status');
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

    const storageKey='splashcad-manual-stations-v1';
    let active=false,tool=null;
    let widths=[],heights=[];
    try{
      const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
      widths=Array.isArray(saved.widths)?saved.widths:[];
      heights=Array.isArray(saved.heights)?saved.heights:[];
    }catch{}
    const save=()=>localStorage.setItem(storageKey,JSON.stringify({widths,heights}));

    const resizeOverlay=()=>{
      const r=drawingCanvas.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1);
      overlay.width=Math.max(1,Math.round(r.width*dpr));
      overlay.height=Math.max(1,Math.round(r.height*dpr));
      overlay.style.width=`${r.width}px`;overlay.style.height=`${r.height}px`;
      drawOverlay();
    };
    const pointFromEvent=e=>{
      const r=overlay.getBoundingClientRect();
      return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
    };
    const px=p=>({x:p.x*overlay.width,y:p.y*overlay.height});

    const glassBounds=()=>{
      const ctx=drawingCanvas.getContext('2d',{willReadFrequently:true});
      const w=drawingCanvas.width,h=drawingCanvas.height;
      try{
        const data=ctx.getImageData(0,0,w,h).data;
        let minX=w,maxX=0,minY=h,maxY=0,found=0;
        const step=Math.max(3,Math.floor(w/420));
        for(let y=0;y<h;y+=step){
          for(let x=0;x<w;x+=step){
            const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
            if(a<20)continue;
            const nearWhite=r>243&&g>243&&b>243;
            const likelyGlass=!nearWhite&&r>155&&g>165&&b>170&&Math.abs(g-b)<45;
            if(likelyGlass){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);found++;}
          }
        }
        if(found>20)return{left:minX,right:maxX,top:minY,bottom:maxY};
      }catch{}
      return{left:w*.16,right:w*.78,top:h*.18,bottom:h*.72};
    };

    const line=(ctx,x1,y1,x2,y2)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
    const knockout=(ctx,text,x,y,baseline='middle')=>{
      ctx.textAlign='center';ctx.textBaseline=baseline;
      const m=ctx.measureText(text),hh=19*Math.max(1,window.devicePixelRatio||1);
      ctx.save();ctx.fillStyle='#fff';ctx.fillRect(x-m.width/2-6,y-hh/2,m.width+12,hh);ctx.restore();
      ctx.fillText(text,x,y);
    };

    function drawOverlay(){
      const ctx=overlay.getContext('2d');
      ctx.clearRect(0,0,overlay.width,overlay.height);
      if(!active)return;
      const dpr=Math.max(1,window.devicePixelRatio||1),red='#b91c1c',witness='#94a3b8',green='#17d99a';
      const b=glassBounds();
      const sx=overlay.width/drawingCanvas.width,sy=overlay.height/drawingCanvas.height;
      const bounds={left:b.left*sx,right:b.right*sx,top:b.top*sy,bottom:b.bottom*sy};
      const dir=document.querySelector('input[name="measureDirection"]:checked')?.value||'ltr';
      const datumX=dir==='rtl'?bounds.right:bounds.left;
      ctx.font=`800 ${13*dpr}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;

      widths.forEach((p,i)=>{
        const q=px(p),laneY=Math.max(18*dpr,bounds.top-(30+i*27)*dpr);
        ctx.strokeStyle=witness;ctx.lineWidth=1*dpr;ctx.setLineDash([3*dpr,3*dpr]);
        line(ctx,datumX,bounds.top,datumX,laneY);line(ctx,q.x,q.y,q.x,laneY);
        ctx.setLineDash([]);ctx.strokeStyle=red;ctx.fillStyle=red;ctx.lineWidth=2*dpr;
        line(ctx,datumX,laneY,q.x,laneY);
        line(ctx,datumX,laneY-5*dpr,datumX,laneY+5*dpr);line(ctx,q.x,laneY-5*dpr,q.x,laneY+5*dpr);
        const v=Number(p.value),label=v>0?`${i+1}  ${Math.round(v)} mm`:`W${i+1}`;
        knockout(ctx,label,(datumX+q.x)/2,laneY);
      });

      heights.forEach((p,i)=>{
        const q=px(p),outer=Math.abs(q.x-bounds.left)<26*dpr||Math.abs(q.x-bounds.right)<26*dpr;
        ctx.strokeStyle=red;ctx.fillStyle=red;ctx.lineWidth=1.5*dpr;
        if(outer){
          const left=Math.abs(q.x-bounds.left)<=Math.abs(q.x-bounds.right);
          const x=left?bounds.left-34*dpr:bounds.right+34*dpr;
          line(ctx,x,bounds.bottom,x,q.y);
          line(ctx,x-5*dpr,bounds.bottom,x+5*dpr,bounds.bottom);line(ctx,x-5*dpr,q.y,x+5*dpr,q.y);
          ctx.textAlign=left?'right':'left';ctx.textBaseline='middle';
          const v=Number(p.value),label=v>0?`${i+1}  ${Math.round(v)} mm`:`H${i+1}`;
          ctx.fillText(label,x+(left?-9:9)*dpr,(bounds.bottom+q.y)/2);
        }else{
          const lane=i%3,labelY=Math.min(overlay.height-20*dpr,bounds.bottom+(36+lane*34)*dpr);
          let labelX=q.x;if(heights.length>2)labelX+=((i%2)?22:-22)*dpr;
          ctx.strokeStyle=witness;ctx.lineWidth=1*dpr;ctx.setLineDash([3*dpr,3*dpr]);
          line(ctx,q.x,q.y,q.x,bounds.bottom);line(ctx,q.x,bounds.bottom,q.x,labelY-9*dpr);
          if(Math.abs(labelX-q.x)>2)line(ctx,q.x,labelY-9*dpr,labelX,labelY-9*dpr);
          ctx.setLineDash([]);ctx.strokeStyle=red;ctx.fillStyle=red;ctx.lineWidth=1.5*dpr;
          line(ctx,q.x-5*dpr,q.y,q.x+5*dpr,q.y);line(ctx,q.x-5*dpr,bounds.bottom,q.x+5*dpr,bounds.bottom);
          const v=Number(p.value),label=v>0?`${i+1}  ${Math.round(v)} mm`:`H${i+1}`;
          knockout(ctx,label,labelX,labelY,'top');
        }
      });

      const dots=tool==='width'?widths:tool==='height'?heights:[];
      dots.forEach(p=>{const q=px(p);ctx.fillStyle=green;ctx.beginPath();ctx.arc(q.x,q.y,5*dpr,0,Math.PI*2);ctx.fill();});
    }

    const updateStatus=()=>{
      if(!active){status.hidden=true;return;}
      status.hidden=false;
      status.textContent=tool==='width'?`Width points: ${widths.length}. Keep touching every width station.`:
        tool==='height'?`Width points: ${widths.length} · Height points: ${heights.length}. Keep touching every height station.`:
        `Width points: ${widths.length} · Height points: ${heights.length}.`;
      if(countBadge)countBadge.textContent=`Manual: ${widths.length} widths · ${heights.length} heights`;
    };

    const renderEntryRows=()=>{
      widthHost.innerHTML=widths.map((p,i)=>`<div class="measure-sequence-row"><div class="measure-seq-no">${i+1}</div><div class="measure-seq-label">Width ${i+1}</div><input class="measure-seq-input manual-measure-input" data-manual-width="${i}" type="text" inputmode="decimal" autocomplete="off" value="${p.value??''}" placeholder="mm"></div>`).join('');
      heightHost.innerHTML=heights.map((p,i)=>`<div class="measure-sequence-row"><div class="measure-seq-no">${i+1}</div><div class="measure-seq-label">Height ${i+1}</div><input class="height-seq-input manual-measure-input" data-entry-order="height" data-manual-height="${i}" type="text" inputmode="decimal" autocomplete="off" value="${p.value??''}" placeholder="mm"></div>`).join('');
      const inputs=[...productionPanel.querySelectorAll('.manual-measure-input')];
      inputs.forEach((input,idx)=>{
        input.addEventListener('input',()=>{
          const v=Number(String(input.value).replace(',','.'));
          if(input.dataset.manualWidth!==undefined)widths[Number(input.dataset.manualWidth)].value=Number.isFinite(v)&&v>0?v:null;
          if(input.dataset.manualHeight!==undefined)heights[Number(input.dataset.manualHeight)].value=Number.isFinite(v)&&v>0?v:null;
          save();drawOverlay();
        });
        input.addEventListener('focus',()=>{
          document.body.classList.add('manual-keyboard-open');
          setTimeout(()=>drawingCanvas.scrollIntoView({block:'start',behavior:'smooth'}),80);
        });
        input.addEventListener('blur',()=>setTimeout(()=>{
          if(!productionPanel.contains(document.activeElement)||!document.activeElement?.classList?.contains('manual-measure-input'))document.body.classList.remove('manual-keyboard-open');
        },180));
        input.addEventListener('keydown',e=>{
          if(e.key!=='Enter')return;
          e.preventDefault();
          const next=inputs[idx+1];
          if(next){next.focus();next.select?.();}else{input.blur();document.getElementById('applyProductionMeasurementsButton')?.focus();}
        });
      });
    };

    const setTool=next=>{
      tool=next;
      toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.classList.toggle('active',b.dataset.manualTool===tool));
      updateStatus();drawOverlay();
    };

    const setManual=on=>{
      active=on;
      autoButton.classList.toggle('active',!on);manualButton.classList.toggle('active',on);toolbar.hidden=!on;overlay.hidden=!on;
      productionGrid?.classList.toggle('manual-mode-hidden',on);
      if(on){renderEntryRows();if(prodStatus)prodStatus.textContent='MANUAL DIMENSIONS — touch width stations, then height stations; enter widths first, then heights.';}
      else{document.body.classList.remove('manual-keyboard-open');location.reload();return;}
      updateStatus();setTimeout(resizeOverlay,50);
    };

    controls.querySelectorAll('[data-dim-mode]').forEach(b=>b.addEventListener('click',()=>setManual(b.dataset.dimMode==='manual')));
    toolbar.querySelectorAll('[data-manual-tool]').forEach(b=>b.addEventListener('click',()=>{
      const next=b.dataset.manualTool;
      if(next==='delete'){
        if(tool==='height'&&heights.length)heights.pop();else if(tool==='width'&&widths.length)widths.pop();else if(heights.length)heights.pop();else widths.pop();
        save();renderEntryRows();updateStatus();drawOverlay();return;
      }
      if(next==='clear'){
        if((widths.length||heights.length)&&confirm('Clear all manual measurement points?')){widths=[];heights=[];save();renderEntryRows();updateStatus();drawOverlay();}return;
      }
      if(next==='enter'){
        tool=null;renderEntryRows();updateStatus();drawOverlay();
        const first=productionPanel.querySelector('.manual-measure-input');if(first){first.focus();first.select?.();}return;
      }
      setTool(next);
    }));

    overlay.addEventListener('pointerdown',e=>{
      if(!active||(tool!=='width'&&tool!=='height'))return;
      e.preventDefault();e.stopPropagation();
      const p=pointFromEvent(e);
      const rec={x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y)),value:null};
      if(tool==='width')widths.push(rec);else heights.push(rec);
      save();renderEntryRows();updateStatus();drawOverlay();
    });

    document.querySelectorAll('input[name="measureDirection"]').forEach(r=>r.addEventListener('change',drawOverlay));
    window.addEventListener('resize',resizeOverlay);
    const ro=new ResizeObserver(()=>resizeOverlay());ro.observe(drawingCanvas);
    setTimeout(resizeOverlay,100);
  }

  if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  const indicator=document.createElement('div');indicator.className='tablet-save-indicator';indicator.textContent='Job saved';document.body.appendChild(indicator);
  let timer;document.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{indicator.classList.add('show');setTimeout(()=>indicator.classList.remove('show'),900)},500)},true);
})();