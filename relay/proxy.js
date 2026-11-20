// MYX relay bridge — یک Worker کوچک که درخواست‌ها را به رلهٔ Pages فوروارد می‌کند.
// دلیل وجود: پنل/رلهٔ حجیم روی این اکانت در مسیر Workers بارگذاری نمی‌شود (1101/522)،
// اما رله روی Cloudflare Pages درست کار می‌کند و Workerهای کوچک روی دامنهٔ اختصاصی سالم‌اند.
const TARGET = "https://myx-relay.pages.dev";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.protocol = "https:";
    url.hostname = "myx-relay.pages.dev";
    url.port = "";

    const headers = new Headers(request.headers);
    headers.delete("host");

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (!["GET", "HEAD"].includes(request.method)) {
      init.body = request.body;
    }

    const upstream = await fetch(url.toString(), init);

    const outHeaders = new Headers(upstream.headers);
    outHeaders.delete("content-encoding");
    outHeaders.delete("content-length");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  },
};
