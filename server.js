import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Alpha 6.0.10 retains the robust Windows .env discovery introduced in 6.0.9.
// The ZIP may be extracted into a same-named outer folder, so the key can
// legitimately be one directory above server.js. We also support UTF-8/UTF-16
// .env files and existing sibling SplashCAD folders, without ever printing the key.
const PRIMARY_ENV_FILE = path.join(__dirname, ".env");
let activeEnvFile = PRIMARY_ENV_FILE;
let loadedEnv = {};

function decodeEnvFile(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buf.length - 2);
    for (let i = 2, j = 0; i + 1 < buf.length; i += 2, j += 2) {
      swapped[j] = buf[i + 1]; swapped[j + 1] = buf[i];
    }
    return swapped.toString("utf16le");
  }
  const utf8 = buf.toString("utf8").replace(/^\uFEFF/, "");
  // Some Windows editors can save UTF-16LE without a BOM. NULs are the giveaway.
  if (utf8.includes("\u0000")) return buf.toString("utf16le").replace(/^\uFEFF/, "");
  return utf8;
}

function parseEnvFile(file) {
  const loaded = {};
  if (!file || !fs.existsSync(file)) return loaded;
  const text = decodeEnvFile(file);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\u0000/g, "").trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    loaded[key] = value;
  }
  return loaded;
}

function candidateEnvFiles() {
  const out = [];
  const add = f => { if (f && !out.includes(f)) out.push(f); };
  add(path.join(__dirname, ".env"));
  add(path.join(__dirname, "API_KEY_SETUP.txt"));
  add(path.join(path.dirname(__dirname), ".env"));
  add(path.join(path.dirname(__dirname), "API_KEY_SETUP.txt"));
  add(path.join(process.cwd(), ".env"));
  add(path.join(process.cwd(), "API_KEY_SETUP.txt"));

  // If this build is inside Downloads/SplashCAD_.../SplashCAD_..., inspect sibling
  // SplashCAD folders for an already-configured .env. This prevents the user
  // having to re-enter the same key for every alpha build.
  const roots = [path.dirname(__dirname), path.dirname(path.dirname(__dirname))];
  for (const root of roots) {
    try {
      for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory() || !/^SplashCAD/i.test(ent.name)) continue;
        add(path.join(root, ent.name, ".env"));
        add(path.join(root, ent.name, "API_KEY_SETUP.txt"));
        // Also tolerate one extra same-name extraction layer.
        add(path.join(root, ent.name, ent.name, ".env"));
        add(path.join(root, ent.name, ent.name, "API_KEY_SETUP.txt"));
      }
    } catch {}
  }
  return out;
}

function selectEnvFile() {
  let firstExisting = PRIMARY_ENV_FILE;
  for (const file of candidateEnvFiles()) {
    if (!fs.existsSync(file)) continue;
    if (firstExisting === PRIMARY_ENV_FILE && !fs.existsSync(PRIMARY_ENV_FILE)) firstExisting = file;
    const parsed = parseEnvFile(file);
    const key = String(parsed.OPENAI_API_KEY || "").trim();
    if (key.length > 10) return { file, parsed };
  }
  const parsed = parseEnvFile(firstExisting);
  return { file: firstExisting, parsed };
}

function refreshEnv() {
  const picked = selectEnvFile();
  activeEnvFile = picked.file;
  loadedEnv = picked.parsed;
  for (const key of ["OPENAI_API_KEY", "OPENAI_VISION_MODEL"]) {
    if (Object.prototype.hasOwnProperty.call(loadedEnv, key)) process.env[key] = loadedEnv[key];
  }
  if (!process.env.PORT && loadedEnv.PORT) process.env.PORT = loadedEnv.PORT;
  return loadedEnv;
}

