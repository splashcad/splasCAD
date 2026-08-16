(() => {
  const BUILD='ALPHA 6.0.22 · UPDATE 015';
  const start=()=>{
    const proof=document.querySelector('.alpha-proof'); if(proof) proof.textContent=BUILD;
    const brand=document.querySelector('.brand p'); if(brand) brand.textContent=BUILD+' · Locked Detection + Dimension Engine V2';
    document.title='SplashCAD — '+BUILD;

    const controls=document.querySelector('.edge-manual-controls');
    const drawing=document.getElementById('drawingCanvas');
    const heightHost=document.getElementById('heightMeasurementSequence');
    if(!controls||!drawing||!heightHost) return;
    const baseOverlay=document.querySelector('.edge-manual-overlay');
    const tools=controls.querySelector('.edge-manual-tools');
    if(!tools||tools.querySelector('[data-witness-tool]')) return;

    const button=document.createElement('button');
    button.type='button'; button.dataset.witnessTool='1'; button.textContent='Witness measurement';
    const enter=tools.querySelector('[data-edge-tool="enter"]');
    tools.insertBefore(button,enter);

    const wrap=drawing.parentElement;
    if(getComputedStyle(wrap).position==='static') wrap.style.position='relative';
    const overlay=document.createElement('canvas');
    overlay.className='witness-measure-overlay';
    Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'14',pointerEvents:'none',touchAction:'none'});
    wrap.appendChild(overlay);

    let active=false;
    const witnesses=[];
    const status=controls.querySelector('.edge-manual-status');

    const resize=()=>{
      const r=drawing.getBoundingClientRect(),d=window.devicePixelRatio||1;
      overlay.width=Math.max(1,Math.round(r.width*d)); overlay.height=Math.max(1,Math.round(r.height*d));
      overlay.style.width=r.width+'px'; overlay.style.height=r.height+'px'; draw();
    };

    const drawingPoint=e=>{
      const r=drawing.getBoundingClientRect();
      return{x:(e.clientX-r.left)/r.width*drawing.width,y:(e.clientY-r.top)/r.height*drawing.height};
    };

    const nearestHorizontalEdge=p=>{
      const ctx=drawing.getContext('2d',{willReadFrequently:true});
      const rad=Math.max(12,Math.round(drawing.width/90));
      let best=null,bestScore=Infinity;
      try{
        const x0=Math.max(2,Math.round(p.x-rad)),x1=Math.min(drawing.width-3,Math.round(p.x+rad));
        const y0=Math.max(2,Math.round(p.y-rad)),y1=Math.min(drawing.height-3,Math.round(p.y+rad));
        const img=ctx.getImageData(x0,y0,x1-x0+1,y1-y0+1),w=img.width,data=img.data;
        const dark=(x,y)=>{const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];return a>20&&r<155&&g<170&&b<180;};
        for(let yy=2;yy<img.height-2;yy++) for(let xx=2;xx<img.width-2;xx++){
          if(!dark(xx,yy)) continue;
          let horiz=0; for(let k=-4;k<=4;k++) if(xx+k>=0&&xx+k<w&&dark(xx+k,yy)) horiz++;
          if(horiz<5) continue;
          const px=x0+xx,py=y0+yy;
          const score=Math.abs(py-p.y)*1.7+Math.abs(px-p.x)*.35;
          if(score<bestScore){bestScore=score;best={x:px/drawing.width,y:py/drawing.height};}
        }
      }catch{}
      return bestScore<=rad*1.7?best:null;
    };

    const glassBottom=()=>{
      const ctx=drawing.getContext('2d',{willReadFrequently:true}),w=drawing.width,h=drawing.height;
      let maxY=0,n=0;
      try{const data=ctx.getImageData(0,0,w,h).data,step=Math.max(3,Math.floor(w/400));
        for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];if(r>155&&g>165&&b>170&&r<240&&g<245&&b<250){maxY=Math.max(maxY,y);n++;}}
      }catch{}
      return n>20?maxY/h:.72;
    };

    const draw=()=>{
      const c=overlay.getContext('2d'),d=window.devicePixelRatio||1;
      c.clearRect(0,0,overlay.width,overlay.height);
      const B=glassBottom()*overlay.height;
      c.font='800 '+(12*d)+'px sans-serif'; c.fillStyle='#b91c1c'; c.lineWidth=1.5*d;
      witnesses.forEach((p,i)=>{
        const x=p.x*overlay.width,y=p.y*overlay.height,labelY=Math.min(overlay.height-20*d,B+(35+(i%3)*31)*d);
        c.strokeStyle='#9ca3af';c.setLineDash([4*d,4*d]);c.beginPath();c.moveTo(x,y);c.lineTo(x,B);c.lineTo(x,labelY-9*d);c.stroke();
        c.setLineDash([]);c.strokeStyle='#b91c1c';
        c.beginPath();c.moveTo(x-6*d,y);c.lineTo(x+6*d,y);c.moveTo(x-6*d,B);c.lineTo(x+6*d,B);c.stroke();
        c.fillText('H'+(i+1)+' W',x+9*d,labelY);
      });
    };

    const addWitnessInputRows=()=>{
      heightHost.querySelectorAll('.witness-height-row').forEach(n=>n.remove());
      witnesses.forEach((p,i)=>{
        const row=document.createElement('div'); row.className='measure-sequence-row witness-height-row';
        row.innerHTML='<div class="measure-seq-no">W'+(i+1)+'</div><div class="measure-seq-label">Witness height '+(i+1)+'</div><input class="height-seq-input edge-measure-input witness-measure-input" inputmode="decimal" autocomplete="off" placeholder="mm">';
        heightHost.appendChild(row);
      });
      const all=[...document.querySelectorAll('#productionMeasurementPanel .edge-measure-input')];
      all.forEach((input,i)=>{if(input.dataset.witnessEnterBound)return;input.dataset.witnessEnterBound='1';input.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();all[i+1]?.focus()||input.blur();});});
    };

    button.addEventListener('click',()=>{
      active=!active; button.classList.toggle('active',active);
      if(baseOverlay) baseOverlay.style.pointerEvents=active?'none':'';
      overlay.style.pointerEvents=active?'auto':'none';
      if(status) status.textContent=active?'Witness measurement ON — touch the actual horizontal line. SplashCAD will drop a dashed witness to the bottom datum.':'Witness measurement off.';
    });

    overlay.addEventListener('pointerdown',e=>{
      if(!active)return; e.preventDefault();e.stopPropagation();
      const hit=nearestHorizontalEdge(drawingPoint(e));
      if(!hit){if(status)status.textContent='Touch an actual horizontal drawing line — blank space is ignored.';return;}
      witnesses.push(hit); draw();
      if(status)status.textContent='Witness '+witnesses.length+' added. Touch another horizontal level or continue to Enter measurements.';
    });

    enter?.addEventListener('click',()=>setTimeout(addWitnessInputRows,0),true);
    controls.querySelector('[data-edge-tool="clear"]')?.addEventListener('click',()=>{witnesses.length=0;draw();addWitnessInputRows();});
    controls.querySelector('[data-edge-tool="delete"]')?.addEventListener('click',()=>{if(active&&witnesses.length){witnesses.pop();draw();}},true);
    window.addEventListener('resize',resize); new ResizeObserver(resize).observe(drawing); resize();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,200));else setTimeout(start,200);
})();