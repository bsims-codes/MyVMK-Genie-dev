#!/usr/bin/env node
/**
 * MyVMK Genie Extension Build Script
 *
 * Usage:
 *   node scripts/build.js dev      - Development build (no minification)
 *   node scripts/build.js staging  - Staging build (minified)
 *   node scripts/build.js prod     - Production build (minified, no debug)
 */

const fs = require('fs');
const path = require('path');

// Get environment from command line
const env = process.argv[2] || 'dev';
const validEnvs = ['dev', 'staging', 'prod'];

if (!validEnvs.includes(env)) {
  console.error(`Invalid environment: ${env}`);
  console.error(`Valid options: ${validEnvs.join(', ')}`);
  process.exit(1);
}

// Load environment config
const config = require(`../config/env.${env}.js`);

console.log(`\n🧞 Building MyVMK Genie for ${env.toUpperCase()}...\n`);

// Paths
const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'public');
const outputDir = path.join(rootDir, '..', '..', 'dist', `extension-${env}`);

// Clean and create output directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// Files to process (JS files that need env injection)
const jsFiles = [
  'content.js',
  'background.js',
  'popup.js',
  'audio-interceptor.js',
  'audio-interceptor-page.js',
  'audio-room-map.js',
  'rooms.js'
];

// Files to copy as-is (no processing needed)
const staticFiles = [
  'manifest.json',
  'popup.html',
  'tesseract.min.js',
  // Images
  'myvmk-genie.png',
  'genie-background.png',
  'genie-host-events.png',
  'genie-community-events.png',
  'genie-double-credits.png',
  'genie-questcover-unclicked.png',
  'genie-questcover-clicked2.png',
  'beadie-genie-1.png',
  'beadie-genie-2.png',
  'raingif.gif'
];

// Process JavaScript files
async function processJsFiles() {
  let esbuild;
  const shouldMinify = env !== 'dev';

  if (shouldMinify) {
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

    // Inject environment variables
    content = injectEnvVariables(content, config);

    // Remove internal-only features if not enabled
    if (!config.INTERNAL_FEATURES) {
      content = removeInternalFeatures(content);
    }

    // Remove debug code if not in debug mode
    if (!config.DEBUG) {
      content = removeDebugCode(content);
    }

    // Minify if not dev and esbuild available
    if (shouldMinify && esbuild) {
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

// Inject environment variables into code
function injectEnvVariables(content, config) {
  // Replace placeholder patterns
  content = content.replace(
    /const WEBAPP_URL = ['"][^'"]*['"]/g,
    `const WEBAPP_URL = '${config.WEBAPP_URL}'`
  );

  content = content.replace(
    /http:\/\/localhost:3000/g,
    config.WEBAPP_URL
  );

  // Add env constants at the top of content scripts
  const envConstants = `
// Environment: ${config.ENV}
const __ENV__ = '${config.ENV}';
const __DEBUG__ = ${config.DEBUG};
const __INTERNAL_FEATURES__ = ${config.INTERNAL_FEATURES};
`;

  // Only add to main content script
  if (content.includes('MyVMK Genie')) {
    content = envConstants + content;
  }

  return content;
}

// Remove internal-only features (wrapped in INTERNAL_FEATURE comments)
function removeInternalFeatures(content) {
  // Remove code blocks marked as internal-only
  // Pattern: // INTERNAL_FEATURE_START ... // INTERNAL_FEATURE_END
  content = content.replace(
    /\/\/ INTERNAL_FEATURE_START[\s\S]*?\/\/ INTERNAL_FEATURE_END/g,
    '// [Internal feature removed in production]'
  );

  // Also handle /* INTERNAL_FEATURE_START */ ... /* INTERNAL_FEATURE_END */
  content = content.replace(
    /\/\* INTERNAL_FEATURE_START \*\/[\s\S]*?\/\* INTERNAL_FEATURE_END \*\//g,
    '/* [Internal feature removed in production] */'
  );

  return content;
}

// Remove debug/console.log statements
function removeDebugCode(content) {
  // Remove console.log statements (but keep console.error and console.warn)
  content = content.replace(
    /console\.log\([^)]*\);?\n?/g,
    ''
  );

  return content;
}

// Process manifest.json
function processManifest() {
  const manifestPath = path.join(sourceDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // Update name based on environment
  manifest.name = config.EXTENSION_NAME;

  // Add version suffix for non-prod
  if (config.VERSION_SUFFIX) {
    // Keep semver valid by adding to description instead
    manifest.description = `${manifest.description} [${env.toUpperCase()}]`;
  }

  const outputPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`✅ manifest.json (${config.EXTENSION_NAME})`);
}

// Copy static files
function copyStaticFiles() {
  for (const file of staticFiles) {
    if (file === 'manifest.json') continue; // Handled separately

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

// Copy popup folder files
function copyPopupFiles() {
  const popupSourceDir = path.join(rootDir, 'popup');

  if (fs.existsSync(popupSourceDir)) {
    const files = fs.readdirSync(popupSourceDir);
    for (const file of files) {
      const sourcePath = path.join(popupSourceDir, file);
      const outputPath = path.join(outputDir, file);

      if (fs.statSync(sourcePath).isFile()) {
        fs.copyFileSync(sourcePath, outputPath);
        console.log(`📄 popup/${file}`);
      }
    }
  }
}

// Main build function
async function build() {
  try {
    console.log(`📁 Output: ${outputDir}\n`);

    processManifest();
    copyStaticFiles();
    copyPopupFiles();
    await processJsFiles();

    console.log(`\n✨ Build complete! Extension ready at:\n   ${outputDir}\n`);

    if (env === 'dev') {
      console.log('💡 Load this folder as an unpacked extension in Chrome:\n   chrome://extensions > Developer mode > Load unpacked\n');
    } else if (env === 'prod') {
      console.log('📦 Ready for Chrome Web Store!\n   Zip the folder and upload to the Developer Dashboard.\n');
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
