
import fs from "node:fs";
import { spawn } from "node:child_process";
import { encode } from "next-auth/jwt";
const env = fs.readFileSync(".env.local", "utf8");
const secret = /^AUTH_SECRET=(.*)$/m.exec(env)[1].trim();
const token = await encode({ token: { sub: "111370377537736286912", email: "me@danwet.me", name: "Daniel" }, secret, salt: "authjs.session-token" });
const port = 10108;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new","--disable-gpu","--no-sandbox","--remote-debugging-port=" + port,"--user-data-dir=/tmp/chrome-logogap2","about:blank"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 3500));
const list = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
const ws = new WebSocket((list.find((t) => t.type === "page") ?? list[0]).webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = (x) => send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }).then(r => r?.result?.value);
await send("Page.enable"); await send("Network.enable"); await send("Runtime.enable");
await send("Network.setBlockedURLs", { urls: ["*/api/gmail/import*", "*/api/calendar/status*"] });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
await send("Network.setCookie", { name: "authjs.session-token", value: token, url: "http://localhost:3000/" });
await send("Page.navigate", { url: "http://localhost:3000/" });
await new Promise((r) => setTimeout(r, 18000));
await ev("(() => { const b=[...document.querySelectorAll('[role=\"radio\"]')].find(x=>/^Hoeft niet/.test(x.textContent)); b?.click(); })()");
await new Promise((r) => setTimeout(r, 1200));
console.log("LOGO: " + await ev(`(() => {
  const kaarten=[...document.querySelectorAll('.card-surface')];
  for (const c of kaarten) {
    const img=[...c.querySelectorAll('img')].find(i=>/max-h-12/.test(i.className));
    if(!img) continue;
    const wrap=img.parentElement;
    const naam=[...c.querySelectorAll('p')].find(p=>/text-\\[22px\\]/.test(p.className));
    const wrapCs=getComputedStyle(wrap);
    return JSON.stringify({
      paddingBoven: wrapCs.paddingTop,
      paddingOnder: wrapCs.paddingBottom,
      ruimteTotNaam: Math.round(naam.getBoundingClientRect().top - img.getBoundingClientRect().bottom)
    });
  }
  return 'geen logo';
})()`));
chrome.kill(); process.exit(0);
