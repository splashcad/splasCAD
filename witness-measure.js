(() => {
  const BUILD='ALPHA 6.0.22 · UPDATE 020';
  const start=()=>{
    const proof=document.querySelector('.alpha-proof');if(proof)proof.textContent=BUILD;
    const brand=document.querySelector('.brand p');if(brand)brand.textContent=BUILD+' · Locked Detection + Dimension Engine V2';
    document.title='SplashCAD — '+BUILD;

    const controls=document.querySelector('.edge-manual-controls');
    const drawing=document.getElementById('drawingCanvas');
    const scroller=document.querySelector('.main-workspace');
    if(!controls||!drawing)return;

    document.querySelector('.height-layout-overlay')?.remove();
    document.querySelector('.witness-measure-overlay')?.remove();
    controls.querySelector('[data-witness-tool]')?.remove();

    const manual=controls.querySelector('[data-edge-mode="manual"]');
    const heightButton=controls.querySelector('[data-edge-tool="height"]');
    const widthButton=controls.querySelector('[data-edge-tool="width"]');
    const enterButton=controls.querySelector('[data-edge-tool="enter"]');
    const status=document.getElementById('drawingStatus');
    const hasDrawing=()=>!!status&&!/No drawing generated yet/i.test(status.textContent||'');

    if(scroller)scroller.scrollTop=0;
    manual?.addEventListener('click',()=>{
      if(!hasDrawing())return;
      const card=drawing.closest('.drawing-card')||drawing.parentElement;
      setTimeout(()=>scroller?.scrollTo({top:Math.max(0,card.offsetTop-6),behavior:'smooth'}),40);
    });

    const wrap=drawing.parentElement;
    if(getComputedStyle(wrap).position==='static')wrap.style.position='relative';
    const overlay=document.createElement('canvas');
    overlay.className='height-layout-overlay';
    Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'15',pointerEvents:'none',display:'none'});
    wrap.appendChild(overlay);

    const ctx=drawing.getContext('2d',{willReadFrequently:true});
    const dark=(r,g,b,a)=>a>20&&r<150&&g<165&&b<175;
    const horizontalRuns=()=>{
      const w=drawing.width,h=drawing.height,out=[];
      try{
        const data=ctx.getImageData(0,0,w,h).data,step=Math.max(2,Math.floor(w/700));
        for(let y=2;y<h-2;y+=step){
          let start=-1,last=-1;
          for(let x=2;x<w-2;x+=step){
            const i=(y*w+x)*4,on=dark(data[i],data[i+1],data[i+2],data[i+3]);
            if(on){if(start<0)start=x;last=x;}
            else if(start>=0){if(last-start>Math.max(25,w*.025))out.push({y:y/h,x1:start/w,x2:last/w});start=-1;}
          }
          if(start>=0&&last-start>Math.max(25,w*.025))out.push({y:y/h,x1:start/w,x2:last/w});
        }
      }catch{}
      const merged=[];out.sort((a,b)=>a.y-b.y);
      for(const r of out){
        const m=merged.find(q=>Math.abs(q.y-r.y)<.008&&Math.max(q.x1,r.x1)<=Math.min(q.x2,r.x2)+.02);
        if(m){m.y=(m.y+r.y)/2;m.x1=Math.min(m.x1,r.x1);m.x2=Math.max(m.x2,r.x2);}else merged.push({...r});
      }
      return merged;
    };
    const line=(c,x1,y1,x2,y2)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();};
    const resize=()=>{
      const r=drawing.getBoundingClientRect(),d=devicePixelRatio||1;
      overlay.width=Math.max(1,Math.round(r.width*d));overlay.height=Math.max(1,Math.round(r.height*d));
      overlay.style.width=r.width+'px';overlay.style.height=r.height+'px';render();
    };
    const render=()=>{
      const c=overlay.getContext('2d'),d=devicePixelRatio||1;
      c.clearRect(0,0,overlay.width,overlay.height);
      if(overlay.style.display==='none'||!hasDrawing())return;
      const runs=horizontalRuns();if(runs.length<2)return;

      const left=Math.min(...runs.map(r=>r.x1))*overlay.width;
      const right=Math.max(...runs.map(r=>r.x2))*overlay.width;
      const top=Math.min(...runs.map(r=>r.y))*overlay.height;
      const bottomRun=runs.reduce((a,b)=>a.y>b.y?a:b);
      const bottomY=bottomRun.y*overlay.height;
      const bottomStart=bottomRun.x1*overlay.width;
      const datumY=Math.min(overlay.height-28*d,bottomY+58*d);

      // Hand drawing: left-side lower level above the bottom datum.
      const leftLevels=runs.filter(r=>r.y<bottomRun.y-.02&&r.x1*overlay.width<=left+20*d&&r.x2*overlay.width>left+35*d).sort((a,b)=>b.y-a.y);
      const leftLevel=leftLevels[0]||runs.filter(r=>r.y<bottomRun.y-.02).sort((a,b)=>b.y-a.y)[0];

      // Hand drawing: inner lower step which receives the second bottom witness.
      const innerLevels=runs.filter(r=>r.y<bottomRun.y-.02&&r.x2<bottomRun.x2-.02).sort((a,b)=>b.y-a.y);
      const innerLevel=innerLevels[0]||leftLevel;
      const innerX=innerLevel?Math.max(innerLevel.x1,Math.min(innerLevel.x2,bottomRun.x1))*overlay.width:bottomStart;

      // Hand drawing: one upper horizontal witness across the main working level only.
      const middleRuns=runs.filter(r=>r.y>runs[0].y+.02&&r.y<bottomRun.y-.05);
      const mainLevel=(middleRuns.length?middleRuns:runs.slice(1,-1)).sort((a,b)=>(b.x2-b.x1)-(a.x2-a.x1))[0];

      c.strokeStyle='#c55';c.lineWidth=1.4*d;c.setLineDash([8*d,7*d]);

      // Bottom witness exactly where the hand drawing has no real bottom edge.
      line(c,left-22*d,datumY,bottomStart,datumY);

      // Left vertical witness: bottom datum up to the left lower horizontal edge.
      if(leftLevel)line(c,left-10*d,leftLevel.y*overlay.height,left-10*d,datumY);

      // Inner vertical witness: bottom datum up to the inner lower step.
      if(innerLevel)line(c,innerX,innerLevel.y*overlay.height,innerX,datumY);

      // Upper witness across the main level, as marked in red on the hand drawing.
      if(mainLevel){
        const y=mainLevel.y*overlay.height-8*d;
        line(c,mainLevel.x1*overlay.width,y,right+12*d,y);
        line(c,right+12*d,y,right+12*d,mainLevel.y*overlay.height+8*d);
      }

      c.setLineDash([]);
    };

    const show=()=>{if(!hasDrawing())return;overlay.style.display='block';resize();};
    const hide=()=>{overlay.style.display='none';render();};
    heightButton?.addEventListener('click',()=>setTimeout(show,0));
    widthButton?.addEventListener('click',hide);
    enterButton?.addEventListener('click',hide);

    new ResizeObserver(resize).observe(drawing);
    window.addEventListener('resize',resize);
    if(status)new MutationObserver(()=>{if(overlay.style.display!=='none')setTimeout(resize,0);}).observe(status,{childList:true,characterData:true,subtree:true});
    setTimeout(resize,150);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,260));else setTimeout(start,260);
})();