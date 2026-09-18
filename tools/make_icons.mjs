/**
 * Rasterise the logo into the icon set.
 *
 * A .ico that carries several sizes rather than one scaled 32px: a browser tab
 * uses 16 or 32 depending on the display, and a single 32 downscaled to 16 turns
 * the scales' cords into mush.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Paths are resolved against the repo, not the shell's working directory, so
// this runs the same from tools/ or from the root.
const FE = join(fileURLToPath(new URL("../frontend/", import.meta.url)));
const at = (p) => join(FE, p);

const svg = readFileSync(at("public/logo.svg"), "utf8");
const browser = await chromium.launch();
const sizes = [16, 32, 48, 64, 180, 512];
const pngs = {};

for (const s of sizes) {
  const page = await browser.newPage({
    viewport: { width: s, height: s },
    deviceScaleFactor: 1,
  });
  // A dark tab needs the mark to sit on the court's own charcoal, not on
  // transparency: a gold hairline on a light tab bar disappears. So the
  // charcoal is painted by an ELEMENT rather than by the page background.
  //
  // `omitBackground: true` is what makes the buffer RGBA. Without it the
  // encoder drops the alpha channel and emits RGB, and an .ico assembled from
  // RGB PNGs is rejected outright by the Next image pipeline with "The PNG is
  // not in RGBA format!". The element still covers the whole frame, so the
  // result is opaque RGBA rather than transparent.
  await page.setContent(
    `<html><body style="margin:0">
       <div style="width:${s}px;height:${s}px;background:rgba(26,26,46,0.996);display:flex;align-items:center;justify-content:center">
         <div style="width:${Math.round(s * 0.84)}px;height:${Math.round(s * 0.84)}px">${svg}</div>
       </div>
     </body></html>`,
    { waitUntil: "load" },
  );
  pngs[s] = await page.screenshot({ omitBackground: true });

  // Assert the format rather than trust it: an RGB frame here fails much later,
  // in a build log, as a message about a file this script wrote.
  const colourType = pngs[s][25];
  if (colourType !== 6) {
    throw new Error(`PNG at ${s}px has colour type ${colourType}, expected 6 (RGBA)`);
  }
  await page.close();
}
await browser.close();

writeFileSync(at("public/icon-512.png"), pngs[512]);
writeFileSync(at("public/apple-icon.png"), pngs[180]);
writeFileSync(at("src/app/icon.png"), pngs[64]);

/* --- assemble a multi-size .ico by hand (no dependency needed) ------------ */
const icoSizes = [16, 32, 48];
const count = icoSizes.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);      // reserved
header.writeUInt16LE(1, 2);      // type 1 = icon
header.writeUInt16LE(count, 4);
const entries = [];
const images = [];
let offset = 6 + count * 16;
for (const s of icoSizes) {
  const png = pngs[s];
  const e = Buffer.alloc(16);
  e.writeUInt8(s === 256 ? 0 : s, 0); // width
  e.writeUInt8(s === 256 ? 0 : s, 1); // height
  e.writeUInt8(0, 2);                 // palette
  e.writeUInt8(0, 3);                 // reserved
  e.writeUInt16LE(1, 4);              // colour planes
  e.writeUInt16LE(32, 6);             // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  entries.push(e);
  images.push(png);
}
writeFileSync(at("src/app/favicon.ico"), Buffer.concat([header, ...entries, ...images]));
console.log("wrote favicon.ico (16/32/48), icon.png (64), apple-icon.png (180), icon-512.png");
