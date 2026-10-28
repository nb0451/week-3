// ---------------------------------------------------------------------------
//  LOCAL DEV SERVER
// ---------------------------------------------------------------------------
//  Runs the whole site on your own machine so you can see it before you
//  deploy. It serves the static files and routes /api/chat to the function,
//  which is exactly what Vercel does.
//
//    node dev.js            then open http://localhost:3000
//
//  To use a real key locally, put it in .env.local and run:
//    node --env-file=.env.local dev.js
// ---------------------------------------------------------------------------

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/chat.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // --- the function -------------------------------------------------------
  if (url.pathname === "/api/chat") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    const request = new Request(url.href, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });

    try {
      const out = await handler.fetch(request);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err.stack || err.message) }));
    }
    return;
  }

  // --- static files -------------------------------------------------------
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  // match Vercel's cleanUrls: /eval serves eval.html
  if (!path.extname(rel) && fs.existsSync(path.join(ROOT, rel + ".html"))) {
    rel += ".html";
  }
  const filePath = path.join(ROOT, rel);

  // refuse to serve anything outside the project, or any secret
  if (!filePath.startsWith(ROOT) || /(^|[\\/])\.env/.test(rel)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end(`Not found: ${rel}`);
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT}`);
  console.log(`open http://localhost:${PORT}`);
  console.log(
    process.env.GROQ_API_KEY
      ? "GROQ_API_KEY is set, answers come from the model"
      : "GROQ_API_KEY is not set, running in demo mode"
  );
});
