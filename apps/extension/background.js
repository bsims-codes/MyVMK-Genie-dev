// MyVMK Genie - Background Service Worker

// Handle extension commands (hotkeys)
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);

  if (command.startsWith('phrase-')) {
    const phraseNumber = parseInt(command.split('-')[1]);
    await sendPhrase(phraseNumber);
  } else if (command === 'take-screenshot') {
    await takeScreenshot();
  }
});

// Send a phrase to the active MyVMK tab
async function sendPhrase(phraseNumber) {
  try {
    // Get stored phrases
    const result = await chrome.storage.sync.get(['phrases']);
    const phrases = result.phrases || {};
    const phrase = phrases[phraseNumber];

    if (!phrase) {
      console.log(`No phrase set for slot ${phraseNumber}`);
      return;
    }

    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('myvmk.com')) {
      console.log('Not on MyVMK - phrase not sent');
      return;
    }

    // Send the phrase to the content script
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SEND_PHRASE',
      phrase: phrase
    });
  } catch (error) {
    console.error('Error sending phrase:', error);
  }
}

// Take a screenshot of the active tab
async function takeScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('myvmk.com')) {
      console.log('Not on MyVMK - screenshot not taken');
      return;
    }

    // Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });

    // Store the screenshot temporarily
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotData = {
      dataUrl,
      timestamp,
      tabUrl: tab.url
    };

    // Save to local storage (will be synced to Supabase later)
    const result = await chrome.storage.local.get(['screenshots']);
    const screenshots = result.screenshots || [];
    screenshots.unshift(screenshotData);

    // Keep only last 50 screenshots locally
    if (screenshots.length > 50) {
      screenshots.pop();
    }

    await chrome.storage.local.set({ screenshots });

    // Notify the user
    console.log('Screenshot captured:', timestamp);

    // Send message to content script to show notification
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SCREENSHOT_TAKEN',
      timestamp
    });
  } catch (error) {
    console.error('Error taking screenshot:', error);
  }
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PHRASES') {
    chrome.storage.sync.get(['phrases']).then(result => {
      sendResponse({ phrases: result.phrases || {} });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'SET_PHRASES') {
    chrome.storage.sync.set({ phrases: message.phrases }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_SCREENSHOTS') {
    chrome.storage.local.get(['screenshots']).then(result => {
      sendResponse({ screenshots: result.screenshots || [] });
    });
    return true;
  }
});

// Initialize default phrases on install
chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.sync.get(['phrases']);
  if (!result.phrases) {
    await chrome.storage.sync.set({
      phrases: {
        1: 'Hello!',
        2: 'Good game!',
        3: 'Thanks for playing!',
        4: 'See you later!',
        5: ''
      }
    });
  }
  console.log('MyVMK Genie extension installed');
});
