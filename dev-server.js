// Local development server for Romeo's Pizza Nigeria
// Serves static assets and runs Vercel serverless functions (/api/orders, /api/admin)

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

// Credentials (SUPABASE_URL, SUPABASE_KEY, DATABASE_URL, ADMIN_SECRET) come from the
// environment only, e.g. `SUPABASE_URL=... SUPABASE_KEY=... npm start`. Never hard-code them.

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

// Load .env.local automatically for local server runs if present
try {
  const envLocalPath = path.join(ROOT_DIR, ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
} catch (_) {}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Route API requests
  if (pathname.startsWith("/api/")) {
    const MAX_API_BODY = 48 * 1024; // 48KB max streaming body fail-safe
    let body = "";
    let bodyBytes = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) return;
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_API_BODY) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large." }));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", async () => {
      if (aborted) return;
      // Vercel-compatible mock request / response
      const vReq = {
        method: req.method,
        headers: req.headers,
        query: parsedUrl.query,
        body: body ? (() => {
          try { return JSON.parse(body); } catch { return body; }
        })() : {},
      };

      const vRes = {
        statusCode: 200,
        setHeader: (name, val) => res.setHeader(name, val),
        status: function (code) {
          this.statusCode = code;
          return this;
        },
        json: function (data) {
          res.writeHead(this.statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        },
        send: function (text) {
          res.writeHead(this.statusCode, { "Content-Type": "text/plain" });
          res.end(text);
        },
      };

      try {
        if (pathname === "/api/orders") {
          const handler = require("./api/orders.js");
          await handler(vReq, vRes);
        } else if (pathname === "/api/admin") {
          const handler = require("./api/admin.js");
          await handler(vReq, vRes);
        } else if (pathname === "/api/track") {
          const handler = require("./api/track.js");
          await handler(vReq, vRes);
        } else if (pathname === "/api/feedback") {
          const handler = require("./api/feedback.js");
          await handler(vReq, vRes);
        } else if (pathname === "/api/auth") {
          const handler = require("./api/auth.js");
          await handler(vReq, vRes);
        } else if (pathname === "/api/load-balancer") {
          const handler = require("./api/load-balancer.js");
          await handler(vReq, vRes);
        } else if (pathname === "/api/redis") {
          const handler = require("./api/redis.js");
          await handler(vReq, vRes);
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Endpoint not found" }));
        }
      } catch (err) {
        console.error("API error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error." }));
      }
    });
    return;
  }

  // Route static files
  // Route static files & clean URLs
  const cleanUrlMap = {
    "/": "/index.html",
    "": "/index.html",
    "/admin": "/admin.html",
    "/admin-console": "/admin.html",
    "/manager": "/manager.html",
    "/manager-console": "/manager.html",
    "/staff": "/staff.html",
    "/staff-console": "/staff.html",
    "/driver": "/driver.html",
    "/driver-console": "/driver.html",
    "/feedback": "/feedback.html",
    "/customer-feedback": "/feedback.html",
    "/refunds": "/refunds.html",
    "/refund-tokens": "/refunds.html",
    "/login": "/login.html",
    "/order": "/order.html",
    "/track": "/track.html",
    "/menu": "/890b.html",
    "/deals": "/pizzadeals.html",
  };
  if (cleanUrlMap[pathname]) {
    pathname = cleanUrlMap[pathname];
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("400 Bad Request");
    return;
  }
  const filePath = path.resolve(ROOT_DIR, "." + decodedPath);

  // Block path traversal outside the project and hidden/server-only files
  // (.git, .env, api/, scripts/, node_modules/, package files).
  const relative = path.relative(ROOT_DIR, filePath);
  const blocked =
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    relative.split(path.sep).some((part) => part.startsWith(".")) ||
    /^(api|scripts|node_modules|migrations)(\/|\\|$)/.test(relative) ||
    /^(package(-lock)?\.json|dev-server\.js|vercel\.json)$/.test(relative);
  if (blocked) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const mtime = stats.mtime.toUTCString();
    if (req.headers["if-modified-since"] === mtime) {
      res.writeHead(304);
      res.end();
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const isAsset = /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff|woff2|ttf)$/i.test(filePath);

    res.setHeader("Last-Modified", mtime);
    res.setHeader(
      "Cache-Control",
      isAsset
        ? "public, max-age=86400, stale-while-revalidate=604800"
        : "public, max-age=60, stale-while-revalidate=300"
    );

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

const cluster = require("cluster");
const os = require("os");

const CLUSTER_WORKERS = Number(process.env.CLUSTER_WORKERS || 1);

if (require.main === module) {
  if (CLUSTER_WORKERS > 1 && cluster.isPrimary) {
    const workerCount = Math.min(CLUSTER_WORKERS, os.cpus().length || 4);
    console.log(`[LoadBalancer] Primary PID ${process.pid} starting ${workerCount} load-balanced workers on port ${PORT}...`);
    for (let i = 0; i < workerCount; i++) {
      cluster.fork();
    }
    cluster.on("exit", (worker) => {
      console.warn(`[LoadBalancer] Worker ${worker.process.pid} exited — spawning replacement worker...`);
      cluster.fork();
    });
  } else {
    server.listen(PORT, () => {
      console.log(`Romeo's Pizza Server (PID ${process.pid}) running at http://localhost:${PORT}`);
      console.log(`- Order page: http://localhost:${PORT}/order.html`);
      console.log(`- Menu: http://localhost:${PORT}/890b.html`);
      console.log(`- Deals: http://localhost:${PORT}/pizzadeals.html`);
      console.log(`- Database: ${require("./api/db").isConfigured() ? "configured" : "not configured (orders not stored)"}`);
    });
  }
}

module.exports = server;
