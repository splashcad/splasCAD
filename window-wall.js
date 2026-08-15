const $=id=>document.getElementById(id);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)));

const pieces=[
  {id:'leftWall',name:'Panel left of window',width:423,secondWidth:423,height:457,secondHeight:457,offSquareWidth:false,offSquareHeight:false,colour:'#10b981'},
  {id:'belowWindow',name:'Panel below window',width:2340,secondWidth:2340,height:175,secondHeight:175,offSquareWidth:false,offSquareHeight:false,colour:'#f59e0b'},
  {id:'rightWall',name:'Panel right of window',width:669,secondWidth:669,height:457,secondHeight:457,offSquareWidth:false,offSquareHeight:false,colour:'#0ea5e9'},
  {id:'leftReveal',name:'Left reveal (optional)',width:215,secondWidth:215,height:288,secondHeight:288,offSquareWidth:false,offSquareHeight:true,datum:'none',colour:'#a855f7',optional:'reveals'},
  {id:'rightReveal',name:'Right reveal (optional)',width:214,secondWidth:214,height:297,secondHeight:297,offSquareWidth:false,offSquareHeight:true,datum:'none',colour:'#a855f7',optional:'reveals'},
  {id:'sill',name:'Window sill (optional)',width:2340,secondWidth:2340,height:221,secondHeight:221,offSquareWidth:false,offSquareHeight:false,datum:'none',colour:'#8b5cf6',optional:'sill'}
];

function buildPanels(g){
  const [otl,otr,obr,obl]=g.outer;
  const cy=(g.counter[0].y+g.counter[1].y)/2, leftTop=g.walls.leftTopX??g.walls.leftX, leftBottom=g.walls.leftBottomX??g.walls.leftX, rightTop=g.walls.rightTopX??g.walls.rightX, rightBottom=g.walls.rightBottomX??g.walls.rightX, sy=g.sideTopY,leftJoinX=(otl.x+obl.x)/2,rightJoinX=(otr.x+obr.x)/2;
  return [
    {piece:0,points:[{x:leftTop,y:sy},{x:leftJoinX,y:sy},{x:leftJoinX,y:cy},{x:leftBottom,y:cy}]},
    {piece:1,points:[{x:leftJoinX,y:obl.y},{x:rightJoinX,y:obr.y},{x:rightJoinX,y:cy},{x:leftJoinX,y:cy}]},
    {piece:2,points:[{x:rightJoinX,y:sy},{x:rightTop,y:sy},{x:rightBottom,y:cy},{x:rightJoinX,y:cy}]}
  ].map(panel=>({...panel,points:panel.points.map(p=>({x:clamp(p.x,.025,.975),y:clamp(p.y,.025,.975)}))}));
}

const benchmarkGeometry={
  outer:[{x:.157,y:.202},{x:.777,y:.190},{x:.777,y:.482},{x:.157,y:.482}],
  counter:[{x:.045,y:.555},{x:.94,y:.555}],walls:{leftTopX:.045,leftBottomX:.045,rightTopX:.94,rightBottomX:.94},sideTopY:.365
};
const benchmarkFittings=[
  {x:.105,y:.422,width:.052,height:.034,type:'double',editWidth:145,editHeight:85,confidence:100},
  {x:.815,y:.420,width:.055,height:.035,type:'double',editWidth:145,editHeight:85,confidence:100}
];

const state={
  panels:[],fittings:[],markers:[],notches:[],radii:[],squares:[],
  mode:'move',detailMode:'move',detailPiece:'leftWall',activeMeasureKey:'leftWall',measurementDirection:'ltr',measurementDirections:{leftWall:'rtl',rightWall:'ltr',belowWindow:'ltr',leftReveal:'rtl',rightReveal:'ltr',sill:'ltr'},selectedPanel:0,selectedSocket:null,selectedDetail:null,drag:null,imageDataUrl:null,scanComplete:false,revealsNeeded:false,sillNeeded:false,leftOverlap:false,rightOverlap:false,extraRectangles:[],pieceEdits:{},editHistory:{},widthStations:{leftWall:[196],rightWall:[151],belowWindow:[],leftReveal:[],rightReveal:[],sill:[]},heightStations:{leftWall:[215],rightWall:[212],belowWindow:[],leftReveal:[],rightReveal:[],sill:[]}
};
function directionFor(key){return state.measurementDirections[key]||state.measurementDirection||'ltr';}
let overlayRect={w:1,h:1};
let drawingLayouts=[];

function setStatus(message,ok=true){$('status').textContent=message;$('status').className=`status ${ok?'success':'warning'}`;}
function normToCanvas(p){return{x:p.x*overlayRect.w,y:p.y*overlayRect.h};}
function canvasToNorm(e){const r=$('windowOverlay').getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)};}
function pointInPolygon(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if(((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y||1e-9)+a.x))inside=!inside;}return inside;}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}

function sizeOverlay(){
  const img=$('windowPhoto'),stage=$('windowStage'),canvas=$('windowOverlay'),r=img.getBoundingClientRect(),sr=stage.getBoundingClientRect(),naturalW=img.naturalWidth||r.width,naturalH=img.naturalHeight||r.height,scale=Math.min(r.width/naturalW,r.height/naturalH),w=naturalW*scale,h=naturalH*scale,left=(r.left-sr.left)+(r.width-w)/2,top=(r.top-sr.top)+(r.height-h)/2;
  canvas.width=Math.max(1,Math.round(w*devicePixelRatio));canvas.height=Math.max(1,Math.round(h*devicePixelRatio));canvas.style.inset='auto';canvas.style.left=`${left}px`;canvas.style.top=`${top}px`;canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;overlayRect={w,h};drawOverlay();
}

