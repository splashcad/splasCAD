(() => {
  const BUILD='ALPHA 6.0.22 · UPDATE 019';
  const start=()=>{
    const proof=document.querySelector('.alpha-proof');if(proof)proof.textContent=BUILD;
    const brand=document.querySelector('.brand p');if(brand)brand.textContent=BUILD+' · Locked Detection + Dimension Engine V2';
    document.title='SplashCAD — '+BUILD;

    const controls=document.querySelector('.edge-manual-controls');
    const drawing=document.getElementById('drawingCanvas');
    const scroller=document.querySelector('.main-workspace');
    const base=document.querySelector('.edge-manual-overlay');
    if(!controls||!drawing||!base)return;

    controls.querySelector('[data-witness-tool]')?.remove();
    document.querySelector('.witness-measure-overlay')?.remove();
    document.querySelector('.height-layout-overlay')?.remove();

    const manual=controls.querySelector('[data-edge-mode="manual"]');
    const heightButton=controls.querySelector('[data-edge-tool="height"]');
    const widthButton=controls.querySelector('[data-edge-tool="width"]');
    const enterButton=controls.querySelector('[data-edge-tool="enter"]');
    const clearButton=controls.querySelector('[data-edge-tool="clear"]');
    const deleteButton=controls.querySelector('[data-edge-tool="delete"]');
    const status=document.getElementById('drawingStatus');
    const hasDrawing=()=>!!status&&!/No drawing generated yet/i.test(status.textContent||'');

    if(scroller)scroller.scrollTop=0;
    manual?.addEventListener('click',()=>{if(!hasDrawing())return;const card=drawing.closest('.drawing-card')||drawing.parentElement;setTimeout(()=>scroller?.scrollTo({top:Math.max(0,card.offsetTop-6),behavior:'smooth'}),40);});

    const wrap=drawing.parentElement;if(getComputedStyle(wrap).position==='static')wrap.style.position='relative';
    const overlay=document.createElement('canvas');overlay.className='height-layout-overlay';Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'15',pointerEvents:'none',display:'none'});wrap.appendChild(overlay);
    const ctx=drawing.getContext('2d',{willReadFrequently:true});
    const picks=[];

    const dark=(r,g,b,a)=>a>20&&r<150&&g<165&&b<175;
    const horizontalRuns=()=>{
      const w=drawing.width,h=drawing.height,out=[];
      try{
        const data=ctx.getImageData(0,0,w,h).data,step=Math.max(2,Math.floor(w/700));
        for(let y=2;y<h-2;y+=step){let start=-1,last=-1;for(let x=2;x<w-2;x+=step){const i=(y*w+x)*4,on=dark(data[i],data[i+1],data[i+2],data[i+3]);if(on){if(start<0)start=x;last=x}else if(start>=0){if(last-start>Math.max(25,w*.025))out.push({y:y/h,x1:start/w,x2:last/w});start=-1}}if(start>=0&&last-start>Math.max(25,w*.025))out.push({y:y/h,x1:start/w,x2:last/w});}
      }catch{}
      const merged=[];out.sort((a,b)=>a.y-b.y);
      for(const r of out){const m=merged.find(q=>Math.abs(q.y-r.y)<.008&&Math.max(q.x1,r.x1)<=Math.min(q.x2,r.x2)+.02);if(m){m.y=(m.y+r.y)/2;m.x1=Math.min(m.x1,r.x1);m.x2=Math.max(m.x2,r.x2)}else merged.push({...r});}
      return merged;
    };
    const line=(c,x1,y1,x2,y2)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();};
    const nearestHorizontal=(xN,yN,runs)=>{
      let best=null,score=1e9;for(const r of runs){if(xN<r.x1-.035||xN>r.x2+.035)continue;const s=Math.abs(r.y-yN);if(s<score){score=s;best=r;}}return score<.035?best:null;
    };
    const lowerHorizontal=(xN,yN,runs)=>{
      const candidates=runs.filter(r=>r.y>yN+.018&&xN>=r.x1-.018&&xN<=r.x2+.018).sort((a,b)=>a.y-b.y);return candidates[0]||null;
    };
    const geometry=()=>{
      const runs=horizontalRuns();if(!runs.length)return null;
      return{runs,left:Math.min(...runs.map(r=>r.x1)),right:Math.max(...runs.map(r=>r.x2)),bottom:Math.max(...runs.map(r=>r.y))};
    };
    const resize=()=>{const r=drawing.getBoundingClientRect(),d=devicePixelRatio||1;overlay.width=Math.max(1,Math.round(r.width*d));overlay.height=Math.max(1,Math.round(r.height*d));overlay.style.width=r.width+'px';overlay.style.height=r.height+'px';render();};
    const render=()=>{
      const c=overlay.getContext('2d'),d=devicePixelRatio||1;c.clearRect(0,0,overlay.width,overlay.height);if(overlay.style.display==='none'||!hasDrawing())return;
      const g=geometry();if(!g)return;
      const datumY=Math.min(overlay.height-25*d,g.bottom*overlay.height+62*d),left=g.left*overlay.width,right=g.right*overlay.width;
      c.lineWidth=1.4*d;c.strokeStyle='#c55';c.setLineDash([8*d,6*d]);
      // One clean datum line, visible before any height touch.
      line(c,left-28*d,datumY,right+28*d,datumY);
      for(const p of picks){
        const x=p.x*overlay.width,top=p.top*overlay.height;
        if(p.lower!=null){
          // Real lower edge exists: keep this measurement inside the drawing.
          const low=p.lower*overlay.height;c.setLineDash([]);c.strokeStyle='#b91c1c';line(c,x,top,x,low);line(c,x-6*d,top,x+6*d,top);line(c,x-6*d,low,x+6*d,low);
        }else{
          // No real lower edge: only this selected height gets a witness to datum.
          c.setLineDash([8*d,6*d]);c.strokeStyle='#c55';line(c,x,top,x,datumY);line(c,x-7*d,datumY,x+7*d,datumY);
        }
      }
      c.setLineDash([]);
    };
    const showHeight=()=>{if(!hasDrawing())return;base.style.opacity='0';overlay.style.display='block';resize();};
    const hideHeight=()=>{base.style.opacity='';overlay.style.display='none';render();};

    base.addEventListener('pointerdown',e=>{
      if(!heightButton?.classList.contains('active')||overlay.style.display==='none')return;
      const r=base.getBoundingClientRect(),xN=(e.clientX-r.left)/r.width,yN=(e.clientY-r.top)/r.height,g=geometry();if(!g)return;
      const top=nearestHorizontal(xN,yN,g.runs);if(!top)return;
      const lower=lowerHorizontal(xN,top.y,g.runs);
      picks.push({x:Math.min(Math.max(xN,top.x1),top.x2),top:top.y,lower:lower?lower.y:null});
      setTimeout(render,0);
    },true);

    heightButton?.addEventListener('click',()=>setTimeout(showHeight,0));
    widthButton?.addEventListener('click',hideHeight);
    enterButton?.addEventListener('click',hideHeight);
    clearButton?.addEventListener('click',()=>{picks.length=0;setTimeout(()=>{if(heightButton?.classList.contains('active'))showHeight();else render();},0);});
    deleteButton?.addEventListener('click',()=>{if(heightButton?.classList.contains('active')&&picks.length){picks.pop();setTimeout(render,0);}},true);

    new ResizeObserver(resize).observe(drawing);window.addEventListener('resize',resize);
    if(status)new MutationObserver(()=>{if(overlay.style.display!=='none')setTimeout(resize,0);}).observe(status,{childList:true,characterData:true,subtree:true});
    setTimeout(resize,150);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,260));else setTimeout(start,260);
})();