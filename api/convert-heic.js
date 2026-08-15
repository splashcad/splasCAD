import convertHeic from "heic-convert";
export default async function handler(req,res) {
  if (req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  const {imageDataUrl} = req.body || {};
  if (typeof imageDataUrl !== "string" || !imageDataUrl.includes(",")) return res.status(400).json({error:"Choose a valid photo"});
  try {
    const encoded = imageDataUrl.slice(imageDataUrl.indexOf(",")+1);
    const b = Buffer.from(encoded,"base64");
    if (b.length>3 && b[0]===255 && b[1]===216 && b[2]===255) return res.status(200).json({imageDataUrl:"data:image/jpeg;base64,"+encoded});
    if (b.length>8 && b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71) return res.status(200).json({imageDataUrl:"data:image/png;base64,"+encoded});
    const out = await convertHeic({buffer:b,format:"JPEG",quality:0.92});
    return res.status(200).json({imageDataUrl:"data:image/jpeg;base64,"+Buffer.from(out).toString("base64")});
  } catch (e) {
    return res.status(422).json({error:"Photo conversion failed: "+(e?.message||"unknown error")});
  }
}
