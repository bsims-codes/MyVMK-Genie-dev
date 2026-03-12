// MyVMK Genie - Audio Interceptor (runs in PAGE context)
// This file is loaded directly as a web_accessible_resource

console.log('MyVMK Genie: Audio interceptor STARTING in page context...');

(function() {
  'use strict';

  // Store tracked audio globally
  window.__vmkGenieAudio = {
    trackedContexts: [],
    trackedMediaElements: [],
    masterGainNodes: [],
    muted: false
  };

  // ==========================================
  // 1. INTERCEPT AudioContext
  // ==========================================
  const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;

  if (OriginalAudioContext) {
    console.log('MyVMK Genie: Wrapping AudioContext...');

    const AudioContextWrapper = function(...args) {
      console.log('MyVMK Genie: NEW AudioContext created!');
      const ctx = new OriginalAudioContext(...args);

      // Create a MASTER gain node that ALL audio will route through
      const masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);

      // Store original destination before we override
      const originalDestination = ctx.destination;

      // Store for muting
      window.__vmkGenieAudio.trackedContexts.push({
        context: ctx,
        masterGain: masterGain,
        originalDestination: originalDestination
      });
      window.__vmkGenieAudio.masterGainNodes.push(masterGain);

      console.log('MyVMK Genie: Intercepted AudioContext #' + window.__vmkGenieAudio.trackedContexts.length);

      // Override createGain to route through master
      const originalCreateGain = ctx.createGain.bind(ctx);
      ctx.createGain = function() {
        const gain = originalCreateGain();
        const origConnect = gain.connect.bind(gain);
        gain.connect = function(dest, ...rest) {
          if (dest === originalDestination) {
            return origConnect(masterGain, ...rest);
          }
          return origConnect(dest, ...rest);
        };
        return gain;
      };

      // Override createBufferSource to route through master
      const originalCreateBufferSource = ctx.createBufferSource.bind(ctx);
      ctx.createBufferSource = function() {
        const source = originalCreateBufferSource();
        const origConnect = source.connect.bind(source);
        source.connect = function(dest, ...rest) {
          if (dest === originalDestination) {
            console.log('MyVMK Genie: Routing BufferSource through master gain');
            return origConnect(masterGain, ...rest);
          }
          return origConnect(dest, ...rest);
        };
        return source;
      };

      // Override createMediaElementSource
      const originalCreateMediaElementSource = ctx.createMediaElementSource.bind(ctx);
      ctx.createMediaElementSource = function(el) {
        const source = originalCreateMediaElementSource(el);
        const origConnect = source.connect.bind(source);
        source.connect = function(dest, ...rest) {
          if (dest === originalDestination) {
            return origConnect(masterGain, ...rest);
          }
          return origConnect(dest, ...rest);
        };
        return source;
      };

      // Apply mute if already muted
      if (window.__vmkGenieAudio.muted) {
        masterGain.gain.value = 0;
      }

      return ctx;
    };

    AudioContextWrapper.prototype = OriginalAudioContext.prototype;
    try {
      Object.setPrototypeOf(AudioContextWrapper, OriginalAudioContext);
    } catch(e) {}

    window.AudioContext = AudioContextWrapper;
    if (window.webkitAudioContext) {
      window.webkitAudioContext = AudioContextWrapper;
    }

    console.log('MyVMK Genie: AudioContext wrapped successfully');
  }

  // ==========================================
  // 2. INTERCEPT Audio constructor
  // ==========================================
  const OriginalAudio = window.Audio;
  if (OriginalAudio) {
    window.Audio = function(src) {
      const audio = new OriginalAudio(src);
      window.__vmkGenieAudio.trackedMediaElements.push(audio);
      console.log('MyVMK Genie: Intercepted new Audio()', src);

      // Broadcast the audio URL for room detection (use postMessage to cross isolated world boundary)
      if (src && src.length > 0) {
        window.__vmkGenieAudio.currentAudioUrl = src;
        window.postMessage({ type: 'vmkgenie-audio-detected', url: src }, '*');
      }

      if (window.__vmkGenieAudio.muted) {
        audio.muted = true;
        audio.volume = 0;
      }
      return audio;
    };
    window.Audio.prototype = OriginalAudio.prototype;
  }

  // ==========================================
  // 3. INTERCEPT HTMLMediaElement.play()
  // ==========================================
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function() {
    const audioSrc = this.src || this.currentSrc;
    if (!window.__vmkGenieAudio.trackedMediaElements.includes(this)) {
      window.__vmkGenieAudio.trackedMediaElements.push(this);
      console.log('MyVMK Genie: Intercepted .play()', audioSrc);
    }

    // Broadcast the audio URL to the content script for room detection (use postMessage to cross isolated world boundary)
    if (audioSrc && audioSrc.length > 0) {
      window.__vmkGenieAudio.currentAudioUrl = audioSrc;
      window.postMessage({ type: 'vmkgenie-audio-detected', url: audioSrc }, '*');
    }

    if (window.__vmkGenieAudio.muted) {
      this.muted = true;
      this.volume = 0;
    }
    return originalPlay.call(this);
  };

  // ==========================================
  // 4. MUTE/UNMUTE FUNCTIONS
  // ==========================================
  window.__vmkGenieAudio.mute = function() {
    window.__vmkGenieAudio.muted = true;

    // Mute via master gain nodes
    window.__vmkGenieAudio.masterGainNodes.forEach(gain => {
      try {
        gain.gain.setValueAtTime(0, gain.context.currentTime);
      } catch(e) {
        try { gain.gain.value = 0; } catch(e2) {}
      }
    });

    // Mute media elements
    window.__vmkGenieAudio.trackedMediaElements.forEach(el => {
      try { el.muted = true; el.volume = 0; } catch(e) {}
    });

    // Scan DOM
    document.querySelectorAll('audio, video').forEach(el => {
      try { el.muted = true; el.volume = 0; } catch(e) {}
    });

    console.log('MyVMK Genie: MUTED - gains:', window.__vmkGenieAudio.masterGainNodes.length,
                'contexts:', window.__vmkGenieAudio.trackedContexts.length,
                'media:', window.__vmkGenieAudio.trackedMediaElements.length);
  };

  window.__vmkGenieAudio.unmute = function() {
    window.__vmkGenieAudio.muted = false;

    window.__vmkGenieAudio.masterGainNodes.forEach(gain => {
      try {
        gain.gain.setValueAtTime(1, gain.context.currentTime);
      } catch(e) {
        try { gain.gain.value = 1; } catch(e2) {}
      }
    });

    window.__vmkGenieAudio.trackedMediaElements.forEach(el => {
      try { el.muted = false; el.volume = 1; } catch(e) {}
    });

    document.querySelectorAll('audio, video').forEach(el => {
      try { el.muted = false; el.volume = 1; } catch(e) {}
    });

    console.log('MyVMK Genie: UNMUTED - gains:', window.__vmkGenieAudio.masterGainNodes.length,
                'contexts:', window.__vmkGenieAudio.trackedContexts.length,
                'media:', window.__vmkGenieAudio.trackedMediaElements.length);
  };

  // Listen for mute/unmute commands from content script
  window.addEventListener('vmkgenie-mute', function() {
    console.log('MyVMK Genie: Received mute command');
    window.__vmkGenieAudio.mute();
  });

  window.addEventListener('vmkgenie-unmute', function() {
    console.log('MyVMK Genie: Received unmute command');
    window.__vmkGenieAudio.unmute();
  });

  console.log('MyVMK Genie: Audio interceptor READY in page context!');
})();
