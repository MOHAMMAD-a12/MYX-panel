// ===== پنل ساخت کانفیگ Xray — کاملاً سمت کلاینت، مناسب Netlify =====

const $ = (id) => document.getElementById(id);

const fields = [
  "protocol", "remark", "address", "port", "uuid", "encryption", "flow",
  "network", "security", "sni", "alpn", "fingerprint", "allowInsecure",
  "pbk", "sid", "spx", "dest", "host", "path", "serviceName", "mux",
];

// قالب‌های آماده — با یک کلیک همه تنظیمات فنی پر می‌شود
const PRESETS = {
  "vless-reality": {
    protocol: "vless", network: "tcp", security: "reality",
    flow: "xtls-rprx-vision", encryption: "none", fingerprint: "chrome",
    port: "443", path: "/", spx: "/", alpn: "", mux: "off",
  },
  "vless-ws-tls": {
    protocol: "vless", network: "ws", security: "tls",
    flow: "", encryption: "none", fingerprint: "chrome",
    port: "443", path: "/", alpn: "h2,http/1.1", mux: "off",
  },
  "trojan-ws-tls": {
    protocol: "trojan", network: "ws", security: "tls",
    flow: "", fingerprint: "chrome",
    port: "443", path: "/", alpn: "h2,http/1.1", mux: "off",
  },
  "vmess-ws-tls": {
    protocol: "vmess", network: "ws", security: "tls",
    flow: "", fingerprint: "chrome",
    port: "443", path: "/", alpn: "h2,http/1.1", mux: "off",
  },
};

function readForm() {
  const v = {};
  for (const f of fields) v[f] = $(f).value.trim();
  v.port = parseInt(v.port || "443", 10);
  return v;
}

function setField(id, value) {
  if ($(id) && value !== undefined) $(id).value = value;
}

function randomUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

