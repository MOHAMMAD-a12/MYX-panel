# MYX panel — پنل Xray برای Cloudflare Workers / Pages + Netlify

یک پنل فارسی با رابط ساده برای ساخت کانفیگ **VLESS / VMess / Trojan** که دو حالت دارد:

1. **حالت Cloudflare (واقعاً وصل، بدون VPS):** فایل `_worker.js` یک سرور **VLESS-over-WebSocket** روی Workers/Pages اجرا می‌کند؛ پنل آدرس و UUID همان ورکر را از `/info` می‌خواند و خودکار پر می‌کند. لینک سابسکریپشن آماده: `/sub`.
2. **حالت Netlify/Static:** فقط تولیدکننده کانفیگ برای سرور Xray خودتان است؛ روی Netlify پروکسی اجرا نمی‌شود.

## امکانات پنل
- قالب‌های آماده یک‌کلیکی: Cloudflare Worker، VLESS+Reality، VLESS+WS+TLS، Trojan+WS+TLS، VMess+WS+TLS
- QR Code، کپی لینک، دانلود JSON و `sub.txt`
- بررسی خطاها و راهنمای فارسی تا کامل شدن فیلدها
- وارد کردن لینک vless/vmess/trojan و پر شدن خودکار فرم
- تولید UUID تصادفی، رابط ریسپانسیو با فونت وزیرمتن

---

## نصب خودکار با یک API Token (GitHub Actions + Pages)

صفحه راهنمای نصب:
```text
https://mohammad-a12.github.io/MYX-panel/
```

فقط یک Secret لازم است:

1. در Cloudflare یک **Custom API Token** با دسترسی `Account → Workers Scripts → Edit` بسازید.
2. در GitHub در مسیر **Settings → Secrets and variables → Actions** یک Secret با نام `CLOUDFLARE_API_TOKEN` بسازید.
3. از تب **Actions → Deploy MYX panel to Cloudflare → Run workflow** اجرا کنید.

Action به‌صورت خودکار اکانت را تشخیص می‌دهد، UUID تصادفی می‌سازد، Worker تک‌فایلی را Deploy می‌کند، `workers.dev` را فعال می‌کند و لینک پنل و سابسکریپشن را در Summary نشان می‌دهد. نیازی به وارد کردن Account ID نیست.

---

## استقرار روی Cloudflare Pages (ساده‌ترین روش)

### روش مستقیم (بدون Git)
1. یک پروژه در [Cloudflare Dashboard → Workers & Pages → Create → Pages](https://dash.cloudflare.com/) بسازید و **Direct upload** را انتخاب کنید.
2. **پوشه `public`** را آپلود کنید (فایل `_worker.js` داخل آن است). Pages آن را به‌صورت **Advanced Mode** اجرا می‌کند: فایل‌های HTML/CSS/JS استاتیک و `/vless`، `/info` و `/sub` روی ورکر.
3. در **Settings → Environment variables** این متغیر را بسازید:
   - `UUID` = یک UUID تصادفی اختصاصی (با دکمه 🎲 پنل می‌سازید)
   - اختیاری: `PATH` = `/vless` (پیش‌فرض)
   - اختیاری: `PROXYIP` = `IP:port` برای باز شدن سایت‌هایی که خودشان روی Cloudflare هستند
4. سایت `https://project-name.pages.dev` را باز کنید. قالب **☁️ Cloudflare Worker** خودکار انتخاب و مشخصات پر می‌شود؛ QR را اسکن کنید یا لینک را کپی کنید.
5. سابسکریپشن: `https://project-name.pages.dev/sub`

> برای پایداری بهتر، دامنه خودتان را به Pages وصل کنید تا روی دامنه شخصی و پورت 443 اجرا شود. در صورت اختلال روی `pages.dev` یا `workers.dev`، دامنه شخصی روی Cloudflare بهترین حالت است.

## استقرار روی Cloudflare Workers (با Wrangler)
```bash
npx wrangler login
npx wrangler secret put UUID   # UUID اختصاصی را وارد کنید
npx wrangler deploy
```
سپس پنل روی `https://<name>.<account>.workers.dev` بالا می‌آید و `/sub` هم فعال است.

## تست محلی
```bash
npx wrangler dev --local --port 8789
# مرورگر: http://localhost:8789
# ساب:   http://localhost:8789/sub
# مشخصات: http://localhost:8789/info
```
حالت فقط استاتیک هم با `python -m http.server -d public 8788` یا `npx serve public` قابل اجرا است.

## استقرار روی Netlify (فقط ساخت کانفیگ)
پروژه را در Netlify بکشید و رها کنید یا Git وصل کنید؛ Publish directory = `public` و بدون Build command. فایل `netlify.toml` این تنظیمات را دارد؛ برای Drag & Drop هم می‌توانید فقط پوشه `public` را آپلود کنید. توجه: در این حالت `_worker.js` اجرا نمی‌شود و برای اتصال باید مشخصات سرور Xray خودتان را وارد کنید.

## محدودیت‌های VLESS روی Workers
- **UDP پشتیبانی نمی‌شود** (مثل بعضی قابلیت‌های صوتی/تصویری و بازی‌ها)؛ تلگرام صوتی، وب عادی و دانلود TCP کار می‌کنند.
- سقف پلن رایگان Workers روزانه ۱۰۰٬۰۰۰ درخواست است؛ برای استفاده شخصی و چند کاربر مناسب است.
- UUID را محرمانه نگه دارید و مقدار پیش‌فرض `public/_worker.js` را برای استفاده واقعی تغییر دهید.
