(() => {
  const BUILD='ALPHA 6.0.22 · UPDATE 021';
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
        const m=merged.find(q=>Math.abs(q.y-r.y)<.008&&Math.max(q.x1,r.x1)<=Math.min(q.x2,r.x2)+.018);
        if(m){m.y=(m.y+r.y)/2;m.x1=Math.min(m.x1,r.x1);m.x2=Math.max(m.x2,r.x2);}else merged.push({...r});
      }
      return merged;
    };

    const verticalRuns=()=>{
      const w=drawing.width,h=drawing.height,out=[];
      try{
        const data=ctx.getImageData(0,0,w,h).data,step=Math.max(2,Math.floor(h/520));
        for(let x=2;x<w-2;x+=step){
          let start=-1,last=-1;
          for(let y=2;y<h-2;y+=step){
            const i=(y*w+x)*4,on=dark(data[i],data[i+1],data[i+2],data[i+3]);
            if(on){if(start<0)start=y;last=y;}
            else if(start>=0){if(last-start>Math.max(25,h*.025))out.push({x:x/w,y1:start/h,y2:last/h});start=-1;}
          }
          if(start>=0&&last-start>Math.max(25,h*.025))out.push({x:x/w,y1:start/h,y2:last/h});
        }
      }catch{}
      const merged=[];out.sort((a,b)=>a.x-b.x);
      for(const r of out){
        const m=merged.find(q=>Math.abs(q.x-r.x)<.008&&Math.max(q.y1,r.y1)<=Math.min(q.y2,r.y2)+.018);
        if(m){m.x=(m.x+r.x)/2;m.y1=Math.min(m.y1,r.y1);m.y2=Math.max(m.y2,r.y2);}else merged.push({...r});
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
      const c=overlay.getContext('2d'),d=devicePixelRatio||1;c.clearRect(0,0,overlay.width,overlay.height);
      if(overlay.style.display==='none'||!hasDrawing())return;
      const hrs=horizontalRuns(),vrs=verticalRuns();if(hrs.length<2||vrs.length<2)return;

      const leftX=Math.min(...vrs.map(v=>v.x));
      const rightX=Math.max(...vrs.map(v=>v.x));
      const bottomY=Math.max(...hrs.map(h=>h.y));

      // Main shoulder/ledge: longest horizontal line in the middle of the shape.
      const candidates=hrs.filter(h=>h.y>.28&&h.y<bottomY-.04);
      const shoulder=(candidates.length?candidates:hrs).sort((a,b)=>(b.x2-b.x1)-(a.x2-a.x1))[0];

      // Left lower glass edge: horizontal edge ending before the inner/right panel.
      const leftLower=hrs.filter(h=>h.y>shoulder.y+.03&&h.y<bottomY-.02&&h.x1<=leftX+.035).sort((a,b)=>b.y-a.y)[0]||shoulder;

      // Inner vertical edge: the vertical edge nearest the start of the lower/right panel.
      const innerCandidates=vrs.filter(v=>v.x>leftX+.08&&v.x<rightX-.08&&v.y2<bottomY+.025).sort((a,b)=>Math.abs(a.x-shoulder.x2)-Math.abs(b.x-shoulder.x2));
      const inner=innerCandidates[0]||vrs.filter(v=>v.x>leftX+.08&&v.x<rightX-.08).sort((a,b)=>a.x-b.x)[0];

      const bottomPanel=hrs.filter(h=>Math.abs(h.y-bottomY)<.018).sort((a,b)=>(b.x2-b.x1)-(a.x2-a.x1))[0];
      const datumY=Math.min(.92,bottomY+.09);

      c.strokeStyle='#c55';c.lineWidth=1.35*d;c.setLineDash([8*d,7*d]);
      const X=n=>n*overlay.width,Y=n=>n*overlay.height;

      // 1) Left vertical witness = continuation of the actual left edge down to the datum.
      line(c,X(leftX),Y(leftLower.y),X(leftX),Y(datumY));

      // 2) Inner vertical witness = continuation of the actual inner edge down to the datum.
      if(inner)line(c,X(inner.x),Y(inner.y2),X(inner.x),Y(datumY));

      // 3) Bottom witness only across the empty space between those two continued edges.
      const bottomEnd=inner?inner.x:(bottomPanel?bottomPanel.x1:rightX);
      line(c,X(leftX),Y(datumY),X(bottomEnd),Y(datumY));

      // 4) Horizontal witness at the shoulder level: extend the real shoulder edge through empty space only.
      //    Do not draw over the real glass line itself.
      if(shoulder){
        if(shoulder.x1>leftX+.015)line(c,X(leftX),Y(shoulder.y),X(shoulder.x1),Y(shoulder.y));
        if(shoulder.x2<rightX-.015)line(c,X(shoulder.x2),Y(shoulder.y),X(rightX),Y(shoulder.y));
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