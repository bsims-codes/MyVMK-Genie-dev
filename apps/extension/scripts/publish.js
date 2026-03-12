#!/usr/bin/env node
/**
 * Publish production build to public GitHub repo
 *
 * This script:
 * 1. Builds the production extension
 * 2. Copies it to a separate folder
 * 3. Pushes to the public MyVMK-Genie repo
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const distDir = path.join(rootDir, 'dist');
const prodDir = path.join(distDir, 'extension-prod');
const publicRepoDir = path.join(distDir, 'public-repo');
const publicRepoUrl = 'https://github.com/bsims-codes/MyVMK-Genie.git';

console.log('🚀 Publishing to public repository...\n');

// Step 1: Build production
console.log('📦 Building production version...');
execSync('pnpm ext:prod', { cwd: rootDir, stdio: 'inherit' });

// Step 2: Prepare public repo folder
console.log('\n📁 Preparing public repo folder...');
if (fs.existsSync(publicRepoDir)) {
  // Keep .git folder if it exists
  const gitDir = path.join(publicRepoDir, '.git');
  const hasGit = fs.existsSync(gitDir);

  if (hasGit) {
    // Remove everything except .git
    const files = fs.readdirSync(publicRepoDir);
    for (const file of files) {
      if (file !== '.git') {
        fs.rmSync(path.join(publicRepoDir, file), { recursive: true });
      }
    }
  } else {
    fs.rmSync(publicRepoDir, { recursive: true });
    fs.mkdirSync(publicRepoDir, { recursive: true });
  }
} else {
  fs.mkdirSync(publicRepoDir, { recursive: true });
}

// Step 3: Initialize git if needed
const gitDir = path.join(publicRepoDir, '.git');
if (!fs.existsSync(gitDir)) {
  console.log('🔧 Initializing git repo...');
  execSync('git init', { cwd: publicRepoDir, stdio: 'inherit' });
  execSync(`git remote add origin ${publicRepoUrl}`, { cwd: publicRepoDir, stdio: 'inherit' });
  execSync('git config user.email "19766089+bsims-codes@users.noreply.github.com"', { cwd: publicRepoDir });
  execSync('git config user.name "bsims-codes"', { cwd: publicRepoDir });
}

// Step 4: Copy production build
console.log('📋 Copying production build...');
const files = fs.readdirSync(prodDir);
for (const file of files) {
  const src = path.join(prodDir, file);
  const dest = path.join(publicRepoDir, file);
  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Step 5: Create README for public repo
const readmeContent = `# MyVMK Genie

A companion Chrome extension for MyVMK - quick phrases, screenshots, and more!

## Features

- 🎤 Quick Phrases (Alt+1 through Alt+5)
- 📸 Screenshots (Alt+S)
- 🌧️ Visual overlays (rain, snow, fireworks, etc.)
- 🌙 Night mode
- 🎵 Audio controls
- 📍 Room detection
- And more!

## Installation

### From Chrome Web Store
Coming soon!

### Manual Installation
1. Download or clone this repository
2. Open Chrome and go to \`chrome://extensions\`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select this folder

## Usage

1. Go to [MyVMK](https://www.myvmk.com)
2. Click the genie icon that appears
3. Configure your phrases and settings

## License

MIT
`;

fs.writeFileSync(path.join(publicRepoDir, 'README.md'), readmeContent);

// Step 6: Commit and push
console.log('\n📤 Committing and pushing...');
try {
  execSync('git add .', { cwd: publicRepoDir, stdio: 'inherit' });

  // Get version from manifest
  const manifest = JSON.parse(fs.readFileSync(path.join(publicRepoDir, 'manifest.json'), 'utf8'));
  const version = manifest.version;

  const commitMsg = `Release v${version}`;
  execSync(`git commit -m "${commitMsg}" --allow-empty`, { cwd: publicRepoDir, stdio: 'inherit' });
  execSync('git branch -M main', { cwd: publicRepoDir, stdio: 'inherit' });
  execSync('git push -u origin main --force', { cwd: publicRepoDir, stdio: 'inherit' });

  console.log(`\n✨ Published v${version} to public repo!`);
  console.log(`   https://github.com/bsims-codes/MyVMK-Genie`);
} catch (error) {
  console.error('❌ Failed to push:', error.message);
  console.log('\nYou can manually push from:', publicRepoDir);
}
