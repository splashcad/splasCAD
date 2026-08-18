(() => {
  const button=document.getElementById('tabletModeButton');
  const key='splashcad-tablet-field-mode';
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

  // Recovery-only hardening. Keep live Hob Wall / Window Wall behaviour unchanged.
  const recoveryPage=/TEST\s*\/\s*RECOVERY/i.test(document.title) || /RECOVERY\s+R00/i.test(document.body?.innerText||'');
  if(recoveryPage){
    document.title='TEST / RECOVERY R003 · SplashCAD';
    const banner=document.querySelector('body > div[style*="position:sticky"]');
    if(banner) banner.textContent='TEST / RECOVERY · BUILD R003 · 18 AUG · FORCED JPEG CAMERA · SEPARATE FROM LIVE HOB WALL';
    const proof=document.querySelector('.alpha-proof');
    if(proof) proof.textContent='RECOVERY R003 · ALPHA 6.0.21';
    const brandSub=document.querySelector('.brand p');
    if(brandSub) brandSub.textContent='RECOVERY R003 · ALPHA 6.0.21 · Locked Detection + Dimension Engine V2';

    if(libraryInput) libraryInput.accept='image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
    if(cameraInput) cameraInput.accept='image/jpeg';

    // The old sidebar Take photo label directly opened Android's file camera and
    // could return HEIC before our JPEG handler ran. Hide that direct route and
    // replace it with a button that calls the same browser JPEG camera as the
    // tablet toolbar.
    const directCameraLabel=cameraInput?.closest('label.file-button');
    if(directCameraLabel){
      directCameraLabel.style.display='none';
      const safeButton=document.createElement('button');
      safeButton.type='button';
      safeButton.className='full';
      safeButton.textContent='Take photo · JPEG';
      safeButton.setAttribute('data-recovery-jpeg-camera','1');
      directCameraLabel.insertAdjacentElement('afterend',safeButton);
      safeButton.addEventListener('click',()=>tabletTakePhotoButton?.click());
    }
  }

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

        if(
          (photo?.complete && photo?.naturalWidth>0 && Date.now()-started>500) ||
          Date.now()-started>60000
        ){
          clearInterval(timer);
          finishPhotoLoading();
        }
      },200);
    });
  }
  if(tabletTakePhotoButton){
    tabletTakePhotoButton.addEventListener('click',async()=>{
      // Use a live browser camera preview and capture to JPEG ourselves. This avoids
      // Samsung/Android HEIC output entirely, so the detector always receives a
      // browser-safe image without relying on server-side HEIC conversion.
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
            // Fallback for browsers that do not allow assigning FileList.
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
        const working=
          edgeButton?.disabled ||
          fittingButton?.disabled;

        if((!working && Date.now()-started>1500) || Date.now()-started>90000){
          clearInterval(timer);
          tabletScanButton.disabled=false;
          tabletScanButton.textContent=originalText;
          tabletScanButton.classList.remove('scan-working');
        }
      },250);
    });
  }
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  const indicator=document.createElement('div');
  indicator.className='tablet-save-indicator';indicator.textContent='Job saved';document.body.appendChild(indicator);
  let timer;
  document.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{indicator.classList.add('show');setTimeout(()=>indicator.classList.remove('show'),900)},500)},true);
})();