function currentApiKey() {
  refreshEnv();
  return String(loadedEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
}

function currentModel() {
  refreshEnv();
  return String(loadedEnv.OPENAI_VISION_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-5.6-luna").trim();
}

refreshEnv();

const mime = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8",
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".svg":"image/svg+xml",
  ".txt":"text/plain; charset=utf-8"
};

// Only these browser assets may ever be served. Survey notes, setup files,
// environment files and historical builds stay private on the server.
const PUBLIC_FILES = new Set([
  "index.html", "hob.html", "window.html", "splashcad-app.js", "window-wall.js", "tablet.js",
  "voice.js", "styles.css", "manifest.webmanifest", "service-worker.js",
  "splashcad-icon.svg", "benchmark.jpg", "window-benchmark.jpg"
]);

function express() {
  const routes = new Map();
  const middleware = [];
  const app = {
    use(fn) { if (typeof fn === "function") middleware.push(fn); return app; },
    post(route, handler) { routes.set(`POST ${route}`, handler); return app; },
    get(route, handler) { routes.set(`GET ${route}`, handler); return app; },
    async handle(req, nodeRes) {
        const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        const res = {
          statusCode: 200,
          setHeader: (k,v) => nodeRes.setHeader(k,v),
          status(code) { res.statusCode = code; return res; },
          json(obj) { nodeRes.statusCode = res.statusCode; nodeRes.setHeader("Content-Type","application/json; charset=utf-8"); nodeRes.end(JSON.stringify(obj)); },
          send(body) { nodeRes.statusCode = res.statusCode; if (!nodeRes.hasHeader("Content-Type")) nodeRes.setHeader("Content-Type","text/plain; charset=utf-8"); nodeRes.end(body); }
        };
        let i = 0;
        const next = () => { const fn = middleware[i++]; if (fn) fn(req,res,next); };
        next();
        try {
          if (req.method === "POST") {
            let raw = "";
            for await (const chunk of req) {
              raw += chunk;
              if (raw.length > 70 * 1024 * 1024) throw new Error("Request too large.");
            }
            const contentType = String(req.headers["content-type"] || "").toLowerCase();
            if (contentType.includes("application/sdp") || contentType.includes("text/plain")) req.body = raw;
            else try { req.body = raw ? JSON.parse(raw) : {}; } catch { res.status(400).json({error:"Invalid JSON."}); return; }
          }
          const handler = routes.get(`${req.method} ${url.pathname}`);
          if (handler) { await handler(req,res); return; }
          if (req.method !== "GET" && req.method !== "HEAD") { nodeRes.statusCode=405; nodeRes.end("Method not allowed"); return; }
          let rel = decodeURIComponent(url.pathname);
          if (rel === "/") rel = "/index.html";
          const publicName = rel.replace(/^\/+/, "");
          const target = path.resolve(__dirname, publicName);
          if (!PUBLIC_FILES.has(publicName) || !target.startsWith(__dirname + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
            nodeRes.statusCode = 404; nodeRes.end("Not found"); return;
          }
          nodeRes.setHeader("Content-Type", mime[path.extname(target).toLowerCase()] || "application/octet-stream");
          fs.createReadStream(target).pipe(nodeRes);
        } catch (err) {
          console.error(err);
          if (!nodeRes.headersSent) { nodeRes.statusCode=500; nodeRes.setHeader("Content-Type","application/json"); }
          if (!nodeRes.writableEnded) nodeRes.end(JSON.stringify({error: err instanceof Error ? err.message : "Server error"}));
        }
    },
    listen(port, cb) {
      const server = http.createServer(app.handle);
      server.listen(port, "127.0.0.1", cb);
      return server;
    }
  };
  return app;
}
express.json = () => (_req,_res,next) => next();
express.static = () => (_req,_res,next) => next();

class OpenAI {
  constructor({apiKey}) {
    this.apiKey = apiKey;
    this.responses = { create: (payload) => this.createResponse(payload) };
  }
  async createResponse(payload) {
    if (!this.apiKey) throw new Error("Missing credentials. OPENAI_API_KEY is not configured.");
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `OpenAI request failed (${r.status}).`);
    let output_text = data.output_text || "";
    if (!output_text && Array.isArray(data.output)) {
      output_text = data.output.flatMap(item => Array.isArray(item.content) ? item.content : [])
        .map(c => c.text || c.output_text || "").filter(Boolean).join("\n");
    }
    return {...data, output_text};
  }
}

const app = express();
const port = Number(process.env.PORT || 3042);

app.use(express.json({ limit: "25mb" }));
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(express.static(".", { etag: false, lastModified: false }));

app.post("/api/realtime-session", async (req, res) => {
  const apiKey = currentApiKey();
  if (!apiKey) return res.status(503).json({ error: "OPENAI_API_KEY is not configured on the server." });
  if (typeof req.body !== "string" || !req.body.includes("v=0")) return res.status(400).json({ error: "A valid WebRTC offer was not received." });
  const makeSession = fallback => ({
    type: "transcription",
    audio: { input: {
      transcription: fallback ? {
        model: "gpt-4o-transcribe",
        prompt: "Glass splashback measurements in millimetres. Preserve every digit exactly.",
        language: "en"
      } : {
        model: "gpt-live-transcribe",
        prompt: "Glass splashback site survey. The speaker calls millimetre measurements and short commands. Preserve every digit exactly.",
        keywords: ["millimetres", "width", "height", "correct that", "back", "repeat", "apply measurements"],
        languages: ["en"],
        delay: "low"
      },
      turn_detection: { type: "server_vad", threshold: 0.35, prefix_padding_ms: 450, silence_duration_ms: 420 }
    } }
  });
  try {
    let lastStatus = 502;
    let lastMessage = "Realtime voice connection failed.";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const form = new FormData();
      form.set("sdp", req.body);
      // The compatibility transcription route is primary because it connected
      // reliably on the survey laptop; the newer live route is now the fallback.
      form.set("session", JSON.stringify(makeSession(attempt < 2)));
      const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form
      });
      const body = await upstream.text();
      if (upstream.ok) {
        res.setHeader("Content-Type", "application/sdp");
        res.setHeader("X-SplashCAD-Voice-Attempt", String(attempt + 1));
        return res.send(body);
      }
      lastStatus = upstream.status;
      lastMessage = `Realtime voice connection failed (${upstream.status}).`;
      try { lastMessage = JSON.parse(body)?.error?.message || lastMessage; } catch {}
      if (![429, 500, 502, 503, 504].includes(upstream.status)) break;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 150 : 350));
    }
    return res.status(lastStatus).json({ error: `${lastMessage} Tried the primary and fallback voice routes.` });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Realtime voice connection failed." });
  }
});

