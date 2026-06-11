// Rasterize assets/icon.svg -> assets/icon.png (1024) and assets/icon.icns.
// Run: npm run icon   (needs `sharp`; .icns step uses macOS `sips` + `iconutil`)
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');
const svg = path.join(assets, 'icon.svg');
const png = path.join(assets, 'icon.png');

// 1) SVG -> 1024px PNG (master)
await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(png);
console.log('wrote', png);

// 2) Build an .iconset and convert to .icns (macOS only)
if (process.platform === 'darwin') {
  const iconset = path.join(assets, 'icon.iconset');
  if (existsSync(iconset)) rmSync(iconset, { recursive: true });
  mkdirSync(iconset);
  const sizes = [16, 32, 128, 256, 512]; // canonical iconset bases (each has 1x and @2x)
  for (const s of sizes) {
    await sharp(svg, { density: 384 }).resize(s, s).png().toFile(path.join(iconset, `icon_${s}x${s}.png`));
    await sharp(svg, { density: 384 }).resize(s * 2, s * 2).png().toFile(path.join(iconset, `icon_${s}x${s}@2x.png`));
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(assets, 'icon.icns')]);
  rmSync(iconset, { recursive: true });
  console.log('wrote', path.join(assets, 'icon.icns'));
}
