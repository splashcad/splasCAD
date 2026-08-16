(() => {
  const BUILD='ALPHA 6.0.22 · UPDATE 017';
  const start=()=>{
    const proof=document.querySelector('.alpha-proof');if(proof)proof.textContent=BUILD;
    const brand=document.querySelector('.brand p');if(brand)brand.textContent=BUILD+' · Locked Detection + Dimension Engine V2';
    document.title='SplashCAD — '+BUILD;
    const controls=document.querySelector('.edge-manual-controls'),drawing=document.getElementById('drawingCanvas'),scroller=document.querySelector('.main-workspace');
    if(!controls||!drawing)return;
    controls.querySelector('[data-witness-tool]')?.remove();
    document.querySelector('.witness-measure-overlay')?.remove();
    const manual=controls.querySelector('[data-edge-mode="manual"]');
    const hasDrawing=()=>{const s=document.getElementById('drawingStatus');return !!s&&!/No drawing generated yet/i.test(s.textContent||'');};
    if(scroller)scroller.scrollTop=0;
    manual?.addEventListener('click',()=>{if(!hasDrawing())return;const card=drawing.closest('.drawing-card')||drawing.parentElement;setTimeout(()=>scroller?.scrollTo({top:Math.max(0,card.offsetTop-6),behavior:'smooth'}),40);});

    const base=document.querySelector('.edge-manual-overlay');
    if(!base)return;
    const overlay=document.createElement('canvas');overlay.className='height-layout-overlay';Object.assign(overlay.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'15',pointerEvents:'none'});base.parentElement.appendChild(overlay);
    const ctx=drawing.getContext('2d',{willReadFrequently:true});
    const dark=(r,g,b,a)=>a>20&&r<150&&g<165&&b<175;
    const horizontalRuns=()=>{const w=drawing.width,h=drawing.height,out=[];try{const data=ctx.getImageData(0,0,w,h).data,step=Math.max(2,Math.floor(w/700));for(let y=2;y<h-2;y+=step){let start=-1,last=-1;for(let x=2;x<w-2;x+=step){const i=(y*w+x)*4,on=dark(data[i],data[i+1],data[i+2],data[i+3]);if(on){if(start<0)start=x;last=x}else if(start>=0){if(last-start>Math.max(25,w*.025))out.push({y:y/h,x1:start/w,x2:last/w});start=-1}}if(start>=0&&last-start>Math.max(25,w*.025))out.push({y:y/h,x1:start/w,x2:last/w});} }catch{}const merged=[];out.sort((a,b)=>a.y-b.y);for(const r of out){const m=merged.find(q=>Math.abs(q.y-r.y)<.008&&Math.max(q.x1,r.x1)<=Math.min(q.x2,r.x2)+.02);if(m){m.y=(m.y+r.y)/2;m.x1=Math.min(m.x1,r.x1);m.x2=Math.max(m.x2,r.x2)}else merged.push({...r});}return merged;};
    const line=(c,x1,y1,x2,y2)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();};
    const resize=()=>{const r=drawing.getBoundingClientRect(),d=devicePixelRatio||1;overlay.width=Math.max(1,Math.round(r.width*d));overlay.height=Math.max(1,Math.round(r.height*d));overlay.style.width=r.width+'px';overlay.style.height=r.height+'px';render();};
    const render=()=>{const c=overlay.getContext('2d'),d=devicePixelRatio||1;c.clearRect(0,0,overlay.width,overlay.height);const runs=horizontalRuns();if(!runs.length)return;const left=Math.min(...runs.map(r=>r.x1))*overlay.width,right=Math.max(...runs.map(r=>r.x2))*overlay.width,bottom=Math.max(...runs.map(r=>r.y))*overlay.height,top=Math.min(...runs.map(r=>r.y))*overlay.height;c.strokeStyle='#c55';c.lineWidth=1.25*d;c.setLineDash([7*d,6*d]);line(c,left-18*d,bottom,left+10*d,bottom);line(c,right-10*d,bottom,right+18*d,bottom);line(c,left-18*d,bottom,left-18*d,top);line(c,right+18*d,bottom,right+18*d,top);for(const r of runs){const y=r.y*overlay.height;line(c,r.x1*overlay.width-10*d,y,r.x1*overlay.width+5*d,y);line(c,r.x2*overlay.width-5*d,y,r.x2*overlay.width+10*d,y);}c.setLineDash([]);};
    new ResizeObserver(resize).observe(drawing);window.addEventListener('resize',resize);setTimeout(resize,150);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,260));else setTimeout(start,260);
})();