// MyVMK Genie - Content Script
// Injected into MyVMK game pages

console.log('MyVMK Genie content script loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEND_PHRASE') {
    injectPhrase(message.phrase);
    sendResponse({ success: true });
  }

  if (message.type === 'SCREENSHOT_TAKEN') {
    showNotification(`Screenshot saved! (${message.timestamp})`);
    sendResponse({ success: true });
  }
});

// Inject a phrase into the game's chat input
function injectPhrase(phrase) {
  // Try to find the chat input field
  // This selector may need adjustment based on actual MyVMK DOM structure
  const chatInput = document.querySelector(
    'input[type="text"][placeholder*="chat"], ' +
    'input.chat-input, ' +
    'textarea.chat-input, ' +
    '#chat-input, ' +
    '[data-chat-input]'
  );

  if (chatInput) {
    // Set the value
    chatInput.value = phrase;

    // Dispatch input event to trigger any listeners
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Focus the input
    chatInput.focus();

    // Optionally auto-submit (send Enter key)
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    });
    chatInput.dispatchEvent(enterEvent);

    showNotification(`Sent: "${phrase}"`);
  } else {
    // If we can't find the input, try injecting via the game's Flash/canvas
    // This is a fallback for older game implementations
    console.log('Chat input not found - phrase:', phrase);
    showNotification('Chat input not found. Click on chat first.');
  }
}

// Show a non-intrusive notification overlay
function showNotification(message) {
  // Remove existing notification if any
  const existing = document.getElementById('myvmkpal-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'myvmkpal-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.3s ease, transform 0.3s ease;
  `;

  document.body.appendChild(notification);

  // Animate in
  requestAnimationFrame(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateY(0)';
  });

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(10px)';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Detect current room for audio sync feature
function detectRoom() {
  // Check URL for room info
  const url = window.location.href;

  // Try to find room name in the page
  const roomElement = document.querySelector(
    '.room-name, ' +
    '[data-room-name], ' +
    '#room-title'
  );

  return {
    url,
    roomName: roomElement?.textContent?.trim() || 'Unknown'
  };
}

// Report room changes to background script
let lastRoom = null;
setInterval(() => {
  const currentRoom = detectRoom();
  if (currentRoom.roomName !== lastRoom) {
    lastRoom = currentRoom.roomName;
    chrome.runtime.sendMessage({
      type: 'ROOM_CHANGED',
      room: currentRoom
    });
  }
}, 2000);
