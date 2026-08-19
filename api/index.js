import handler from "../server.js";

export default function recoveryRoute(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const recoveryPath = url.searchParams.get("recoveryPath");
  if (recoveryPath) req.url = `/${recoveryPath}`;
  return handler(req, res);
}
