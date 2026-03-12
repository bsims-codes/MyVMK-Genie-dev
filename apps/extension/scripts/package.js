#!/usr/bin/env node
/**
 * Package the production extension as a ZIP for Chrome Web Store
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, '..', '..', 'dist');
const prodDir = path.join(distDir, 'extension-prod');
const outputZip = path.join(distDir, 'myvmk-genie-extension.zip');

// First, build production
console.log('🧞 Building production version...\n');
execSync('node scripts/build.js prod', { cwd: rootDir, stdio: 'inherit' });

// Check if prod build exists
if (!fs.existsSync(prodDir)) {
  console.error('❌ Production build not found. Run build:prod first.');
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
      `powershell -command "Compress-Archive -Path '${prodDir}\\*' -DestinationPath '${outputZip}'"`,
      { stdio: 'inherit' }
    );
  } else {
    // Use zip on Unix
    execSync(`cd "${prodDir}" && zip -r "${outputZip}" .`, { stdio: 'inherit' });
  }

  console.log(`\n✨ Package created: ${outputZip}`);
  console.log('\n📤 Upload this file to Chrome Web Store Developer Dashboard:');
  console.log('   https://chrome.google.com/webstore/devconsole\n');
} catch (error) {
  console.error('❌ Failed to create ZIP:', error.message);
  console.log('\nManually zip the contents of:', prodDir);
  process.exit(1);
}
