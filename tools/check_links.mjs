/**
 * Every link on every page actually resolves.
 *
 * Internal links are followed; external ones are HEAD-checked once each. A
 * broken link is the cheapest possible bug to ship and the most annoying to
 * find by hand.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PAGES = ["/", "/file", "/cases", "/verdicts", "/docs", "/case/1", "/case/3"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const seen = new Map();
const problems = [];

for (const path of PAGES) {
  await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
  const hrefs = await page.$$eval("a[href]", (as) =>
    as.map((a) => ({ href: a.getAttribute("href"), text: (a.textContent || "").trim().slice(0, 40) })));
  for (const { href, text } of hrefs) {
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
    const url = href.startsWith("http") ? href : BASE + href;
    if (seen.has(url)) continue;
    let status = 0;
    try {
      const res = await fetch(url, { method: href.startsWith("http") ? "HEAD" : "GET", redirect: "follow" });
      status = res.status;
    } catch (e) {
      status = -1;
    }
    seen.set(url, status);
    // An explorer that 404s a page we never wrote is not our bug; anything on
    // our own origin is.
    const ours = url.startsWith(BASE);
    if (status >= 400 || status === -1) {
      (ours ? problems : []).push?.(`${path}: ${url} -> ${status} ("${text}")`);
      if (!ours) console.log(`  note external ${url} -> ${status}`);
    }
  }
}

const ours = [...seen.entries()].filter(([u]) => u.startsWith(BASE));
const ext = [...seen.entries()].filter(([u]) => !u.startsWith(BASE));
console.log(`\n  internal links checked: ${ours.length}, all 2xx: ${ours.every(([, s]) => s < 400)}`);
console.log(`  external links checked: ${ext.length}`);
for (const [u, s] of ours) if (s >= 400) console.log(`    ${u} -> ${s}`);
await browser.close();
if (problems.length) {
  console.log("\nBROKEN:");
  problems.forEach((p) => console.log("  ✗ " + p));
  process.exit(1);
}
console.log("\n✔ every internal link resolves");
