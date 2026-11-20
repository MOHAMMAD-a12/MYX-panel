// MYX Auto Deploy — رابط فقط-توکن
const RELAY_URL = "https://relay.amirtf.qzz.io";

const $ = (id) => document.getElementById(id);
const form = $("deployForm");
const tokenInput = $("token");
const nameInput = $("workerName");
const button = $("deployBtn");
const spinner = button.querySelector(".spinner");
const buttonText = button.querySelector(".btn-text");
const errorBox = $("errorBox");
const resultBox = $("resultBox");

function randomName() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return "myx-" + [...bytes].map((b) => chars[b % chars.length]).join("");
}

nameInput.value = randomName();

$("toggleToken").addEventListener("click", () => {
  tokenInput.type = tokenInput.type === "password" ? "text" : "password";
  $("toggleToken").textContent = tokenInput.type === "password" ? "👁" : "🙈";
});

function setLoading(loading) {
  button.disabled = loading;
  spinner.hidden = !loading;
  buttonText.textContent = loading ? "در حال ساخت پنل..." : "ساخت خودکار پنل";
  button.classList.toggle("loading", loading);
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  resultBox.hidden = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  resultBox.hidden = true;

  const token = tokenInput.value.trim();
  const workerName = nameInput.value.trim().toLowerCase();

  if (token.length < 20) return showError("توکن Cloudflare را کامل وارد کنید.");
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(workerName)) {
    return showError("نام Worker فقط می‌تواند شامل حروف کوچک انگلیسی، عدد و خط تیره باشد.");
  }

  setLoading(true);
  try {
    const response = await fetch(RELAY_URL + "/deploy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, workerName }),
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("پاسخ نامعتبر از سرور دریافت شد.");
    }

    if (!response.ok || !data.panelUrl) {
      throw new Error(data.error || "ساخت پنل ناموفق بود. دوباره تلاش کنید.");
    }

    $("panelLink").textContent = data.panelUrl;
    $("panelLink").href = data.panelUrl;
    $("subLink").textContent = data.subUrl;
    $("subLink").href = data.subUrl;
    $("openPanel").href = data.panelUrl;
    resultBox.hidden = false;
    tokenInput.value = "";
    resultBox.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    showError(error.message === "Failed to fetch"
      ? "ارتباط با رله برقرار نشد. اتصال اینترنت یا VPN خود را بررسی کنید."
      : error.message);
  } finally {
    setLoading(false);
  }
});

$("againBtn").addEventListener("click", () => {
  nameInput.value = randomName();
  resultBox.hidden = true;
  tokenInput.focus();
});

document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = $(btn.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      const toast = $("toast");
      toast.hidden = false;
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => (toast.hidden = true), 1500);
    } catch {
      showError("کپی خودکار ممکن نشد؛ لینک را دستی انتخاب کنید.");
    }
  });
});
