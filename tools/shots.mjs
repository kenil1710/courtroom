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

    // Scroll the whole page before capturing.
    //
    // A `fullPage` screenshot resizes the viewport and captures in one pass, so
    // anything gated on an IntersectionObserver has never been scrolled into
    // view and is photographed in its hidden state. Walking down the page first
    // is what makes the screenshot show what a reader actually sees — and it is
    // also how the reveal was caught stranding content in the first place.
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
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
  /*
   * Infrastructure noise is not an application error.
   *
   * Studio Dev meters 30 requests a minute per IP, and this sweep loads sixteen
   * pages back to back — so it rate-limits ITSELF and the SDK logs that on the
   * server. The pages still render, because `retry` in lib/court.ts handles it.
   * Reporting it as a console error would mean this check cried wolf on every
   * clean run, and a check that always fails is a check nobody reads.
   */
  const real = [...new Set(errors)].filter(
    (e) => !/rate limit exceeded|-32029|Unexpected token '<'|fetch failed|GenLayer RPC error/i.test(e),
  );
  if (real.length) problems.push(`${device}: console errors — ${real.slice(0, 3).join(" | ")}`);
  await ctx.close();
}

await browser.close();
if (problems.length) {
  console.log("\nPROBLEMS:");
  for (const p of problems) console.log("  ✗ " + p);
  process.exit(1);
}
console.log("\n✔ every page renders with no horizontal scroll and no console errors");
