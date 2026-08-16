(() => {
  const BUILD='ALPHA 6.0.22 · UPDATE 016';
  const start=()=>{
    const proof=document.querySelector('.alpha-proof'); if(proof) proof.textContent=BUILD;
    const brand=document.querySelector('.brand p'); if(brand) brand.textContent=BUILD+' · Locked Detection + Dimension Engine V2';
    document.title='SplashCAD — '+BUILD;

    const controls=document.querySelector('.edge-manual-controls');
    const drawing=document.getElementById('drawingCanvas');
    const heightHost=document.getElementById('heightMeasurementSequence');
    const baseOverlay=document.querySelector('.edge-manual-overlay');
    if(!controls||!drawing||!heightHost||!baseOverlay) return;

    /* UPDATE 016: no separate Witness button. Every manual height automatically
       measures from the nearest horizontal drawing line directly underneath.
       If there is no lower line, the bottom datum is used with a witness line. */
    controls.querySelector('[data-witness-tool]')?.remove();
    controls.querySelector('.witness-measure-overlay')?.remove();

    const wrap=drawing.parentElement;
    if(getComputedStyle(wrap).position==='static') wrap.style.position='relative';
    const overlay=document.createElement('canvas');
    overlay.className='auto-height-datum-overlay';
    Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'14',pointerEvents:'none',touchAction:'none'});
    wrap.appendChild(overlay);

    const status=controls.querySelector('.edge-manual-status');
    const heights=[];

    const resize=()=>{
      const r=drawing.getBoundingClientRect(),d=window.devicePixelRatio||1;
      overlay.width=Math.max(1,Math.round(r.width*d));
      overlay.height=Math.max(1,Math.round(r.height*d));
      overlay.style.width=r.width+'px'; overlay.style.height=r.height+'px';
      draw();
    };

    const toDrawingPoint=e=>{
      const r=baseOverlay.getBoundingClientRect();
      return{x:(e.clientX-r.left)/r.width*drawing.width,y:(e.clientY-r.top)/r.height*drawing.height};
    };

    const pixelInfo=()=>{
      const ctx=drawing.getContext('2d',{willReadFrequently:true}),w=drawing.width,h=drawing.height;
      let data=null; try{data=ctx.getImageData(0,0,w,h).data;}catch{}
      const dark=(x,y)=>{
        if(!data||x<0||y<0||x>=w||y>=h)return false;
        const i=(Math.round(y)*w+Math.round(x))*4,r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
        if(a<20)return false;
        const red=r>145&&r>g*1.25&&r>b*1.2;
        const white=r>235&&g>235&&b>235;
        const glass=r>155&&g>165&&b>170&&Math.max(r,g,b)-Math.min(r,g,b)<65;
        return !red&&!white&&!glass&&r<175&&g<185&&b<195;
      };
      const horizontalScore=(x,y)=>{
        let score=0;
        const span=Math.max(12,Math.round(w/90));
        for(let dx=-span;dx<=span;dx+=2) if(dark(Math.round(x+dx),Math.round(y))) score++;
        return score;
      };
      return{w,h,dark,horizontalScore};
    };

    const nearestHorizontal=p=>{
      const px=pixelInfo(),rad=Math.max(14,Math.round(px.w/80));
      let best=null,bestScore=Infinity;
      for(let y=Math.max(2,Math.round(p.y-rad));y<=Math.min(px.h-3,Math.round(p.y+rad));y++){
        const hs=px.horizontalScore(p.x,y);
        if(hs<5)continue;
        const score=Math.abs(y-p.y)-hs*.2;
        if(score<bestScore){bestScore=score;best={x:p.x/px.w,y:y/px.h};}
      }
      return best;
    };

    const glassBottom=()=>{
      const ctx=drawing.getContext('2d',{willReadFrequently:true}),w=drawing.width,h=drawing.height;
      let maxY=0,n=0;
      try{
        const data=ctx.getImageData(0,0,w,h).data,step=Math.max(3,Math.floor(w/400));
        for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
          const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2];
          if(r>155&&g>165&&b>170&&r<240&&g<245&&b<250){maxY=Math.max(maxY,y);n++;}
        }
      }catch{}
      return n>20?maxY/h:.72;
    };

    const nearestLineUnder=top=>{
      const px=pixelInfo();
      const x=top.x*px.w,topY=top.y*px.h;
      const bottomY=glassBottom()*px.h;
      const minGap=Math.max(12,Math.round(px.h/70));
      let candidate=null;
      let runStart=null;
      for(let y=Math.round(topY+minGap);y<=Math.round(bottomY);y++){
        const hs=px.horizontalScore(x,y);
        if(hs>=5){if(runStart===null)runStart=y;}
        else if(runStart!==null){candidate=(runStart+y-1)/2;break;}
      }
      if(candidate!==null && candidate<bottomY-minGap*.35){
        return{y:candidate/px.h,isDatum:false};
      }
      return{y:bottomY/px.h,isDatum:true};
    };

    const line=(c,x1,y1,x2,y2)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();};
    const draw=()=>{
      const c=overlay.getContext('2d'),d=window.devicePixelRatio||1;
      c.clearRect(0,0,overlay.width,overlay.height);
      c.font='800 '+(12*d)+'px sans-serif';
      heights.forEach((m,i)=>{
        const x=m.top.x*overlay.width,yt=m.top.y*overlay.height,yb=m.bottom.y*overlay.height;
        const red='#b91c1c',wit='#9ca3af';
        if(m.bottom.isDatum){
          c.strokeStyle=wit;c.lineWidth=1*d;c.setLineDash([4*d,4*d]);
          line(c,x-30*d,yb,x+8*d,yb);
          c.setLineDash([]);
        }
        c.strokeStyle=red;c.fillStyle=red;c.lineWidth=1.5*d;c.setLineDash([]);
        line(c,x,yb,x,yt);
        line(c,x-6*d,yt,x+6*d,yt);
        line(c,x-6*d,yb,x+6*d,yb);
        c.fillText('H'+(i+1),x+10*d,(yt+yb)/2);
      });
    };

    const addHeightRows=()=>{
      heightHost.querySelectorAll('.auto-datum-height-row').forEach(n=>n.remove());
      heights.forEach((m,i)=>{
        const row=document.createElement('div');row.className='measure-sequence-row auto-datum-height-row';
        row.innerHTML='<div class="measure-seq-no">'+(i+1)+'</div><div class="measure-seq-label">Height '+(i+1)+'</div><input class="height-seq-input edge-measure-input auto-datum-height-input" inputmode="decimal" autocomplete="off" placeholder="mm">';
        heightHost.appendChild(row);
      });
      const all=[...document.querySelectorAll('#productionMeasurementPanel .edge-measure-input')];
      all.forEach((input,i)=>{if(input.dataset.autoDatumEnterBound)return;input.dataset.autoDatumEnterBound='1';input.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();all[i+1]?.focus()||input.blur();});});
    };

    /* Capture height touches before UPDATE 014's generic height handler. */
    baseOverlay.addEventListener('pointerdown',e=>{
      const heightButton=controls.querySelector('[data-edge-tool="height"]');
      if(!heightButton?.classList.contains('active'))return;
      e.preventDefault();e.stopImmediatePropagation();
      const top=nearestHorizontal(toDrawingPoint(e));
      if(!top){if(status)status.textContent='Touch the height line itself — blank space is ignored.';return;}
      const lower=nearestLineUnder(top);
      heights.push({top,bottom:lower});
      draw();
      if(status)status.textContent=lower.isDatum
        ? 'Height '+heights.length+' added from bottom witness datum.'
        : 'Height '+heights.length+' added from the nearest line underneath.';
    },true);

    controls.querySelector('[data-edge-tool="enter"]')?.addEventListener('click',()=>setTimeout(addHeightRows,0),true);
    controls.querySelector('[data-edge-tool="clear"]')?.addEventListener('click',()=>{heights.length=0;draw();addHeightRows();},true);
    controls.querySelector('[data-edge-tool="delete"]')?.addEventListener('click',()=>{
      if(controls.querySelector('[data-edge-tool="height"]')?.classList.contains('active')&&heights.length){heights.pop();draw();if(status)status.textContent='Last manual height removed.';}
    },true);

    const heightButton=controls.querySelector('[data-edge-tool="height"]');
    heightButton?.addEventListener('click',()=>setTimeout(()=>{if(status)status.textContent='Touch each height line once. SplashCAD measures from the nearest horizontal line underneath, or the bottom datum when there is no lower line.';},0));

    window.addEventListener('resize',resize);new ResizeObserver(resize).observe(drawing);resize();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,220));else setTimeout(start,220);
})();