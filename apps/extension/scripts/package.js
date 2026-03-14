#!/usr/bin/env node
/**
 * Package the extension as a ZIP for Chrome Web Store
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, '..', '..', 'dist');
const releaseDir = path.join(distDir, 'extension-release');
const outputZip = path.join(distDir, 'myvmk-genie-extension.zip');

// First, build release version
console.log('🧞 Building release version...\n');
execSync('node scripts/build.js release', { cwd: rootDir, stdio: 'inherit' });

// Check if release build exists
if (!fs.existsSync(releaseDir)) {
  console.error('❌ Release build not found.');
  process.exit(1);
}

// Remove old zip if exists
if (fs.existsSync(outputZip)) {
  fs.unlinkSync(outputZip);
}

console.log('\n📦 Creating ZIP package...\n');

// Create zip (cross-platform)
try {
  // Try using PowerShell on Windows
  if (process.platform === 'win32') {
    execSync(
      `powershell -command "Compress-Archive -Path '${releaseDir}\\*' -DestinationPath '${outputZip}'"`,
      { stdio: 'inherit' }
    );
  } else {
    // Use zip on Unix
    execSync(`cd "${releaseDir}" && zip -r "${outputZip}" .`, { stdio: 'inherit' });
  }

  console.log(`\n✨ Package created: ${outputZip}`);
  console.log('\n📤 Upload this file to Chrome Web Store Developer Dashboard:');
  console.log('   https://chrome.google.com/webstore/devconsole\n');
} catch (error) {
  console.error('❌ Failed to create ZIP:', error.message);
  console.log('\nManually zip the contents of:', releaseDir);
  process.exit(1);
}