function drawOverlay(){
  const c=$('windowOverlay'),ctx=c.getContext('2d');ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.clearRect(0,0,overlayRect.w,overlayRect.h);
  state.panels.forEach((panel,pi)=>{
    const piece=pieces[panel.piece];ctx.beginPath();panel.points.map(normToCanvas).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle=piece.colour+(pi===state.selectedPanel?'58':'2b');ctx.fill();ctx.strokeStyle=piece.colour;ctx.lineWidth=pi===state.selectedPanel?5:3;ctx.stroke();
    const centre=panel.points.reduce((a,p)=>({x:a.x+p.x/panel.points.length,y:a.y+p.y/panel.points.length}),{x:0,y:0});const cq=normToCanvas(centre);
    ctx.fillStyle='white';ctx.font='800 11px sans-serif';ctx.textAlign='center';ctx.fillText(piece.name,cq.x,cq.y);
    if(pi===state.selectedPanel)panel.points.forEach((p,i)=>{const q=normToCanvas(p);ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fillStyle='#2563eb';ctx.fill();ctx.fillStyle='white';ctx.font='800 10px sans-serif';ctx.fillText(String(i+1),q.x,q.y+4)});
  });
  if(state.panels.length===3){const lx=state.panels[1].points[0].x*overlayRect.w,rx=state.panels[1].points[1].x*overlayRect.w;ctx.save();ctx.setLineDash([8,6]);ctx.lineWidth=2;ctx.strokeStyle='#fff';[lx,rx].forEach(x=>{ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,overlayRect.h);ctx.stroke()});ctx.setLineDash([]);ctx.fillStyle='#111827cc';ctx.fillRect(lx-45,5,90,20);ctx.fillRect(rx-47,5,94,20);ctx.fillStyle='#fff';ctx.font='800 10px sans-serif';ctx.textAlign='center';ctx.fillText('WINDOW LEFT',lx,19);ctx.fillText('WINDOW RIGHT',rx,19);ctx.restore();}
  state.fittings.forEach((f,i)=>{const q=normToCanvas(f),w=f.width*overlayRect.w,h=f.height*overlayRect.h;ctx.save();ctx.strokeStyle='#dc2626';ctx.fillStyle='#ef444455';ctx.lineWidth=i===state.selectedSocket?5:3;if(f.type==='hole'){drawHoleCentreMark(ctx,q.x,q.y,Math.max(8,w/2));}else{ctx.fillRect(q.x-w/2,q.y-h/2,w,h);ctx.strokeRect(q.x-w/2,q.y-h/2,w,h);}ctx.fillStyle='white';ctx.font='800 10px sans-serif';ctx.textAlign='center';if(f.type!=='hole')ctx.fillText(`${f.type==='single'?'S/S':f.type==='cooker'?'C/S':'D/S'} ${i+1}`,q.x,q.y+4);ctx.restore();});
  state.markers.forEach((m,i)=>{const q=normToCanvas(m);ctx.fillStyle=m.kind==='width'?'#fde047':'#fb923c';ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111827';ctx.font='900 9px sans-serif';ctx.fillText(`${m.kind==='width'?'W':'H'}+`,q.x,q.y+3)});
  state.notches.forEach(n=>{const q=normToCanvas(n);ctx.save();ctx.translate(q.x,q.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#f97316';ctx.fillRect(-7,-7,14,14);ctx.restore()});
  state.squares.forEach(s=>{const q=normToCanvas(s);ctx.strokeStyle='#22c55e';ctx.lineWidth=3;ctx.strokeRect(q.x-8,q.y-8,16,16)});
  state.radii.forEach(r=>{const q=normToCanvas(r);drawCornerRadiusMark(ctx,q,r.corner||radiusCornerFromPoint(r.x,r.y),12,'#c084fc');ctx.fillStyle='#fff';ctx.font='800 9px sans-serif';ctx.fillText(`R${Math.round(Number(r.radius)||10)}`,q.x+10,q.y-10)});
}

function syncOptionEditors(){
  const values={leftRevealWidth:pieces[3].width,leftRevealWidth2:pieces[3].secondWidth,leftRevealHeight1:pieces[3].height,leftRevealHeight2:pieces[3].secondHeight,rightRevealWidth:pieces[4].width,rightRevealWidth2:pieces[4].secondWidth,rightRevealHeight1:pieces[4].height,rightRevealHeight2:pieces[4].secondHeight,sillWidth:pieces[5].width,sillWidth2:pieces[5].secondWidth,sillDepth:pieces[5].height,sillDepth2:pieces[5].secondHeight};
  Object.entries(values).forEach(([id,value])=>{if($(id)&&document.activeElement!==$(id))$(id).value=value;});
  [['leftRevealDatum',pieces[3].datum],['rightRevealDatum',pieces[4].datum],['sillDatum',pieces[5].datum]].forEach(([id,value])=>{if($(id))$(id).value=value||'none';});
}
function renderInputs(){
  const order=[0,2,1,...(state.sillNeeded?[5]:[]),...(state.revealsNeeded?[3,4]:[])];
  const rows=order.map(i=>({p:pieces[i],key:pieces[i].id,name:pieces[i].name,attrs:`data-piece="${i}"`}));
  state.extraRectangles.forEach((p,i)=>rows.push({p,key:`extra-${i}`,name:`Extra rectangle ${i+1}`,attrs:`data-extra="${i}"`,extra:i}));
  if(!rows.some(r=>r.key===state.activeMeasureKey))state.activeMeasureKey=rows[0]?.key||'leftWall';
  const activeIndex=Math.max(0,rows.findIndex(r=>r.key===state.activeMeasureKey));
  const heading=r=>`<div class="measure-piece-name"><span class="piece-dot" style="background:${r.p.colour||'#64748b'}"></span>${r.name}</div>`;
  const cards=rows.map((r,index)=>{
    const widths=state.widthStations[r.key]||[],heights=state.heightStations[r.key]||[],direction=directionFor(r.key);
    const widthRows=widths.map((value,i)=>`<label><span class="measure-station-label"><b>${i+1}</b> Width ${i+1}</span><input data-entry-order="width" data-width-station="${r.key}" data-station-index="${i}" type="number" value="${value}"></label>`).join('');
    const heightRows=heights.map((value,i)=>`<label><span class="measure-station-label"><b>${i+1}</b> Height ${i+1}</span><input data-entry-order="height" data-height-station="${r.key}" data-station-index="${i}" type="number" value="${value}"></label>`).join('');
    const wOverall=widths.length+1,hOverall=heights.length+1;
    return`<section class="piece-measurement-card"><div class="piece-order-badge">${index+1}</div>${heading(r)}<div class="piece-direction"><strong>Measure this piece from</strong><label><input type="radio" data-piece-direction="${r.key}" name="direction-${r.key}" value="ltr" ${direction==='ltr'?'checked':''}> Left → Right</label><label><input type="radio" data-piece-direction="${r.key}" name="direction-${r.key}" value="rtl" ${direction==='rtl'?'checked':''}> Right → Left</label></div><div class="measurement-columns"><div class="piece-measure-section"><div class="measure-group-title">A · WIDTHS</div>${widthRows}<label><span class="measure-station-label"><b>${wOverall}</b> Width ${wOverall}</span><input data-entry-order="width" ${r.attrs} data-field="width" type="number" value="${r.p.width}"></label><label class="off-square-toggle"><input ${r.attrs} data-field="offSquareWidth" type="checkbox" ${r.p.offSquareWidth?'checked':''}> Off-square width check</label>${r.p.offSquareWidth?`<label>Off-square width<input data-entry-order="width" ${r.attrs} data-field="secondWidth" type="number" value="${r.p.secondWidth}"></label>`:''}</div><div class="piece-measure-section"><div class="measure-group-title">B · HEIGHTS — FROM BOTTOM</div>${heightRows}<label><span class="measure-station-label"><b>${hOverall}</b> Height ${hOverall}</span><input data-entry-order="height" ${r.attrs} data-field="height" type="number" value="${r.p.height}"></label><label class="off-square-toggle"><input ${r.attrs} data-field="offSquareHeight" type="checkbox" ${r.p.offSquareHeight?'checked':''}> Off-square height check</label>${r.p.offSquareHeight?`<label>Off-square height<input data-entry-order="height" ${r.attrs} data-field="secondHeight" type="number" value="${r.p.secondHeight}"></label>`:''}</div></div>${r.p.datum!==undefined?`<label>90° datum<select ${r.attrs} data-field="datum"><option value="none" ${r.p.datum==='none'?'selected':''}>None</option><option value="top-left" ${r.p.datum==='top-left'?'selected':''}>Top left</option><option value="top-right" ${r.p.datum==='top-right'?'selected':''}>Top right</option><option value="bottom-left" ${r.p.datum==='bottom-left'?'selected':''}>Bottom left</option><option value="bottom-right" ${r.p.datum==='bottom-right'?'selected':''}>Bottom right</option></select></label>`:''}<button data-open-piece="${r.key}" class="edit-piece-button">Edit this piece</button>${r.extra!==undefined?`<button data-delete-extra="${r.extra}" class="danger">Remove extra piece</button>`:''}</section>`;
  }).join('');
  $('pieceInputs').innerHTML=`<p class="help"><strong>Complete one panel at a time: select its datum, enter all widths, then all heights from the bottom.</strong></p><div class="piece-measurement-list">${cards}</div>`;
  const bind=(input,p)=>input.addEventListener(input.type==='checkbox'?'change':input.tagName==='SELECT'?'change':'input',()=>{const field=input.dataset.field;if(field==='offSquareWidth'||field==='offSquareHeight'){p[field]=input.checked;if(field==='offSquareWidth'&&!p[field])p.secondWidth=p.width;if(field==='offSquareHeight'&&!p[field])p.secondHeight=p.height;renderInputs();renderDetailPieceOptions();}else{p[field]=field==='datum'?input.value:(Number(input.value)||0);if(field==='width'&&!p.offSquareWidth)p.secondWidth=p.width;if(field==='height'&&!p.offSquareHeight)p.secondHeight=p.height;}drawMeasured();drawPieceEditor();});
  document.querySelectorAll('[data-piece]').forEach(input=>bind(input,pieces[+input.dataset.piece]));
  document.querySelectorAll('[data-extra]').forEach(input=>bind(input,state.extraRectangles[+input.dataset.extra]));
  document.querySelectorAll('[data-open-piece]').forEach(button=>button.addEventListener('click',()=>openPieceEditor(button.dataset.openPiece)));
  document.querySelectorAll('[data-width-station]').forEach(input=>input.addEventListener('input',()=>{const values=state.widthStations[input.dataset.widthStation]||(state.widthStations[input.dataset.widthStation]=[]);values[+input.dataset.stationIndex]=Number(input.value)||0;drawMeasured();}));
  document.querySelectorAll('[data-height-station]').forEach(input=>input.addEventListener('input',()=>{const values=state.heightStations[input.dataset.heightStation]||(state.heightStations[input.dataset.heightStation]=[]);values[+input.dataset.stationIndex]=Number(input.value)||0;drawMeasured();}));
  document.querySelectorAll('[data-delete-extra]').forEach(button=>button.addEventListener('click',()=>{state.extraRectangles.splice(+button.dataset.deleteExtra,1);renderInputs();drawMeasured();}));
  document.querySelectorAll('[data-piece-direction]').forEach(radio=>radio.addEventListener('change',()=>{state.measurementDirections[radio.dataset.pieceDirection]=radio.value;renderInputs();renderFeatureList();drawMeasured();}));
  const activeCard=$('pieceInputs').querySelectorAll('.piece-measurement-card')[activeIndex];
  const orderedInputs=activeCard?[...activeCard.querySelectorAll('input[data-entry-order="width"],input[data-entry-order="height"]')]:[];
  orderedInputs.forEach((input,i)=>input.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();event.stopImmediatePropagation();const next=orderedInputs[i+1];if(next){next.focus();next.select();return;}const nextPiece=rows[activeIndex+1];if(!nextPiece){input.blur();return;}state.activeMeasureKey=nextPiece.key;state.detailPiece=nextPiece.key;renderInputs();renderDetailPieceOptions();requestAnimationFrame(()=>{const first=$('pieceInputs').querySelector('.piece-measurement-card:not(.hidden) input[data-entry-order="width"], .piece-measurement-card:not(.hidden) input[data-entry-order="height"]');first?.focus();first?.select();});}));
  const cardsEls=[...$('pieceInputs').querySelectorAll('.piece-measurement-card')];cardsEls.forEach((card,i)=>card.classList.toggle('hidden',i!==activeIndex));const nav=document.createElement('div');nav.className='piece-step-nav';nav.innerHTML=`<button data-measure-step="prev" ${activeIndex===0?'disabled':''}>← Previous</button><select id="measurePieceSelect">${rows.map((r,i)=>`<option value="${r.key}" ${i===activeIndex?'selected':''}>${i+1}. ${r.name}</option>`).join('')}</select><button data-measure-step="next" ${activeIndex===rows.length-1?'disabled':''}>Next →</button>`;$('pieceInputs').prepend(nav);$('measurePieceSelect').addEventListener('change',e=>{state.activeMeasureKey=e.target.value;state.detailPiece=e.target.value;renderInputs();renderDetailPieceOptions();});document.querySelectorAll('[data-measure-step]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.measureStep==='next'?activeIndex+1:activeIndex-1;if(rows[next]){state.activeMeasureKey=rows[next].key;state.detailPiece=rows[next].key;renderInputs();renderDetailPieceOptions();}}));
}

// Commit every visible measurement box before producing either drawing.
// Voice entry changes the DOM first; this explicit pass prevents a drawing from
// using an older in-memory value if navigation follows immediately.
function commitMeasurementInputs(){
  document.querySelectorAll('#pieceInputs [data-piece]').forEach(input=>{
    const p=pieces[+input.dataset.piece],field=input.dataset.field;
    if(!p||!field)return;
    if(field==='offSquareWidth'||field==='offSquareHeight')p[field]=input.checked;
    else p[field]=field==='datum'?input.value:(Number(input.value)||0);
    if(field==='width'&&!p.offSquareWidth)p.secondWidth=p.width;
    if(field==='height'&&!p.offSquareHeight)p.secondHeight=p.height;
  });
  document.querySelectorAll('#pieceInputs [data-extra]').forEach(input=>{
    const p=state.extraRectangles[+input.dataset.extra],field=input.dataset.field;
    if(!p||!field)return;
    if(field==='offSquareWidth'||field==='offSquareHeight')p[field]=input.checked;
    else p[field]=field==='datum'?input.value:(Number(input.value)||0);
    if(field==='width'&&!p.offSquareWidth)p.secondWidth=p.width;
    if(field==='height'&&!p.offSquareHeight)p.secondHeight=p.height;
  });
  document.querySelectorAll('#pieceInputs [data-width-station]').forEach(input=>{
    const key=input.dataset.widthStation;
    (state.widthStations[key]||(state.widthStations[key]=[]))[+input.dataset.stationIndex]=Number(input.value)||0;
  });
  document.querySelectorAll('#pieceInputs [data-height-station]').forEach(input=>{
    const key=input.dataset.heightStation;
    (state.heightStations[key]||(state.heightStations[key]=[]))[+input.dataset.stationIndex]=Number(input.value)||0;
  });
}

function fittingLabel(f){if(f.type==='hole')return `Hole Ø${f.editWidth||20} mm`;const name=f.type==='single'?'Single socket':f.type==='cooker'?'Cooker switch':'Double socket';return `${name} · ${f.editWidth} × ${f.editHeight} mm`;}
function renderFittings(){
  $('fittingList').innerHTML=state.fittings.map((f,i)=>`<div class="fitting-row ${state.selectedSocket===i?'selected':''}" data-fitting="${i}"><strong>${fittingLabel(f)}</strong><span>${f.type==='double'?'135 × 75 mm standard cut-out':'Size remains editable'}</span></div>`).join('')||'<p class="help">No fittings detected.</p>';
  document.querySelectorAll('[data-fitting]').forEach(row=>row.addEventListener('click',()=>selectSocket(+row.dataset.fitting)));
}
function selectSocket(i){state.selectedSocket=i;const f=state.fittings[i];$('fittingWidth').value=f?.editWidth||'';$('fittingHeight').value=f?.editHeight||'';renderFittings();drawOverlay();}

function productionPiece(p){
  const out={...p};
  const adjustWidths=delta=>{out.width=Math.max(1,p.width+delta);if(Number(p.secondWidth)>0)out.secondWidth=Math.max(1,p.secondWidth+delta);};
  if(p.id==='belowWindow'){
    adjustWidths(-(state.revealsNeeded?16:2));
    const leftBoard=(state.pieceEdits.leftWall||[]).some(edit=>edit.kind==='notch'&&edit.side==='right'&&edit.allowanceType==='windowBoard');
    const rightBoard=(state.pieceEdits.rightWall||[]).some(edit=>edit.kind==='notch'&&edit.side==='left'&&edit.allowanceType==='windowBoard');
    if(leftBoard)out.height=Math.max(1,(Number(p.height)||1)-2);
    if(rightBoard)out.secondHeight=Math.max(1,(Number(p.secondHeight)||Number(p.height)||1)-2);
    out.offSquareHeight=Math.abs((Number(out.height)||1)-(Number(out.secondHeight)||Number(out.height)||1))>.01;
  }
  else if(p.id==='sill')adjustWidths(-(state.revealsNeeded?18:4));
  else if(p.id==='leftWall'||p.id==='rightWall'){
    const overlap=p.id==='leftWall'?state.leftOverlap:state.rightOverlap;
    // Confirmed production edge rules:
    // no overlap + reveal = -2 + 7 = +5 mm
    // overlap + reveal    = -8 + 7 = -1 mm
    // without a reveal the same edge reductions are -2 mm / -8 mm.
    adjustWidths(state.revealsNeeded?(overlap?-1:5):(overlap?-8:-2));
    out.allowanceNote='';
  }
  return out;
}
function productionFeatureWidth(value,key,direction,featureType){
  if(key!=='leftWall'&&key!=='rightWall')return Number(value)||0;
  const measuringFromWindow=(key==='leftWall'&&direction==='rtl')||(key==='rightWall'&&direction==='ltr');
  const socketEdgeAllowance=featureType==='hole'?0:5;
  if(measuringFromWindow)return (Number(value)||0)+(state.revealsNeeded?7:0)+socketEdgeAllowance;
  return (Number(value)||0)-2+socketEdgeAllowance;
}
function productionFeatureHeight(value,key,featureType){
  if(key!=='leftWall'&&key!=='rightWall'&&key!=='belowWindow')return Number(value)||0;
  // Site measurements are to the faceplate edge. Production is to the
  // cut-out edge: standard socket cut-outs are 5 mm smaller on each side.
  return (Number(value)||0)+(featureType==='hole'?0:5);
}
function detectMeasurementStations(force=false){
  ['leftWall','belowWindow','rightWall'].forEach((key,panelIndex)=>{
    const panel=state.panels[panelIndex],piece=pieces[panelIndex];if(!panel)return;
    const xs=panel.points.map(q=>q.x),ys=panel.points.map(q=>q.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),rtl=directionFor(key)==='rtl';
    const detected=state.fittings.filter(f=>featurePanelIndex(f)===panelIndex);
    const sideNotches=(state.pieceEdits[key]||[]).filter(e=>e.kind==='notch');
    const stationCount=detected.length,heightCount=detected.length;
    // The scan supplies an initial estimate only. Once the surveyor enters a
    // station, that entered value remains authoritative and is never replaced
    // by a photo-coordinate calculation during later edits or redraws.
    if(force||(state.widthStations[key]||[]).length!==stationCount)state.widthStations[key]=detected.map(f=>{const edge=f.type==='hole'?f.x:(rtl?f.x+f.width/2:f.x-f.width/2),rel=clamp((edge-minX)/(maxX-minX||1));return Math.round((rtl?1-rel:rel)*piece.width);}).sort((a,b)=>a-b);
    if(force||(state.heightStations[key]||[]).length!==heightCount)state.heightStations[key]=detected.map(f=>{const bottom=f.type==='hole'?f.y:f.y+f.height/2,rel=clamp((maxY-bottom)/(maxY-minY||1));return Math.round(rel*piece.height);}).filter(v=>v>=0).sort((a,b)=>a-b);
  });
}
function syncOptionalNotchStations(key){const detail=visibleDetailPieces().find(v=>v.key===key);if(!detail||['leftWall','belowWindow','rightWall'].includes(key))return;state.widthStations[key]=[];state.heightStations[key]=[];}
function featurePanelIndex(point){
  for(let i=0;i<state.panels.length;i++)if(pointInPolygon(point,state.panels[i].points))return i;
  let best={d:Infinity,index:0};state.panels.forEach((panel,i)=>{const c=panel.points.reduce((a,q)=>({x:a.x+q.x/panel.points.length,y:a.y+q.y/panel.points.length}),{x:0,y:0}),d=dist(point,c);if(d<best.d)best={d,index:i};});return best.index;
}
function drawAngleMark(ctx,x,y,sx,sy,size=20){ctx.save();ctx.strokeStyle='#f97316';ctx.lineWidth=5;ctx.lineCap='square';ctx.lineJoin='miter';ctx.beginPath();ctx.moveTo(x,y+sy*size);ctx.lineTo(x,y);ctx.lineTo(x+sx*size,y);ctx.stroke();ctx.restore();}
function drawHoleCentreMark(ctx,x,y,size=9){ctx.save();ctx.lineWidth=2.5;ctx.lineCap='square';ctx.beginPath();ctx.moveTo(x-size,y);ctx.lineTo(x+size,y);ctx.moveTo(x,y-size);ctx.lineTo(x,y+size);ctx.stroke();ctx.restore();}
function radiusCornerFromPoint(x,y){return`${y<.5?'top':'bottom'}-${x<.5?'left':'right'}`;}
function askWindowBoardNotch(){return window.confirm('Is this notch for a window board?\n\nOK = Yes — apply 2 mm production clearance all around.\nCancel = No — use the standard notch rule.');}
function syncBelowWindowJoinFromNotch(key,edit){
  if(!edit||edit.kind!=='notch')return;
  const joiningSide=key==='leftWall'?'right':key==='rightWall'?'left':null;
  if(!joiningSide||edit.side!==joiningSide)return;
  const joinHeight=Math.max(1,Number(edit.height1)||1),below=pieces[1];
  if(key==='leftWall')below.height=joinHeight;
  else below.secondHeight=joinHeight;
  below.offSquareHeight=Math.abs((Number(below.height)||1)-(Number(below.secondHeight)||Number(below.height)||1))>.01;
}
function radiusCornerPoint(corner,left,top,pw,ph){return{x:corner.includes('right')?left+pw:left,y:corner.includes('bottom')?top+ph:top};}
function drawCornerRadiusMark(ctx,q,corner,radiusPx,colour){
  const r=Math.max(5,radiusPx),right=corner.includes('right'),bottom=corner.includes('bottom'),cx=q.x+(right?-r:r),cy=q.y+(bottom?-r:r),angles=corner==='top-left'?[Math.PI,Math.PI*1.5]:corner==='top-right'?[Math.PI*1.5,Math.PI*2]:corner==='bottom-right'?[0,Math.PI*.5]:[Math.PI*.5,Math.PI];
  ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(q.x+(right?-r-2:r+2),q.y);ctx.lineTo(q.x,q.y);ctx.lineTo(q.x,q.y+(bottom?-r-2:r+2));ctx.stroke();ctx.strokeStyle=colour;ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,r,angles[0],angles[1]);ctx.stroke();ctx.restore();
}
function drawPiece(ctx,p,panel,x,y,w,h,production=false){
  const rightHeight=p.offSquareHeight&&Number(p.secondHeight)>0?Number(p.secondHeight):Number(p.height),bottomWidth=p.offSquareWidth&&Number(p.secondWidth)>0?Number(p.secondWidth):Number(p.width),maxHeight=Math.max(Number(p.height)||1,rightHeight||1),maxWidth=Math.max(Number(p.width)||1,bottomWidth||1);
  const editKey=p._editKey||p.id,squareTop=editKey==='leftReveal'||editKey==='rightReveal',colour=production?'#1d4ed8':'#b91c1c',scale=Number(p._forcedScale)>0?Number(p._forcedScale):Math.min(w/maxWidth,h/maxHeight),pw=maxWidth*scale,ph=maxHeight*scale,topWidth=p.width*scale,bottomWidthPx=bottomWidth*scale,leftTop=squareTop?y:y+(maxHeight-p.height)*scale,rightTop=squareTop?y:y+(maxHeight-rightHeight)*scale,leftBottom=squareTop?y+Number(p.height)*scale:y+ph,rightBottom=squareTop?y+rightHeight*scale:y+ph;
  const corners={"top-left":{x,y:leftTop},"top-right":{x:x+topWidth,y:rightTop},"bottom-left":{x,y:leftBottom},"bottom-right":{x:x+bottomWidthPx,y:rightBottom}};
  ctx.strokeStyle=colour;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(corners['top-left'].x,corners['top-left'].y);ctx.lineTo(corners['top-right'].x,corners['top-right'].y);ctx.lineTo(corners['bottom-right'].x,corners['bottom-right'].y);ctx.lineTo(corners['bottom-left'].x,corners['bottom-left'].y);ctx.closePath();ctx.stroke();ctx.fillStyle='#334155';ctx.font='700 13px sans-serif';ctx.textAlign='left';ctx.fillText(p.name,x,Math.min(leftTop,rightTop)-10);
  if(p.datum&&p.datum!=='none'&&corners[p.datum]){const d=corners[p.datum],sx=p.datum.includes('right')?-1:1,sy=p.datum.includes('bottom')?-1:1;drawAngleMark(ctx,d.x+sx*14,d.y+sy*14,sx,sy,16);}
  const notchEdits=(state.pieceEdits[editKey]||[]).filter(edit=>edit.kind==='notch');
  const notchWidths=notchEdits.map(edit=>Number(edit.notchWidth)||30),notchHeights=notchEdits.flatMap(edit=>[Number(edit.height1)||0,Number(edit.height2)||0]);
  const removeOne=(values,removals)=>{const pending=removals.slice();return values.filter(value=>{const match=pending.findIndex(remove=>Math.abs(Number(remove)-Number(value))<.01);if(match<0)return true;pending.splice(match,1);return false;});};
  const measuredPiece=visibleDetailPieces().find(item=>item.key===editKey)?.p||p,direction=directionFor(editKey),panelFeatures=panel?state.fittings.filter(f=>featurePanelIndex(f)===state.panels.indexOf(panel)):[],widthFeatureTypes=panelFeatures.slice().sort((a,b)=>{const edge=f=>direction==='rtl'?(f.type==='hole'?1-f.x:1-(f.x+f.width/2)):(f.type==='hole'?f.x:f.x-f.width/2);return edge(a)-edge(b);}).map(f=>f.type),heightFeatureTypes=panelFeatures.slice().sort((a,b)=>{const edge=f=>1-(f.type==='hole'?f.y:f.y+f.height/2);return edge(a)-edge(b);}).map(f=>f.type);
  const measuredStationWidths=removeOne(state.widthStations[editKey]||[],notchWidths).map(Number),stationWidths=production?measuredStationWidths.map((value,index)=>productionFeatureWidth(value,editKey,direction,widthFeatureTypes[index])):measuredStationWidths;
  const measuredStationHeights=removeOne(state.heightStations[editKey]||[],notchHeights).map(Number),stationHeights=production?measuredStationHeights.map((value,index)=>productionFeatureHeight(value,editKey,heightFeatureTypes[index])):measuredStationHeights;
  const widthValues=[...stationWidths,Number(p.width)||0],heightValues=[...stationHeights,Number(p.height)||0],rtl=directionFor(editKey)==='rtl',topEdge=Math.min(leftTop,rightTop),bottomEdge=y+ph;
  const dimLine=(x1,y1,x2,y2,label,lx,ly)=>{ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=colour;ctx.lineWidth=1.5;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.moveTo(x1,y1-5);ctx.lineTo(x1,y1+5);ctx.moveTo(x2,y2-5);ctx.lineTo(x2,y2+5);ctx.stroke();ctx.font='800 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';const tw=ctx.measureText(label).width+8;ctx.fillStyle='#fff';ctx.fillRect(lx-tw/2,ly-8,tw,16);ctx.fillStyle=colour;ctx.fillText(label,lx,ly);ctx.restore();};
  const witness=(x1,y1,x2,y2)=>{ctx.save();ctx.strokeStyle='#94a3b8';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();};
  const panelIndex=panel?state.panels.indexOf(panel):-1;
  const panelBounds=panel?{minX:Math.min(...panel.points.map(q=>q.x)),maxX:Math.max(...panel.points.map(q=>q.x)),minY:Math.min(...panel.points.map(q=>q.y)),maxY:Math.max(...panel.points.map(q=>q.y))}:null;
  const featurePlacements=new Map(),panelFittings=panel?state.fittings.filter(f=>featurePanelIndex(f)===panelIndex):[];
  if(panel){
    const photoWidthDistance=f=>{const edge=f.type==='hole'?f.x:(rtl?f.x+f.width/2:f.x-f.width/2),rel=clamp((edge-panelBounds.minX)/(panelBounds.maxX-panelBounds.minX||1));return rtl?1-rel:rel;};
    const photoHeightDistance=f=>clamp((panelBounds.maxY-(f.type==='hole'?f.y:f.y+f.height/2))/(panelBounds.maxY-panelBounds.minY||1));
    const widthOrder=panelFittings.slice().sort((a,b)=>photoWidthDistance(a)-photoWidthDistance(b)),heightOrder=panelFittings.slice().sort((a,b)=>photoHeightDistance(a)-photoHeightDistance(b));
    widthOrder.forEach((f,i)=>{const fw=Math.max(12,(production&&f.type!=='hole'?Math.max(1,f.editWidth-10):f.editWidth)*scale),value=stationWidths[i],fallbackEdge=x+clamp((f.x-panelBounds.minX)/(panelBounds.maxX-panelBounds.minX||1))*pw+(f.type==='hole'?0:(rtl?fw/2:-fw/2)),edgeX=value===undefined?fallbackEdge:(rtl?x+pw-value/(Number(p.width)||1)*pw:x+value/(Number(p.width)||1)*pw),current=featurePlacements.get(f)||{};featurePlacements.set(f,{...current,fw,edgeX,cx:f.type==='hole'?edgeX:(rtl?edgeX-fw/2:edgeX+fw/2)});});
    heightOrder.forEach((f,i)=>{const fh=Math.max(10,(production&&f.type!=='hole'?Math.max(1,f.editHeight-10):f.editHeight)*scale),value=stationHeights[i],fallbackBottom=y+clamp((f.y-panelBounds.minY)/(panelBounds.maxY-panelBounds.minY||1))*ph+(f.type==='hole'?0:fh/2),bottomY=value===undefined?fallbackBottom:bottomEdge-value/(Number(p.height)||1)*ph,current=featurePlacements.get(f)||{};featurePlacements.set(f,{...current,fh,cy:f.type==='hole'?bottomY:bottomY-fh/2,height:value??photoHeightDistance(f)*(Number(p.height)||1)});});
  }
  const detectedFeatures=panelFittings.map(f=>{const placed=featurePlacements.get(f)||{},fw=placed.fw||Math.max(12,f.editWidth*scale),fh=placed.fh||Math.max(10,f.editHeight*scale),cx=placed.cx??x,cy=placed.cy??y,edgeX=placed.edgeX??(rtl?cx+fw/2:cx-fw/2);return{f,cx,cy,fw,fh,edgeX,edgeY:cy,distance:Math.abs(edgeX-(rtl?x+pw:x))/pw*(Number(p.width)||1),height:placed.height??Math.max(0,(bottomEdge-(cy+fh/2))/ph*(Number(p.height)||1))};});
  const widthAnchors=detectedFeatures.slice().sort((a,b)=>a.distance-b.distance),datumX=rtl?x+pw:x;
  stationWidths.forEach((value,i)=>{const fallbackX=rtl?x+pw-clamp(Number(value)/(Number(p.width)||1))*pw:x+clamp(Number(value)/(Number(p.width)||1))*pw,sx=widthAnchors[i]?.edgeX??fallbackX,touchY=widthAnchors[i]?.edgeY??topEdge,dy=topEdge-35-(i*25);witness(datumX,topEdge,datumX,dy);witness(sx,touchY,sx,dy);dimLine(datumX,dy,sx,dy,`${i+1}  ${Math.round(value)} mm`,(datumX+sx)/2,dy);});
  const overallWidthY=bottomEdge+28,oppositeX=rtl?x:x+pw;witness(datumX,bottomEdge,datumX,overallWidthY);witness(oppositeX,bottomEdge,oppositeX,overallWidthY);dimLine(datumX,overallWidthY,oppositeX,overallWidthY,`${Math.round(Number(p.width)||0)} mm`,x+pw/2,overallWidthY);
  const detectedHeightAnchors=detectedFeatures.map(f=>({f:f.f,x:f.cx,value:f.height,edgeY:f.f.type==='hole'?f.cy:f.cy+f.fh/2})).sort((a,b)=>a.value-b.value);
  const drawOverallHeight=(side,value,topY)=>{const dx=side==='left'?x-34:x+pw+34,edgeX=side==='left'?x:x+pw,dimensionBottom=squareTop?(side==='left'?leftBottom:rightBottom):bottomEdge,dimensionTop=squareTop?(side==='left'?leftTop:rightTop):topY,mid=(dimensionBottom+dimensionTop)/2,label=`${Math.round(value)} mm`;witness(edgeX,dimensionBottom,dx,dimensionBottom);witness(edgeX,dimensionTop,dx,dimensionTop);ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=colour;ctx.lineWidth=1.5;ctx.font='800 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.beginPath();ctx.moveTo(dx,dimensionBottom);ctx.lineTo(dx,mid+13);ctx.moveTo(dx,mid-13);ctx.lineTo(dx,dimensionTop);ctx.moveTo(dx-5,dimensionBottom);ctx.lineTo(dx+5,dimensionBottom);ctx.moveTo(dx-5,dimensionTop);ctx.lineTo(dx+5,dimensionTop);ctx.stroke();const tw=ctx.measureText(label).width+8;ctx.fillStyle='#fff';ctx.fillRect(dx-tw/2,mid-8,tw,16);ctx.fillStyle=colour;ctx.fillText(label,dx,mid);ctx.restore();};
  heightValues.forEach((value,i)=>{
    const fraction=clamp(Number(value)/(Number(p.height)||1)),sy=bottomEdge-fraction*ph,label=`${i+1}  ${Math.round(value)} mm`,overall=i===heightValues.length-1;
    ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=colour;ctx.lineWidth=1.5;ctx.font='800 11px sans-serif';ctx.textBaseline='middle';
    if(overall){
      const primarySide=editKey==='leftWall'?'left':editKey==='rightWall'?'right':rtl?'right':'left';
      if(p.offSquareHeight){drawOverallHeight('left',Number(p.height)||0,leftTop);drawOverallHeight('right',Number(p.secondHeight)||0,rightTop);}
      else drawOverallHeight(primarySide,Number(p.height)||0,leftTop);
    }else{
      const anchor=detectedHeightAnchors[i],anchorX=anchor?.x??(x+pw*((i+1)/(heightValues.length))),touchY=anchor?.edgeY??sy,labelY=bottomEdge+78+(i*24);
      // Feature heights use a dashed witness from the measured edge to the
      // value. Overall heights remain solid outside the panel.
      ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(anchorX,touchY);ctx.lineTo(anchorX,labelY+14);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(anchorX-5,bottomEdge);ctx.lineTo(anchorX+5,bottomEdge);ctx.moveTo(anchorX-5,touchY);ctx.lineTo(anchorX+5,touchY);ctx.stroke();ctx.textAlign='center';ctx.textBaseline='top';const tw=ctx.measureText(label).width+8;ctx.fillStyle='#fff';ctx.fillRect(anchorX-tw/2,labelY-2,tw,16);ctx.fillStyle=colour;ctx.fillText(label,anchorX,labelY);
    }
    ctx.restore();
  });
  if(p.offSquareWidth){ctx.fillStyle=colour;ctx.font='700 11px sans-serif';ctx.textAlign='center';ctx.fillText(`${Math.round(bottomWidth)} mm`,x+bottomWidthPx/2,y+ph+48);}
  (state.pieceEdits[editKey]||[]).forEach((edit)=>{
    let q;
    if(edit.kind==='notch'){
      const notchSide=edit.side||(edit.x<.5?'left':'right'),windowEdge=(editKey==='leftWall'&&notchSide==='right')||(editKey==='rightWall'&&notchSide==='left'),revealExtension=production&&state.revealsNeeded&&windowEdge?7:0,notchClearance=production?(edit.allowanceType==='windowBoard'?2:edit.allowanceType==='shoulder'?3:0):0;
      const shownEdit=production?{...edit,notchWidth:(Number(edit.notchWidth)||30)+revealExtension+notchClearance,height1:notchClearance?Math.max(0,(Number(edit.height1)||0)-notchClearance):edit.height1,height2:notchClearance?(Number(edit.height2)||0)+notchClearance:edit.height2}:edit;
      q=drawSideNotch(ctx,shownEdit,x,y,pw,ph,p,false);
      const side=shownEdit.side||(shownEdit.x<.5?'left':'right'),edgeX=side==='left'?x:x+pw,insideX=side==='left'?edgeX+(Number(shownEdit.notchWidth)||30)/(Number(p.width)||1)*pw:edgeX-(Number(shownEdit.notchWidth)||30)/(Number(p.width)||1)*pw;
      const h1=Number(shownEdit.height1)||0,h2=Math.max(h1,Number(shownEdit.height2)||0),y1=bottomEdge-h1/(Number(p.height)||1)*ph,y2=bottomEdge-h2/(Number(p.height)||1)*ph,laneX=side==='left'?x-70:x+pw+70,labelX=side==='left'?laneX-7:laneX+7;
      ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=colour;ctx.lineWidth=1.3;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(edgeX,y1);ctx.lineTo(laneX,y1);ctx.moveTo(edgeX,y2);ctx.lineTo(laneX,y2);ctx.moveTo(edgeX,bottomEdge);ctx.lineTo(laneX,bottomEdge);ctx.stroke();ctx.setLineDash([]);
      const verticalDimension=(fromY,toY,label,offset)=>{const dx=laneX+(side==='left'?-offset:offset);ctx.beginPath();ctx.moveTo(dx,fromY);ctx.lineTo(dx,toY);ctx.moveTo(dx-4,fromY);ctx.lineTo(dx+4,fromY);ctx.moveTo(dx-4,toY);ctx.lineTo(dx+4,toY);ctx.stroke();ctx.font='800 10px sans-serif';ctx.textAlign=side==='left'?'right':'left';ctx.textBaseline='middle';ctx.fillText(label,dx+(side==='left'?-6:6),(fromY+toY)/2);};
      verticalDimension(bottomEdge,y1,`H1 ${Math.round(h1)} mm`,0);verticalDimension(bottomEdge,y2,`H2 ${Math.round(h2)} mm`,60);
      const widthY=y2-23;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(edgeX,y2);ctx.lineTo(edgeX,widthY);ctx.moveTo(insideX,y2);ctx.lineTo(insideX,widthY);ctx.stroke();ctx.setLineDash([]);dimLine(edgeX,widthY,insideX,widthY,`W ${Math.round(Number(shownEdit.notchWidth)||30)} mm`,(edgeX+insideX)/2,widthY);ctx.restore();
    }else{
      q={x:x+clamp(edit.x)*pw,y:y+clamp(edit.y)*ph};ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=colour;ctx.lineWidth=3;
      if(edit.kind==='hole'){
        drawHoleCentreMark(ctx,q.x,q.y,9);
        const holeLane=(state.pieceEdits[editKey]||[]).filter(item=>item.kind==='hole').indexOf(edit),holeWidth=Math.round((rtl?1-clamp(edit.x):clamp(edit.x))*(Number(measuredPiece.width)||1)),holeHeight=Math.round((1-clamp(edit.y))*(Number(measuredPiece.height)||1)),widthY=topEdge-35-(stationWidths.length+holeLane)*25,heightY=bottomEdge+78+(stationHeights.length+holeLane)*24;
        witness(datumX,topEdge,datumX,widthY);witness(q.x,q.y,q.x,widthY);dimLine(datumX,widthY,q.x,widthY,`${stationWidths.length+holeLane+1}  ${holeWidth} mm`,(datumX+q.x)/2,widthY);
        ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x,heightY+14);ctx.stroke();ctx.setLineDash([]);ctx.font='800 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';const holeLabel=`${stationHeights.length+holeLane+1}  ${holeHeight} mm`,holeTextWidth=ctx.measureText(holeLabel).width+8;ctx.fillStyle='#fff';ctx.fillRect(q.x-holeTextWidth/2,heightY-2,holeTextWidth,16);ctx.fillStyle=colour;ctx.fillText(holeLabel,q.x,heightY);
      }else if(edit.kind==='square'){const sx=edit.x<.5?1:-1,sy=edit.y<.5?1:-1;if(ph<90){const corner=`${sy===1?'top':'bottom'}-${sx===1?'left':'right'}`,d=corners[corner];q={x:d.x-sx*12,y:d.y-sy*12};drawAngleMark(ctx,q.x,q.y,sx,sy,18);}else{const mx=q.x+sx*16,my=q.y+sy*16;q={x:mx,y:my};drawAngleMark(ctx,mx,my,sx,sy,18);}}else if(edit.kind==='radius'){const corner=edit.corner||radiusCornerFromPoint(edit.x,edit.y);q=radiusCornerPoint(corner,x,y,pw,ph);drawCornerRadiusMark(ctx,q,corner,Math.min((Number(edit.radius)||10)*scale,Math.min(pw,ph)/2),colour);}else if(edit.kind==='socket'||edit.kind==='cutout'){const sw=Math.max(14,(production&&edit.kind==='socket'?Math.max(1,(edit.width||145)-10):(edit.width||100))*scale),sh=Math.max(11,(production&&edit.kind==='socket'?Math.max(1,(edit.height||85)-10):(edit.height||100))*scale);ctx.strokeRect(q.x-sw/2,q.y-sh/2,sw,sh);}ctx.restore();
    }
    const seq=edit.kind==='square'?ctx._featureSeq:++ctx._featureSeq;if(edit.kind!=='square'){ctx.fillStyle=colour;ctx.font='800 10px sans-serif';ctx.textAlign='center';ctx.fillText(edit.kind==='radius'?`R${Math.round(Number(edit.radius)||10)}`:String(seq),q.x+(edit.kind==='radius'?14:0),q.y+(edit.kind==='radius'?-10:4));}if(!['notch','square','radius'].includes(edit.kind)){const name=edit.kind==='socket'?`${edit.label||'SOCKET'} ${seq} — ${edit.width||145} × ${edit.height||85} mm`:edit.kind==='cutout'?`CUT-OUT ${seq} — ${edit.width||100} × ${edit.height||100} mm`:edit.kind==='hole'?`HOLE ${seq} — Ø${edit.diameter||20} mm`:`${edit.kind.toUpperCase()} ${seq}`,halfW=edit.kind==='hole'?Math.max(6,(edit.diameter||20)*scale/2):Math.max(7,(edit.width||100)*scale/2),halfH=edit.kind==='hole'?halfW:Math.max(6,(edit.height||100)*scale/2),scheduleX=q.x+(q.x<ctx.canvas.width/2?halfW:-halfW);(ctx._scheduleCallouts||(ctx._scheduleCallouts=[])).push({x:scheduleX,y:q.y+halfH,targetY:bottomEdge+78,text:name});}
  });
  if(p.allowanceNote){ctx.fillStyle='#1d4ed8';ctx.font='800 11px sans-serif';ctx.textAlign='center';ctx.fillText(p.allowanceNote,x+pw/2,y+ph+40);ctx.textAlign='left';}
  if(!panel)return {x,y,pw,ph,scale};
  const xs=panel.points.map(q=>q.x),ys=panel.points.map(q=>q.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const map=q=>({x:x+((q.x-minX)/(maxX-minX||1))*pw,y:y+((q.y-minY)/(maxY-minY||1))*ph});
  state.fittings.forEach((f)=>{if(featurePanelIndex(f)!==panelIndex)return;const placed=featurePlacements.get(f),q=placed?{x:placed.cx,y:placed.cy}:map(f),fw=placed?.fw||Math.max(12,(production&&f.type!=='hole'?Math.max(1,f.editWidth-10):f.editWidth)*scale),fh=placed?.fh||Math.max(10,(production&&f.type!=='hole'?Math.max(1,f.editHeight-10):f.editHeight)*scale),seq=++ctx._featureSeq,code=f.type==='single'?'S/S':f.type==='cooker'?'C/S':f.type==='hole'?'HOLE':'D/S';ctx.save();ctx.strokeStyle=colour;ctx.lineWidth=2;if(f.type==='hole'){drawHoleCentreMark(ctx,q.x,q.y,9);}else ctx.strokeRect(q.x-fw/2,q.y-fh/2,fw,fh);ctx.fillStyle=colour;ctx.font='800 10px sans-serif';ctx.textAlign='center';if(f.type!=='hole')ctx.fillText(`${code} ${seq}`,q.x,q.y+4);ctx.restore();const sw=Math.round(production&&f.type!=='hole'?Math.max(1,f.editWidth-10):f.editWidth),sh=Math.round(production&&f.type!=='hole'?Math.max(1,f.editHeight-10):f.editHeight),scheduleEdgeX=q.x+(q.x<ctx.canvas.width/2?9:-9),heightLane=Math.max(0,detectedHeightAnchors.findIndex(anchor=>anchor.f===f)),targetY=bottomEdge+78+heightLane*24;(ctx._scheduleCallouts||(ctx._scheduleCallouts=[])).push({x:scheduleEdgeX,y:q.y+9,targetY,text:f.type==='hole'?`HOLE ${seq} — Ø${sw} mm`:`${code} ${seq} — ${sw} × ${sh} mm`});});
  state.notches.filter(n=>n.panel===panelIndex).forEach(n=>{const q=map(n);ctx.strokeStyle=colour;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(q.x-10,q.y);ctx.lineTo(q.x-10,q.y+12);ctx.lineTo(q.x+10,q.y+12);ctx.lineTo(q.x+10,q.y);ctx.stroke();});
  state.squares.filter(s=>s.panel===panelIndex).forEach(s=>{const q=map(s),sx=q.x<x+pw/2?1:-1,sy=q.y<y+ph/2?1:-1;drawAngleMark(ctx,q.x+sx*14,q.y+sy*14,sx,sy,16);});
  state.radii.filter(r=>r.panel===panelIndex).forEach(r=>{const q=map(r),corner=r.corner||radiusCornerFromPoint(r.x,r.y);drawCornerRadiusMark(ctx,q,corner,Math.min((Number(r.radius)||10)*scale,Math.min(pw,ph)/2),colour);ctx.fillStyle=colour;ctx.fillText(`R${Math.round(Number(r.radius)||10)}`,q.x+10,q.y-10);});
  state.markers.filter(m=>m.panel===panelIndex).forEach((m,i)=>{const q=map(m);ctx.fillStyle=m.kind==='width'?'#854d0e':'#9a3412';ctx.beginPath();ctx.arc(q.x,q.y,5,0,Math.PI*2);ctx.fill();ctx.font='800 9px sans-serif';ctx.fillText(`${m.kind==='width'?'W':'H'}${i+1}`,q.x+8,q.y-5);});
  return {x,y,pw,ph,scale};
}
function optionalDrawingItems(){const items=[];if(state.sillNeeded)items.push({p:pieces[5],key:'sill'});if(state.revealsNeeded)items.push({p:pieces[3],key:'leftReveal'},{p:pieces[4],key:'rightReveal'});state.extraRectangles.forEach((p,i)=>items.push({p:{...p,name:`Extra rectangle ${i+1}`},key:`extra-${i}`}));return items;}
function drawWindowDrawing(canvasId,production){
  const c=$(canvasId),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx._featureSeq=0;ctx._scheduleCallouts=[];
  if(!production)drawingLayouts=[];
  if(!state.scanComplete){ctx.fillStyle='#64748b';ctx.font='800 24px sans-serif';ctx.textAlign='center';ctx.fillText('Press Scan window + sockets to create the drawing',700,430);ctx.textAlign='left';return;}
  const use=p=>production?productionPiece(p):p;
  const add=(piece,panel,key,x,y,w,h,forcedScale)=>{const layout=drawPiece(ctx,{...use(piece),_editKey:key,_forcedScale:forcedScale},panel,x,y,w,h,production);if(!production)drawingLayouts.push({...layout,key,panel,piece});};
  const main=[{piece:pieces[0],panel:state.panels[0],key:'leftWall'},{piece:pieces[1],panel:state.panels[1],key:'belowWindow'},{piece:pieces[2],panel:state.panels[2],key:'rightWall'}].map(item=>({...item,drawPiece:use(item.piece)}));
  const maxWidthOf=piece=>Math.max(Number(piece.width)||1,piece.offSquareWidth&&Number(piece.secondWidth)>0?Number(piece.secondWidth):Number(piece.width)||1),maxHeightOf=piece=>Math.max(Number(piece.height)||1,piece.offSquareHeight&&Number(piece.secondHeight)>0?Number(piece.secondHeight):Number(piece.height)||1);
  const mainGap=105,availableWidth=c.width-160-mainGap*2,totalWidth=main.reduce((sum,item)=>sum+maxWidthOf(item.drawPiece),0),sharedScale=Math.min(availableWidth/Math.max(1,totalWidth),280/Math.max(...main.map(item=>maxHeightOf(item.drawPiece)))),commonBottom=510;
  const sideNotchPresent=['leftWall','rightWall'].some(key=>(state.pieceEdits[key]||[]).some(edit=>edit.kind==='notch')),belowWindowLift=sideNotchPresent?128:42;
  let mainX=80;main.forEach(item=>{const maxH=maxHeightOf(item.drawPiece),maxW=maxWidthOf(item.drawPiece),pieceBottom=item.key==='belowWindow'?commonBottom-belowWindowLift:commonBottom;add(item.piece,item.panel,item.key,mainX,pieceBottom-maxH*sharedScale,maxW*sharedScale,maxH*sharedScale,sharedScale);mainX+=maxW*sharedScale+mainGap;});
  const placed=[];ctx._scheduleCallouts.slice().sort((a,b)=>a.x-b.x).forEach(callout=>{const side=callout.x<c.width/2?1:-1,lane=placed.filter(p=>Math.abs(p.x-callout.x)<210).length,targetY=Number(callout.targetY)||690+lane*32,targetX=clamp(callout.x+side*125,125,c.width-125),elbowX=callout.x+side*24;placed.push({x:callout.x});ctx.save();ctx.strokeStyle='#22c55e';ctx.lineWidth=1.4;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(callout.x,callout.y);ctx.lineTo(elbowX,callout.y);ctx.lineTo(elbowX,targetY);ctx.lineTo(targetX-side*10,targetY);ctx.stroke();ctx.setLineDash([]);ctx.font='800 13px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';const tw=ctx.measureText(callout.text).width+12;ctx.fillStyle='#fff';ctx.fillRect(targetX-tw/2,targetY-10,tw,20);ctx.fillStyle='#15803d';ctx.fillText(callout.text,targetX,targetY);ctx.restore();});
  ctx.fillStyle=production?'#1d4ed8':'#b91c1c';ctx.font='800 14px sans-serif';ctx.textAlign='center';const count=3+(state.revealsNeeded?2:0)+(state.sillNeeded?1:0)+state.extraRectangles.length;ctx.fillText(`${production?'PRODUCTION - BLUE':'MEASURED TO EDGE - RED'} · ${count} pieces`,700,1045);ctx.textAlign='left';
}
function drawOptionalDrawing(canvasId,production){const c=$(canvasId),use=p=>production?productionPiece(p):p,items=optionalDrawingItems();c.height=Math.max(1100,items.length*360+180);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx._featureSeq=0;ctx._scheduleCallouts=[];items.forEach((item,i)=>drawPiece(ctx,{...use(item.p),_editKey:item.key},null,280,140+i*360,840,210,production));ctx._scheduleCallouts.forEach((callout,i)=>{const side=callout.x<c.width/2?1:-1,targetX=clamp(callout.x+side*180,130,c.width-130),targetY=Number(callout.targetY)||callout.y+90+(i%2)*30,elbowX=callout.x+side*24;ctx.save();ctx.strokeStyle='#22c55e';ctx.lineWidth=1.4;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(callout.x,callout.y);ctx.lineTo(elbowX,callout.y);ctx.lineTo(elbowX,targetY);ctx.lineTo(targetX-side*10,targetY);ctx.stroke();ctx.setLineDash([]);ctx.font='800 13px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';const tw=ctx.measureText(callout.text).width+12;ctx.fillStyle='#fff';ctx.fillRect(targetX-tw/2,targetY-10,tw,20);ctx.fillStyle='#15803d';ctx.fillText(callout.text,targetX,targetY);ctx.restore();});ctx.fillStyle=production?'#1d4ed8':'#b91c1c';ctx.font='800 14px sans-serif';ctx.textAlign='center';ctx.fillText(`${production?'PRODUCTION - BLUE':'MEASURED TO EDGE - RED'} · OPTIONAL PIECES`,700,c.height-40);}
function renderOptionalPieceEditActions(){
  const items=optionalDrawingItems();
  document.querySelectorAll('.optional-piece-edit-actions').forEach(actions=>{
    actions.querySelectorAll('[data-edit-optional-piece]').forEach(button=>button.remove());
    items.forEach(item=>{
      const button=document.createElement('button');
      button.type='button';button.className='primary';button.dataset.editOptionalPiece=item.key;
      button.textContent=item.key.startsWith('extra-')?`Edit extra rectangle ${Number(item.key.split('-')[1])+1}`:`Edit ${item.p.name.replace(' (optional)','').toLowerCase()}`;
      button.addEventListener('click',()=>openPieceEditor(item.key));actions.appendChild(button);
    });
  });
}
function drawMeasured(){drawWindowDrawing('windowDrawing',false);drawWindowDrawing('productionWindowDrawing',true);const overflow=optionalDrawingItems().length>0;$('optionalMeasuredCard')?.classList.toggle('hidden',!overflow);$('optionalProductionCard')?.classList.toggle('hidden',!overflow);renderOptionalPieceEditActions();if(overflow){drawOptionalDrawing('optionalWindowDrawing',false);drawOptionalDrawing('optionalProductionWindowDrawing',true);}}

function visibleDetailPieces(){const list=pieces.filter(p=>!p.optional||(p.optional==='reveals'&&state.revealsNeeded)||(p.optional==='sill'&&state.sillNeeded)).map(p=>({key:p.id,name:p.name,p}));state.extraRectangles.forEach((p,i)=>list.push({key:`extra-${i}`,name:`Extra rectangle ${i+1}`,p}));return list;}
function currentDetail(){return visibleDetailPieces().find(v=>v.key===state.detailPiece)||visibleDetailPieces()[0];}
function renderDetailPieceOptions(){const list=visibleDetailPieces();if(!list.some(v=>v.key===state.detailPiece))state.detailPiece=list[0]?.key||'leftWall';const options=list.map(v=>`<option value="${v.key}" ${v.key===state.detailPiece?'selected':''}>${v.name}</option>`).join('');$('detailPiece').innerHTML=options;$('photoEditPiece').innerHTML=options;renderEditorGeometry();drawPieceEditor();renderFeatureList();}
function renderEditorGeometry(){const detail=currentDetail(),p=detail?.p,host=$('editorGeometry');if(!host||!p)return;host.innerHTML=`<strong>PIECE SHAPE / OFF-SQUARE</strong><div class="editor-geometry-grid"><label>Top width mm<input data-editor-shape="width" type="number" min="1" value="${p.width}"></label><label class="editor-geometry-toggle"><input data-editor-shape="offSquareWidth" type="checkbox" ${p.offSquareWidth?'checked':''}> Off-square width</label><label>Bottom width mm<input data-editor-shape="secondWidth" type="number" min="1" value="${p.secondWidth||p.width}"></label><span></span><label>Left height mm<input data-editor-shape="height" type="number" min="1" value="${p.height}"></label><label class="editor-geometry-toggle"><input data-editor-shape="offSquareHeight" type="checkbox" ${p.offSquareHeight?'checked':''}> Off-square height</label><label>Right height mm<input data-editor-shape="secondHeight" type="number" min="1" value="${p.secondHeight||p.height}"></label></div>`;host.querySelectorAll('[data-editor-shape]').forEach(input=>input.addEventListener('change',()=>{const field=input.dataset.editorShape;if(field==='offSquareWidth'||field==='offSquareHeight'){p[field]=input.checked;if(field==='offSquareWidth'&&!p[field])p.secondWidth=p.width;if(field==='offSquareHeight'&&!p[field])p.secondHeight=p.height;}else{const entered=Number(input.value);if(!Number.isFinite(entered)||entered<1){input.value=p[field]||1;return;}p[field]=entered;if(field==='width'&&!p.offSquareWidth)p.secondWidth=p.width;if(field==='height'&&!p.offSquareHeight)p.secondHeight=p.height;if(field==='secondWidth')p.offSquareWidth=Math.abs(p.secondWidth-p.width)>.01;if(field==='secondHeight')p.offSquareHeight=Math.abs(p.secondHeight-p.height)>.01;}renderEditorGeometry();renderInputs();drawPieceEditor();drawMeasured();}));}
function rememberPieceEdits(key=state.detailPiece){const history=state.editHistory[key]||(state.editHistory[key]=[]);history.push(structuredClone(state.pieceEdits[key]||[]));if(history.length>30)history.shift();}
function undoPieceEdit(){const key=state.detailPiece,history=state.editHistory[key]||[];if(!history.length){$('activeToolNotice').textContent='Nothing to undo on this piece.';return;}state.pieceEdits[key]=history.pop();state.selectedDetail=null;$('activeToolNotice').textContent='Last piece edit undone.';drawPieceEditor();renderFeatureList();drawMeasured();}
function openPieceEditor(key=state.detailPiece){state.detailPiece=key;state.selectedDetail=null;renderDetailPieceOptions();$('detailPiece').value=state.detailPiece;$('photoEditPiece').value=state.detailPiece;renderEditorGeometry();$('activeToolNotice').textContent=`${document.querySelector('[data-detail-tool].active')?.textContent||'Select / move'} active — tap the enlarged piece below`;$('pieceEditorModal').classList.remove('hidden');drawPieceEditor();renderFeatureList();}
function closePieceEditor(){$('pieceEditorModal').classList.add('hidden');}
function scannedEditorFittings(detail){const panelIndex=['leftWall','belowWindow','rightWall'].indexOf(detail?.key),panel=state.panels[panelIndex];if(panelIndex<0||!panel)return[];const xs=panel.points.map(q=>q.x),ys=panel.points.map(q=>q.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);return state.fittings.filter(f=>featurePanelIndex(f)===panelIndex).map(f=>({...f,rx:clamp((f.x-minX)/(maxX-minX||1)),ry:clamp((f.y-minY)/(maxY-minY||1))}));}
function drawSideNotch(ctx,e,left,top,pw,ph,p,selected=false){const side=e.side||(e.x<.5?'left':'right'),depth=Math.max(1,Number(e.notchWidth)||30)/(p.width||1)*pw,h1=Math.max(0,Number(e.height1)||0)/(p.height||1)*ph,h2=Math.max(Number(e.height1)||0,Number(e.height2)||0)/(p.height||1)*ph,x=side==='left'?left:left+pw,y1=top+ph-h1,y2=top+ph-h2,inside=side==='left'?x+depth:x-depth;ctx.save();ctx.strokeStyle=selected?'#2563eb':'#b91c1c';ctx.lineWidth=selected?4:3;ctx.fillStyle='#fff';ctx.fillRect(Math.min(x,inside)-3,y2-3,Math.abs(depth)+6,Math.max(6,y1-y2+6));ctx.beginPath();ctx.moveTo(x,y2);ctx.lineTo(inside,y2);ctx.lineTo(inside,y1);ctx.lineTo(x,y1);ctx.stroke();ctx.restore();return{x:inside,y:(y1+y2)/2};}
function drawPieceEditor(){
  const c=$('pieceEditor');if(!c)return;const ctx=c.getContext('2d'),detail=currentDetail();ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);if(!detail)return;
  const p=detail.p,left=80,top=65,availW=c.width-160,availH=c.height-175,topW=Math.max(1,Number(p.width)||1),bottomW=p.offSquareWidth?Math.max(1,Number(p.secondWidth)||topW):topW,leftH=Math.max(1,Number(p.height)||1),rightH=p.offSquareHeight?Math.max(1,Number(p.secondHeight)||leftH):leftH,w=Math.max(topW,bottomW),h=Math.max(leftH,rightH),scale=Math.min(availW/w,availH/h),pw=w*scale,ph=h*scale,squareTop=detail.key==='leftReveal'||detail.key==='rightReveal',leftTop=squareTop?top:top+(h-leftH)*scale,rightTop=squareTop?top:top+(h-rightH)*scale,leftBottom=squareTop?top+leftH*scale:top+ph,rightBottom=squareTop?top+rightH*scale:top+ph;
  ctx.strokeStyle='#b91c1c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(left,leftTop);ctx.lineTo(left+topW*scale,rightTop);ctx.lineTo(left+bottomW*scale,rightBottom);ctx.lineTo(left,leftBottom);ctx.closePath();ctx.stroke();ctx.fillStyle='#111827';ctx.font='800 18px sans-serif';ctx.fillText(detail.name,left,32);
  let seq=0;scannedEditorFittings(detail).forEach(f=>{const x=left+f.rx*pw,y=top+f.ry*ph,fw=Math.max(18,(f.editWidth||85)*scale),fh=Math.max(14,(f.editHeight||85)*scale);ctx.save();ctx.strokeStyle='#b91c1c';ctx.lineWidth=2;ctx.strokeRect(x-fw/2,y-fh/2,fw,fh);ctx.fillStyle='#b91c1c';ctx.font='800 11px sans-serif';ctx.textAlign='center';ctx.fillText(`${f.type==='single'?'S/S':f.type==='cooker'?'C/S':'D/S'} ${++seq}`,x,y+4);ctx.restore();});
  (state.pieceEdits[detail.key]||[]).forEach((e,i)=>{let q;if(e.kind==='notch')q=drawSideNotch(ctx,e,left,top,pw,ph,p,i===state.selectedDetail);else{const x=left+e.x*pw,y=top+e.y*ph;q={x,y};ctx.save();const editColour=i===state.selectedDetail?'#2563eb':'#b91c1c';ctx.strokeStyle=editColour;ctx.lineWidth=i===state.selectedDetail?6:4;if(e.kind==='hole'){drawHoleCentreMark(ctx,x,y,12)}else if(e.kind==='square'){const sx=e.x<.5?1:-1,sy=e.y<.5?1:-1;if(ph<90){const corner=`${sy===1?'top':'bottom'}-${sx===1?'left':'right'}`,d=radiusCornerPoint(corner,left,top,pw,ph);q={x:d.x-sx*14,y:d.y-sy*14};drawAngleMark(ctx,q.x,q.y,sx,sy,20)}else{const mx=x+sx*16,my=y+sy*16;q={x:mx,y:my};drawAngleMark(ctx,mx,my,sx,sy,20)}}else if(e.kind==='radius'){const corner=e.corner||radiusCornerFromPoint(e.x,e.y);q=radiusCornerPoint(corner,left,top,pw,ph);drawCornerRadiusMark(ctx,q,corner,Math.min((Number(e.radius)||10)*scale,Math.min(pw,ph)/2),editColour)}else{const ew=Math.max(22,(e.width||100)*scale),eh=Math.max(18,(e.height||85)*scale);ctx.strokeRect(x-ew/2,y-eh/2,ew,eh)}ctx.restore();}if(e.kind!=='square'){ctx.fillStyle='#b91c1c';ctx.font='800 11px sans-serif';ctx.textAlign='center';ctx.fillText(String(++seq),q.x+14,q.y-12);}});
  ctx.fillStyle='#b91c1c';ctx.font='700 13px sans-serif';ctx.textAlign='left';ctx.fillText('Tap this complete panel to add or select an edit',left,top+ph+35);c._layout={left,top,pw,ph};
}
function featureName(e){return e.kind==='socket'?(e.socketType==='single'?'Single socket':e.socketType==='cooker'?'Cooker switch':'Double socket'):e.kind==='cutout'?'Cut-out':e.kind==='square'?'90° corner':e.kind[0].toUpperCase()+e.kind.slice(1);}
function renderFeatureList(){
  const detail=currentDetail(),p=detail?.p,edits=state.pieceEdits[detail?.key]||[],rtl=directionFor(detail?.key)==='rtl';
  $('featureList').innerHTML=edits.map((e,i)=>{const notch=e.kind==='notch',square=e.kind==='square';if(square)return`<div class="feature-row angle-feature ${i===state.selectedDetail?'selected':''}" data-feature="${i}"><strong>90° corner mark</strong><button data-remove-feature="${i}" class="danger">Remove mark</button></div>`;return`<div class="feature-row ${i===state.selectedDetail?'selected':''}" data-feature="${i}"><strong>${i+1}. ${featureName(e)}</strong>${notch?`<label>Side<select data-notch-field="side" data-feature-index="${i}"><option value="left" ${e.side==='left'?'selected':''}>Left side</option><option value="right" ${e.side==='right'?'selected':''}>Right side</option></select></label><label>Width into panel mm<input data-notch-field="notchWidth" data-feature-index="${i}" type="number" value="${e.notchWidth||30}"></label><label>Height 1 — lower edge from bottom mm<input data-notch-field="height1" data-feature-index="${i}" type="number" value="${e.height1||0}"></label><label>Height 2 — upper edge from bottom mm<input data-notch-field="height2" data-feature-index="${i}" type="number" value="${e.height2||0}"></label>`:`<label>X from ${rtl?'right':'left'} mm<input data-feature-x="${i}" type="number" value="${Math.round((rtl?1-e.x:e.x)*(p.width||1))}"></label><label>Y from bottom mm<input data-feature-y="${i}" type="number" value="${Math.round((1-e.y)*(p.height||1))}"></label>${e.kind==='hole'?`<label>Diameter mm<input data-feature-size="${i}" type="number" value="${e.diameter||20}"></label>`:''}${e.kind==='cutout'?`<label>Cut-out width mm<input data-cutout-width="${i}" type="number" value="${e.width||100}"></label><label>Cut-out height mm<input data-cutout-height="${i}" type="number" value="${e.height||100}"></label>`:''}`}<button data-remove-feature="${i}" class="danger">Remove</button></div>`}).join('')||'<p class="help">The complete panel is shown above. Choose a tool to add an edit.</p>';
  edits.forEach((edit,i)=>{if(edit.kind!=='radius')return;const row=$('featureList').querySelector(`[data-feature="${i}"]`);row?.querySelectorAll('[data-feature-x],[data-feature-y]').forEach(input=>input.closest('label')?.remove());const controls=document.createElement('div');controls.innerHTML=`<label>Corner<select data-radius-corner="${i}"><option value="top-left" ${edit.corner==='top-left'?'selected':''}>Top left</option><option value="top-right" ${edit.corner==='top-right'?'selected':''}>Top right</option><option value="bottom-left" ${edit.corner==='bottom-left'?'selected':''}>Bottom left</option><option value="bottom-right" ${edit.corner==='bottom-right'?'selected':''}>Bottom right</option></select></label><label>Radius mm<input data-radius-size="${i}" type="number" min="1" value="${edit.radius||10}"></label>`;const remove=row?.querySelector('[data-remove-feature]');if(remove)while(controls.firstChild)row.insertBefore(controls.firstChild,remove);});
  edits.forEach((edit,i)=>{if(edit.kind!=='notch')return;const row=$('featureList').querySelector(`[data-feature="${i}"]`),label=document.createElement('label');label.innerHTML=`Notch allowance<select data-notch-allowance="${i}"><option value="standard" ${!['windowBoard','shoulder'].includes(edit.allowanceType)?'selected':''}>Standard notch</option><option value="windowBoard" ${edit.allowanceType==='windowBoard'?'selected':''}>Window board — 2 mm all around</option><option value="shoulder" ${edit.allowanceType==='shoulder'?'selected':''}>Shoulder notch — 3 mm all around</option></select>`;row?.insertBefore(label,row.querySelector('[data-remove-feature]'));});
  document.querySelectorAll('[data-feature]').forEach(r=>r.addEventListener('click',()=>{state.selectedDetail=+r.dataset.feature;drawPieceEditor();renderFeatureList()}));
  $('featureList').querySelectorAll('input,select,button,label').forEach(control=>control.addEventListener('click',event=>event.stopPropagation()));
  document.querySelectorAll('[data-feature-x]').forEach(inp=>inp.addEventListener('change',()=>{rememberPieceEdits(detail.key);const v=clamp((Number(inp.value)||0)/(p.width||1));edits[+inp.dataset.featureX].x=rtl?1-v:v;drawPieceEditor();drawMeasured()}));
  document.querySelectorAll('[data-feature-y]').forEach(inp=>inp.addEventListener('change',()=>{rememberPieceEdits(detail.key);edits[+inp.dataset.featureY].y=clamp(1-(Number(inp.value)||0)/(p.height||1));drawPieceEditor();drawMeasured()}));
  document.querySelectorAll('[data-feature-size]').forEach(inp=>inp.addEventListener('change',()=>{rememberPieceEdits(detail.key);edits[+inp.dataset.featureSize].diameter=Math.max(1,Number(inp.value)||1);drawPieceEditor();drawMeasured()}));
  document.querySelectorAll('[data-radius-size]').forEach(inp=>inp.addEventListener('change',()=>{rememberPieceEdits(detail.key);edits[+inp.dataset.radiusSize].radius=Math.max(1,Number(inp.value)||1);drawPieceEditor();drawMeasured()}));
  document.querySelectorAll('[data-radius-corner]').forEach(select=>select.addEventListener('change',()=>{rememberPieceEdits(detail.key);const edit=edits[+select.dataset.radiusCorner];edit.corner=select.value;edit.x=select.value.includes('right')?1:0;edit.y=select.value.includes('bottom')?1:0;drawPieceEditor();drawMeasured()}));
  document.querySelectorAll('[data-cutout-width]').forEach(inp=>inp.addEventListener('change',()=>{rememberPieceEdits(detail.key);edits[+inp.dataset.cutoutWidth].width=Math.max(1,Number(inp.value)||1);drawPieceEditor();drawMeasured()}));
  document.querySelectorAll('[data-cutout-height]').forEach(inp=>inp.addEventListener('change',()=>{rememberPieceEdits(detail.key);edits[+inp.dataset.cutoutHeight].height=Math.max(1,Number(inp.value)||1);drawPieceEditor();drawMeasured()}));
  document.querySelectorAll('[data-notch-field]').forEach(inp=>inp.addEventListener('change',()=>{rememberPieceEdits(detail.key);const edit=edits[+inp.dataset.featureIndex],field=inp.dataset.notchField;edit[field]=field==='side'?inp.value:Math.max(0,Number(inp.value)||0);if(field==='height1'&&edit.height2<edit.height1)edit.height2=edit.height1;if(field==='height2'&&edit.height1>edit.height2)edit.height1=edit.height2;syncBelowWindowJoinFromNotch(detail.key,edit);detectMeasurementStations();syncOptionalNotchStations(detail.key);drawPieceEditor();renderInputs();drawMeasured()}));
  document.querySelectorAll('[data-notch-allowance]').forEach(select=>select.addEventListener('change',()=>{rememberPieceEdits(detail.key);edits[+select.dataset.notchAllowance].allowanceType=select.value;drawPieceEditor();drawMeasured()}));
  document.querySelectorAll('[data-remove-feature]').forEach(b=>b.addEventListener('click',()=>{rememberPieceEdits(detail.key);edits.splice(+b.dataset.removeFeature,1);state.selectedDetail=null;renderFeatureList();drawPieceEditor();drawMeasured()}));
}
function detailPointerDown(e){
  const layout=$('pieceEditor')._layout,detail=currentDetail();if(!layout||!detail)return;const r=$('pieceEditor').getBoundingClientRect(),px=(e.clientX-r.left)*$('pieceEditor').width/r.width,py=(e.clientY-r.top)*$('pieceEditor').height/r.height;if(px<layout.left||px>layout.left+layout.pw||py<layout.top||py>layout.top+layout.ph)return;
  let x=clamp((px-layout.left)/layout.pw),y=clamp((py-layout.top)/layout.ph),edits=state.pieceEdits[detail.key]||(state.pieceEdits[detail.key]=[]);
  if(state.detailMode==='move'){let best={d:.08,index:null};edits.forEach((q,i)=>{const d=Math.hypot(x-q.x,y-q.y);if(d<best.d)best={d,index:i}});state.selectedDetail=best.index;}
  else{
    rememberPieceEdits(detail.key);const side=x<.5?'left':'right';if(state.detailMode==='notch')x=side==='left'?0:1;if(state.detailMode==='square'){x=x<.5?.035:.965;y=y<.5?.035:.965;}
    if(state.detailMode==='radius'){
      const corner=radiusCornerFromPoint(x,y),entered=window.prompt(`Radius size in mm for ${corner.replace('-',' ')} corner`,'10');if(entered===null)return;const radius=Number(entered);if(!Number.isFinite(radius)||radius<=0){window.alert('Enter a radius greater than 0 mm.');return;}x=corner.includes('right')?1:0;y=corner.includes('bottom')?1:0;edits.push({kind:'radius',x,y,corner,radius});
    }else{
      const notchAllowance=state.detailMode==='notch'&&askWindowBoardNotch()?'windowBoard':'standard',specs={double:{kind:'socket',socketType:'double',width:145,height:85,label:'D/S'},single:{kind:'socket',socketType:'single',width:85,height:85,label:'S/S'},cooker:{kind:'socket',socketType:'cooker',width:85,height:145,label:'C/S'},hole:{kind:'hole',diameter:20},cutout:{kind:'cutout',width:100,height:100},notch:{kind:'notch',side,notchWidth:30,height1:Math.max(0,Math.round((1-y)*detail.p.height)-20),height2:Math.min(detail.p.height,Math.round((1-y)*detail.p.height)+20),allowanceType:notchAllowance},square:{kind:'square'}};edits.push({kind:state.detailMode,x,y,...(specs[state.detailMode]||{})});
    }
    state.selectedDetail=edits.length-1;if(state.detailMode==='notch'){syncBelowWindowJoinFromNotch(detail.key,edits[state.selectedDetail]);detectMeasurementStations();syncOptionalNotchStations(detail.key);renderInputs();}
  }
  renderFeatureList();drawPieceEditor();drawMeasured();
}
function askOverlap(){$('overlapModal').classList.remove('hidden');}
function applyOverlapChoice(choice){state.leftOverlap=choice==='left'||choice==='both';state.rightOverlap=choice==='right'||choice==='both';$('overlapModal').classList.add('hidden');drawMeasured();setStatus(`${choice==='none'?'No overlap reduction':choice==='both'?'Both side panels reduced 8 mm in production':`${choice==='left'?'Left':'Right'} panel reduced 8 mm in production`}. Red measurements are unchanged.`);window.dispatchEvent(new CustomEvent('splashcad:measurements-ready',{detail:{wall:'window'}}));}

function nearestVertex(p){let best={d:.035,panel:-1,vertex:-1};state.panels.forEach((panel,pi)=>panel.points.forEach((q,vi)=>{const d=dist(p,q);if(d<best.d)best={d,panel:pi,vertex:vi}}));return best.panel>=0?best:null;}
function nearestStation(p){if(state.panels.length!==3)return null;const leftX=state.panels[1].points[0].x,rightX=state.panels[1].points[1].x;const dl=Math.abs(p.x-leftX),dr=Math.abs(p.x-rightX);if(Math.min(dl,dr)<.025)return{side:dl<dr?'left':'right'};return null;}
function nearestSocket(p){let best={d:.04,index:-1};state.fittings.forEach((q,i)=>{const d=dist(p,q);if(d<best.d)best={d,index:i}});return best.index>=0?best:null;}
function selectPanelAt(p){for(let i=state.panels.length-1;i>=0;i--)if(pointInPolygon(p,state.panels[i].points)){state.selectedPanel=i;state.detailPiece=pieces[state.panels[i].piece].id;renderDetailPieceOptions();return i;}return -1;}
function setMode(mode){state.mode=mode;document.querySelectorAll('.window-tool-grid button').forEach(b=>b.classList.remove('active'));const ids={move:'moveButton',width:'addWidthButton',height:'addHeightButton',square:'squareButton',single:'singleSocketButton',double:'socketButton',cooker:'cookerButton',notch:'notchButton',hole:'holeButton',radius:'radiusButton',erase:'eraseButton'};$(ids[mode])?.classList.add('active');}

function pointerDown(e){
  e.preventDefault();const p=canvasToNorm(e);
  if(state.mode==='move'){
    const s=nearestSocket(p);if(s){selectSocket(s.index);state.drag={type:'socket',index:s.index};return;}
    const v=nearestVertex(p);if(v){state.selectedPanel=v.panel;state.drag={type:'vertex',panel:v.panel,vertex:v.vertex};drawOverlay();return;}
    const station=nearestStation(p);if(station){state.drag={type:'station',side:station.side};return;}
    selectPanelAt(p);drawOverlay();return;
  }
  if(['single','double','cooker','hole'].includes(state.mode)){
    const specs={single:[85,85,.035,.035],double:[145,85,.055,.035],cooker:[85,145,.035,.055],hole:[20,20,.018,.018]},s=specs[state.mode];state.fittings.push({...p,type:state.mode,editWidth:s[0],editHeight:s[1],width:s[2],height:s[3],confidence:100});selectSocket(state.fittings.length-1);detectMeasurementStations();renderInputs();drawMeasured();return;
  }
  if(state.mode==='width'||state.mode==='height')state.markers.push({...p,kind:state.mode,panel:state.selectedPanel});
  else if(state.mode==='notch')state.notches.push({...p,panel:state.selectedPanel,allowanceType:askWindowBoardNotch()?'windowBoard':'standard'});
  else if(state.mode==='square')state.squares.push({...p,panel:state.selectedPanel});
  else if(state.mode==='radius'){
    const panel=state.panels[state.selectedPanel];if(!panel)return;const vertex=panel.points.reduce((best,q,index)=>{const d=dist(p,q);return d<best.d?{d,q,index}:best;},{d:Infinity,q:panel.points[0],index:0}),xs=panel.points.map(q=>q.x),ys=panel.points.map(q=>q.y),corner=radiusCornerFromPoint((vertex.q.x-Math.min(...xs))/(Math.max(...xs)-Math.min(...xs)||1),(vertex.q.y-Math.min(...ys))/(Math.max(...ys)-Math.min(...ys)||1)),entered=window.prompt(`Radius size in mm for ${corner.replace('-',' ')} corner`,'10');if(entered===null)return;const radius=Number(entered);if(!Number.isFinite(radius)||radius<=0){window.alert('Enter a radius greater than 0 mm.');return;}state.radii.push({...vertex.q,panel:state.selectedPanel,corner,radius});
  }
  else if(state.mode==='erase')eraseNearest(p);
  drawOverlay();
}
function pointerMove(e){
  if(!state.drag)return;const p=canvasToNorm(e);
  if(state.drag.type==='station'){
    const minX=state.drag.side==='left'?state.panels[0].points[0].x+.035:state.panels[1].points[0].x+.035,maxX=state.drag.side==='left'?state.panels[1].points[1].x-.035:state.panels[2].points[1].x-.035,x=clamp(p.x,minX,maxX);if(state.drag.side==='left'){state.panels[0].points[1].x=x;state.panels[0].points[2].x=x;state.panels[1].points[0].x=x;state.panels[1].points[3].x=x;}else{state.panels[1].points[1].x=x;state.panels[1].points[2].x=x;state.panels[2].points[0].x=x;state.panels[2].points[3].x=x;}
  }else if(state.drag.type==='vertex'){
    const {panel,vertex}=state.drag;
    const piece=pieces[state.panels[panel].piece],top=vertex<2,bottom=vertex>1,left=vertex===0||vertex===3;
    if(panel===0&&(vertex===1||vertex===2)){const px=clamp(p.x,.06,state.panels[1].points[1].x-.06);state.panels[0].points[1].x=px;state.panels[0].points[2].x=px;state.panels[1].points[0].x=px;state.panels[1].points[3].x=px;}
    else if(panel===2&&(vertex===0||vertex===3)){const px=clamp(p.x,state.panels[1].points[0].x+.06,.94);state.panels[2].points[0].x=px;state.panels[2].points[3].x=px;state.panels[1].points[1].x=px;state.panels[1].points[2].x=px;}
    else if(panel===0&&(vertex===0||vertex===3)){state.panels[0].points[vertex].x=clamp(p.x,.025,state.panels[0].points[1].x-.035);}
    else if(panel===2&&(vertex===1||vertex===2)){state.panels[2].points[vertex].x=clamp(p.x,state.panels[2].points[0].x+.035,.975);}
    if(bottom){const y=clamp(p.y,.025,.975);state.panels.forEach(q=>{q.points[2].y=y;q.points[3].y=y;});}
    else if(top){const py=clamp(p.y,.04,.94);state.panels[panel].points[vertex].y=py;if(!piece.offSquareHeight)state.panels[panel].points[left?1:0].y=py;if((panel===0||panel===2)&&!pieces[0].offSquareHeight&&!pieces[2].offSquareHeight){const opposite=panel===0?2:0;state.panels[opposite].points[0].y=py;state.panels[opposite].points[1].y=py;}}
  }else state.fittings[state.drag.index]={...state.fittings[state.drag.index],...p};
  drawOverlay();
}
function pointerUp(){state.drag=null;}
function eraseNearest(p){
  const groups=['markers','notches','squares','radii'];let best={d:.04,group:null,index:-1};groups.forEach(group=>state[group].forEach((q,i)=>{const d=dist(p,q);if(d<best.d)best={d,group,index:i}}));const s=nearestSocket(p);if(s&&s.d<best.d){state.fittings.splice(s.index,1);state.selectedSocket=null;detectMeasurementStations();renderInputs();renderFittings();drawMeasured();return;}if(best.group)state[best.group].splice(best.index,1);
}

function drawingPointerDown(e){
  if(state.editTarget!=='drawing'||!state.scanComplete)return;e.preventDefault();const canvas=$('windowDrawing'),r=canvas.getBoundingClientRect(),p={x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
  const layout=[...drawingLayouts].reverse().find(l=>p.x>=l.x&&p.x<=l.x+l.pw&&p.y>=l.y&&p.y<=l.y+l.ph);if(!layout)return;
  state.selectedDrawingKey=layout.key;let nx=clamp((p.x-layout.x)/(layout.pw||1)),ny=clamp((p.y-layout.y)/(layout.ph||1));
  if(state.mode==='move'){setStatus(`${layout.piece.name||layout.key} selected for drawing edits.`);return;}
  if(state.mode==='square'){const corners=[[0,0],[1,0],[0,1],[1,1]],nearest=corners.sort((a,b)=>Math.hypot(nx-a[0],ny-a[1])-Math.hypot(nx-b[0],ny-b[1]))[0];nx=nearest[0];ny=nearest[1];}
  const edits=state.pieceEdits[layout.key]||(state.pieceEdits[layout.key]=[]);
  if(state.mode==='erase'){let best={d:.09,index:-1};edits.forEach((item,i)=>{const d=Math.hypot(nx-item.x,ny-item.y);if(d<best.d)best={d,index:i};});if(best.index>=0)edits.splice(best.index,1);}
  else if(state.mode==='notch'){
    const side=nx<.5?'left':'right',height=Number(layout.piece.height)||1,centre=Math.round((1-ny)*height),edit={kind:'notch',x:side==='left'?0:1,y:ny,side,notchWidth:30,height1:Math.max(0,centre-20),height2:Math.min(height,centre+20),allowanceType:askWindowBoardNotch()?'windowBoard':'standard'};
    edits.push(edit);syncBelowWindowJoinFromNotch(layout.key,edit);renderInputs();
  }
  else if(state.mode==='square'||state.mode==='radius'||state.mode==='width'||state.mode==='height')edits.push({kind:state.mode,x:nx,y:ny});
  else if(state.mode==='hole')edits.push({kind:'hole',x:nx,y:ny,diameter:20});
  else if(state.mode==='cutout')edits.push({kind:'cutout',x:nx,y:ny,width:100,height:100});
  else if(['single','double','cooker'].includes(state.mode)){const specs={single:[85,85,'S/S'],double:[145,85,'D/S'],cooker:[85,145,'C/S']},s=specs[state.mode];edits.push({kind:'socket',x:nx,y:ny,width:s[0],height:s[1],label:s[2]});}
  drawMeasured();setStatus(`${layout.piece.name||layout.key} drawing updated with ${state.mode}.`);
}

async function fileToDataUrl(file){return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});}
function isHeicFile(file){return /\.(heic|heif)$/i.test(file?.name||'')||/^image\/(heic|heif)$/i.test(file?.type||'');}
async function loadPhotoFile(file){
  const rawDataUrl=await fileToDataUrl(file);
  if(!isHeicFile(file))return rawDataUrl;
  setStatus('Converting HEIC photo…');
  const response=await fetch('/api/convert-heic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageDataUrl:rawDataUrl})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.imageDataUrl)throw new Error(data.error||'HEIC conversion failed.');
  return data.imageDataUrl;
}
async function scan(){
  if(!state.imageDataUrl){const response=await fetch('/window-benchmark.jpg');state.imageDataUrl=await fileToDataUrl(await response.blob());}
  $('scanButton').disabled=true;setStatus('Scanning three main wall panels and sockets…');
  try{
    const r=await fetch('/api/detect-window-wall',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageDataUrl:state.imageDataUrl})}),data=await r.json();if(!r.ok)throw new Error(data.error||'Scan failed');
    state.panels=buildPanels({outer:data.outerCorners,counter:data.counterLine,walls:data.wallLimits,sideTopY:data.sideTopY});state.fittings=data.fittings.map(f=>({...f,editWidth:f.type==='double'?145:85,editHeight:f.type==='cooker'?145:85}));state.markers=[];state.notches=[];state.radii=[];state.squares=[];state.scanComplete=true;detectMeasurementStations(true);renderInputs();
    $('confidence').textContent=`${data.confidence}% AI`;setStatus(`Three main panels created using shared window stations. ${state.fittings.length} fitting${state.fittings.length===1?'':'s'} detected.`,true);renderFittings();drawOverlay();drawMeasured();askOverlap();
  }catch(err){setStatus(`${err.message} Benchmark geometry retained for manual editing.`,false);}finally{$('scanButton').disabled=false;}
}
function resetBenchmark(){state.panels=buildPanels(benchmarkGeometry);state.fittings=structuredClone(benchmarkFittings);state.markers=[];state.notches=[];state.radii=[];state.squares=[];state.scanComplete=true;state.selectedPanel=0;state.selectedSocket=null;state.widthStations.leftWall=[196];state.widthStations.rightWall=[151];state.widthStations.belowWindow=[];state.heightStations.leftWall=[215];state.heightStations.rightWall=[212];state.heightStations.belowWindow=[];renderInputs();$('confidence').textContent='Benchmark';setStatus('Benchmark measurements loaded. Entered edge measurements remain authoritative.');renderFittings();drawOverlay();drawMeasured();askOverlap();}

