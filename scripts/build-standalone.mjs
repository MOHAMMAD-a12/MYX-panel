// ساخت نسخه تک‌فایلی MYX panel برای Deploy خودکار در Cloudflare Workers
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const outputDir = path.join(root, ".build");

const [html, css, app, originalWorker] = await Promise.all(
  ["index.html", "style.css", "app.js", "_worker.js"].map((file) =>
    readFile(path.join(publicDir, file), "utf8")
  )
);

const uuid = process.env.MYX_UUID || "7c3d6f2a-9b41-4f5e-8a0c-2d91e6b4a735";
const worker = originalWorker.replace(
  /const DEFAULT_UUID = "[^"]+";/,
  `const DEFAULT_UUID = "${uuid}";`
);

// اطلاعات اتصال در همان Worker می‌مانند؛ هیچ وابستگی Assets برای نصب لازم نیست.
const assets = {
  "/": { body: html, type: "text/html; charset=utf-8" },
  "/style.css": { body: css, type: "text/css; charset=utf-8" },
  "/app.js": { body: app, type: "application/javascript; charset=utf-8" },
};

const bundle = `globalThis.__MYX_ASSETS__ = ${JSON.stringify(assets)};\n${worker}`;
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "myx-panel.js"), bundle, "utf8");
console.log(`Built .build/myx-panel.js (${Buffer.byteLength(bundle)} bytes)`);
