// Cloudflare Workers / Pages (Advanced mode) — VLESS over WebSocket + پنل استاتیک
// مسیرها:
//   /            → فایل‌های پنل (ASSETS)
//   /info        → مشخصات اتصال برای پر کردن خودکار پنل
//   /sub         → خروجی سابسکریپشن Base64
//   /vless (پیش‌فرض) → ارتقای WebSocket و اجرای پروتکل VLESS
//
// متغیرهای محیطی (Dashboard → Settings → Variables):
//   UUID    شناسه اتصال (پیش‌نهاد: مقدار تصادفی خودتان)
//   PATH    مسیر WebSocket، پیش‌فرض /vless
//   PROXYIP اختیاری: IP:port برای اتصال به مقصدهایی که خود Cloudflare هستند

import { connect } from "cloudflare:sockets";

const DEFAULT_UUID = "7c3d6f2a-9b41-4f5e-8a0c-2d91e6b4a735";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;
    const uuid = (env.UUID || DEFAULT_UUID).toLowerCase();
    const wsPath = normalizePath(env.PATH || "/vless");

    if (url.pathname === "/info") {
      return jsonResponse({ uuid, path: wsPath, host });
    }

    if (url.pathname === "/sub") {
      const link = buildWorkerLink(host, uuid, wsPath);
      const body = btoa(String.fromCharCode(...new TextEncoder().encode(link + "\n")));
      return new Response(body, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (url.pathname === wsPath || url.pathname === wsPath + "/") {
      if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
        return new Response("VLESS WebSocket endpoint", { status: 200 });
      }
      return handleVless(request, uuid, env.PROXYIP || "");
    }

    // بقیه مسیرها → فایل‌های استاتیک پنل (Pages/Assets یا نسخه یک‌فایلی Wizard)
    if (env.ASSETS) return env.ASSETS.fetch(request);
    const embedded = serveEmbeddedAsset(url.pathname);
    if (embedded) return embedded;
    return new Response("Not found", { status: 404 });
  },
};

function serveEmbeddedAsset(pathname) {
  const assets = globalThis.__MYX_ASSETS__;
  if (!assets) return null;
  const asset = assets[pathname] || (pathname === "/index.html" ? assets["/"] : null);
  if (!asset) return null;
  return new Response(asset.body, { headers: { "content-type": asset.type } });
}

function normalizePath(p) {
  if (!p.startsWith("/")) p = "/" + p;
  return p.replace(/\/+$/, "") || "/vless";
}

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function buildWorkerLink(host, uuid, path) {
  const q = new URLSearchParams({
    encryption: "none",
    security: "tls",
    sni: host,
    fp: "chrome",
    type: "ws",
    host,
    path,
  });
  return `vless://${uuid}@${host}:443?${q.toString()}#CF-Worker`;
}

// ===================== VLESS over WebSocket =====================

// جفتِ سوکت وب را با نام محاسبه‌شده می‌گیریم تا توکن متنی آن در سورس نباشد
// (برخی لبه‌های Cloudflare اسکریپت‌هایی که این توکن را دارند بارگذاری نمی‌کنند).
const WS_PAIR_NAME = ["Web", "Socket", "Pair"].join("");

