#!/usr/bin/env node
/**
 * Watch mode for development
 * Rebuilds the dev extension when files change
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const sourceDir = path.join(__dirname, '..', 'public');
const configDir = path.join(__dirname, '..', 'config');

console.log('👀 Watching for changes...\n');

// Initial build
runBuild();

// Watch for changes
fs.watch(sourceDir, { recursive: true }, (eventType, filename) => {
  if (filename && !filename.includes('node_modules')) {
    console.log(`\n📝 Changed: ${filename}`);
    runBuild();
  }
});

fs.watch(configDir, (eventType, filename) => {
  if (filename) {
    console.log(`\n⚙️  Config changed: ${filename}`);
    runBuild();
  }
});

function runBuild() {
  const build = spawn('node', [path.join(__dirname, 'build.js'), 'dev'], {
    stdio: 'inherit',
    shell: true
  });

  build.on('close', (code) => {
    if (code === 0) {
      console.log('👀 Waiting for changes...');
    }
  });
}

console.log('Press Ctrl+C to stop\n');
