export default async function handler(req,res){
  if(req.method!=='POST'){res.status(405).json({error:'POST only'});return}
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey){res.status(503).json({error:'OPENAI_API_KEY is not configured'});return}
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const imageDataUrl=body.imageDataUrl;
  if(typeof imageDataUrl!=='string'||!imageDataUrl.startsWith('data:image/')){res.status(400).json({error:'Invalid image'});return}
  const prompt=`You are detecting a glass splashback from a survey photo. Return JSON only with shape {"outline":[{"x":0..1,"y":0..1}],"fittings":[{"x":0..1,"y":0..1,"code":"S/S|D/S|C/S|M/S","w":0..1,"h":0..1}],"notches":[{"x":0..1,"y":0..1}]}. Outline points must trace only the intended glass perimeter in clockwise order. Detect visible electrical faceplates simultaneously. Ignore handles, appliance details, reflections, shadows and internal socket details. Prefer fewer accurate perimeter points over noisy points. Keep coordinates normalized to the image.`;
  try{
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_VISION_MODEL||'gpt-5.6',input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:imageDataUrl}]}],text:{format:{type:'json_object'}}})});
    const data=await r.json();
    if(!r.ok)throw new Error(data?.error?.message||`OpenAI ${r.status}`);
    let text=data.output_text||'';
    if(!text&&Array.isArray(data.output))text=data.output.flatMap(x=>x.content||[]).map(x=>x.text||'').join('');
    const out=JSON.parse(text);
    const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
    const outline=(out.outline||[]).slice(0,32).map(p=>({x:clamp(p.x),y:clamp(p.y)}));
    const fittings=(out.fittings||[]).slice(0,20).map(f=>({x:clamp(f.x),y:clamp(f.y),code:String(f.code||'S/S').slice(0,4),w:Math.max(.015,Math.min(.2,Number(f.w)||.035)),h:Math.max(.015,Math.min(.2,Number(f.h)||.05))}));
    const notches=(out.notches||[]).slice(0,20).map(p=>({x:clamp(p.x),y:clamp(p.y)}));
    if(outline.length<3)throw new Error('Detector returned too few outline points');
    res.setHeader('Cache-Control','no-store');res.status(200).json({outline,fittings,notches});
  }catch(err){res.status(502).json({error:err instanceof Error?err.message:'Detection failed'})}
}