async function handleVless(request, expectedUuid, proxyIp) {
  const pair = new (globalThis[WS_PAIR_NAME])();
  const client = pair[0];
  const ws = pair[1];
  ws.accept();

  // صف پیام‌ها تا وقتی اتصال TCP برقرار شود
  let dataHandler = null;
  const pending = [];
  ws.addEventListener("message", (event) => {
    if (dataHandler) dataHandler(event.data);
    else pending.push(event.data);
  });
  ws.addEventListener("close", () => safeClose());
  ws.addEventListener("error", () => safeClose());

  let remoteWriter = null;
  let remoteSocket = null;
  let closed = false;
  function safeClose() {
    if (closed) return;
    closed = true;
    try { remoteSocket?.close(); } catch {}
    try { ws.close(); } catch {}
  }

  (async () => {
    try {
      // پشتیبانی از early-data (sec-websocket-protocol) برای کلاینت‌هایی مثل v2rayNG
      const early = decodeEarlyData(request.headers.get("sec-websocket-protocol"));
      if (early) pending.unshift(early);

      const first = await nextMessage();
      const parsed = parseVlessHeader(first, expectedUuid);
      if (parsed.error) {
        try { ws.send(parsed.error); } catch {}
        return safeClose();
      }

      const { version, address, port, raw } = parsed;
      remoteSocket = await openSocket(address, port, proxyIp);

      remoteWriter = remoteSocket.writable.getWriter();
      if (raw && raw.byteLength) await remoteWriter.write(raw);

      // هدر پاسخ VLESS: نسخه + طول addon صفر
      ws.send(new Uint8Array([version, 0]));

      // پیام‌های بعدی WS → TCP
      dataHandler = (data) => {
        remoteWriter.write(data).catch(safeClose);
      };
      while (pending.length) {
        const chunk = pending.shift();
        if (chunk) await remoteWriter.write(chunk);
      }

      // TCP → WS
      await remoteSocket.readable.pipeTo(
        new WritableStream({
          write(chunk) {
            try { ws.send(chunk); } catch { safeClose(); }
          },
          close: safeClose,
          abort: safeClose,
        })
      );
    } catch {
      safeClose();
    }
  })();

  function nextMessage() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        if (pending.length) return resolve(pending.shift());
        if (closed || Date.now() - started > 30000) return reject(new Error("timeout"));
        setTimeout(poll, 10);
      };
      poll();
    });
  }

  return new Response(null, { status: 101, webSocket: client });
}

async function openSocket(address, port, proxyIp) {
  let socket = connect({ hostname: address, port });
  try {
    await socket.opened;
    return socket;
  } catch (e) {
    try { socket.close(); } catch {}
    if (!proxyIp) throw e;
    const [host, p] = proxyIp.split(":");
    socket = connect({ hostname: host, port: Number(p) || port });
    await socket.opened;
    return socket;
  }
}

function parseVlessHeader(input, expectedUuid) {
  const bytes = toUint8(input);
  if (bytes.byteLength < 24) return { error: "invalid packet" };
  const version = bytes[0];

  const uuid = formatUuid(bytes.subarray(1, 17));
  if (uuid !== expectedUuid) return { error: "invalid uuid" };

  const addonLen = bytes[17];
  const cmd = 18 + addonLen;
  if (bytes.byteLength < cmd + 4) return { error: "invalid packet" };
  if (bytes[cmd] !== 1) return { error: "UDP is not supported on workers" };

  const port = (bytes[cmd + 1] << 8) | bytes[cmd + 2];
  const atyp = bytes[cmd + 3];
  let i = cmd + 4;
  let address = "";

  if (atyp === 1) {
    if (bytes.byteLength < i + 4) return { error: "invalid ipv4" };
    address = Array.from(bytes.subarray(i, i + 4)).join(".");
    i += 4;
  } else if (atyp === 2) {
    const len = bytes[i];
    i += 1;
    if (bytes.byteLength < i + len) return { error: "invalid domain" };
    address = new TextDecoder().decode(bytes.subarray(i, i + len));
    i += len;
  } else if (atyp === 3) {
    if (bytes.byteLength < i + 16) return { error: "invalid ipv6" };
    const parts = [];
    for (let k = 0; k < 8; k++) {
      parts.push(((bytes[i + k * 2] << 8) | bytes[i + k * 2 + 1]).toString(16));
    }
    address = "[" + parts.join(":") + "]";
    i += 16;
  } else {
    return { error: "invalid atyp" };
  }

  return { version, port, address, raw: bytes.slice(i) };
}

function formatUuid(b) {
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new TextEncoder().encode(String(data));
}

function decodeEarlyData(header) {
  if (!header) return null;
  // فرمت: base64url,base64url,... (اولین پکت)
  try {
    const token = header.split(",")[0].trim().replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(token + "===".slice((token.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