let optionalPieceMode=null;
function optionalDimensionFields(piece,prefix,title,heightLabel='Height mm'){
  return `<div class="optional-piece-group"><h3>${title}</h3><label>Width mm<input id="${prefix}Width" type="number" value="${piece.width}"></label><label>${heightLabel}<input id="${prefix}Height" type="number" value="${piece.height}"></label></div>`;
}
function openOptionalPiecePopup(mode){
  optionalPieceMode=mode;
  if(mode==='reveals'){
    $('optionalPieceTitle').textContent='Add reveals';
    $('optionalPieceHelp').textContent='Enter both reveal sizes. Both pieces will be added and remain independently editable.';
    $('optionalPieceFields').innerHTML=`<div class="optional-piece-grid">${optionalDimensionFields(pieces[3],'leftReveal','Left reveal')}${optionalDimensionFields(pieces[4],'rightReveal','Right reveal')}</div>`;
  }else{
    $('optionalPieceTitle').textContent='Add cill';
    $('optionalPieceHelp').textContent='Enter the cill width and depth, then position or edit it in the enlarged editor.';
    $('optionalPieceFields').innerHTML=optionalDimensionFields(pieces[5],'cill','Window cill','Depth mm');
  }
  $('optionalPieceModal').classList.remove('hidden');
  $('optionalPieceFields').querySelector('input')?.focus();
}
function saveOptionalPiecePopup(){
  if(optionalPieceMode==='reveals'){
    pieces[3].width=pieces[3].secondWidth=Math.max(1,Number($('leftRevealWidth').value)||1);pieces[3].height=pieces[3].secondHeight=Math.max(1,Number($('leftRevealHeight').value)||1);pieces[3].offSquareHeight=true;
    pieces[4].width=pieces[4].secondWidth=Math.max(1,Number($('rightRevealWidth').value)||1);pieces[4].height=pieces[4].secondHeight=Math.max(1,Number($('rightRevealHeight').value)||1);pieces[4].offSquareHeight=true;
    state.revealsNeeded=true;$('revealsNeeded').value='yes';state.detailPiece='leftReveal';
  }else{
    pieces[5].width=pieces[5].secondWidth=Math.max(1,Number($('cillWidth').value)||1);pieces[5].height=pieces[5].secondHeight=Math.max(1,Number($('cillHeight').value)||1);
    state.sillNeeded=true;$('sillNeeded').value='yes';state.detailPiece='sill';
  }
  $('optionalPieceModal').classList.add('hidden');renderInputs();renderDetailPieceOptions();drawMeasured();openPieceEditor(state.detailPiece);setStatus(`${optionalPieceMode==='reveals'?'Both reveals':'Window cill'} added and ready to edit.`);
}

