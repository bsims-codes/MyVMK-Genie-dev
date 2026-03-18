#!/usr/bin/env node
/**
 * MyVMK Genie Extension Build Script
 *
 * Usage:
 *   node scripts/build.js         - Development build (Chrome only)
 *   node scripts/build.js release - Release build (Chrome + Firefox)
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
const distBase = path.join(rootDir, '..', '..', 'dist');

// Files to process (JS files)
const jsFiles = [
  'content.js',
  'background.js',
  'popup.js',
  'audio-interceptor.js',
  'audio-interceptor-page.js',
  'audio-room-map.js',
  'rooms.js',
  'prize-tracker-bridge.js'
];

// Files to copy as-is
const staticFiles = [
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

// Transform Chrome manifest to Firefox manifest
function transformManifestForFirefox(chromeManifest) {
  const firefoxManifest = JSON.parse(JSON.stringify(chromeManifest));

  // Add Firefox-specific settings
  firefoxManifest.browser_specific_settings = {
    gecko: {
      id: 'myvmk-genie@bsims.codes',
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: ["none"]
      }
    }
  };

  // Convert service_worker to background scripts (Firefox MV3 uses different syntax)
  if (firefoxManifest.background && firefoxManifest.background.service_worker) {
    firefoxManifest.background = {
      scripts: [firefoxManifest.background.service_worker]
    };
  }

  // Remove tabCapture permission (not supported in Firefox)
  if (firefoxManifest.permissions) {
    firefoxManifest.permissions = firefoxManifest.permissions.filter(
      p => p !== 'tabCapture'
    );
  }

  return firefoxManifest;
}

// Process JavaScript files
async function processJsFiles(outputDir, browser = 'chrome') {
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

    // For release builds: disable DEV_MODE
    if (isRelease) {
      content = content.replace(
        /const DEV_MODE = true/g,
        'const DEV_MODE = false'
      );
    }

    // Minify for release builds and strip console.log
    if (isRelease && esbuild) {
      try {
        const result = await esbuild.transform(content, {
          minify: true,
          target: 'es2020',
          drop: ['console'],  // Strip all console.* calls in release
        });
        content = result.code;
        console.log(`✅ ${file} (minified, logs stripped, DEV_MODE=false)`);
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
function copyStaticFiles(outputDir) {
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

// Build for a specific browser
async function buildForBrowser(browser) {
  const suffix = isRelease ? 'release' : 'dev';
  const outputDir = path.join(distBase, `extension-${suffix}${browser === 'firefox' ? '-firefox' : ''}`);

  console.log(`\n📁 Building for ${browser.toUpperCase()}...`);
  console.log(`   Output: ${outputDir}\n`);

  // Clean and create output directory
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // Copy static files
  copyStaticFiles(outputDir);

  // Process and copy manifest
  const manifestPath = path.join(sourceDir, 'manifest.json');
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (browser === 'firefox') {
    manifest = transformManifestForFirefox(manifest);
  }

  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`📄 manifest.json (${browser})`);

  // Process JS files
  await processJsFiles(outputDir, browser);

  return outputDir;
}

// Main build function
async function build() {
  try {
    // Always build Chrome version
    const chromeDir = await buildForBrowser('chrome');

    // For release builds, also build Firefox version
    if (isRelease) {
      const firefoxDir = await buildForBrowser('firefox');

      console.log(`\n✨ Build complete!`);
      console.log(`   Chrome:  ${chromeDir}`);
      console.log(`   Firefox: ${firefoxDir}\n`);
      console.log('📦 Ready for packaging!\n   Use "npm run package" to create zip files.\n');
    } else {
      console.log(`\n✨ Build complete! Extension ready at:\n   ${chromeDir}\n`);
      console.log('💡 Load this folder as an unpacked extension in Chrome:\n   chrome://extensions > Developer mode > Load unpacked\n');
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
