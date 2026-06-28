const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 128, 256, 512];
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const ICONS_DIR = path.join(ASSETS_DIR, 'icons');
const LOGO_SVG = path.join(ASSETS_DIR, 'logo.svg');

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function generatePngs() {
  await ensureDir(ICONS_DIR);
  for (const size of SIZES) {
    const outPath = path.join(ICONS_DIR, `icon_${size}.png`);
    await sharp(LOGO_SVG)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log(`Generated ${outPath}`);
  }
}

async function copyBestIcon(name, size) {
  const src = path.join(ICONS_DIR, `icon_${size}.png`);
  const dest = path.join(ASSETS_DIR, name);
  await fs.promises.copyFile(src, dest);
  console.log(`Copied ${src} -> ${dest}`);
}

async function build() {
  if (!fs.existsSync(LOGO_SVG)) {
    throw new Error(`Logo SVG not found: ${LOGO_SVG}`);
  }
  await generatePngs();
  await copyBestIcon('icon.png', 512);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