function isUUID(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

// ============ ساخت streamSettings ============
function buildStreamSettings(v) {
  const ss = { network: v.network };

  if (v.security === "tls") {
    ss.security = "tls";
    const tls = {};
    if (v.sni) tls.serverName = v.sni;
    if (v.alpn) tls.alpn = v.alpn.split(",");
    if (v.fingerprint) tls.fingerprint = v.fingerprint;
    if (v.allowInsecure === "true") tls.allowInsecure = true;
    ss.tlsSettings = tls;
  } else if (v.security === "reality") {
    ss.security = "reality";
    const r = { fingerprint: v.fingerprint || "chrome" };
    if (v.sni) r.serverName = v.sni;
    if (v.pbk) r.publicKey = v.pbk;
    if (v.sid) r.shortId = v.sid;
    if (v.spx) r.spiderX = v.spx;
    ss.realitySettings = r;
  }

  if (v.network === "ws" || v.network === "httpupgrade") {
    const w = {};
    if (v.path) w.path = v.path;
    if (v.host) w.headers = { Host: v.host };
    ss[v.network === "ws" ? "wsSettings" : "httpupgradeSettings"] = w;
  } else if (v.network === "grpc") {
    ss.grpcSettings = { serviceName: v.serviceName || "", multiMode: false };
  } else if (v.network === "tcp" && (v.host || (v.path && v.path !== "/"))) {
    ss.tcpSettings = {
      header: {
        type: "http",
        request: {
          path: [v.path || "/"],
          headers: v.host ? { Host: [v.host] } : {},
        },
      },
    };
  }

  return ss;
}

function canUseFlow(v) {
  return v.protocol === "vless" && v.network === "tcp" && (v.security === "tls" || v.security === "reality");
}

// ============ ساخت JSON کامل کلاینت Xray ============
function buildXrayJson(v) {
  const user = { id: v.uuid, level: 0 };
  if (v.protocol === "vless") {
    user.encryption = v.encryption || "none";
    if (v.flow && canUseFlow(v)) user.flow = v.flow;
  }

  const outbound = {
    protocol: v.protocol,
    settings: { vnext: [{ address: v.address, port: v.port, users: [user] }] },
    streamSettings: buildStreamSettings(v),
  };
  if (v.mux === "on") outbound.mux = { enabled: true, concurrency: 8 };

  return {
    log: { loglevel: "warning" },
    inbounds: [
      {
        tag: "socks-in", port: 10808, listen: "127.0.0.1", protocol: "socks",
        settings: { udp: true },
        sniffing: { enabled: true, destOverride: ["http", "tls"] },
      },
      {
        tag: "http-in", port: 10809, listen: "127.0.0.1", protocol: "http",
        sniffing: { enabled: true, destOverride: ["http", "tls"] },
      },
    ],
    outbounds: [
      outbound,
      { protocol: "freedom", tag: "direct" },
      { protocol: "blackhole", tag: "block" },
    ],
    routing: {
      domainStrategy: "IPIfNonMatch",
      rules: [
        { type: "field", ip: ["geoip:private"], outboundTag: "direct" },
        { type: "field", domain: ["geosite:private"], outboundTag: "direct" },
      ],
    },
  };
}

// ============ لینک اشتراک ============
function buildShareLink(v) {
  const remark = encodeURIComponent(v.remark || "config");
  const p = new URLSearchParams();

  if (v.protocol === "vless") {
    p.set("encryption", v.encryption || "none");
    if (canUseFlow(v) && v.flow) p.set("flow", v.flow);
  }

  if (v.security !== "none") {
    p.set("security", v.security);
    if (v.sni) p.set("sni", v.sni);
    if (v.fingerprint) p.set("fp", v.fingerprint);
    if (v.security === "tls") {
      if (v.alpn) p.set("alpn", v.alpn);
      if (v.allowInsecure === "true") p.set("allowInsecure", "1");
    }
    if (v.security === "reality") {
      if (v.pbk) p.set("pbk", v.pbk);
      if (v.sid) p.set("sid", v.sid);
      if (v.spx) p.set("spx", v.spx);
    }
  }

  p.set("type", v.network);
  if (v.network === "ws" || v.network === "httpupgrade") {
    if (v.host) p.set("host", v.host);
    if (v.path) p.set("path", v.path);
  } else if (v.network === "grpc" && v.serviceName) {
    p.set("serviceName", v.serviceName);
  }

  const auth = v.protocol === "trojan" ? encodeURIComponent(v.uuid) : v.uuid;
  return `${v.protocol}://${auth}@${v.address}:${v.port}?${p.toString()}#${remark}`;
}

function buildVmessLink(v) {
  const tlsEnabled = v.security === "tls";
  const obj = {
    v: "2",
    ps: v.remark || "config",
    add: v.address,
    port: String(v.port),
    id: v.uuid,
    aid: "0",
    scy: "auto",
    net: v.network,
    type: "none",
    host: v.network === "ws" || v.network === "httpupgrade" ? (v.host || "") : "",
    path: v.network === "ws" || v.network === "httpupgrade" ? (v.path || "") : (v.network === "grpc" ? (v.serviceName || "") : ""),
    tls: tlsEnabled ? "tls" : "",
    sni: tlsEnabled ? (v.sni || "") : "",
    alpn: tlsEnabled ? (v.alpn || "") : "",
    fp: tlsEnabled ? (v.fingerprint || "") : "",
  };
  return `vmess://${b64EncodeUtf8(JSON.stringify(obj))}`;
}

// ============ Base64 سازگار با یونیکد ============
function b64EncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64DecodeUtf8(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ============ اعتبارسنجی ============
function validate(v) {
  const errs = [];
  if (!v.address) errs.push("آدرس سرور");
  if (!v.port || v.port < 1 || v.port > 65535) errs.push("پورت معتبر (۱ تا ۶۵۵۳۵)");
  if (!v.uuid) {
    errs.push(v.protocol === "trojan" ? "رمز (Password)" : "UUID");
  } else if (v.protocol !== "trojan" && !isUUID(v.uuid)) {
    errs.push("UUID معتبر (با دکمه 🎲 بسازید)");
  }
  if (v.security === "reality") {
    if (!v.pbk) errs.push("Public Key (pbk) برای Reality");
    if (!v.sni) errs.push("SNI برای Reality");
  }
  if (v.network === "ws" && !v.host) errs.push("Host برای WebSocket (در تنظیمات پیشرفته)");
  return errs;
}

// ============ QR ============
function updateQR(text) {
  const el = $("qr");
  el.innerHTML = "";
  if (!text) {
    el.innerHTML = '<div class="qr-empty">کانفیگ کامل شود، QR اینجا نمایش داده می‌شود</div>';
    return;
  }
  if (!window.QRCode) {
    el.innerHTML = '<div class="qr-empty">برای نمایش QR به اینترنت نیاز است؛ لینک را کپی کنید.</div>';
    return;
  }
  new QRCode(el, {
    text,
    width: 190,
    height: 190,
    colorDark: "#0b0e1a",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });
}

// ============ رندر اصلی ============
function render() {
  const v = readForm();

  // نمایش/پنهان‌سازی فیلدها بر اساس انتخاب‌ها
  $("encryptionWrap").style.display = v.protocol === "vless" ? "" : "none";
  $("flowWrap").style.display = v.protocol === "vless" ? "" : "none";
  $("idLabel").innerHTML = v.protocol === "trojan" ? 'رمز (Password) <b class="req">*</b>' : 'UUID <b class="req">*</b>';

  const isReality = v.security === "reality";
  $("tlsBlock").hidden = v.security === "none";
  $("tlsTitle").textContent = isReality ? "تنظیمات REALITY" : "تنظیمات TLS";
  $("realityFields").hidden = !isReality;

  const wsLike = ["ws", "httpupgrade", "tcp"].includes(v.network);
  document.querySelectorAll(".wsField").forEach((el) => (el.hidden = !wsLike));
  document.querySelectorAll(".grpcField").forEach((el) => (el.hidden = v.network !== "grpc"));

  // هایلایت قالب فعال؛ اگر اطلاعات همان ورکر باشد، کارت نارنجی Cloudflare انتخاب می‌شود
  const activeKey = detectPreset(v);
  const isWorker = !!workerInfo && v.protocol === "vless" && v.network === "ws" &&
    v.address === workerInfo.host && v.host === workerInfo.host && v.path === workerInfo.path;
  document.querySelectorAll(".preset").forEach((b) => {
    b.classList.toggle("active", !!activeKey && !isWorker && b.dataset.preset === activeKey);
  });
  $("workerPreset").classList.toggle("active", isWorker);

  // اعتبارسنجی + وضعیت
  const errs = validate(v);
  const status = $("status");
  if (errs.length) {
    status.className = "status warn";
    status.textContent = "⚠️ برای ساخت کانفیگ این موارد را کامل کنید: " + errs.join("، ");
    $("jsonOut").textContent = "";
    $("linkOut").textContent = "";
    $("subOut").textContent = "";
    updateQR("");
    return;
  }
  status.className = "status ok";
  status.textContent = "✅ کانفیگ آماده است — QR را اسکن کنید یا لینک را کپی کنید.";

  $("jsonOut").textContent = JSON.stringify(buildXrayJson(v), null, 2);
  const link = v.protocol === "vmess" ? buildVmessLink(v) : buildShareLink(v);
  $("linkOut").textContent = link;
  $("subOut").textContent = b64EncodeUtf8(link);
  updateQR(link);
}

function detectPreset(v) {
  for (const [key, p] of Object.entries(PRESETS)) {
    if (v.protocol === p.protocol && v.network === p.network && v.security === p.security) return key;
  }
  return null;
}

// ============ وارد کردن لینک موجود ============
function importLink() {
  const msg = $("importMsg");
  const raw = $("importLink").value.trim();
  msg.className = "hint";
  try {
    if (raw.startsWith("vmess://")) {
      const obj = JSON.parse(b64DecodeUtf8(raw.slice(8)));
      setField("protocol", "vmess");
      setField("address", obj.add || "");
      setField("port", obj.port || "443");
      setField("uuid", obj.id || "");
      setField("remark", obj.ps || "MyServer");
      setField("network", obj.net || "tcp");
      setField("security", obj.tls ? "tls" : "none");
      setField("host", obj.host || "");
      setField("path", obj.path || "/");
      setField("sni", obj.sni || "");
      setField("alpn", obj.alpn || "");
      if (obj.fp) setField("fingerprint", obj.fp);
      setField("serviceName", obj.net === "grpc" ? (obj.path || "") : "");
    } else if (raw.startsWith("vless://") || raw.startsWith("trojan://")) {
      const u = new URL(raw);
      setField("protocol", u.protocol.replace(":", ""));
      setField("uuid", decodeURIComponent(u.username));
      setField("address", u.hostname);
      setField("port", u.port || "443");
      setField("remark", decodeURIComponent(u.hash.slice(1)) || "MyServer");
      const q = u.searchParams;
      setField("network", q.get("type") || "tcp");
      setField("security", q.get("security") || "none");
      setField("sni", q.get("sni") || "");
      setField("host", q.get("host") || "");
      setField("path", q.get("path") || "/");
      setField("serviceName", q.get("serviceName") || "");
      setField("encryption", q.get("encryption") || "none");
      setField("flow", q.get("flow") || "");
      setField("pbk", q.get("pbk") || "");
      setField("sid", q.get("sid") || "");
      setField("spx", q.get("spx") || "/");
      setField("alpn", q.get("alpn") || "");
      if (q.get("fp")) setField("fingerprint", q.get("fp"));
      setField("allowInsecure", q.get("allowInsecure") === "1" ? "true" : "false");
    } else {
      throw new Error("bad protocol");
    }
    msg.textContent = "✔ لینک با موفقیت وارد شد؛ فرم به‌روزرسانی شد.";
    msg.classList.add("ok");
    $("advanced").open = true;
  } catch {
    msg.textContent = "✖ لینک معتبر نیست. فقط لینک‌های vless:// vmess:// trojan:// پشتیبانی می‌شود.";
    msg.classList.add("err");
  }
  render();
}

// ============ ابزارها ============
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 1800);
}