app.post("/api/convert-heic", async (req, res) => {
  const { imageDataUrl } = req.body || {};
  if (typeof imageDataUrl !== "string" || !/^data:(?:image\/(?:heic|heif)|application\/octet-stream);base64,/i.test(imageDataUrl)) {
    return res.status(400).json({ error: "Choose a valid HEIC or HEIF photo." });
  }
  try {
    // Load the HEIC decoder only for HEIC requests. Its WebAssembly bundle can
    // reference browser globals during Vercel cold starts when imported eagerly.
    const { default: convertHeic } = await import("heic-convert");
    const encoded = imageDataUrl.slice(imageDataUrl.indexOf(",") + 1);
    const inputBuffer = Buffer.from(encoded, "base64");
    const outputBuffer = await convertHeic({ buffer: inputBuffer, format: "JPEG", quality: 0.9 });
    res.json({ imageDataUrl: `data:image/jpeg;base64,${Buffer.from(outputBuffer).toString("base64")}` });
  } catch (error) {
    res.status(422).json({ error: `This HEIC photo could not be converted. ${error instanceof Error ? error.message : ""}`.trim() });
  }
});

function currentClient() {
  const apiKey = currentApiKey();
  return new OpenAI({ apiKey });
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

const validatePoints = (points) => {
  if (!Array.isArray(points) || points.length < 3 || points.length > 24) {
    throw new Error("AI returned an invalid number of outline points.");
  }

  return points.map((point) => {
    if (
      point === null ||
      typeof point !== "object" ||
      !Number.isFinite(Number(point.x)) ||
      !Number.isFinite(Number(point.y))
    ) {
      throw new Error("AI returned an invalid outline point.");
    }

    return {
      x: clamp01(point.x),
      y: clamp01(point.y)
    };
  });
};

const normaliseFittings = (rawFittings) => {
  const allowed = new Set(["single","double","cooker","switch","multiple"]);
  const fittings=(Array.isArray(rawFittings)?rawFittings:[]).slice(0,30).map(f=>({
    x:clamp01(f.x), y:clamp01(f.y),
    width:Math.max(0.015,Math.min(0.25,Number(f.width)||0.05)),
    height:Math.max(0.015,Math.min(0.20,Number(f.height)||0.05)),
    type:allowed.has(String(f.type))?String(f.type):"switch",
    orientation:String(f.orientation).toLowerCase()==="vertical"?"vertical":"horizontal",
    confidence:Math.max(1,Math.min(99,Math.round(Number(f.confidence)||50)))
  })).filter(f=>f.confidence>=55).sort((a,b)=>b.confidence-a.confidence);

  const deduped=[];
  for(const f of fittings){
    const duplicate=deduped.some(k=>{
      const ax1=f.x-f.width/2, ay1=f.y-f.height/2, ax2=f.x+f.width/2, ay2=f.y+f.height/2;
      const bx1=k.x-k.width/2, by1=k.y-k.height/2, bx2=k.x+k.width/2, by2=k.y+k.height/2;
      const iw=Math.max(0,Math.min(ax2,bx2)-Math.max(ax1,bx1));
      const ih=Math.max(0,Math.min(ay2,by2)-Math.max(ay1,by1));
      const inter=iw*ih;
      const areaA=f.width*f.height, areaB=k.width*k.height;
      const union=areaA+areaB-inter;
      const iou=union>0?inter/union:0;
      const containment=inter/Math.max(0.000001,Math.min(areaA,areaB));
      const centre=Math.hypot(f.x-k.x,f.y-k.y);
      const minDim=Math.max(0.015,Math.min(f.width,f.height,k.width,k.height));
      return iou>0.48 || containment>0.82 || centre<minDim*0.24;
    });
    if(!duplicate) deduped.push(f);
  }
  const classified=deduped.map(f=>{
    const ratio=f.height/Math.max(0.0001,f.width);

    // Real cooker plates are portrait. Override weak AI labels when the
    // detected outer faceplate is clearly tall.
    if(ratio>=1.28){
      return {...f,type:"cooker",orientation:"vertical"};
    }

    // Clearly landscape plates are double sockets unless the model has
    // confidently identified something more specific.
    if((f.width/Math.max(0.0001,f.height))>=1.38 &&
       ["single","switch"].includes(f.type)){
      return {...f,type:"double",orientation:"horizontal"};
    }

    return f;
  });

  return classified.slice(0,20);
};

app.post("/api/detect-outline", async (req, res) => {
  try {
    const { imageDataUrl, job = {} } = req.body || {};

    if (
      typeof imageDataUrl !== "string" ||
      !imageDataUrl.startsWith("data:image/")
    ) {
      return res.status(400).json({ error: "A valid image is required." });
    }

    if (!currentApiKey()) {
      return res.status(503).json({
        error: "OPENAI_API_KEY is not configured on the server."
      });
    }

    const model = currentModel();

    const extractJson = (raw) => {
      if (!raw) throw new Error("The AI returned no result.");
      const cleaned = String(raw)
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "");
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      const candidate =
        firstBrace >= 0 && lastBrace > firstBrace
          ? cleaned.slice(firstBrace, lastBrace + 1)
          : cleaned;
      return JSON.parse(candidate);
    };

    const callVision = async (prompt, detail = "high") => {
      const response = await currentClient().responses.create({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: imageDataUrl, detail }
            ]
          }
        ]
      });
      return extractJson(response.output_text);
    };

    const benchmark = job.benchmark
      ? `
APPROVED BENCHMARK 001 CONTEXT
- The approved production drawing is authoritative.
- Overall width: ${job.benchmark.overallWidthMm} mm.
- Side height: ${job.benchmark.sideHeightMm} mm.
- Central rise check: ${job.benchmark.centralRiseMm} mm.
- Shoulder checks: ${(job.benchmark.shoulderChecksMm || []).join(" / ")} mm.
- Horizontal stations: ${(job.benchmark.horizontalStationsMm || []).join(", ")} mm.
- Use these only to understand topology and feature order.
- Never convert these measurements directly into image coordinates.
- This benchmark is ONE continuous hob-wall glass piece with EXACTLY 8 outer corners.
- Required clockwise topology: bottom-left → bottom-right → right shoulder → extractor right-lower → extractor right-top → extractor left-top → extractor left-lower → left shoulder → close.
- The extractor rise is a clean rectangular central step: two shoulder horizontals, two vertical rises, one top horizontal.
- Do NOT create a ninth point for a photograph edge, black canvas edge, perspective triangle or cabinet return.
`
      : "";

    // Alpha 4.4 performance path:
    // One vision request instead of three sequential requests. The same scene,
    // colour and geometry rules are preserved in a single pass.
    const proposal = await callVision(`
Return SplashCAD's editable outer glass polygon and all visible electrical faceplates in one pass.

Outline: detect ONLY the MAIN FRONT-FACING REAR WALL PLANE that will receive the glass.
Follow the rear worktop/wall junction, real cabinet undersides and extractor rise.

CRITICAL WALL-PLANE RULES
- First identify the LEFT and RIGHT vertical junctions where the main rear wall turns away into a side/return wall.
- Those two junctions are HARD LIMITS of this splashback piece.
- NEVER continue the polygon around a left or right return wall.
- NEVER use a socket, cabinet, worktop edge or feature located on a side-return wall to extend the main-wall outline.
- Perspective must not make the outline follow the return wall.
- At each side, stop exactly on the visible wall-turn/junction line.
- The bottom edge follows ONLY the rear worktop-to-main-wall junction between those limits.
- The top edge follows ONLY cabinet undersides/extractor geometry on that same front-facing wall plane.
- BEFORE choosing the raised section, positively identify the actual extractor hood/canopy.
- The tall central/raised glass section must rise to the TRUE extractor hood area.
- NEVER mistake a random gap between wall cabinets, cabinet door recess, shelf or open cupboard for the extractor rise.
- The two vertical sides of the raised section must correspond to the real extractor zone.
- If the extractor is visibly offset left or right in the photograph, the raised section must also be offset to that real position. Do NOT artificially centre it.
- Prefer the dominant broad wall plane facing the camera, not narrower angled surfaces at either side.
- Ignore worktop fronts, doors, handles, appliances, shadows, reflections, black margins and image borders.
- Use only genuine direction changes; keep shoulders and rises rectilinear.
- Return clockwise normalized coordinates beginning bottom-left.

Faceplates: detect the tight OUTER rectangle of every visible electrical faceplate ON THAT SAME MAIN FRONT-FACING WALL ONLY.
Ignore every electrical fitting on a left or right side-return wall, even if clearly visible.
One physical plate is one detection. Classify single, double, cooker or switch.
ELECTRICAL CLASSIFICATION RULES:
- A tall portrait faceplate is a COOKER SWITCH unless there is strong visual evidence otherwise.
- Cooker switch faceplate ≈ 85 x 145 mm, therefore clearly taller than wide.
- Double socket ≈ 145 x 85 mm, therefore clearly wider than tall.
- Single socket/switch ≈ 85 x 85 mm, approximately square.
- Do not label a tall portrait cooker switch as a single switch.
- Use the OUTER faceplate proportions, not the inner switch/button arrangement. Ignore internal holes, handles, appliances and
notches. Return normalized centre, width, height, orientation and confidence.

Detection mode: ${String(job.detectionMode || "standard")}
Surveyor guidance: ${String(job.surveyorGuidance || "None")}
${benchmark}

FIELD SCAN RULE:
Return the TRUE number of physical outline corners visible on the main front-facing wall.
Do not force an 8-point benchmark topology.
Do not invent corners and do not remove genuine cabinet-under, extractor or wall-junction transitions.

Return JSON only:
{
  "points": [{"x": 0.0, "y": 0.0}],
  "fittings": [{"x":0.5,"y":0.5,"width":0.08,"height":0.04,"type":"double","orientation":"horizontal","confidence":92}],
  "confidence": 0,
  "message": "short instruction",
  "observations": "short description of boundaries used"
}
`.trim(), "high");

    let points = validatePoints(proposal.points);

    const confidence = Math.max(
      1,
      Math.min(99, Math.round(Number(proposal.confidence) || 40))
    );

    const fittings=normaliseFittings(proposal.fittings);
    res.json({
      points,
      fittings,
      confidence,
      message:
        String(proposal.message || "").trim() ||
        "Outline created. Move any point that is not exactly on the glass edge.",
      observations: String(proposal.observations || "").trim(),
      detection: {
        passes: 1,
        performanceMode: "stable-combined-pass"
      }
    });
  } catch (error) {
    console.error("Outline detection error:", error);
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "The outline could not be detected."
    });
  }
});

