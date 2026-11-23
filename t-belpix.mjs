import fs from "node:fs";
import { spawn } from "node:child_process";
import { encode } from "next-auth/jwt";
const env = fs.readFileSync(".env.local", "utf8");
const secret = /^AUTH_SECRET=(.*)$/m.exec(env)[1].trim();
const token = await encode({ token: { sub: "111370377537736286912", email: "me@danwet.me", name: "Daniel" }, secret, salt: "authjs.session-token" });
const port = 10192;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new","--disable-gpu","--no-sandbox","--remote-debugging-port=" + port,"--user-data-dir=/tmp/chrome-belpix","about:blank"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 3000));
const list = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
const ws = new WebSocket((list.find((t) => t.type === "page") ?? list[0]).webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = (x) => send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }).then(r => r?.result?.value);
await send("Page.enable"); await send("Network.enable"); await send("Runtime.enable");
await send("Network.setBlockedURLs", { urls: ["*/api/gmail/import*", "*/api/calendar/status*"] });
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 4, mobile: false });
await send("Network.setCookie", { name: "authjs.session-token", value: token, url: "http://localhost:3000/" });
for (const [pad, naam] of [["/", "dashboard"], ["/scan", "uploaden"]]) {
  await send("Page.navigate", { url: "http://localhost:3000" + pad });
  await new Promise((r) => setTimeout(r, 11000));
  const box = await ev(`(() => {
    for (const svg of document.querySelectorAll('header svg')) {
      const d = svg.querySelector('path')?.getAttribute('d') ?? '';
      if (/^M18 8a6/.test(d)) { const r = svg.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }); }
    }
    return null;
  })()`);
  if (!box) { console.log(naam + ": geen bel"); continue; }
  const o = JSON.parse(box);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: o.x, y: o.y, width: o.w, height: o.h, scale: 4 } });
  fs.writeFileSync(`/tmp/bel2-${naam}.png`, Buffer.from(shot.data, "base64"));
  console.log(naam + ": " + box);
}
chrome.kill(); process.exit(0);
