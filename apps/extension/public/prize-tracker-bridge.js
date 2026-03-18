/**
 * Prize Tracker Bridge - Syncs localStorage with chrome.storage
 *
 * This script runs on bsims-codes.github.io (both direct visits and iframes)
 * to keep localStorage in sync with chrome.storage.local, enabling data
 * sharing between the extension and the standalone website.
 *
 * Architecture:
 * - Page script (injected): Intercepts localStorage changes, dispatches events
 * - Content script (this file): Listens for events, syncs with chrome.storage
 */

(function() {
  'use strict'

  // Check if chrome.storage is available
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    console.log('[Prize Tracker Bridge] chrome.storage not available, skipping')
    return
  }

  // Storage keys used by the prize tracker
  const STORAGE_KEYS = [
    'myvmk_prize_tracker_v1',  // Main data
    'myvmk_theme',             // Theme preference
    'myvmk_gallery_collapsed', // UI state
    'myvmk_bulk_session'       // Bulk session data
  ]

  const CHROME_STORAGE_PREFIX = 'prizeTracker_'
  let isInitialized = false
  let isSyncing = false

  // Note: Page script injection doesn't work on GitHub Pages due to CSP
  // We use polling instead to detect localStorage changes

  // Save a key to chrome.storage
  function saveToChromeStorage(key, value) {
    if (isSyncing) return

    const chromeKey = CHROME_STORAGE_PREFIX + key

    try {
      if (value !== null && value !== undefined) {
        chrome.storage.local.set({ [chromeKey]: value }, () => {
          if (chrome.runtime.lastError) {
            console.error('[Prize Tracker Bridge] Error saving:', chrome.runtime.lastError)
            return
          }
          console.log('[Prize Tracker Bridge] Saved to chrome.storage:', key, '(' + value.length + ' chars)')
        })
      } else {
        chrome.storage.local.remove(chromeKey, () => {
          if (chrome.runtime.lastError) {
            console.error('[Prize Tracker Bridge] Error removing:', chrome.runtime.lastError)
            return
          }
          console.log('[Prize Tracker Bridge] Removed from chrome.storage:', key)
        })
      }
    } catch (e) {
      console.error('[Prize Tracker Bridge] Exception saving:', e)
    }
  }

  // Save all keys to chrome.storage
  function saveAllToChromeStorage() {
    if (isSyncing) return

    const data = {}
    for (const key of STORAGE_KEYS) {
      const value = localStorage.getItem(key)
      if (value !== null) {
        data[CHROME_STORAGE_PREFIX + key] = value
      }
    }

    if (Object.keys(data).length > 0) {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error('[Prize Tracker Bridge] Error saving all:', chrome.runtime.lastError)
          return
        }
        console.log('[Prize Tracker Bridge] Saved all to chrome.storage')
      })
    }
  }

  // Load from chrome.storage into localStorage
  function loadFromChromeStorage(callback) {
    const keys = STORAGE_KEYS.map(k => CHROME_STORAGE_PREFIX + k)

    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        console.error('[Prize Tracker Bridge] Error loading:', chrome.runtime.lastError)
        if (callback) callback()
        return
      }

      isSyncing = true
      let loadedCount = 0

      for (const key of STORAGE_KEYS) {
        const chromeKey = CHROME_STORAGE_PREFIX + key
        if (result[chromeKey] !== undefined) {
          const chromeValue = result[chromeKey]
          const currentLocal = localStorage.getItem(key)

          if (chromeValue && chromeValue !== currentLocal) {
            localStorage.setItem(key, chromeValue)
            loadedCount++
            console.log('[Prize Tracker Bridge] Loaded:', key, '(' + chromeValue.length + ' chars)')
          }
        }
      }

      isSyncing = false

      // Notify the app that data was loaded
      if (loadedCount > 0) {
        window.dispatchEvent(new CustomEvent('prizeTrackerDataLoaded', {
          detail: { keysLoaded: loadedCount }
        }))
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'myvmk_prize_tracker_v1',
          newValue: localStorage.getItem('myvmk_prize_tracker_v1'),
          storageArea: localStorage
        }))
      }

      console.log('[Prize Tracker Bridge] Loaded', loadedCount, 'keys from chrome.storage')
      if (callback) callback()
    })
  }

  // Listen for chrome.storage changes (from other contexts)
  function setupChromeStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || isSyncing) return

      isSyncing = true

      for (const key of STORAGE_KEYS) {
        const chromeKey = CHROME_STORAGE_PREFIX + key
        if (changes[chromeKey]) {
          const newValue = changes[chromeKey].newValue
          if (newValue !== undefined) {
            localStorage.setItem(key, newValue)
            console.log('[Prize Tracker Bridge] Updated from chrome.storage:', key)

            window.dispatchEvent(new StorageEvent('storage', {
              key: key,
              newValue: newValue,
              storageArea: localStorage
            }))
          }
        }
      }

      isSyncing = false
    })
  }

  function isInIframe() {
    try {
      return window !== window.top
    } catch (e) {
      return true
    }
  }

  // Track last known values to detect changes via polling
  let lastKnownValues = {}

  // Poll for localStorage changes as a fallback
  function startPolling() {
    // Initialize with current values
    for (const key of STORAGE_KEYS) {
      lastKnownValues[key] = localStorage.getItem(key)
    }

    // Check every 1 second for changes
    setInterval(() => {
      if (isSyncing) return

      for (const key of STORAGE_KEYS) {
        const currentValue = localStorage.getItem(key)
        if (currentValue !== lastKnownValues[key]) {
          console.log('[Prize Tracker Bridge] Polling detected change:', key)
          lastKnownValues[key] = currentValue
          saveToChromeStorage(key, currentValue)
        }
      }
    }, 2000)
  }

  // Add a sync status indicator on main site
  function addSyncIndicator() {
    if (isInIframe()) return // Only on main site

    const indicator = document.createElement('div')
    indicator.id = 'prize-tracker-sync-indicator'
    indicator.innerHTML = `
      <button id="prize-tracker-sync-btn" title="Sync with extension">
        🔄 Sync
      </button>
    `
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
    `

    const style = document.createElement('style')
    style.textContent = `
      #prize-tracker-sync-btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 10px 16px;
        border-radius: 25px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        transition: all 0.3s ease;
      }
      #prize-tracker-sync-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
      }
      #prize-tracker-sync-btn.synced {
        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      }
    `

    const addToPage = () => {
      document.head.appendChild(style)
      document.body.appendChild(indicator)

      document.getElementById('prize-tracker-sync-btn').addEventListener('click', () => {
        const btn = document.getElementById('prize-tracker-sync-btn')
        btn.textContent = '⏳ Syncing...'

        saveAllToChromeStorage()

        setTimeout(() => {
          btn.textContent = '✓ Synced!'
          btn.classList.add('synced')
          setTimeout(() => {
            btn.textContent = '🔄 Sync'
            btn.classList.remove('synced')
          }, 2000)
        }, 500)
      })
    }

    if (document.body) {
      addToPage()
    } else {
      document.addEventListener('DOMContentLoaded', addToPage)
    }
  }

  function init() {
    if (isInitialized) return
    isInitialized = true

    const inIframe = isInIframe()
    console.log('[Prize Tracker Bridge] Initializing...', inIframe ? '(iframe)' : '(main site)')

    // Listen for chrome.storage changes (bidirectional sync)
    setupChromeStorageListener()

    // Poll localStorage for changes (CSP blocks page script injection on GitHub Pages)
    startPolling()

    // Add sync button on main site
    addSyncIndicator()

    // Load data from chrome.storage
    loadFromChromeStorage(() => {
      console.log('[Prize Tracker Bridge] Ready - bidirectional sync enabled')
    })
  }

  // Listen for manual save requests
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'PRIZE_TRACKER_SAVE') {
      console.log('[Prize Tracker Bridge] Manual save requested')
      saveAllToChromeStorage()
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'PRIZE_TRACKER_SAVED' }, '*')
      }
    }
  })

  // Run immediately
  init()

  // Also on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadFromChromeStorage()
    })
  }
})()
