/**
 * Screenshots of every page, desktop and phone.
 *
 * The phone pass also asserts there is NO HORIZONTAL SCROLL at 390px, which is
 * the one responsive failure that looks fine in a screenshot and is unusable in
 * a hand.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = new URL("../screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["landing", "/"],
  ["file", "/file"],
  ["cases", "/cases"],
  ["case-1", "/case/1"],
  ["case-3", "/case/3"],
  ["case-4", "/case/4"],
  ["verdicts", "/verdicts"],
  ["docs", "/docs"],
];

const browser = await chromium.launch();
const problems = [];

for (const [device, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]]) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  for (const [name, path] of PAGES) {
    // `load`, not `networkidle`. A deployed page keeps a connection warm long
    // enough that `networkidle` never fires, and the check then reports a
    // timeout on a page that rendered correctly in 400ms.
    await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}${device}-${name}.png`, fullPage: true });

    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      culprits: [...document.querySelectorAll("*")]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 4)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`),
    }));
    if (overflow.scrollW > overflow.clientW + 1) {
      problems.push(`${device} ${path}: horizontal scroll ${overflow.scrollW} > ${overflow.clientW} — ${overflow.culprits.join(" | ")}`);
    }
    console.log(`${device.padEnd(8)} ${path.padEnd(12)} ${overflow.scrollW <= overflow.clientW + 1 ? "no h-scroll" : "H-SCROLL"}`);
  }
  if (errors.length) problems.push(`${device}: console errors — ${[...new Set(errors)].slice(0, 3).join(" | ")}`);
  await ctx.close();
}

await browser.close();
if (problems.length) {
  console.log("\nPROBLEMS:");
  for (const p of problems) console.log("  ✗ " + p);
  process.exit(1);
}
console.log("\n✔ every page renders with no horizontal scroll and no console errors");
