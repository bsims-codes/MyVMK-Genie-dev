// MyVMK Genie - Audio Interceptor (runs in PAGE context)
// This file is loaded directly as a web_accessible_resource

(function() {
  'use strict';

  // Store image replacement config
  window.__vmkGenieImageReplace = {
    enabled: false,
    targetPattern: null,  // URL pattern to match
    replacementUrl: null  // URL to replace with
  };

  // ==========================================
  // INTERCEPT Image() constructor for image replacement
  // ==========================================
  const OriginalImage = window.Image;

  // Image URL sniffer (toggled by content script via CustomEvent).
  // Deduplicates by URL "pattern" — last numeric segment collapsed to <N> —
  // so we see one log line per URL family (e.g. inventory icons keyed by id).
  window.__vmkGenieImageSniffer = {
    enabled: false,
    seenUrls: new Set(),
    seenPatterns: new Map() // pattern -> { count, sample }
  };
  function patternForUrl(u) {
    if (typeof u !== 'string') return null;
    return u
      .replace(/[?#].*$/, '')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      .replace(/\/\d+(\.\w+)$/, '/<N>$1')
      .replace(/=\d+(&|$)/g, '=<N>$1');
  }
  function maybeLogUrl(value, source) {
    const s = window.__vmkGenieImageSniffer;
    if (!s || !s.enabled) return;
    if (typeof value !== 'string' || !value) return;
    // Skip blob:/data: URLs — already-resolved in-memory references; the
    // upstream fetch is what we actually want.
    if (value.startsWith('blob:') || value.startsWith('data:')) return;
    if (s.seenUrls.has(value)) return;
    s.seenUrls.add(value);
    const pattern = patternForUrl(value) || value;
    const ent = s.seenPatterns.get(pattern);
    if (ent) {
      ent.count++;
    } else {
      s.seenPatterns.set(pattern, { count: 1, sample: value, source: source });
      console.log('%c[Genie image-sniffer] %s pattern:', 'color:#a78bfa', source, pattern, '\n  e.g.', value);
    }
  }
  function maybeLogImageSrc(value) { maybeLogUrl(value, 'IMG'); }
  window.addEventListener('vmkgenie-image-sniffer-on', () => {
    window.__vmkGenieImageSniffer.enabled = true;
    console.log('[Genie image-sniffer] ENABLED — load the in-game inventory and walk around. Run window.__vmkGenieImageSniffer.seenPatterns to dump.');
  });
  window.addEventListener('vmkgenie-image-sniffer-off', () => {
    window.__vmkGenieImageSniffer.enabled = false;
    console.log('[Genie image-sniffer] DISABLED.', window.__vmkGenieImageSniffer.seenPatterns.size, 'patterns recorded.');
  });

  window.Image = function(width, height) {
    const img = new OriginalImage(width, height);

    // Override the src setter to intercept image loads
    const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    let _src = '';

    Object.defineProperty(img, 'src', {
      get: function() {
        return _src;
      },
      set: function(value) {
        maybeLogImageSrc(value);
        if (window.__vmkGenieImageReplace.enabled &&
            window.__vmkGenieImageReplace.targetPattern &&
            window.__vmkGenieImageReplace.replacementUrl &&
            value && value.includes(window.__vmkGenieImageReplace.targetPattern)) {
          console.log('[VMK Genie] Intercepting Image src:', value, '-> replacing with:', window.__vmkGenieImageReplace.replacementUrl);
          _src = window.__vmkGenieImageReplace.replacementUrl;
          originalSrcDescriptor.set.call(this, window.__vmkGenieImageReplace.replacementUrl);
        } else {
          _src = value;
          originalSrcDescriptor.set.call(this, value);
        }
      },
      configurable: true
    });

    return img;
  };
  window.Image.prototype = OriginalImage.prototype;

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
    const AudioContextWrapper = function(...args) {
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
  }

  // ==========================================
  // 2. INTERCEPT Audio constructor
  // ==========================================
  const OriginalAudio = window.Audio;
  if (OriginalAudio) {
    window.Audio = function(src) {
      const audio = new OriginalAudio(src);
      window.__vmkGenieAudio.trackedMediaElements.push(audio);

      // Broadcast the audio URL for room detection
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
  // 4. INTERCEPT fetch() for audio files AND image replacement
  // ==========================================
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    const urlStr = typeof url === 'string' ? url : (url && url.url ? url.url : String(url));

    maybeLogUrl(urlStr, 'FETCH');

    // IMAGE REPLACEMENT: If enabled and URL matches target pattern, redirect to replacement
    if (window.__vmkGenieImageReplace.enabled &&
        window.__vmkGenieImageReplace.targetPattern &&
        window.__vmkGenieImageReplace.replacementUrl &&
        urlStr.includes(window.__vmkGenieImageReplace.targetPattern)) {
      console.log('[VMK Genie] Intercepting image:', urlStr, '-> replacing with:', window.__vmkGenieImageReplace.replacementUrl);
      return originalFetch.call(this, window.__vmkGenieImageReplace.replacementUrl, options);
    }

    // Broadcast audio file fetches for room detection
    if (urlStr && urlStr.match(/\.(mp3|ogg|wav|webm|m4a|aac)(\?|$)/i)) {
      window.postMessage({ type: 'vmkgenie-audio-detected', url: urlStr }, '*');
    }

    // Detect HM GAME stage data
    if (urlStr && urlStr.includes('/hm_stage_data/')) {
      window.postMessage({ type: 'vmkgenie-hm-game-entered' }, '*');
    }

    // Detect NPC sound files for room detection (backup)
    if (urlStr && urlStr.includes('/sound/npcs/')) {
      window.postMessage({ type: 'vmkgenie-npc-audio-detected', url: urlStr }, '*');
    }

    // Detect room_sound files for room detection (backup)
    if (urlStr && urlStr.includes('/room_sound/')) {
      window.postMessage({ type: 'vmkgenie-room-audio-detected', url: urlStr }, '*');
    }

    // Detect room JSON config files (e.g., vmk_inthesky.json, vmk_snd_inthesky.json)
    // Exclude non-room files like vmk_avatar_*, vmk_npc_*, etc.
    if (urlStr && urlStr.match(/vmk_(?:snd_)?(?!avatar_|npc_|item_|furniture_|pin_|badge_)[a-z_]+\.json$/i)) {
      window.postMessage({ type: 'vmkgenie-room-json-detected', url: urlStr }, '*');
    }

    return originalFetch.apply(this, arguments);
  };

  // ==========================================
  // 5. INTERCEPT XMLHttpRequest for audio files AND image replacement
  // ==========================================
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    let urlStr = String(url);

    maybeLogUrl(urlStr, 'XHR');

    // IMAGE REPLACEMENT: If enabled and URL matches target pattern, redirect to replacement
    if (window.__vmkGenieImageReplace.enabled &&
        window.__vmkGenieImageReplace.targetPattern &&
        window.__vmkGenieImageReplace.replacementUrl &&
        urlStr.includes(window.__vmkGenieImageReplace.targetPattern)) {
      console.log('[VMK Genie] Intercepting XHR image:', urlStr, '-> replacing with:', window.__vmkGenieImageReplace.replacementUrl);
      urlStr = window.__vmkGenieImageReplace.replacementUrl;
      url = urlStr;
    }

    // Broadcast audio file XHR for room detection
    if (urlStr && urlStr.match(/\.(mp3|ogg|wav|webm|m4a|aac)(\?|$)/i)) {
      window.postMessage({ type: 'vmkgenie-audio-detected', url: urlStr }, '*');
    }

    // Detect NPC sound files for room detection (backup)
    if (urlStr && urlStr.includes('/sound/npcs/')) {
      window.postMessage({ type: 'vmkgenie-npc-audio-detected', url: urlStr }, '*');
    }

    // Detect room_sound files for room detection (backup)
    if (urlStr && urlStr.includes('/room_sound/')) {
      window.postMessage({ type: 'vmkgenie-room-audio-detected', url: urlStr }, '*');
    }

    // Detect room JSON config files (e.g., vmk_inthesky.json, vmk_snd_inthesky.json)
    // Exclude non-room files like vmk_avatar_*, vmk_npc_*, etc.
    if (urlStr && urlStr.match(/vmk_(?:snd_)?(?!avatar_|npc_|item_|furniture_|pin_|badge_)[a-z_]+\.json$/i)) {
      window.postMessage({ type: 'vmkgenie-room-json-detected', url: urlStr }, '*');
    }

    // Detect HM GAME stage data
    if (urlStr && urlStr.includes('/hm_stage_data/')) {
      window.postMessage({ type: 'vmkgenie-hm-game-entered' }, '*');
    }

    return originalXHROpen.call(this, method, url, ...rest);
  };

  // ==========================================
  // 6. MUTE/UNMUTE FUNCTIONS
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
  };

  // Listen for mute/unmute commands from content script
  window.addEventListener('vmkgenie-mute', function() {
    window.__vmkGenieAudio.mute();
  });

  window.addEventListener('vmkgenie-unmute', function() {
    window.__vmkGenieAudio.unmute();
  });

  // ==========================================
  // 7. IMAGE REPLACEMENT COMMANDS
  // ==========================================
  // Listen for image replacement enable/disable from content script
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;

    if (event.data && event.data.type === 'vmkgenie-enable-image-replace') {
      window.__vmkGenieImageReplace.enabled = true;
      window.__vmkGenieImageReplace.targetPattern = event.data.targetPattern;
      window.__vmkGenieImageReplace.replacementUrl = event.data.replacementUrl;
      console.log('[VMK Genie] Image replacement enabled:', event.data.targetPattern, '->', event.data.replacementUrl);
    }

    if (event.data && event.data.type === 'vmkgenie-disable-image-replace') {
      window.__vmkGenieImageReplace.enabled = false;
      window.__vmkGenieImageReplace.targetPattern = null;
      window.__vmkGenieImageReplace.replacementUrl = null;
      console.log('[VMK Genie] Image replacement disabled');
    }
  });
})();
