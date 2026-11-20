// MYX Deploy Relay — تنها وظیفه: ساخت خودکار پنل با توکن کاربر
// هیچ توکنی ذخیره یا لاگ نمی‌شود؛ فقط به API رسمی Cloudflare ارسال می‌شود.
const API = "https://api.cloudflare.com/client/v4";
const REPO = "MOHAMMAD-a12/MYX-panel";
const PANEL_SOURCES = [
  `https://raw.githubusercontent.com/${REPO}/main/dist/myx-panel.js`,
  `https://cdn.jsdelivr.net/gh/${REPO}@main/dist/myx-panel.js`,
];

// کش کوتاه در حافظهٔ ایزوله تا هر درخواست دوباره از GitHub نخواند
let cachedSource = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

const DEFAULT_ORIGINS = [
  "https://mohammad-a12.github.io",
  "http://localhost:8792",
  "http://127.0.0.1:8792",
];

class UserError extends Error {}

async function loadPanelSource() {
  if (cachedSource && Date.now() - cachedAt < CACHE_MS) return cachedSource;
  for (const url of PANEL_SOURCES) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "myx-deploy-relay" } });
      if (!response.ok) continue;
      const text = await response.text();
      if (text.length > 1000 && text.includes("__MYX_ASSETS__") && text.includes("cloudflare:sockets")) {
        cachedSource = text;
        cachedAt = Date.now();
        return text;
      }
    } catch {}
  }
  throw new UserError("منبع پنل در دسترس نیست. چند لحظه بعد دوباره تلاش کنید.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","))
      .split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0],
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
      vary: "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/health") {
      return json({ ok: true, service: "myx-relay-live" }, 200, cors);
    }

    if (url.pathname !== "/deploy" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, cors);
    }

    if (origin && !allowed.includes(origin)) {
      return json({ error: "این دامنه اجازه استفاده از رله را ندارد." }, 403, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "درخواست نامعتبر است." }, 400, cors);
    }

    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const workerName = String(body?.workerName || "").trim().toLowerCase();
    const target = body?.target === "pages" ? "pages" : "worker";

    if (token.length < 20 || token.length > 200) {
      return json({ error: "توکن Cloudflare معتبر نیست." }, 400, cors);
    }
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(workerName)) {
      return json({ error: "نام باید با حروف کوچک انگلیسی، عدد یا خط تیره باشد." }, 400, cors);
    }

    try {
      const result = await deploy({ token, workerName, target });
      return json(result, 200, cors);
    } catch (error) {
      const message = error instanceof UserError
        ? error.message
        : "خطا در ارتباط با Cloudflare. دوباره تلاش کنید.";
      return json({ error: message }, 400, cors);
    }
  },
};

async function deploy({ token, workerName, target }) {
  const accounts = await cf(token, "/accounts");
  if (!Array.isArray(accounts) || !accounts.length) {
    throw new UserError("هیچ اکانتی با این توکن پیدا نشد. توکن را با دسترسی Account Settings Read بسازید.");
  }
  const accountId = accounts[0].id;
  const uuid = crypto.randomUUID();

  if (target === "pages") return deployPages({ token, accountId, workerName, uuid });
  return deployWorker({ token, accountId, workerName, uuid });
}

// ---- حالت Worker (workers.dev) ----
async function deployWorker({ token, accountId, workerName, uuid }) {
  let subdomain = await cf(token, `/accounts/${accountId}/workers/subdomain`)
    .then((r) => r?.subdomain || "")
    .catch(() => "");

  if (!subdomain) {
    subdomain = `myx-${randomId(6)}`;
    const created = await cf(token, `/accounts/${accountId}/workers/subdomain`, {
      method: "PUT",
      body: JSON.stringify({ subdomain }),
    });
    subdomain = created?.subdomain || subdomain;
  }

  const metadata = {
    main_module: "myx-panel.js",
    compatibility_date: "2025-06-01",
    bindings: [{ type: "plain_text", name: "UUID", text: uuid }],
  };

  const workerSource = await loadPanelSource();
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append(
    "myx-panel.js",
    new Blob([workerSource], { type: "application/javascript+module" }),
    "myx-panel.js"
  );

  await cf(token, `/accounts/${accountId}/workers/scripts/${workerName}`, {
    method: "PUT",
    body: form,
  });

  await cf(token, `/accounts/${accountId}/workers/scripts/${workerName}/subdomain`, {
    method: "POST",
    body: JSON.stringify({ enabled: true }),
  }).catch(() => {});

  const panelUrl = `https://${workerName}.${subdomain}.workers.dev`;
  return {
    panelUrl,
    subUrl: panelUrl + "/sub",
    infoUrl: panelUrl + "/info",
    workerName,
    target: "worker",
    uuid,
  };
}