app.post("/api/detect-window-wall", async (req, res) => {
  try {
    const { imageDataUrl } = req.body || {};
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "A valid window-wall photograph is required." });
    }
    if (!currentApiKey()) return res.status(503).json({ error: "OPENAI_API_KEY is not configured on the server." });

    const response = await currentClient().responses.create({
      model: currentModel(),
      input: [{ role: "user", content: [
        { type: "input_text", text: `You are SplashCAD Window Wall Alpha 2.3. Detect ONLY the three main wall panels shown by the Advanced Glass benchmark.

SCAN TOPOLOGY — EXACTLY THREE PANELS
1. Left wall panel: from the VISIBLE LEFT WALL/CORNER JUNCTION to the outer left window edge, from its own horizontal top boundary down to the rear worktop line.
2. Panel below window: from the full outer window sill width straight down to the rear worktop line.
3. Right wall panel: mirrored equivalent from outer right window edge to the VISIBLE RIGHT WALL/CORNER JUNCTION.

CRITICAL SIDE LIMIT RULES
- wallLimits are NOT the left and right borders of the photograph.
- Never return leftX=0 or rightX=1 unless the physical wall junction genuinely coincides with the image border.
- Find the visible vertical junction where the back wall turns into the side wall/cabinet boundary.
- The left panel must be a visible four-corner panel fully inside the photograph. Its left control points must never be clipped off-screen.
- The right panel must also remain fully visible inside the photograph.
- Detect the outer boundary X at both the top edge and worktop edge only to preserve the photographed panel outline. These are geometry points, NOT measurement stations.
- Measurement stations are generated separately from detected sockets and other fittings, exactly like SplashCAD Hob Wall.
- Keep at least a small visible margin between every returned control point and the photograph border.
- The two INNER panel edges must use the same outer vertical edges of the window opening that define the perforated WINDOW LEFT and WINDOW RIGHT stations.

Do NOT make the left and right wall panels into thin strips beside the sill. Their top edges sit substantially above the window sill, approximately level with the two electrical faceplates. The long panel below the window is separate.

IGNORE ALL REVEALS AND THE WINDOW SILL. Do not detect, outline or return them. SplashCAD asks about those later and creates optional editable rectangles in the drawing.

Find the four OUTER plaster/window-opening corners in clockwise order: top-left, top-right, bottom-right, bottom-left. The bottom-left and bottom-right corners must sit on the true lower edge of the window opening, not on the frame glass line or an internal sash line. Find the rear worktop/wall junction exactly where the wall meets the worktop, the independent side-panel top height, left/right wall limits, and every electrical faceplate. Ignore the tap, sink, window subdivisions, blinds, handles, scenery, reflections and cabinet doors.

All coordinates must be normalized to the full image, 0..1. Return JSON only:
{
  "outerCorners":[{"x":0.16,"y":0.20},{"x":0.78,"y":0.19},{"x":0.78,"y":0.48},{"x":0.16,"y":0.48}],
  "counterLine":[{"x":0.05,"y":0.6},{"x":0.95,"y":0.6}],
  "wallLimits":{"leftTopX":0.05,"leftBottomX":0.04,"rightTopX":0.94,"rightBottomX":0.95},
  "sideTopY":0.37,
  "fittings":[{"x":0.1,"y":0.48,"width":0.06,"height":0.04,"type":"double","confidence":90}],
  "confidence":90,
  "observations":"short note"
}` },
        { type: "input_image", image_url: imageDataUrl, detail: "high" }
      ] }]
    });
    const raw=String(response.output_text||"").trim().replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"");
    const a=raw.indexOf("{"), b=raw.lastIndexOf("}");
    const data=JSON.parse(a>=0&&b>a?raw.slice(a,b+1):raw);
    const point=p=>({x:clamp01(p?.x),y:clamp01(p?.y)});
    if(!Array.isArray(data.outerCorners)||data.outerCorners.length!==4) throw new Error("AI did not return four outer window corners.");
    if(!Array.isArray(data.counterLine)||data.counterLine.length!==2) throw new Error("AI did not return the worktop line.");
    res.json({
      outerCorners:data.outerCorners.map(point),
      counterLine:data.counterLine.map(point),
      wallLimits:(()=>{const outer=data.outerCorners.map(point),leftJoin=(outer[0].x+outer[3].x)/2,rightJoin=(outer[1].x+outer[2].x)/2,limitLeft=v=>Math.max(.025,Math.min(leftJoin-.035,Number.isFinite(Number(v))?Number(v):.06)),limitRight=v=>Math.min(.975,Math.max(rightJoin+.035,Number.isFinite(Number(v))?Number(v):.94));return{leftTopX:limitLeft(data.wallLimits?.leftTopX??data.wallLimits?.leftX),leftBottomX:limitLeft(data.wallLimits?.leftBottomX??data.wallLimits?.leftX),rightTopX:limitRight(data.wallLimits?.rightTopX??data.wallLimits?.rightX),rightBottomX:limitRight(data.wallLimits?.rightBottomX??data.wallLimits?.rightX)};})(),
      sideTopY:clamp01(data.sideTopY),
      fittings:normaliseFittings(data.fittings),
      confidence:Math.max(1,Math.min(99,Math.round(Number(data.confidence)||50))),
      observations:String(data.observations||"")
    });
  } catch (error) {
    console.error("Window-wall detection error:",error);
    res.status(500).json({error:error instanceof Error?error.message:"Window-wall detection failed."});
  }
});

