(()=>{
  const REF='f49eed18d588a56f1f30e86fd77b46ab4a6da3b2';
  const CDN=`https://cdn.jsdelivr.net/gh/splashcad/splasCAD@${REF}/`;
  const RECOVERY_PREFIX='recovery.r004.';

  const scopeStorage=()=>{
    const g=Storage.prototype.getItem,s=Storage.prototype.setItem,r=Storage.prototype.removeItem;
    const scoped=k=>String(k).startsWith('splashcad')?RECOVERY_PREFIX+k:k;
    Storage.prototype.getItem=function(k){return g.call(this,scoped(k));};
    Storage.prototype.setItem=function(k,v){return s.call(this,scoped(k),v);};
    Storage.prototype.removeItem=function(k){return r.call(this,scoped(k));};
    if('serviceWorker' in navigator){try{navigator.serviceWorker.register=()=>Promise.resolve({});}catch{}}
  };

  const addScript=src=>new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=src;s.defer=false;s.onload=resolve;s.onerror=reject;document.body.appendChild(s);
  });

  const runText=text=>{
    const blob=new Blob([text],{type:'text/javascript'});
    const url=URL.createObjectURL(blob);
    return addScript(url).finally(()=>URL.revokeObjectURL(url));
  };

  const extractPatchFunction=sw=>{
    const start=sw.indexOf('const patchSplashcadApp=(source)=>{');
    const end=sw.indexOf("\n};\nself.addEventListener('install'",start);
    if(start<0||end<0)throw new Error('Update 029 app patch was not found.');
    const fnSource=sw.slice(start,end+3);
    return new Function(`${fnSource}; return patchSplashcadApp;`)();
  };

  const extractTabletPatch=sw=>{
    const token='const TABLET_PATCH=`';
    const start=sw.indexOf(token);
    const end=sw.indexOf('`;\nconst patchSplashcadApp',start);
    if(start<0||end<0)return '';
    return sw.slice(start+token.length,end);
  };

  const rewriteHistoricalAssets=doc=>{
    doc.querySelectorAll('script').forEach(s=>s.remove());
    doc.querySelectorAll('link[href]').forEach(link=>{
      const href=link.getAttribute('href')||'';
      if(href && !/^(?:https?:|data:|\/)/i.test(href))link.setAttribute('href',CDN+href.replace(/^\.\//,''));
    });
    doc.querySelectorAll('img[src]').forEach(img=>{
      const src=img.getAttribute('src')||'';
      if(src && !/^(?:https?:|data:|\/)/i.test(src))img.setAttribute('src',CDN+src.replace(/^\.\//,''));
    });
  };

  const installRecoveryBanner=()=>{
    const bar=document.createElement('div');
    bar.id='recoveryBuildBar';
    bar.textContent='TEST / RECOVERY · BUILD R004 · UPDATE 029 RECOVERY · SEPARATE FROM LIVE HOB WALL';
    bar.style.cssText='position:sticky;top:0;z-index:999999;background:#9a3412;color:#fff;padding:8px 12px;text-align:center;font-weight:900;letter-spacing:.2px';
    document.body.prepend(bar);
    const proof=document.querySelector('.alpha-proof');if(proof)proof.textContent='RECOVERY R004 · UPDATE 029';
    const brand=document.querySelector('.brand p');if(brand)brand.textContent='RECOVERY R004 · ALPHA 6.0.22 · UPDATE 029 · Locked Detection + Dimension Engine V2';
    document.title='SplashCAD · RECOVERY R004 · Update 029';
  };

  const installFastImageTransport=()=>{
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async(input,init={})=>{
      try{
        const url=typeof input==='string'?input:(input?.url||'');
        if(url.includes('/api/detect-outline') && typeof init.body==='string'){
          const data=JSON.parse(init.body);
          if(typeof data.imageDataUrl==='string' && data.imageDataUrl.startsWith('data:image/')){
            data.imageDataUrl=await downscaleDataUrl(data.imageDataUrl,2048,0.9);
            init={...init,body:JSON.stringify(data)};
          }
        }
      }catch{}
      return nativeFetch(input,init);
    };
  };

  const downscaleDataUrl=(src,maxSide,quality)=>new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const largest=Math.max(img.naturalWidth||1,img.naturalHeight||1);
      if(largest<=maxSide){resolve(src);return;}
      const scale=maxSide/largest;
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(img,0,0,canvas.width,canvas.height);
      resolve(canvas.toDataURL('image/jpeg',quality));
    };
    img.onerror=()=>resolve(src);
    img.src=src;
  });

  const boot=async()=>{
    scopeStorage();
    const [htmlRes,appRes,swRes]=await Promise.all([
      fetch(CDN+'hob.html',{cache:'no-store'}),
      fetch(CDN+'splashcad-app.js',{cache:'no-store'}),
      fetch(CDN+'service-worker.js',{cache:'no-store'})
    ]);
    if(!htmlRes.ok||!appRes.ok||!swRes.ok)throw new Error('Could not load the Update 029 recovery source.');
    const [html,baseApp,sw]=await Promise.all([htmlRes.text(),appRes.text(),swRes.text()]);
    const hist=new DOMParser().parseFromString(html,'text/html');
    rewriteHistoricalAssets(hist);
    document.head.innerHTML=hist.head.innerHTML;
    document.body.innerHTML=hist.body.innerHTML;
    installRecoveryBanner();
    installFastImageTransport();

    const patchSplashcadApp=extractPatchFunction(sw);
    const patchedApp=patchSplashcadApp(baseApp);
    await runText(patchedApp);

    try{await addScript(CDN+'voice.js');}catch{}
    try{await addScript('/tablet.js?v=recovery-r004-current-jpeg');}catch{}

    const tabletPatch=extractTabletPatch(sw);
    if(tabletPatch){try{await runText(tabletPatch);}catch{} }
    installRecoveryBanner();
    window.dispatchEvent(new Event('resize'));
  };

  boot().catch(error=>{
    document.body.innerHTML=`<div style="padding:28px;background:#07110f;color:white;font-family:system-ui"><h2>TEST / RECOVERY · R004</h2><p style="color:#fca5a5">${String(error?.message||error)}</p><p>Live Hob Wall and Window Wall were not changed.</p></div>`;
  });
})();
