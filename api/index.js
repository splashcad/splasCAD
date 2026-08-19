import fs from "node:fs";
import path from "node:path";
import handler from "../server.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const RECOVERY_ASSETS = new Set([
  "index.html", "hob.html", "window.html", "splashcad-app.js", "window-wall.js",
  "tablet.js", "voice.js", "styles.css", "manifest.webmanifest", "service-worker.js",
  "splashcad-icon.svg", "benchmark.jpg", "window-benchmark.jpg", "heic-to.js", "heic2any.min.js"
]);

export default function recoveryRoute(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const recoveryPath = url.searchParams.get("recoveryPath");

  if (!recoveryPath) return handler(req, res);
  if (!RECOVERY_ASSETS.has(recoveryPath)) {
    res.statusCode = 404;
    return res.end("Not found");
  }

  const target = path.join(process.cwd(), recoveryPath);
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.statusCode = 404;
    return res.end("Not found");
  }

  res.statusCode = 200;
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Type", MIME[path.extname(target).toLowerCase()] || "application/octet-stream");

  if (path.extname(target).toLowerCase() === ".html") {
    let html = fs.readFileSync(target, "utf8");
    html = html.replaceAll("RECOVERY 029-R005", "RECOVERY 029-R007");
    if (recoveryPath === "index.html" && !html.includes("RECOVERY 029-R007")) {
      html = html.replace("<body>", "<body><div style=\"position:fixed;top:8px;right:8px;z-index:99999;background:#0b2b24;color:#62e6bd;border:1px solid #2f6b5c;border-radius:8px;padding:7px 10px;font:800 12px system-ui\">RECOVERY 029-R007 · ISOLATED</div>");
    }
    return res.end(html);
  }

  return fs.createReadStream(target).pipe(res);
}