app.get("/api/version", (_req, res) => res.json({ version: "SPLASHCAD STREAMING VOICE TABLET ALPHA 3.6", build: "tablet-field-v21" }));

app.get("/api/health", (_req, res) => {
  const key = currentApiKey();
  res.json({
    ok: true,
    version: "SPLASHCAD STREAMING VOICE TABLET ALPHA 3.6",
    aiConfigured: key.length > 10
  });
});

app.post("/api/detect-fittings", async (req, res) => {
  try {
    const { imageDataUrl, outline = [] } = req.body || {};
    if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "A valid image is required." });
    }
    if (!currentApiKey()) {
      return res.status(503).json({ error: "OPENAI_API_KEY is not configured on the server." });
    }
    const model = currentModel();
    const prompt = `You are SplashCAD's electrical FACEPLATE detector for glass splashback surveys.

LOCKED CONSTRAINTS
- The supplied glass outline is already approved. NEVER alter, redraw, extend or reinterpret it.
- Detect electrical faceplates only.
- NEVER detect notches. Notches are manual.

DETECTION METHOD — FACEPLATE FIRST
1. Find the OUTER PHYSICAL RECTANGLE of each visible electrical faceplate using its edge, colour/brightness contrast, corners and rectangular geometry.
2. Treat one physical faceplate as ONE detection, even when it contains multiple socket holes, switches, LEDs, labels or fused units.
3. Do not create a box around internal socket/switch components.
4. Reject duplicate or strongly overlapping boxes for the same physical plate.
5. Only AFTER the outer faceplate boundary is established, classify it.
6. Scan the ENTIRE approved splashback independently for every physical faceplate so nearby fittings are not merged.
7. PORTRAIT / VERTICAL faceplates are valid. Never reject a plate because height is greater than width.
8. A tall portrait plate containing a large rocker/switch is a strong COOKER SWITCH candidate.
9. Return a TIGHT bounding rectangle around the OUTER faceplate edges. Do not pad the box.

CLASSIFICATION
- single: one-gang / square-ish electrical faceplate
- double: standard two-gang rectangular socket faceplate
- cooker: cooker/isolation faceplate, INCLUDING portrait/vertical cooker switches, when the OUTER plate and large rocker/switch support that classification; do not classify from nearby appliance context alone
- switch: other switch faceplate

IGNORE cabinet handles, hinges, appliance controls, oven/hob parts, printed labels, reflections, grout, shadows and cabinet seams.
The supplied normalized splashback outline is ${JSON.stringify(outline)}. A faceplate centre should be inside or immediately adjacent to this polygon.

For EVERY detection return the visible OUTER faceplate bounding box normalized to the FULL image:
- x,y = faceplate centre
- width,height = visible outer faceplate width/height
- all values 0..1
Also return orientation and confidence.

Return JSON only:
{"fittings":[{"x":0.5,"y":0.5,"width":0.08,"height":0.04,"type":"double","orientation":"horizontal","confidence":92}],"observations":"short note"}
If none are visible return {"fittings":[],"observations":"..."}.`;

    const response = await currentClient().responses.create({
      model,
      input: [{ role: "user", content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageDataUrl, detail: "high" }
      ] }]
    });
    const raw = String(response.output_text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const a = raw.indexOf("{"); const b = raw.lastIndexOf("}");
    const data = JSON.parse(a >= 0 && b > a ? raw.slice(a,b+1) : raw);
    const allowed = new Set(["single","double","cooker","switch"]);
    let fittings = (Array.isArray(data.fittings) ? data.fittings : []).slice(0, 30).map((f) => ({
      x: clamp01(f.x), y: clamp01(f.y),
      width: Math.max(0.015, Math.min(0.25, Number(f.width) || 0.05)),
      height: Math.max(0.015, Math.min(0.20, Number(f.height) || 0.05)),
      type: allowed.has(String(f.type)) ? String(f.type) : "switch",
      orientation: String(f.orientation).toLowerCase() === "vertical" ? "vertical" : "horizontal",
      confidence: Math.max(1, Math.min(99, Math.round(Number(f.confidence) || 50)))
    })).filter(f => f.confidence >= 55);

    // Alpha 4.6 duplicate suppression:
    // remove repeated boxes for the SAME plate while preserving adjacent real plates.
    const overlap46 = (a,b) => {
      const ax1=a.x-a.width/2, ay1=a.y-a.height/2, ax2=a.x+a.width/2, ay2=a.y+a.height/2;
      const bx1=b.x-b.width/2, by1=b.y-b.height/2, bx2=b.x+b.width/2, by2=b.y+b.height/2;
      const iw=Math.max(0,Math.min(ax2,bx2)-Math.max(ax1,bx1));
      const ih=Math.max(0,Math.min(ay2,by2)-Math.max(ay1,by1));
      const inter=iw*ih;
      const areaA=a.width*a.height, areaB=b.width*b.height;
      const union=areaA+areaB-inter;
      return {
        iou: union>0 ? inter/union : 0,
        containment: inter/Math.max(0.000001,Math.min(areaA,areaB))
      };
    };
    fittings.sort((a,b)=>b.confidence-a.confidence);
    const deduped=[];
    for (const f of fittings) {
      const duplicate = deduped.some((k) => {
        const o=overlap46(f,k);
        const centre=Math.hypot(f.x-k.x,f.y-k.y);
        const minDim=Math.max(0.015,Math.min(f.width,f.height,k.width,k.height));
        return o.iou>0.48 || o.containment>0.82 || centre<minDim*0.24;
      });
      if (!duplicate) deduped.push(f);
    }
    fittings = deduped.slice(0, 20);
    res.json({ fittings, observations: String(data.observations || ""), method: "outer-faceplate-boundary+nms" });
  } catch (error) {
    console.error("Fitting detection error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Fitting detection failed." });
  }
});


if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log("========================================");
    console.log("   SPLASHCAD STREAMING VOICE TABLET ALPHA 3.6");
    console.log("========================================");
    console.log(`Open: http://localhost:${port}`);
    console.log(currentApiKey() ? "AI: CONFIGURED" : "AI: MISSING API KEY");
  });
}

export default app.handle;