async function copyText(text, msg) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(msg);
}

function download(filename, content) {
  if (!content) return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ============ تشخیص و اتصال خودکار به Cloudflare Worker ============
let workerInfo = null;

async function detectWorker() {
  try {
    const res = await fetch("/info", { headers: { accept: "application/json" } });
    if (!res.ok) return;
    const info = await res.json();
    if (!info.uuid || !info.path || !info.host) return;
    workerInfo = info;
    $("workerPresetDesc").textContent = `متصل به ${info.host} — کانفیگ واقعاً وصل، بدون VPS`;
    applyWorkerConfig();
  } catch {
    // روی Netlify یا اجرای محلی: فقط تولید کانفیگ دستی
  }
}

function applyWorkerConfig() {
  const host = workerInfo?.host || location.hostname;
  if (!workerInfo && (!host || ["localhost", "127.0.0.1"].includes(host))) {
    toast("اول پروژه را روی Cloudflare اجرا کنید");
    return;
  }
  const info = workerInfo || { host, path: "/vless" };
  setField("protocol", "vless");
  setField("network", "ws");
  setField("security", "tls");
  setField("flow", "");
  setField("encryption", "none");
  setField("fingerprint", "chrome");
  setField("alpn", "h2,http/1.1");
  setField("port", "443");
  setField("address", info.host);
  setField("host", info.host);
  setField("sni", info.host);
  setField("path", info.path);
  setField("remark", "CF-Worker");
  if (info.uuid) setField("uuid", info.uuid);
  render();
  toast("کانفیگ همین ورکر ساخته شد ☁️✔");
}

$("workerPreset").addEventListener("click", applyWorkerConfig);

// ============ رویدادها ============
fields.forEach((f) => $(f).addEventListener("input", render));

document.querySelectorAll(".preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    const p = PRESETS[btn.dataset.preset];
    // مقادیر مخصوص قالب را اعمال می‌کنیم؛ Houst و SNI اگر خالی باشند با آدرس پر می‌شوند
    for (const [k, val] of Object.entries(p)) setField(k, val);
    if (p.security === "tls" && !$("sni").value && $("host").value) setField("sni", $("host").value);
    render();
    toast("قالب اعمال شد ✔");
  });
});

$("genUuid").addEventListener("click", () => {
  setField("uuid", randomUUID());
  render();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $("tab-" + tab.dataset.tab).classList.add("active");
  });
});

$("copyJson").addEventListener("click", () => copyText($("jsonOut").textContent, "JSON کپی شد ✔"));
$("copyLink").addEventListener("click", () => copyText($("linkOut").textContent, "لینک کپی شد ✔"));
$("copySub").addEventListener("click", () => copyText($("subOut").textContent, "Base64 کپی شد ✔"));
$("dlJson").addEventListener("click", () => download("config.json", $("jsonOut").textContent));
$("dlSub").addEventListener("click", () => download("sub.txt", $("subOut").textContent));
$("doImport").addEventListener("click", importLink);
$("importLink").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); importLink(); } });

// کتابخانه QR مسیر defer دارد؛ بعد از لود یک‌بار رندر مجدد
window.addEventListener("load", render);

// مقدار اولیه: قالب پیشنهادی + UUID تصادفی
setField("uuid", randomUUID());
for (const [k, val] of Object.entries(PRESETS["vless-reality"])) setField(k, val);
render();
detectWorker();
