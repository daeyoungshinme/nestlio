import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const svgPath = join(rootDir, "public", "favicon.svg");
const iconsDir = join(rootDir, "public", "icons");

const sizes = [16, 32, 48, 180, 192, 512];

async function main() {
  mkdirSync(iconsDir, { recursive: true });
  const svgBuffer = readFileSync(svgPath);

  const pngBuffers = {};
  for (const size of sizes) {
    const buffer = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    pngBuffers[size] = buffer;
    writeFileSync(join(iconsDir, `icon-${size}.png`), buffer);
    console.log(`generated icons/icon-${size}.png`);
  }

  const icoBuffer = await pngToIco([pngBuffers[16], pngBuffers[32], pngBuffers[48]]);
  writeFileSync(join(rootDir, "public", "favicon.ico"), icoBuffer);
  console.log("generated favicon.ico");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