// ---- حالت Pages (pages.dev) ----
async function deployPages({ token, accountId, workerName, uuid }) {
  // ساخت پروژه در صورت نبود
  const created = await fetch(`${API}/accounts/${accountId}/pages/projects`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name: workerName,
      production_branch: "main",
      deployment_configs: {
        production: {
          compatibility_date: "2025-06-01",
          env_vars: { UUID: { type: "plain_text", value: uuid } },
        },
      },
    }),
  }).then((r) => r.json());

  const code = created?.errors?.[0]?.code;
  if (!created?.success && code !== 8000021) {
    const message = created?.errors?.[0]?.message || "";
    if (code === 8000009 || /already exists/i.test(message)) {
      // پروژه از قبل هست — متغیر UUID را به‌روزرسانی می‌کنیم
      await fetch(`${API}/accounts/${accountId}/pages/projects/${workerName}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          deployment_configs: {
            production: {
              compatibility_date: "2025-06-01",
              env_vars: { UUID: { type: "plain_text", value: uuid } },
            },
          },
        }),
      }).catch(() => {});
    } else {
      throw new UserError(pagesError(code, message));
    }
  }

  const workerSource = await loadPanelSource();
  const inner = new FormData();
  inner.append(
    "metadata",
    JSON.stringify({ main_module: "_worker.js", compatibility_date: "2025-06-01", compatibility_flags: [] })
  );
  inner.append("_worker.js", new Blob([workerSource], { type: "application/javascript+module" }), "_worker.js");
  const bundle = await new Response(inner).blob();

  const form = new FormData();
  form.append("manifest", JSON.stringify({}));
  form.append("branch", "main");
  form.append("_worker.bundle", bundle, "_worker.bundle");

  const deployment = await fetch(`${API}/accounts/${accountId}/pages/projects/${workerName}/deployments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  }).then((r) => r.json());

  if (!deployment?.success) {
    throw new UserError(pagesError(deployment?.errors?.[0]?.code, deployment?.errors?.[0]?.message));
  }

  const panelUrl = `https://${workerName}.pages.dev`;
  return {
    panelUrl,
    subUrl: panelUrl + "/sub",
    infoUrl: panelUrl + "/info",
    workerName,
    target: "pages",
    uuid,
    note: "اگر آدرس pages.dev باز نشد، یک دامنهٔ اختصاصی به پروژه وصل کنید.",
  };
}

function pagesError(code, message) {
  if (code === 8000119) {
    return "پروژهٔ Pages این اکانت توسط Cloudflare مسدود شده است. از حالت Worker + دامنهٔ اختصاصی استفاده کنید.";
  }
  if (/not entitled|not allowed/i.test(message || "")) {
    return "توکن اجازهٔ ساخت Pages را ندارد. دسترسی Pages: Edit را به توکن اضافه کنید.";
  }
  return message || "ساخت پنل روی Pages ناموفق بود.";
}

async function cf(token, path, init = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
  };

  let response;
  try {
    response = await fetch(API + path, { ...init, headers });
  } catch {
    throw new UserError("اتصال به API کلودفلر برقرار نشد.");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new UserError(`پاسخ نامعتبر از Cloudflare (HTTP ${response.status}).`);
  }

  if (!response.ok || !data?.success) {
    const apiMessage = Array.isArray(data?.errors)
      ? data.errors.map((e) => e?.message).filter(Boolean).join(" | ")
      : "";
    const code = data?.errors?.[0]?.code;
    if (code === 10000 || response.status === 401) {
      throw new UserError("توکن معتبر نیست یا منقضی شده است.");
    }
    if (code === 10001 || response.status === 403) {
      throw new UserError("دسترسی توکن کافی نیست: Workers Scripts Edit و Account Settings Read لازم است.");
    }
    throw new UserError(apiMessage || `خطای Cloudflare (HTTP ${response.status}).`);
  }

  return data.result;
}

function randomId(length) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => chars[b % chars.length]).join("");
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...cors,
    },
  });
}
