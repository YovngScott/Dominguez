import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = path.resolve(import.meta.dirname, "..");
const assets = path.join(root, "assets");
const build = path.join(root, "build");
fs.mkdirSync(assets, { recursive: true });
fs.mkdirSync(build, { recursive: true });

const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="55" y1="35" x2="460" y2="480" gradientUnits="userSpaceOnUse">
      <stop stop-color="#9B83FF"/>
      <stop offset="1" stop-color="#5330DC"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="132" fill="#090B10"/>
  <rect x="42" y="42" width="428" height="428" rx="112" fill="url(#g)"/>
  <path d="M157 172c0-48 39-82 102-82 48 0 86 19 107 49l-54 40c-13-17-30-26-54-26-23 0-37 8-37 22 0 15 14 20 58 30 72 17 101 44 101 99 0 61-49 104-123 104-61 0-110-25-137-67l57-39c19 28 43 42 76 42 27 0 43-9 43-25 0-16-15-22-59-32-69-16-100-45-100-95Z" fill="white"/>
</svg>`;

const png = path.join(assets, "icon.png");
await sharp(Buffer.from(svg)).png().toFile(png);
for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(build, `icon-${size}.png`));
}
const ico = await pngToIco([16, 24, 32, 48, 64, 128, 256].map((s) => path.join(build, `icon-${s}.png`)));
fs.writeFileSync(path.join(build, "icon.ico"), ico);
console.log("Assets generados.");
