#!/usr/bin/env node
/**
 * MyVMK Genie Extension Build Script
 *
 * Usage:
 *   node scripts/build.js         - Development build (no minification)
 *   node scripts/build.js release - Release build (minified)
 */

const fs = require('fs');
const path = require('path');

// Get build type from command line
const buildType = process.argv[2] || 'dev';
const isRelease = buildType === 'release';

console.log(`\n🧞 Building MyVMK Genie (${isRelease ? 'RELEASE' : 'DEV'})...\n`);

// Paths
const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'public');
const outputDir = path.join(rootDir, '..', '..', 'dist', isRelease ? 'extension-release' : 'extension-dev');

// Clean and create output directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// Files to process (JS files)
const jsFiles = [
  'content.js',
  'background.js',
  'popup.js',
  'audio-interceptor.js',
  'audio-interceptor-page.js',
  'audio-room-map.js',
  'rooms.js'
];

// Files to copy as-is
const staticFiles = [
  'manifest.json',
  'popup.html',
  'tesseract.min.js',
  // Images
  'myvmk-genie.png',
  'myvmk-genie-lamp-logo-pink.png',
  'genie-background.png',
  'genie-background-smoky-pink.png',
  'genie-host-events.png',
  'genie-genie-events.png',
  'genie-community-events.png',
  'genie-double-credits.png',
  'bee-static.png',
  'bee.gif',
  'genie-questcover-unclicked.png',
  'genie-questcover-clicked2.png',
  'beadie-genie-1.png',
  'beadie-genie-2.png',
  'raingif.gif',
  'Tinkerbelle_Only.gif',
  'Butterfly1.gif',
  'Butterfly2.gif',
  'Butterfly3.gif'
];

// Process JavaScript files
async function processJsFiles() {
  let esbuild;

  if (isRelease) {
    try {
      esbuild = require('esbuild');
    } catch (e) {
      console.log('⚠️  esbuild not found, skipping minification');
      esbuild = null;
    }
  }

  for (const file of jsFiles) {
    const sourcePath = path.join(sourceDir, file);
    const outputPath = path.join(outputDir, file);

    if (!fs.existsSync(sourcePath)) {
      console.log(`⚠️  Skipping ${file} (not found)`);
      continue;
    }

    let content = fs.readFileSync(sourcePath, 'utf8');

    // Minify for release builds
    if (isRelease && esbuild) {
      try {
        const result = await esbuild.transform(content, {
          minify: true,
          target: 'es2020',
        });
        content = result.code;
        console.log(`✅ ${file} (minified)`);
      } catch (e) {
        console.log(`⚠️  ${file} (minification failed, using original)`);
        fs.writeFileSync(outputPath, content);
        continue;
      }
    } else {
      console.log(`✅ ${file}`);
    }

    fs.writeFileSync(outputPath, content);
  }
}

// Copy static files
function copyStaticFiles() {
  for (const file of staticFiles) {
    const sourcePath = path.join(sourceDir, file);
    const outputPath = path.join(outputDir, file);

    if (!fs.existsSync(sourcePath)) {
      console.log(`⚠️  Skipping ${file} (not found)`);
      continue;
    }

    fs.copyFileSync(sourcePath, outputPath);
    console.log(`📄 ${file}`);
  }
}

// Main build function
async function build() {
  try {
    console.log(`📁 Output: ${outputDir}\n`);

    copyStaticFiles();
    await processJsFiles();

    console.log(`\n✨ Build complete! Extension ready at:\n   ${outputDir}\n`);

    if (!isRelease) {
      console.log('💡 Load this folder as an unpacked extension in Chrome:\n   chrome://extensions > Developer mode > Load unpacked\n');
    } else {
      console.log('📦 Ready for Chrome Web Store!\n   Use "pnpm ext:package" to create a zip file.\n');
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
