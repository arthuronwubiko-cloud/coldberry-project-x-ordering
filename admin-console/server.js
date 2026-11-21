// Standalone server for hosting the Coldberry Ice Cream Order Verification Console separately.
// Runs on its own origin/port (default: http://localhost:4000) and proxies /api/* calls
// to the main ordering backend (default: https://coldberry-project-x.vercel.app).

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const CONSOLE_PORT = Number(process.env.ADMIN_PORT || 4000);
const API_ORIGIN = (
  process.env.API_ORIGIN ||
  (process.env.VERCEL ? "https://coldberry-project-x.vercel.app" : "http://localhost:3000")
).replace(/\/+$/, "");
const CONSOLE_DIR = __dirname;
const { createLoadBalancerPool, parseOriginsFromEnv } = require("../api/load-balancer");
const upstreamPool = createLoadBalancerPool(parseOriginsFromEnv(API_ORIGIN), {
  name: "admin-console-upstream",
  strategy: process.env.LB_STRATEGY || "least-connections",
});

function requestHandler(req, res) {
  const parsed = url.parse(req.url, false);
  const pathname = parsed.pathname || "/";

  // Proxy /api/* to main storefront API origin via load balancer pool
  if (pathname.startsWith("/api/")) {
    const node = upstreamPool.acquireNode();
    const selectedOrigin = node ? node.url : API_ORIGIN;
    const expectedOrigin = new URL(selectedOrigin).origin;
    const targetUrl = new URL(pathname + (parsed.search || ""), selectedOrigin);
    if (targetUrl.origin !== expectedOrigin) {
      if (node) upstreamPool.releaseNode(node, { success: false });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid proxy target." }));
      return;
    }
    const proxyModule = targetUrl.protocol === "https:" ? require("https") : http;
    const startMs = Date.now();

    const proxyReq = proxyModule.request(
      targetUrl,
      {
        method: req.method,
        headers: {
          ...req.headers,
          host: targetUrl.host,
        },
      },
      (proxyRes) => {
        if (node) {
          upstreamPool.releaseNode(node, {
            success: (proxyRes.statusCode || 502) < 500,
            latencyMs: Date.now() - startMs,
          });
        }
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", (err) => {
      if (node) upstreamPool.releaseNode(node, { success: false, latencyMs: Date.now() - startMs });
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `Main API server unreachable at ${selectedOrigin}. Ensure the main ordering site is running.`,
          details: err.message,
        })
      );
    });

    req.pipe(proxyReq);
    return;
  }

  // Serve standalone console UI strictly
  if (pathname === "/" || pathname === "/index.html" || pathname === "/admin.html") {
    const indexPath = path.join(CONSOLE_DIR, "index.html");
    fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Console UI unavailable.");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
      });
      res.end(content);
    });
    return;
  }

  if (pathname.startsWith("/images/")) {
    const imgFile = path.basename(pathname);
    const localImg = path.join(CONSOLE_DIR, "images", imgFile);
    const rootImg = path.join(CONSOLE_DIR, "..", "images", imgFile);
    const targetImg = fs.existsSync(localImg) ? localImg : rootImg;
    fs.readFile(targetImg, (err, content) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      const ext = path.extname(imgFile).toLowerCase();
      const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "public, max-age=86400" });
      res.end(content);
    });
    return;
  }

  const extra = { "/feedback": "feedback.html", "/customer-feedback": "feedback.html", "/refunds": "refunds.html", "/refund-tokens": "refunds.html" };
  const extraKey = pathname.replace(/\.html$/, "");
  if (extra[extraKey] || extra["/" + extraKey.replace(/^\//, "")]) {
    const file = extra[extraKey] || extra["/" + extraKey.replace(/^\//, "")];
    fs.readFile(path.join(CONSOLE_DIR, file), (err, content) => {
      if (err) { res.writeHead(500, { "Content-Type": "text/plain" }); res.end("Page unavailable."); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
      res.end(content);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("404 Not Found");
}

if (require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(CONSOLE_PORT, () => {
    console.log(`Coldberry Ice Cream Verification Console running separately at http://localhost:${CONSOLE_PORT}`);
    console.log(`Proxying API calls to: ${API_ORIGIN}`);
  });
}

// Default export MUST be a function for Vercel Serverless Functions
module.exports = function handler(req, res) {
  return requestHandler(req, res);
};
