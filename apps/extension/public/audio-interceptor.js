// MyVMK Genie - Audio Interceptor Loader
// Injects the page script as an external file to bypass CSP

(function() {
  'use strict';

  console.log('MyVMK Genie: Loading audio interceptor...');

  // Inject the external script file into the page context
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('audio-interceptor-page.js');
  script.onload = function() {
    console.log('MyVMK Genie: Audio interceptor script loaded');
    this.remove();
  };
  script.onerror = function(e) {
    console.error('MyVMK Genie: Failed to load audio interceptor', e);
  };

  // Insert at the very beginning
  (document.head || document.documentElement).insertBefore(script, (document.head || document.documentElement).firstChild);

  console.log('MyVMK Genie: Audio interceptor injection started');
})();
