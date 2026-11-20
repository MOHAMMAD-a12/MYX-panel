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

## نصب خودکار با یک API Token (ویزارد یک‌فیلدی)

سریع‌ترین راه — فقط توکن را وارد کنید:

```text
https://mohammad-a12.github.io/MYX-panel/
```

1. در Cloudflare یک **Custom API Token** با دو دسترسی بسازید:
   - `Account → Workers Scripts → Edit`
   - `Account → Account Settings → Read`
2. توکن را در ویزارد بالا وارد کنید و دکمه را بزنید.

ویزارد درخواست را به **رلهٔ MYX** می‌فرستد (`https://relay.amirtf.qzz.io`). رله فقط یک کار می‌کند: از سمت سرور به API رسمی Cloudflare وصل می‌شود، اکانت را از خود توکن تشخیص می‌دهد، UUID تصادفی می‌سازد، Worker تک‌فایلی پنل را Deploy می‌کند و `workers.dev` را فعال می‌کند.

- رله هیچ توکنی را ذخیره یا لاگ نمی‌کند؛ توکن فقط در حافظهٔ همان درخواست می‌ماند.
- سورس پنل توسط رله از این مخزن خوانده می‌شود (`dist/myx-panel.js`)، پس هر تغییر در `public/` با یک push اعمال می‌شود.
- کد رله: [`relay/worker.js`](relay/worker.js) — مرورگر به‌دلیل CORS نمی‌تواند مستقیم به API کلودفلر وصل شود، به همین دلیل واسط لازم است.

### روش جایگزین (GitHub Actions)

اگر نمی‌خواهید توکن از واسطه عبور کند، می‌توانید همان کار را با GitHub Actions انجام دهید (توکن در Secret گیت‌هاب می‌ماند):

1. در **Settings → Secrets and variables → Actions** یک Secret با نام `CLOUDFLARE_API_TOKEN` بسازید.
2. از تب **Actions → Deploy MYX panel to Cloudflare → Run workflow** اجرا کنید.

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
- **اتصال به هاست‌های پشت Cloudflare ممکن نیست**: Workers نمی‌توانند با `connect()` به دامنه‌هایی که خودشان پشت Cloudflare هستند سوکت باز کنند. برای این حالت متغیر محیطی `PROXYIP` را روی یک IP غیر-Cloudflare تنظیم کنید (در پنل هم قابل وارد کردن است).
- **`workers.dev` برای بعضی اکانت‌ها در دسترس نیست** (به‌خصوص اکانت‌هایی که پیش‌تر برای پروکسی علامت‌گذاری شده‌اند). در آن حالت یک **دامنهٔ اختصاصی** (Custom Domain) به Worker وصل کنید — همین کار برای پنل نمایشی این پروژه انجام شد.
- سقف پلن رایگان Workers روزانه ۱۰۰٬۰۰۰ درخواست است؛ برای استفاده شخصی و چند کاربر مناسب است. توجه: سقف تعداد Worker در پلن رایگان ۱۰۰ عدد است؛ نزدیک شدن به آن باعث خطاهای 522/1101 در استقرار می‌شود.
- UUID را محرمانه نگه دارید و مقدار پیش‌فرض `public/_worker.js` را برای استفاده واقعی تغییر دهید.
