// MyVMK Genie - Popup Script

const WEBAPP_URL = 'http://localhost:3000'; // Will be updated to production URL
const MYVMK_URL = 'https://play.myvmk.com';

// Load phrases when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  await loadPhrases();
  setupEventListeners();
});

// Load saved phrases from storage
async function loadPhrases() {
  const container = document.getElementById('phrases-container');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PHRASES' });
    const phrases = response.phrases || {};

    container.innerHTML = '';

    for (let i = 1; i <= 5; i++) {
      const item = document.createElement('div');
      item.className = 'phrase-item';
      item.innerHTML = `
        <span class="phrase-number">${i}</span>
        <input
          type="text"
          class="phrase-input"
          id="phrase-${i}"
          value="${phrases[i] || ''}"
          placeholder="Enter phrase ${i}..."
          maxlength="200"
        >
      `;
      container.appendChild(item);
    }
  } catch (error) {
    console.error('Error loading phrases:', error);
    container.innerHTML = '<p style="color: #ef4444;">Error loading phrases</p>';
  }
}

// Set up button event listeners
function setupEventListeners() {
  // Save phrases
  document.getElementById('save-btn').addEventListener('click', savePhrases);

  // Take screenshot
  document.getElementById('screenshot-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('myvmk.com')) {
      chrome.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
      showStatus('Screenshot captured!', 'success');
    } else {
      showStatus('Open MyVMK first', 'error');
    }
  });

  // Open web app
  document.getElementById('webapp-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: WEBAPP_URL });
  });

  // Open MyVMK
  document.getElementById('game-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: MYVMK_URL });
  });

  // Open gallery
  document.getElementById('gallery-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: `${WEBAPP_URL}/photos` });
  });

  // Open commands view
  document.getElementById('commands-btn').addEventListener('click', () => {
    document.getElementById('main-view').classList.add('hidden');
    document.getElementById('commands-view').classList.add('active');
  });

  // Back to main view
  document.getElementById('back-btn').addEventListener('click', () => {
    document.getElementById('commands-view').classList.remove('active');
    document.getElementById('main-view').classList.remove('hidden');
  });
}

// Save phrases to storage
async function savePhrases() {
  const phrases = {};

  for (let i = 1; i <= 5; i++) {
    const input = document.getElementById(`phrase-${i}`);
    phrases[i] = input.value.trim();
  }

  try {
    await chrome.runtime.sendMessage({ type: 'SET_PHRASES', phrases });
    showStatus('Phrases saved!', 'success');
  } catch (error) {
    console.error('Error saving phrases:', error);
    showStatus('Error saving phrases', 'error');
  }
}

// Show status message
function showStatus(message, type = 'info') {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;

  setTimeout(() => {
    status.textContent = '';
    status.className = 'status';
  }, 3000);
}