$('photoInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{state.imageDataUrl=await loadPhotoFile(file);$('windowPhoto').src=state.imageDataUrl;$('windowPhoto').onload=sizeOverlay;setStatus(`${isHeicFile(file)?'HEIC converted. ':'Photo loaded. '}Tap Scan window + sockets.`);}catch(error){state.imageDataUrl='';$('windowPhoto').removeAttribute('src');setStatus(error instanceof Error?error.message:'Photo could not be loaded.');window.alert(error instanceof Error?error.message:'Photo could not be loaded.');}finally{e.target.value='';}});
$('scanButton').addEventListener('click',scan);$('benchmarkButton').addEventListener('click',resetBenchmark);$('moveButton').addEventListener('click',()=>setMode('move'));
$('applyFittingSize').addEventListener('click',()=>{const f=state.fittings[state.selectedSocket];if(!f)return;const w=Number($('fittingWidth').value),h=Number($('fittingHeight').value);if(w>0)f.editWidth=w;if(h>0)f.editHeight=h;renderFittings();drawOverlay();});
$('revealsNeeded').addEventListener('change',e=>{state.revealsNeeded=e.target.value==='yes';renderInputs();renderDetailPieceOptions();drawMeasured();});
$('sillNeeded').addEventListener('change',e=>{state.sillNeeded=e.target.value==='yes';renderInputs();renderDetailPieceOptions();drawMeasured();});
$('rectangleButton').addEventListener('click',()=>{state.extraRectangles.push({width:500,secondWidth:500,height:200,secondHeight:200,offSquareWidth:false,offSquareHeight:false,datum:'none',colour:'#64748b'});renderInputs();renderDetailPieceOptions();drawMeasured();setStatus(`Editable rectangle ${state.extraRectangles.length} added.`);});
$('applyButton').addEventListener('click',()=>{commitMeasurementInputs();drawMeasured();const count=3+(state.revealsNeeded?2:0)+(state.sillNeeded?1:0)+state.extraRectangles.length;$('measurementStatus').textContent=`Measurements applied to ${count} independent pieces and both drawings.`;$('measurementStatus').className='status success';});$('printButton').addEventListener('click',()=>window.print());
function setDrawingView(opening){if(opening)drawMeasured();document.body.classList.toggle('show-drawings',opening);$('showDrawingsButton').textContent=opening?'Back to survey':'View drawings';if(opening){$('windowDrawing').style.display='block';$('productionWindowDrawing').style.display='block';setTimeout(()=>document.querySelector('.drawing-card')?.scrollIntoView({behavior:'smooth',block:'start'}),40);}else{window.scrollTo({top:0,behavior:'smooth'});setTimeout(sizeOverlay,250);}}
$('showDrawingsButton').addEventListener('click',()=>setDrawingView(!document.body.classList.contains('show-drawings')));
$('backToPhotoButton').addEventListener('click',()=>setDrawingView(false));
document.querySelectorAll('[data-back-survey]').forEach(button=>button.addEventListener('click',()=>setDrawingView(false)));
document.querySelectorAll('[data-edit-reveal]').forEach(button=>button.addEventListener('click',()=>openPieceEditor(button.dataset.editReveal)));
$('windowOverlay').addEventListener('pointerdown',pointerDown);window.addEventListener('pointermove',pointerMove);window.addEventListener('pointerup',pointerUp);window.addEventListener('resize',sizeOverlay);$('windowPhoto').addEventListener('load',sizeOverlay);
$('detailPiece').addEventListener('change',e=>{state.detailPiece=e.target.value;$('photoEditPiece').value=e.target.value;state.selectedDetail=null;renderEditorGeometry();drawPieceEditor();renderFeatureList();});$('pieceEditor').addEventListener('pointerdown',detailPointerDown);$('undoPieceEdit').addEventListener('click',undoPieceEdit);$('closePieceEditor').addEventListener('click',closePieceEditor);
$('photoEditPiece').addEventListener('change',e=>{state.detailPiece=e.target.value;$('detailPiece').value=e.target.value;state.selectedDetail=null;renderEditorGeometry();drawPieceEditor();renderFeatureList();});
$('addRevealsTool').addEventListener('click',()=>openOptionalPiecePopup('reveals'));
$('addCillTool').addEventListener('click',()=>openOptionalPiecePopup('cill'));
$('closeOptionalPiece').addEventListener('click',()=>$('optionalPieceModal').classList.add('hidden'));
$('saveOptionalPiece').addEventListener('click',saveOptionalPiecePopup);
document.querySelectorAll('[data-detail-tool]').forEach(b=>b.addEventListener('click',()=>{state.detailMode=b.dataset.detailTool;document.querySelectorAll('[data-detail-tool]').forEach(x=>x.classList.toggle('active',x===b));openPieceEditor(state.detailPiece);setStatus(`${b.textContent} selected for ${currentDetail()?.name||'piece'}.`);}));document.querySelectorAll('[data-overlap]').forEach(b=>b.addEventListener('click',()=>applyOverlapChoice(b.dataset.overlap)));
renderInputs();renderFittings();renderDetailPieceOptions();drawMeasured();setTimeout(sizeOverlay,50);
document.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.target?.tagName!=='INPUT'||event.target.type!=='number')return;const scope=event.target.closest('.piece-measurement-card,.piece-editor-dialog')||document,inputs=[...scope.querySelectorAll('input[type="number"]')].filter(input=>!input.disabled&&input.offsetParent!==null),index=inputs.indexOf(event.target);if(index<0)return;event.preventDefault();const next=inputs[index+1];if(next){next.focus();next.select();}else event.target.blur();});
