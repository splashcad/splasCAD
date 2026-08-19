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
  return fs.createReadStream(target).pipe(res);
}
