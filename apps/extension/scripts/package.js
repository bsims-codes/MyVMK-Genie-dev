#!/usr/bin/env node
/**
 * Package the extension as ZIP files for Chrome Web Store and Firefox Add-ons
 * Uses archiver to create cross-platform compatible zips with forward slashes
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, '..', '..', 'dist');
const chromeReleaseDir = path.join(distDir, 'extension-release');
const firefoxReleaseDir = path.join(distDir, 'extension-release-firefox');
const chromeZip = path.join(distDir, 'myvmk-genie-chrome.zip');
const firefoxZip = path.join(distDir, 'myvmk-genie-firefox.zip');
const sourceZip = path.join(distDir, 'myvmk-genie-source.zip');

// First, build release versions (Chrome + Firefox)
console.log('🧞 Building release versions...\n');
execSync('node scripts/build.js release', { cwd: rootDir, stdio: 'inherit' });

// Check if builds exist
if (!fs.existsSync(chromeReleaseDir)) {
  console.error('❌ Chrome release build not found.');
  process.exit(1);
}
if (!fs.existsSync(firefoxReleaseDir)) {
  console.error('❌ Firefox release build not found.');
  process.exit(1);
}

// Create zip using archiver (cross-platform, forward slashes)
function createZip(sourceDir, outputZip, name) {
  return new Promise((resolve, reject) => {
    // Remove old zip if exists
    if (fs.existsSync(outputZip)) {
      fs.unlinkSync(outputZip);
    }

    console.log(`\n📦 Creating ${name} ZIP package...`);

    const output = fs.createWriteStream(outputZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✅ ${name}: ${outputZip} (${(archive.pointer() / 1024).toFixed(0)} KB)`);
      resolve(true);
    });

    archive.on('error', (err) => {
      console.error(`❌ Failed to create ${name} ZIP:`, err.message);
      reject(err);
    });

    archive.pipe(output);
    archive.directory(sourceDir, false); // false = don't include the directory itself
    archive.finalize();
  });
}

// Create source zip for Firefox review
function createSourceZip() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(sourceZip)) {
      fs.unlinkSync(sourceZip);
    }

    console.log(`\n📦 Creating source code ZIP for review...`);

    const output = fs.createWriteStream(sourceZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✅ Source: ${sourceZip} (${(archive.pointer() / 1024).toFixed(0)} KB)`);
      resolve(true);
    });

    archive.on('error', (err) => {
      console.error(`❌ Failed to create source ZIP:`, err.message);
      reject(err);
    });

    archive.pipe(output);

    // Add source files
    archive.directory(path.join(rootDir, 'public'), 'public');
    archive.directory(path.join(rootDir, 'scripts'), 'scripts');
    archive.file(path.join(rootDir, 'package.json'), { name: 'package.json' });
    archive.file(path.join(rootDir, 'BUILD_INSTRUCTIONS.md'), { name: 'BUILD_INSTRUCTIONS.md' });

    archive.finalize();
  });
}

// Main
async function main() {
  try {
    await createZip(chromeReleaseDir, chromeZip, 'Chrome');
    await createZip(firefoxReleaseDir, firefoxZip, 'Firefox');
    await createSourceZip();

    console.log('\n' + '='.repeat(60));
    console.log('📦 Packaging Complete!\n');
    console.log('🌐 Chrome Web Store:');
    console.log(`   ${chromeZip}`);
    console.log('   Upload: https://chrome.google.com/webstore/devconsole\n');
    console.log('🦊 Firefox Add-ons:');
    console.log(`   ${firefoxZip}`);
    console.log(`   Source: ${sourceZip}`);
    console.log('   Upload: https://addons.mozilla.org/developers/\n');
  } catch (error) {
    console.error('❌ Packaging failed:', error);
    process.exit(1);
  }
}

main();
