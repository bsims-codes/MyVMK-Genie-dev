// MyVMK Genie - Content Script
// Injected into myvmk.com pages (including game client popup)

// DEV_MODE: Enables internal/testing features
// - true: Local development (includes test effects, internal features)
// - false: Production release (automatically set by build script)
const DEV_MODE = true

console.log('MyVMK Genie loaded on:', window.location.href)

// ============================================
// AUDIO CONTROL (uses audio-interceptor.js)
// Communicates via custom events since interceptor runs in page context
// ============================================
function muteAllAudioContexts() {
  // Dispatch event to page context where the interceptor runs
  window.dispatchEvent(new CustomEvent('vmkgenie-mute'))
  console.log('MyVMK Genie: Sent mute command to page')
}

function unmuteAllAudioContexts() {
  // Dispatch event to page context where the interceptor runs
  window.dispatchEvent(new CustomEvent('vmkgenie-unmute'))
  console.log('MyVMK Genie: Sent unmute command to page')
}
// ============================================

let currentRoom = null
let currentRoomId = null
let currentLand = null
let detectedAudioUrl = null
let audioRoomMappings = {} // Maps audio URL patterns to room IDs
let hasDetectedRoomThisSession = false // Track if we've detected a room via audio this session

// Find room info by matching audio URL
// Returns { id, land } object or null
function findRoomByAudio(audioUrl) {
  if (!audioUrl) return null

  // Special case: Haunted Mansion GAME (not lobby) - uses /sound/mansion/ path
  if (audioUrl.includes('/sound/mansion/')) {
    console.log('MyVMK Genie: Detected Haunted Mansion GAME audio')
    isInHMGame = true
    return { id: HAUNTED_MANSION_GAME_ID, land: 'New Orleans Square', isHMGame: true }
  }

  // Extract folder name from URL (e.g., "vmk_snd_pirates_lobby_II" from room_sound/vmk_snd_pirates_lobby_II/file.webm)
  const folderMatch = audioUrl.match(/room_sound\/([^\/]+)\//)
  const currentFolder = folderMatch ? folderMatch[1] : null

  // If we detect HM Lobby audio, we're no longer in the game
  if (currentFolder === 'vmk_snd_haunted_game_lobby') {
    isInHMGame = false
  }

  // Check built-in AUDIO_ROOM_MAP first (most reliable)
  if (currentFolder && typeof AUDIO_ROOM_MAP !== 'undefined' && AUDIO_ROOM_MAP[currentFolder]) {
    const entry = AUDIO_ROOM_MAP[currentFolder]
    // Handle both old format (just id) and new format ({ id, land })
    if (typeof entry === 'object') {
      return entry
    } else {
      return { id: entry, land: null }
    }
  }

  // Check user-created mappings
  if (Object.keys(audioRoomMappings).length > 0) {
    // Check for exact URL match
    if (audioRoomMappings[audioUrl]) {
      return { id: audioRoomMappings[audioUrl], land: null }
    }

    // Check for folder match in user mappings
    if (currentFolder) {
      for (const [pattern, roomId] of Object.entries(audioRoomMappings)) {
        const patternFolderMatch = pattern.match(/room_sound\/([^\/]+)\//)
        if (patternFolderMatch && patternFolderMatch[1] === currentFolder) {
          return { id: roomId, land: null }
        }
      }
    }
  }

  return null
}

// Extract folder name from audio URL for display
function getAudioFolder(audioUrl) {
  if (!audioUrl) return null

  // Try room_sound folder pattern first (e.g., room_sound/vmk_snd_pirates_lobby_II/)
  const folderMatch = audioUrl.match(/room_sound\/([^\/]+)\//)
  if (folderMatch) return folderMatch[1]

  // Try sound/room pattern (e.g., sound/room/VMK-camera.webm) - show filename
  const fileMatch = audioUrl.match(/sound\/room\/([^\/]+)$/)
  if (fileMatch) return `sound/room: ${fileMatch[1]}`

  // Fallback: show last part of URL
  const parts = audioUrl.split('/')
  return parts[parts.length - 1] || null
}

// Get game canvas bounds for positioning overlays
// Excludes bottom toolbar (~85px) from overlay area
const GAME_TOOLBAR_HEIGHT = 0

function getGameCanvasBounds() {
  const gameCanvas = document.getElementById('canvas')
  if (gameCanvas) {
    const rect = gameCanvas.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height - GAME_TOOLBAR_HEIGHT,
      found: true
    }
  }
  // Fallback to full viewport if game canvas not found
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight - GAME_TOOLBAR_HEIGHT,
    found: false
  }
}

// Update all overlay canvases to match game canvas bounds
function updateOverlayBounds() {
  const bounds = getGameCanvasBounds()

  const overlays = [
    { canvas: rainCanvas, ctx: rainCtx },
    { canvas: snowCanvas, ctx: snowCtx },
    { canvas: fireworksCanvas, ctx: fireworksCtx },
    { canvas: moneyCanvas, ctx: moneyCtx },
    { canvas: emojiCanvas, ctx: emojiCtx },
    { canvas: fireflyCanvas, ctx: fireflyCtx }
  ]

  overlays.forEach(({ canvas, ctx }) => {
    if (canvas) {
      canvas.style.left = bounds.left + 'px'
      canvas.style.top = bounds.top + 'px'
      canvas.style.width = bounds.width + 'px'
      canvas.style.height = bounds.height + 'px'
      canvas.width = bounds.width
      canvas.height = bounds.height
    }
  })

  // Also update night overlay if enabled
  if (isNightOverlayEnabled) {
    updateNightOverlayBounds()
  }

  // Update fog overlay if active
  if (isFogActive && fogOverlay) {
    fogOverlay.style.left = bounds.left + 'px'
    fogOverlay.style.top = bounds.top + 'px'
    fogOverlay.style.width = bounds.width + 'px'
    fogOverlay.style.height = bounds.height + 'px'
  }

  // Update Kingdom Sync night overlay if active
  const ksNight = document.getElementById('vmkpal-kingdomsync-night')
  if (ksNight) {
    ksNight.style.left = bounds.left + 'px'
    ksNight.style.top = bounds.top + 'px'
    ksNight.style.width = bounds.width + 'px'
    ksNight.style.height = bounds.height + 'px'
  }

  // Update castle overlay if active
  if (isCastleOverlayActive && castleOverlay) {
    castleOverlay.style.left = bounds.left + 'px'
    castleOverlay.style.top = bounds.top + 'px'
    castleOverlay.style.width = bounds.width + 'px'
    castleOverlay.style.height = bounds.height + 'px'
  }

  // Update map button overlay position
  updateMapButtonOverlayPosition()
}

let currentAudio = null
let phrasesCache = {}
// Queue detection feature - commented out for future reference
// let lastQueuePosition = null
// let queueAlertThreshold = 5 // Alert when position is this or lower
let tesseractWorker = null
let isOcrReady = false
let ocrScanInterval = null
let mediaRecorder = null
let recordedChunks = []
let isRecording = false
let recordBtn = null
let currentStream = null
let isRainEnabled = false
let isStarsOverlayEnabled = false
let isNightOverlayEnabled = false
let isMoneyRainEnabled = false
let isFireworksEnabled = false
let isSnowEnabled = false
let isEmojiRainEnabled = false
let selectedEmoji = '🎉'
let activeShakeIntensity = null // null, 'light', 'medium', 'heavy'
let shakeAnimationId = null
let isPositionLocked = false
let isSmallIconEnabled = false
let customBackgroundColor = null // null means use default image
let isPinkTheme = false // Theme toggle: false = blue, true = pink
let isDarkTheme = false // Dark theme toggle
let unlockedThemes = [] // Themes unlocked by attending events: ['dark']
let isTestModeEnabled = false // Show and trigger test events (admin only)
let tickerIntervalId = null // Track ticker interval to prevent duplicates
let manuallyDisabledEffects = new Set() // Track effects user manually disabled during an event
let isCastleTestOverlayEnabled = false // DEV_MODE: Test fixed position overlay

// Rain effect (canvas-based like The Swan game)
let rainDrops = []
let rainAnimationId = null
let rainCanvas = null
let rainCtx = null
let lastRainTime = 0
const RAIN_DROP_COUNT = 150
const RAIN_SPEED_MIN = 400
const RAIN_SPEED_MAX = 700
const RAIN_LENGTH_MIN = 15
const RAIN_LENGTH_MAX = 30
const RAIN_OPACITY = 0.3

// Money rain effect
let moneyDrops = []
let moneyAnimationId = null
let moneyCanvas = null
let moneyCtx = null
let lastMoneyTime = 0
const MONEY_DROP_COUNT = 40
const MONEY_SPEED_MIN = 150
const MONEY_SPEED_MAX = 300
const MONEY_SYMBOLS = ['💵', '💰', '💲', '🤑', '💸']
const MONEY_SIZES = [20, 24, 28, 32]

// Fireworks effect - Enhanced visuals
let fireworksCanvas = null
let fireworksCtx = null
let fireworksAnimationId = null
let rockets = []
let particles = []
let lastFireworkTime = 0
let nextLaunchTime = 0
const FIREWORK_COLORS = [
  { core: '255,220,150', mid: '255,180,80', outer: '255,140,40' },   // Gold
  { core: '150,255,150', mid: '80,220,80', outer: '40,180,40' },     // Green
  { core: '255,150,150', mid: '255,80,80', outer: '200,40,40' },     // Red
  { core: '150,200,255', mid: '80,150,255', outer: '40,100,220' },   // Blue
  { core: '255,200,255', mid: '255,100,255', outer: '200,50,200' },  // Magenta
  { core: '255,255,200', mid: '255,255,100', outer: '220,220,50' },  // Yellow
  { core: '200,255,255', mid: '100,220,255', outer: '50,180,220' },  // Cyan
  { core: '255,255,255', mid: '220,220,255', outer: '180,180,220' }, // White/Silver
]
const PARTICLE_COUNT = 120
const GRAVITY = 50
const LAUNCH_INTERVAL_MIN = 800
const LAUNCH_INTERVAL_MAX = 1800
const EXPLOSION_TYPES = ['starburst', 'willow', 'peony', 'ring', 'crackle']

// Neon Rave effect (DEV_MODE only)
let raveCanvas = null
let raveCtx = null
let raveAnimationId = null
let isRaveEnabled = false
let raveStartTime = 0
const RAVE_COLORS = [
  '#ff00ff', // Magenta
  '#00ffff', // Cyan
  '#ff0080', // Hot pink
  '#80ff00', // Lime
  '#ff8000', // Orange
  '#0080ff', // Electric blue
  '#ffff00', // Yellow
  '#ff0000', // Red
]

// Choreography system for synced shows
let choreographyActive = false
let choreographyStartTime = 0
let choreographyData = null
let choreographyInterval = null
let fireworksIntensity = 1.0 // 0 = none, 1 = normal, 2+ = intense

// Spotlight effect
let spotlightCanvas = null
let spotlightCtx = null
let spotlightAnimationId = null
let spotlights = []
let isSpotlightsEnabled = false
let lastSpotlightTime = 0

// Snow effect
let snowflakes = []
let snowAnimationId = null
let snowCanvas = null
let snowCtx = null
let lastSnowTime = 0
const SNOWFLAKE_COUNT = 150
const SNOW_SPEED_MIN = 30
const SNOW_SPEED_MAX = 80

// Custom emoji rain effect
let emojiDrops = []
let emojiAnimationId = null
let emojiCanvas = null
let emojiCtx = null
let lastEmojiTime = 0
const EMOJI_DROP_COUNT = 35
const EMOJI_SPEED_MIN = 100
const EMOJI_SPEED_MAX = 200
const EMOJI_PRESETS = ['🎉', '❤️', '⭐', '🔥', '🎈', '🌸', '🍀', '🎃', '🐱', '🦋', '🌈', '🍕']

// Haunted Mansion ghost effect
let activeGhosts = []
let ghostSpawnInterval = null
let ghostAnimationId = null
let isGhostEffectActive = false
let isInHMGame = false // Track if player is in HM game (not lobby)
const HAUNTED_MANSION_LOBBY_ID = 1104
const HAUNTED_MANSION_GAME_ID = 1105 // Virtual ID for HM game (detected via hm_stage_data)
const GHOST_IMAGES = ['beadie-genie-1.png', 'beadie-genie-2.png']
const GHOST_GLOW_COLOR = '118, 241, 243' // #76f1f3 in RGB
const GHOST_MAX_COUNT = 1
const GHOST_SPAWN_INTERVAL = 4000 // ms between spawns
const GHOST_LIFETIME = 8000 // ms total lifetime

// Tinkerbell effect for Fantasyland Courtyard
let tinkerbellElement = null
let tinkerbellAnimationId = null
let isTinkerbellActive = false
let tinkerbellData = null
let tinkerbellEventMode = false // When true, limit to top 70% of canvas
let pixieDustParticles = [] // Pixie dust trail
const FANTASYLAND_COURTYARD_ID = 99
const TINKERBELL_IMAGE = 'Tinkerbelle_Only.gif'
const TINKERBELL_GLOW_COLOR = '255, 215, 0' // Gold sparkle

// Butterfly Effect for Snow White Forest
const SNOW_WHITE_FOREST_ID = 37
const BUTTERFLY_IMAGES = ['Butterfly1.gif', 'Butterfly2.gif', 'Butterfly3.gif']
let butterflyElements = []
let butterflyData = []
let isButterflyActive = false
let butterflyAnimationId = null
let butterflySpawnTimer = null

// Snow Effect for Matterhorn
const MATTERHORN_ID = 33
let matterhornSnowDisabledByUser = false // Track if user manually disabled snow in Matterhorn

// Kingdom Sync - enhanced ambient experience
let isKingdomSyncEnabled = false
let kingdomSyncFireflyRooms = new Map()  // Track which rooms got rare effect this session

// Firefly effect (Kingdom Sync)
let fireflyCanvas = null
let fireflyCtx = null
let fireflyAnimationId = null
let fireflies = []
let isFirefliesActive = false
const FIREFLY_COUNT = 25

// Fog effect (Kingdom Sync)
let fogOverlay = null
let isFogActive = false

// Subtle night (Kingdom Sync)
let isKingdomSyncNightActive = false

// Castle overlay (Kingdom Sync)
let castleOverlay = null
let isCastleOverlayActive = false

// Map button overlay - detects when user clicks globe icon
let mapButtonOverlay = null
let onMapButtonClick = null // Callback function when map is clicked
let isMapOpen = false // Track if map is currently open
let overlaysHiddenForMap = {} // Track which overlays were active before map opened

// Room IDs for Kingdom Sync effects
const KINGDOM_SYNC_ROOMS = {
  FRONTIERLAND_DOCK: 59,
  FRONTIERLAND_HUB: 58,
  MARK_TWAIN_STEAMBOAT: 68,
  AFRICA: [70, 299],
  PIXAR_PIER: 300,
  PIRATE_TREEHOUSE: 36,
  EXPLORERS_TENT: 9,
  CASTLE_GARDENS: 30
}

// Genie Events System - remote scheduled events via JSONBin.io
// >>> EDIT THESE TWO VALUES <<<
const GENIE_EVENTS_BIN_ID = '69b4de67aa77b81da9e28bfe'
const GENIE_EVENTS_MASTER_KEY = '$2a$10$86vN99ryuRY169Nhm96soeWQs01a0ACySyD0B6ysbxgE/f2rXu3Z2'
// >>> END EDIT <<<
const GENIE_EVENTS_URL = `https://api.jsonbin.io/v3/b/${GENIE_EVENTS_BIN_ID}/latest`
const GENIE_EVENTS_FETCH_INTERVAL = 5 * 60 * 1000 // Fetch every 5 minutes
let scheduledGenieEvents = []      // Admin events - can trigger overlays + audio
let scheduledCommunityEvents = []  // Player events - audio only
let roomCollectibles = []          // Clickable items in rooms that unlock themes
let activeCollectible = null       // Currently displayed collectible element
let customTickerText = ''          // Custom ticker text from admin panel
let customTickerIcon = ''          // Custom ticker icon URL from admin panel
let activeGenieEvent = null
let activeGenieEventRoomId = null  // Track which room the event effects are running in
let activeCommunityEvent = null
let notifiedUpcomingEvents = new Set() // Track events we've already shown "starting in 1 minute" for
let notifiedHourBeforeEvents = new Set() // Track events we've already shown "begins in 1 hour" for
let notifiedActiveEvents = new Set() // Track events we've already shown "starting/in progress" for
let cachedIcsEvents = [] // Cache ICS events for notifications
let activeCommunityEventRoomId = null
let genieEventCheckInterval = null

// Room detection - tries multiple methods to find current room
function detectRoom() {
  let roomName = null
  let roomSource = null

  // Method 1: Check page title (might contain room name)
  if (document.title) {
    const title = document.title.trim()
    // Ignore generic titles
    if (title && !title.match(/^MyVMK(\s*[-–—]\s*Game)?$/i)) {
      // Extract room name from title patterns like "MyVMK - Room Name"
      const titleMatch = title.match(/MyVMK\s*[-–—]\s*(.+)/i)
      if (titleMatch && titleMatch[1]) {
        roomName = titleMatch[1].trim()
        roomSource = 'title'
      }
    }
  }

  // Method 2: Look for room name in DOM elements
  if (!roomName) {
    const selectors = [
      '.room-name', '#room-name', '[data-room]',
      '.location-name', '#location', '.current-room',
      '.room-title', '#roomName', '.area-name'
    ]
    for (const selector of selectors) {
      const el = document.querySelector(selector)
      if (el && el.textContent.trim()) {
        roomName = el.textContent.trim()
        roomSource = 'dom'
        break
      }
    }
  }

  // Method 3: Check for any game state in window object
  if (!roomName && window.gameState?.room) {
    roomName = window.gameState.room
    roomSource = 'gameState'
  }

  // Method 4: Check localStorage/sessionStorage for room data
  if (!roomName) {
    try {
      const stored = sessionStorage.getItem('currentRoom') || localStorage.getItem('currentRoom')
      if (stored) {
        roomName = stored
        roomSource = 'storage'
      }
    } catch (e) {}
  }

  // Update if room changed
  if (roomName && roomName !== currentRoom) {
    const oldRoom = currentRoom
    currentRoom = roomName
    console.log(`MyVMK Genie: Room detected [${roomSource}]:`, currentRoom)
    onRoomChange(oldRoom, currentRoom)
  }

  return currentRoom
}

// Debug helper - runs automatically and logs info
function runDebug() {
  console.log('=== MyVMK Genie Debug Info ===')
  console.log('Page title:', document.title)
  console.log('Current detected room:', currentRoom)

  // Check sessionStorage
  console.log('SessionStorage:')
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    console.log(`  ${key}:`, sessionStorage.getItem(key))
  }

  // Check localStorage
  console.log('LocalStorage:')
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    const value = localStorage.getItem(key)
    console.log(`  ${key}:`, value?.substring(0, 200))
  }

  // Look for any visible text elements - log each one clearly
  console.log('=== All Text Elements ===')
  const textElements = document.querySelectorAll('div, span, p, h1, h2, h3, label, a, button')
  let textIndex = 0
  textElements.forEach(el => {
    const text = el.textContent?.trim()
    // Only elements with direct text content (no children or only text children)
    if (text && text.length < 100 && text.length > 1) {
      const hasOnlyText = el.children.length === 0 ||
        (el.children.length > 0 && el.innerText === text)
      if (hasOnlyText || el.children.length === 0) {
        console.log(`  [${textIndex}] <${el.tagName.toLowerCase()}${el.id ? '#'+el.id : ''}${el.className ? '.'+el.className.split(' ')[0] : ''}>: "${text}"`)
        textIndex++
      }
    }
  })

  // Check for canvas elements
  const canvases = document.querySelectorAll('canvas')
  console.log('Canvas elements:', canvases.length)
  canvases.forEach((c, i) => {
    const rect = c.getBoundingClientRect()
    console.log(`  Canvas ${i}: internal=${c.width}x${c.height}, rendered=${Math.round(rect.width)}x${Math.round(rect.height)}, position=(${Math.round(rect.left)},${Math.round(rect.top)}), id=${c.id || 'none'}`)
  })

  // Check for any game-related global variables
  console.log('=== Checking window variables ===')
  const gameVars = ['game', 'gameState', 'vmk', 'VMK', 'room', 'currentRoom', 'player', 'client']
  gameVars.forEach(v => {
    if (window[v] !== undefined) {
      console.log(`  window.${v}:`, window[v])
    }
  })

  // Check for iframes
  const iframes = document.querySelectorAll('iframe')
  console.log('Iframes found:', iframes.length)
  iframes.forEach((f, i) => console.log(`  iframe ${i}:`, f.src || '(no src)'))

  // Queue detection logging - commented out for future reference
  // console.log('=== Queue Detection ===')
  // const queueKeywords = ['queue', 'vmk pass', 'number', 'waiting', 'position']
  // document.querySelectorAll('*').forEach(el => {
  //   const text = el.textContent?.toLowerCase() || ''
  //   if (queueKeywords.some(k => text.includes(k)) && el.children.length === 0) {
  //     console.log('  Queue-related element:', el.tagName, el.className, `"${el.textContent?.trim()}"`)
  //   }
  // })
}

// Queue monitoring - commented out for future reference
// function startQueueMonitor() {
//   console.log('MyVMK Genie: Queue monitor active')
//
//   // Watch for DOM changes that might be queue-related (fallback)
//   const queueObserver = new MutationObserver((mutations) => {
//     checkForQueueInfo()
//   })
//
//   queueObserver.observe(document.body, {
//     childList: true,
//     subtree: true,
//     characterData: true
//   })
// }

// Initialize Tesseract OCR (bundled with extension to bypass CSP)
async function initOCR() {
  if (isOcrReady) return true

  try {
    if (typeof Tesseract === 'undefined') {
      console.error('MyVMK Genie: Tesseract not loaded')
      return false
    }

    console.log('MyVMK Genie: Initializing OCR worker...')
    tesseractWorker = await Tesseract.createWorker('eng')
    isOcrReady = true
    console.log('MyVMK Genie: OCR ready!')
    return true
  } catch (err) {
    console.error('MyVMK Genie: Failed to initialize OCR:', err)
    return false
  }
}

// Capture the screen via background script (avoids tainted canvas issues)
async function captureScreen() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_FOR_OCR' })
    if (response && response.success && response.dataUrl) {
      console.log('MyVMK Genie: Screen captured for OCR')
      return response.dataUrl
    } else {
      console.error('MyVMK Genie: Capture failed:', response?.error)
      return null
    }
  } catch (err) {
    console.error('MyVMK Genie: Failed to capture screen:', err)
    return null
  }
}

// Legacy function - kept for compatibility but now uses captureScreen
function captureCanvas() {
  // This function is now async and returns a promise via captureScreen
  // Keeping for any code that might reference it
  console.log('MyVMK Genie: captureCanvas called - use captureScreen instead')
  return null
}

// Scan canvas for queue information using OCR - commented out for future reference
// async function scanForQueue() {
//   // Capture screen via background script (avoids tainted canvas)
//   const imageData = await captureScreen()
//   if (!imageData) {
//     showNotification('Could not capture game screen', 'error')
//     return null
//   }
//
//   // Initialize OCR if needed
//   if (!isOcrReady) {
//     showNotification('Starting OCR engine...', 'info')
//     const ready = await initOCR()
//     if (!ready) {
//       showNotification('OCR failed to initialize', 'error')
//       return null
//     }
//   }
//
//   try {
//     console.log('MyVMK Genie: Scanning for queue...')
//
//     const result = await tesseractWorker.recognize(imageData)
//     const text = result.data.text
//     console.log('MyVMK Genie: OCR result:', text)
//
//     // Look for queue patterns
//     const patterns = [
//       /you are number\s*(\d+)/i,
//       /number\s*(\d+)\s*in queue/i,
//       /number\s+(\d+)/i,
//       /are number\s*(\d+)/i
//     ]
//
//     for (const pattern of patterns) {
//       const match = text.match(pattern)
//       if (match && match[1]) {
//         const position = parseInt(match[1])
//         if (position > 0 && position < 1000) {
//           console.log('MyVMK Genie: Queue position found:', position)
//           handleQueuePosition(position)
//           return position
//         }
//       }
//     }
//
//     // Check if VMK Pass popup might be visible
//     if (text.toLowerCase().includes('vmk') || text.toLowerCase().includes('queue') || text.toLowerCase().includes('pass')) {
//       console.log('MyVMK Genie: Queue popup may be visible but number not detected')
//     }
//
//     return null
//   } catch (err) {
//     console.error('MyVMK Genie: OCR scan failed:', err)
//     return null
//   }
// }

// Start automatic queue scanning - commented out for future reference
// function startAutoScan(intervalMs = 5000) {
//   stopAutoScan() // Clear any existing interval
//
//   console.log('MyVMK Genie: Starting auto-scan every', intervalMs, 'ms')
//   showNotification('Auto-scanning started', 'success')
//
//   // Initial scan
//   scanForQueue()
//
//   ocrScanInterval = setInterval(async () => {
//     const position = await scanForQueue()
//     if (position !== null) {
//       console.log('MyVMK Genie: Auto-scan found position:', position)
//     }
//   }, intervalMs)
// }

// Stop automatic queue scanning - commented out for future reference
// function stopAutoScan() {
//   if (ocrScanInterval) {
//     clearInterval(ocrScanInterval)
//     ocrScanInterval = null
//     console.log('MyVMK Genie: Auto-scan stopped')
//   }
// }


// Check DOM for queue information - commented out for future reference
// function checkForQueueInfo() {
//   // Look for elements containing queue position
//   // Pattern: "You are number X in queue" or similar
//   const allText = document.body.innerText || ''
//
//   // Try to find queue position pattern
//   const queuePatterns = [
//     /you are number\s*(\d+)\s*in queue/i,
//     /position[:\s]*(\d+)/i,
//     /queue[:\s]*#?(\d+)/i,
//     /number\s*(\d+)\s*in\s*(queue|line)/i
//   ]
//
//   for (const pattern of queuePatterns) {
//     const match = allText.match(pattern)
//     if (match && match[1]) {
//       const position = parseInt(match[1])
//       handleQueuePosition(position)
//       return
//     }
//   }
//
//   // Also look for specific elements
//   document.querySelectorAll('*').forEach(el => {
//     if (el.children.length > 0) return // Only leaf elements
//
//     const text = el.textContent?.trim() || ''
//     // Look for just a number in a small element (might be the queue number)
//     if (/^\d{1,3}$/.test(text)) {
//       const parent = el.parentElement
//       const parentText = parent?.textContent?.toLowerCase() || ''
//       if (parentText.includes('queue') || parentText.includes('number')) {
//         const position = parseInt(text)
//         handleQueuePosition(position)
//       }
//     }
//   })
// }

// Handle detected queue position - commented out for future reference
// function handleQueuePosition(position) {
//   if (position === lastQueuePosition) return // No change
//
//   console.log('MyVMK Genie: Queue position detected:', position)
//   lastQueuePosition = position
//
//   // Update queue display if we have one
//   updateQueueDisplay(position)
//
//   // Check if we should alert
//   chrome.storage.local.get(['queueAlertThreshold', 'queueAlertsEnabled'], (result) => {
//     const threshold = result.queueAlertThreshold || 5
//     const enabled = result.queueAlertsEnabled !== false // Default to enabled
//
//     if (enabled && position <= threshold && position > 0) {
//       // Alert the user!
//       showQueueAlert(position)
//     }
//   })
// }

// Show queue alert - commented out for future reference
// function showQueueAlert(position) {
//   // Visual notification
//   showNotification(`🎫 Queue position: ${position} - Get ready!`, 'success')
//
//   // Play alert sound
//   playQueueAlertSound()
//
//   // Flash the title
//   flashTitle(`[${position}] Queue Alert!`)
// }

// Play queue alert sound - commented out for future reference
// function playQueueAlertSound() {
//   try {
//     // Create a simple beep sound
//     const audioContext = new (window.AudioContext || window.webkitAudioContext)()
//     const oscillator = audioContext.createOscillator()
//     const gainNode = audioContext.createGain()
//
//     oscillator.connect(gainNode)
//     gainNode.connect(audioContext.destination)
//
//     oscillator.frequency.value = 800
//     oscillator.type = 'sine'
//     gainNode.gain.value = 0.3
//
//     oscillator.start()
//     oscillator.stop(audioContext.currentTime + 0.2)
//
//     // Second beep
//     setTimeout(() => {
//       const osc2 = audioContext.createOscillator()
//       osc2.connect(gainNode)
//       osc2.frequency.value = 1000
//       osc2.type = 'sine'
//       osc2.start()
//       osc2.stop(audioContext.currentTime + 0.2)
//     }, 250)
//   } catch (e) {
//     console.log('MyVMK Genie: Could not play alert sound')
//   }
// }

// Flash the page title
function flashTitle(alertText) {
  const originalTitle = document.title
  let isAlert = true
  let flashes = 0

  const flashInterval = setInterval(() => {
    document.title = isAlert ? alertText : originalTitle
    isAlert = !isAlert
    flashes++

    if (flashes >= 10) {
      clearInterval(flashInterval)
      document.title = originalTitle
    }
  }, 500)
}

// Update queue display in toolbar - commented out for future reference
// function updateQueueDisplay(position) {
//   const display = document.getElementById('vmkpal-queue-display')
//   if (display) {
//     display.textContent = `#${position}`
//     display.style.display = 'inline'
//   }
// }

// Called when room changes
function onRoomChange(oldRoom, newRoom) {
  // Update room display in toolbar
  updateRoomDisplay()

  // Check room-specific ambient effects (Tinkerbell, butterflies, ghost, snow)
  // These functions check currentRoomId and start/stop effects as needed
  checkRoomAmbientEffects()

  // Auto-play room audio if configured
  chrome.storage.local.get(['roomAudio'], (result) => {
    const roomAudioMap = result.roomAudio || {}
    const audioUrl = roomAudioMap[newRoom]
    if (audioUrl) {
      console.log('MyVMK Genie: Playing room audio for', newRoom)
      playAudio(audioUrl)
    } else if (oldRoom && roomAudioMap[oldRoom]) {
      // Stop audio when leaving a room with custom audio
      stopAudio()
    }
  })
}

// Check all room-specific ambient effects and start/stop as needed
function checkRoomAmbientEffects() {
  // Small delay to ensure currentRoomId is updated
  setTimeout(() => {
    // If map was open, restore overlays now that we're in a room
    if (isMapOpen) {
      restoreOverlaysAfterMap()
    }

    checkGhostEffectRoom()
    checkTinkerbellRoom()
    checkButterflyRoom()
    checkMatterhornRoom()
    checkRoomCollectibles()
    checkKingdomSyncEffects()
    checkCastleGardensRoom()
  }, 100)
}

// Periodic watcher to ensure ambient effects match current room
// This serves as a safety net in case room changes are missed
let ambientEffectWatcherInterval = null
function startAmbientEffectWatcher() {
  // Check every 5 seconds as a backup
  ambientEffectWatcherInterval = setInterval(() => {
    checkGhostEffectRoom()
    checkTinkerbellRoom()
    checkButterflyRoom()
    checkMatterhornRoom()
    checkRoomCollectibles()
    checkKingdomSyncEffects()
    checkCastleGardensRoom()
  }, 5000)
}

// Update room display in the toolbar
function updateRoomDisplay() {
  const roomDisplay = document.getElementById('vmkpal-room-display')
  if (roomDisplay) {
    roomDisplay.textContent = currentRoom || 'Unknown'
  }
}

// Watch for room changes and load saved room
function startRoomWatcher() {
  // Load saved room from storage
  chrome.storage.local.get(['currentRoom', 'currentRoomId'], (result) => {
    if (result.currentRoom) {
      currentRoom = result.currentRoom
      currentRoomId = result.currentRoomId
      updateRoomDisplay()
      console.log('MyVMK Genie: Loaded saved room:', currentRoom)
    }
  })

  // Watch for title changes (in case game updates title with room name)
  const titleObserver = new MutationObserver(() => {
    detectRoom()
  })
  const titleEl = document.querySelector('title')
  if (titleEl) {
    titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true })
  }

  // Monitor network requests for NPC sound files (contains room info!)
  monitorNetworkForRooms()
}

// NPC folder name to Room mapping
const NPC_ROOM_MAP = {
  'vmk_npc_emporium': { id: 43, name: 'Emporium' },
  'vmk_npc_shrunken_neds_shop': { id: 16, name: "Shrunken Ned's Shop" },
  'vmk_npc_matterhorn': { id: 33, name: 'Matterhorn' },
  'vmk_npc_jungle_cruise': { id: 11, name: 'Jungle Cruise Dock' },
  'vmk_npc_haunted_mansion': { id: 12, name: 'Haunted Mansion Conservatory' },
  'vmk_npc_pirates': { id: 1001, name: 'Pirates of the Caribbean Game Lobby' },
  'vmk_npc_tiki_room': { id: 1, name: 'Tiki Tiki Tiki Room' },
  'vmk_npc_penny_arcade': { id: 140, name: 'Penny Arcade' },
  'vmk_npc_magic_shop': { id: 1108, name: 'Main Street Magic Shop' },
  'vmk_npc_inner_space': { id: 45, name: 'Inner-Space Shop' },
  'vmk_npc_small_world': { id: 38, name: "\"it's a small world\" Imports" },
  'vmk_npc_frontierland': { id: 58, name: 'Frontierland Hub' },
  'vmk_npc_splash_mountain': { id: 49, name: 'Splash Mountain' },
  'vmk_npc_thunder_mountain': { id: 61, name: 'Big Thunder Mountain' },
  'vmk_npc_space_mountain': { id: 73, name: 'Space Mountain Quest Deck' },
  'vmk_npc_tomorrowland': { id: 47, name: 'Tomorrowland Hub' },
  'vmk_npc_fantasyland': { id: 99, name: 'Fantasyland Courtyard' },
  'vmk_npc_adventureland': { id: 5, name: 'Adventureland Bazaar' },
  'vmk_npc_new_orleans': { id: 95, name: 'New Orleans Square' },
  'vmk_npc_main_street': { id: 4, name: 'Main Street' },
  'vmk_npc_castle': { id: 35, name: 'Castle Forecourt' },
  'vmk_npc_esplanade': { id: 48, name: 'VMK Esplanade' },
  'vmk_npc_central_plaza': { id: 2, name: 'Central Plaza' },
  'vmk_npc_town_square': { id: 3, name: 'Town Square' },
}

// Monitor network requests using PerformanceObserver
function monitorNetworkForRooms() {
  // Use PerformanceObserver to watch for resource loads
  if (typeof PerformanceObserver !== 'undefined') {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Detect HM GAME by stage data JSON files
        if (entry.name.includes('/hm_stage_data/')) {
          hasDetectedRoomThisSession = true
          isInHMGame = true
          currentRoomId = HAUNTED_MANSION_GAME_ID
          currentRoom = ROOM_MAP[HAUNTED_MANSION_GAME_ID] || 'Haunted Mansion Game'
          currentLand = 'New Orleans Square'
          updateRoomInfoDisplay()
          checkGhostEffectRoom()
          checkTinkerbellRoom()
          checkButterflyRoom()
          checkMatterhornRoom()
          checkGenieEvents()
        }

        // Check if it's an NPC sound file request
        if (entry.name.includes('download.myvmk.com/sound/npcs/')) {
          const match = entry.name.match(/\/npcs\/([^\/]+)\//)
          if (match && match[1]) {
            const npcFolder = match[1]
            console.log('MyVMK Genie: Detected NPC folder:', npcFolder)

            // Check our mapping
            if (NPC_ROOM_MAP[npcFolder]) {
              const roomInfo = NPC_ROOM_MAP[npcFolder]
              setRoomFromNetwork(roomInfo.id, roomInfo.name)
            } else {
              // Try to parse room name from folder name
              const parsedName = parseRoomFromNpcFolder(npcFolder)
              if (parsedName) {
                console.log('MyVMK Genie: Parsed room from NPC folder:', parsedName)
                setRoomFromNetwork(null, parsedName)
              }
            }
          }
        }

        // Check for room audio files (room_sound folder, sound/room folder, or sound/mansion for HM game)
        if (entry.name.includes('download.myvmk.com') &&
            (entry.name.includes('/room_sound/') || entry.name.includes('/sound/room/') || entry.name.includes('/sound/mansion/'))) {
          detectedAudioUrl = entry.name
          console.log('MyVMK Genie: Detected room audio:', entry.name)

          // Extract folder name for room matching (e.g., vmk_snd_pirates_lobby_II)
          const folderMatch = entry.name.match(/room_sound\/([^\/]+)\//)
          if (folderMatch) {
            console.log('MyVMK Genie: Audio folder:', folderMatch[1])
          }

          // Check if this audio matches a known room
          const matchedRoom = findRoomByAudio(entry.name)
          if (matchedRoom !== null) {
            hasDetectedRoomThisSession = true
            currentRoomId = matchedRoom.id
            currentRoom = ROOM_MAP[matchedRoom.id] || `Room ${matchedRoom.id}`
            currentLand = matchedRoom.land
            console.log('MyVMK Genie: Auto-detected room from audio:', currentRoom, currentLand ? `(${currentLand})` : '')
            updateRoomInfoDisplay()
            checkGhostEffectRoom() // Check if ghost effect should change
            checkTinkerbellRoom()
          checkButterflyRoom()
          checkMatterhornRoom()
            checkGenieEvents()
          }
        }

        // Check for room JSON config files (e.g., vmk_inthesky.json, vmk_snd_inthesky.json)
        // Exclude non-room files like vmk_avatar_*, vmk_npc_*, etc.
        if (entry.name.includes('download.myvmk.com') && entry.name.match(/vmk_(?:snd_)?(?!avatar_|npc_|item_|furniture_|pin_|badge_)([a-z_]+)\.json$/i)) {
          const jsonMatch = entry.name.match(/vmk_(?:snd_)?(?!avatar_|npc_|item_|furniture_|pin_|badge_)([a-z_]+)\.json$/i)
          if (jsonMatch && jsonMatch[1]) {
            const roomKey = jsonMatch[1]
            console.log('MyVMK Genie: Detected room JSON:', roomKey)

            // Try to find matching room in AUDIO_ROOM_MAP
            const sndKey = `vmk_snd_${roomKey}`
            if (typeof AUDIO_ROOM_MAP !== 'undefined' && AUDIO_ROOM_MAP[sndKey]) {
              const roomInfo = AUDIO_ROOM_MAP[sndKey]
              if (roomInfo.id !== currentRoomId) {
                hasDetectedRoomThisSession = true
                currentRoomId = roomInfo.id
                currentRoom = ROOM_MAP[roomInfo.id] || `Room ${roomInfo.id}`
                currentLand = roomInfo.land
                console.log('MyVMK Genie: Auto-detected room from JSON:', currentRoom, currentLand ? `(${currentLand})` : '')
                updateRoomInfoDisplay()
                checkGhostEffectRoom()
                checkTinkerbellRoom()
                checkButterflyRoom()
                checkMatterhornRoom()
                checkGenieEvents()
              }
            }
          }
        }

        // Also check for room background/asset files
        if (entry.name.includes('download.myvmk.com')) {
          // Log all myvmk downloads for analysis
          if (entry.name.includes('/room') || entry.name.includes('/bg') || entry.name.includes('/map')) {
            console.log('MyVMK Genie: Game resource:', entry.name)
          }

          // Check for room background patterns like /rooms/roomname/ or /backgrounds/roomname/
          const roomPatterns = [
            /\/rooms\/([^\/]+)\//,
            /\/backgrounds\/([^\/]+)\//,
            /\/maps\/([^\/]+)\//,
            /\/room_(\d+)\//,
            /\/room(\d+)\//
          ]

          for (const pattern of roomPatterns) {
            const match = entry.name.match(pattern)
            if (match && match[1]) {
              console.log('MyVMK Genie: Found room pattern:', match[1], 'in', entry.name)
              // If it's a number, look up in room map
              const id = parseInt(match[1])
              if (!isNaN(id) && ROOM_MAP[id]) {
                setRoomFromNetwork(id, ROOM_MAP[id])
              }
            }
          }
        }
      }
    })

    try {
      observer.observe({ entryTypes: ['resource'] })
      console.log('MyVMK Genie: Network monitoring active for room detection')
    } catch (e) {
      console.log('MyVMK Genie: Could not start network monitoring:', e)
    }
  }
}

// Parse room name from NPC folder name (e.g., vmk_npc_shrunken_neds_shop -> Shrunken Ned's Shop)
function parseRoomFromNpcFolder(folder) {
  // Remove vmk_npc_ prefix
  let name = folder.replace(/^vmk_npc_/, '')

  // Replace underscores with spaces
  name = name.replace(/_/g, ' ')

  // Capitalize each word
  name = name.replace(/\b\w/g, c => c.toUpperCase())

  // Fix common patterns
  name = name.replace(/Neds/g, "Ned's")
  name = name.replace(/Its A/g, "it's a")

  return name
}

// Set room from network detection
function setRoomFromNetwork(roomId, roomName) {
  if (roomName === currentRoom) return // No change

  const oldRoom = currentRoom
  currentRoom = roomName
  currentRoomId = roomId

  console.log('MyVMK Genie: Room auto-detected:', roomName)

  // Update display
  updateRoomDisplay()

  // Update the dropdown if it exists
  const select = document.getElementById('vmkpal-room-select')
  if (select && roomId) {
    select.value = roomId
  }

  // Save to storage
  chrome.storage.local.set({
    currentRoom: roomName,
    currentRoomId: roomId
  })

  // Trigger room change handler
  onRoomChange(oldRoom, currentRoom)
}

// Load phrases from local storage
function loadPhrases() {
  try {
    chrome.storage.local.get(['phrases'], (result) => {
      if (chrome.runtime.lastError) {
        console.log('MyVMK Genie: Extension reloaded, please refresh page')
        return
      }
      phrasesCache = result.phrases || {}
      console.log('Phrases loaded:', phrasesCache)
    })
  } catch (e) {
    console.log('MyVMK Genie: Extension reloaded, please refresh page')
  }
}

// Detect Mac for keyboard shortcuts (Mac uses Ctrl, Windows/Linux uses Alt)
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
const modifierKey = isMac ? 'Ctrl' : 'Alt'

// Listen for keyboard shortcuts (Alt/Ctrl + 1-0 for phrases)
// Use capture phase to catch events before Canvas consumes them
document.addEventListener('keydown', (e) => {
  // Check for the correct modifier key (Ctrl on Mac, Alt on Windows/Linux)
  const modifierPressed = isMac ? e.ctrlKey : e.altKey

  // Debug: log modifier key combos
  if (modifierPressed) {
    console.log(`MyVMK Genie - ${modifierKey} key pressed:`, e.key)
  }

  if (!modifierPressed) return

  // Modifier + 1-9 = slots 1-9, Modifier + 0 = slot 10
  const keyToSlot = {
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
    '6': 6, '7': 7, '8': 8, '9': 9, '0': 10
  }

  const slot = keyToSlot[e.key]
  if (slot) {
    e.preventDefault()
    e.stopPropagation()
    console.log('MyVMK Genie - Phrase slot:', slot, 'Phrase:', phrasesCache[slot])
    const phrase = phrasesCache[slot]
    if (phrase) {
      sendPhraseToChat(phrase)
    } else {
      showNotification(`No phrase in slot ${slot}`, 'info')
    }
  }
}, true) // true = capture phase

// Listen for storage changes (when phrases updated from popup)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.phrases) {
    phrasesCache = changes.phrases.newValue || {}
    console.log('Phrases updated:', phrasesCache)
  }
})

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCREENSHOT_TAKEN') {
    showNotification('Screenshot saved!', 'success')
    sendResponse({ success: true })
  }

  if (message.type === 'START_RECORDING_WITH_STREAM') {
    startRecordingWithStream(message.streamId)
    sendResponse({ success: true })
  }

  if (message.type === 'RECORDING_ERROR') {
    showNotification('Recording failed: ' + message.error, 'error')
    sendResponse({ success: true })
  }

  if (message.type === 'SHOW_SCREENSHOT_DIALOG') {
    showScreenshotModal(message.dataUrl)
    sendResponse({ success: true })
  }
})

// Start recording using getDisplayMedia (shows share prompt)
async function startRecordingDirect() {
  try {
    // Request screen/tab capture - user will see a prompt to select
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',  // Prefer browser tab
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: true,  // Capture tab audio
      preferCurrentTab: true  // Prefer current tab
    })

    recordedChunks = []

    // Try VP9, fall back to VP8
    let mimeType = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8'
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType })

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      // Download the recording
      const blob = new Blob(recordedChunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

      const a = document.createElement('a')
      a.href = url
      a.download = `myvmk-recording-${timestamp}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      URL.revokeObjectURL(url)
      showNotification('Recording saved!', 'success')
    }

    // Handle when user stops sharing via browser UI
    stream.getVideoTracks()[0].onended = () => {
      if (isRecording) {
        stopRecording()
      }
    }

    mediaRecorder.start(1000) // Capture in 1-second chunks
    isRecording = true
    currentStream = stream
    updateRecordButton()
    showNotification('Recording! Click 🔴 to stop', 'success')

  } catch (err) {
    console.error('Recording error:', err)
    if (err.name === 'NotAllowedError') {
      showNotification('Recording cancelled', 'info')
    } else {
      showNotification('Recording failed: ' + err.message, 'error')
    }
    isRecording = false
    updateRecordButton()
  }
}

// Keep for backwards compatibility
async function startRecordingWithStream(streamId) {
  // Fall back to direct method
  startRecordingDirect()
}

// Stop recording
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
    showNotification('Saving recording...', 'info')
  }

  // Stop all tracks
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop())
    currentStream = null
  }

  isRecording = false
  updateRecordButton()
}

// Update record button appearance
function updateRecordButton() {
  if (recordBtn) {
    if (isRecording) {
      recordBtn.innerHTML = '⏹️ Stop'
      recordBtn.style.background = 'rgba(239, 68, 68, 0.3)'
      recordBtn.style.borderColor = 'rgba(239, 68, 68, 0.5)'
      recordBtn.style.color = '#fca5a5'
      recordBtn.title = 'Stop Recording'
    } else {
      recordBtn.innerHTML = '🎥 Record'
      recordBtn.style.background = 'rgba(255,255,255,0.05)'
      recordBtn.style.borderColor = 'rgba(255,255,255,0.1)'
      recordBtn.style.color = 'rgba(255,255,255,0.8)'
      recordBtn.title = 'Start Recording'
    }
  }
}

// Send phrase to the game chat
// Try simulating keystrokes, fall back to clipboard
function sendPhraseToChat(phrase) {
  // Find the game canvas or active element
  const target = document.querySelector('canvas') || document.activeElement || document.body

  let typed = false

  // Try typing each character
  for (const char of phrase) {
    const keyCode = char.charCodeAt(0)

    // keydown
    const downEvent = new KeyboardEvent('keydown', {
      key: char,
      code: `Key${char.toUpperCase()}`,
      keyCode: keyCode,
      charCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true
    })
    target.dispatchEvent(downEvent)

    // keypress (for older systems)
    const pressEvent = new KeyboardEvent('keypress', {
      key: char,
      code: `Key${char.toUpperCase()}`,
      keyCode: keyCode,
      charCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true
    })
    target.dispatchEvent(pressEvent)

    // keyup
    const upEvent = new KeyboardEvent('keyup', {
      key: char,
      code: `Key${char.toUpperCase()}`,
      keyCode: keyCode,
      charCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true
    })
    target.dispatchEvent(upEvent)
  }

  // Send Enter to submit
  setTimeout(() => {
    const enterDown = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    })
    target.dispatchEvent(enterDown)

    const enterUp = new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    })
    target.dispatchEvent(enterUp)
  }, 50)

  showNotification(`Sent: ${phrase}`, 'success')

  // Also copy to clipboard as backup
  navigator.clipboard.writeText(phrase).catch(() => {})
}

// Show notification overlay
// If isHtml is true, content is treated as HTML, otherwise as text
function showNotification(text, type = 'info', duration = 2000, isHtml = false) {
  // Remove existing notification
  const existing = document.getElementById('vmkpal-notification')
  if (existing) existing.remove()

  const notification = document.createElement('div')
  notification.id = 'vmkpal-notification'
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    animation: vmkpal-slide-in 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 8px;
    ${type === 'success' ? 'background: linear-gradient(135deg, #10b981, #059669); color: white;' :
      type === 'error' ? 'background: linear-gradient(135deg, #ef4444, #dc2626); color: white;' :
      'background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;'}
  `
  if (isHtml) {
    notification.innerHTML = text
  } else {
    notification.textContent = text
  }

  // Add animation keyframes if not present
  if (!document.getElementById('vmkpal-styles')) {
    const style = document.createElement('style')
    style.id = 'vmkpal-styles'
    style.textContent = `
      @keyframes vmkpal-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes vmkpal-slide-out {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `
    document.head.appendChild(style)
  }

  document.body.appendChild(notification)

  // Remove after specified duration
  setTimeout(() => {
    notification.style.animation = 'vmkpal-slide-out 0.3s ease forwards'
    setTimeout(() => notification.remove(), 300)
  }, duration)
}

// Show bee banner notification - bee pulling a banner across the screen
function showBeeBanner(text) {
  // Remove existing bee banner
  const existing = document.getElementById('vmkpal-bee-banner')
  if (existing) existing.remove()

  const beeGifUrl = chrome.runtime.getURL('bee.gif')

  // Add animation keyframes if not present
  if (!document.getElementById('vmkpal-bee-styles')) {
    const style = document.createElement('style')
    style.id = 'vmkpal-bee-styles'
    style.textContent = `
      @keyframes vmkpal-bee-fly {
        from { transform: translateX(100vw); }
        to { transform: translateX(-100%); }
      }
      @keyframes vmkpal-banner-wave {
        0%, 100% { transform: rotate(-1deg); }
        50% { transform: rotate(1deg); }
      }
    `
    document.head.appendChild(style)
  }

  // Create container for bee + banner
  const container = document.createElement('div')
  container.id = 'vmkpal-bee-banner'
  container.style.cssText = `
    position: fixed;
    top: 30px;
    left: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    animation: vmkpal-bee-fly 10s linear forwards;
    pointer-events: none;
  `

  // Create bee image (on the left, pulling the banner)
  const bee = document.createElement('img')
  bee.src = beeGifUrl
  bee.style.cssText = `
    width: 40px;
    height: auto;
    flex-shrink: 0;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
  `

  // Create rope/string connecting bee to banner
  const rope = document.createElement('div')
  rope.style.cssText = `
    width: 15px;
    height: 2px;
    background: linear-gradient(to right, #8B4513, #654321);
    flex-shrink: 0;
    margin: 0 -2px;
  `

  // Create banner
  const banner = document.createElement('div')
  banner.style.cssText = `
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    border: 2px solid #d97706;
    border-radius: 4px;
    padding: 8px 20px 8px 15px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: #92400e;
    white-space: nowrap;
    box-shadow: 0 3px 10px rgba(0,0,0,0.2);
    animation: vmkpal-banner-wave 0.5s ease-in-out infinite;
    position: relative;
  `

  // Add triangular attachment point on left side of banner
  const attachment = document.createElement('div')
  attachment.style.cssText = `
    position: absolute;
    left: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    border-top: 8px solid transparent;
    border-bottom: 8px solid transparent;
    border-right: 8px solid #d97706;
  `
  banner.appendChild(attachment)

  // Add text to banner
  banner.appendChild(document.createTextNode(text))

  // Assemble: bee -> rope -> banner
  container.appendChild(bee)
  container.appendChild(rope)
  container.appendChild(banner)

  document.body.appendChild(container)

  // Remove after animation completes (10 seconds + buffer)
  setTimeout(() => {
    if (container.parentNode) {
      container.remove()
    }
  }, 11000)
}

// Show screenshot modal with clipboard/download options
function showScreenshotModal(dataUrl, isRegionSelect = false) {
  // Remove existing modal
  const existing = document.getElementById('vmkpal-screenshot-modal')
  if (existing) existing.remove()

  const modal = document.createElement('div')
  modal.id = 'vmkpal-screenshot-modal'
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #1e1b4b, #312e81);
    border-radius: 12px;
    padding: 16px;
    z-index: 2147483647;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 320px;
  `

  modal.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 12px;">
      <div style="color: white; font-weight: 600; font-size: 14px; flex: 1;">Screenshot captured!</div>
      <button id="vmkpal-ss-close" style="
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 6px;
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.7);
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      " title="Close">✕</button>
    </div>
    <img src="${dataUrl}" style="width: 100%; border-radius: 8px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.2);" />
    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
      <button id="vmkpal-ss-clipboard" style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; font-weight: 500; cursor: pointer; font-size: 12px;">📋 Clipboard</button>
      <button id="vmkpal-ss-download" style="flex: 1; padding: 10px; border: none; border-radius: 8px; background: linear-gradient(135deg, #10b981, #059669); color: white; font-weight: 500; cursor: pointer; font-size: 12px;">💾 Download</button>
    </div>
    ${!isRegionSelect ? '<button id="vmkpal-ss-region" style="width: 100%; padding: 8px; border: none; border-radius: 8px; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); font-weight: 500; cursor: pointer; font-size: 11px;">✂️ Select Region</button>' : ''}
  `

  document.body.appendChild(modal)

  // Close button
  const closeBtn = document.getElementById('vmkpal-ss-close')
  closeBtn.onmouseenter = () => {
    closeBtn.style.background = 'rgba(255,255,255,0.2)'
    closeBtn.style.color = 'white'
  }
  closeBtn.onmouseleave = () => {
    closeBtn.style.background = 'rgba(255,255,255,0.1)'
    closeBtn.style.color = 'rgba(255,255,255,0.7)'
  }
  closeBtn.onclick = () => modal.remove()

  // Clipboard button
  document.getElementById('vmkpal-ss-clipboard').onclick = async () => {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      showNotification('Copied to clipboard!', 'success')
      modal.remove()
    } catch (e) {
      showNotification('Clipboard failed', 'error')
    }
  }

  // Download button
  document.getElementById('vmkpal-ss-download').onclick = () => {
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_SCREENSHOT', dataUrl })
    showNotification('Screenshot saved!', 'success')
    modal.remove()
  }

  // Region select button
  const regionBtn = document.getElementById('vmkpal-ss-region')
  if (regionBtn) {
    regionBtn.onclick = () => {
      modal.remove()
      startRegionSelect(dataUrl)
    }
  }

  // Click outside to close
  const closeOnOutsideClick = (e) => {
    if (!modal.contains(e.target)) {
      modal.remove()
      document.removeEventListener('click', closeOnOutsideClick)
    }
  }
  setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 100)
}

// Start region selection for screenshot
function startRegionSelect(fullDataUrl) {
  // Create overlay with the full screenshot as background
  const overlay = document.createElement('div')
  overlay.id = 'vmkpal-region-overlay'
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: url(${fullDataUrl}) no-repeat center center;
    background-size: 100% 100%;
    cursor: crosshair;
    z-index: 2147483646;
  `

  // Dark overlay for unselected area
  const darkOverlay = document.createElement('div')
  darkOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    pointer-events: none;
  `
  overlay.appendChild(darkOverlay)

  // Selection box
  const selectionBox = document.createElement('div')
  selectionBox.style.cssText = `
    position: absolute;
    border: 2px dashed #8b5cf6;
    background: transparent;
    display: none;
    pointer-events: none;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.5);
  `
  overlay.appendChild(selectionBox)

  // Instructions
  const instructions = document.createElement('div')
  instructions.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    pointer-events: none;
  `
  instructions.textContent = 'Click and drag to select region • ESC to cancel'
  overlay.appendChild(instructions)

  document.body.appendChild(overlay)

  let startX, startY, isSelecting = false

  overlay.onmousedown = (e) => {
    startX = e.clientX
    startY = e.clientY
    isSelecting = true
    selectionBox.style.display = 'block'
    selectionBox.style.left = startX + 'px'
    selectionBox.style.top = startY + 'px'
    selectionBox.style.width = '0'
    selectionBox.style.height = '0'
    darkOverlay.style.display = 'none'
  }

  overlay.onmousemove = (e) => {
    if (!isSelecting) return
    const currentX = e.clientX
    const currentY = e.clientY
    const left = Math.min(startX, currentX)
    const top = Math.min(startY, currentY)
    const width = Math.abs(currentX - startX)
    const height = Math.abs(currentY - startY)
    selectionBox.style.left = left + 'px'
    selectionBox.style.top = top + 'px'
    selectionBox.style.width = width + 'px'
    selectionBox.style.height = height + 'px'
  }

  overlay.onmouseup = (e) => {
    if (!isSelecting) return
    isSelecting = false
    const currentX = e.clientX
    const currentY = e.clientY
    const left = Math.min(startX, currentX)
    const top = Math.min(startY, currentY)
    const width = Math.abs(currentX - startX)
    const height = Math.abs(currentY - startY)

    if (width < 10 || height < 10) {
      overlay.remove()
      showNotification('Selection too small', 'info')
      return
    }

    // Crop the image
    cropScreenshot(fullDataUrl, left, top, width, height).then(croppedDataUrl => {
      overlay.remove()
      showScreenshotModal(croppedDataUrl, true)
    })
  }

  // ESC to cancel
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove()
      document.removeEventListener('keydown', escHandler)
    }
  }
  document.addEventListener('keydown', escHandler)
}

// Crop screenshot to selected region
async function cropScreenshot(dataUrl, x, y, width, height) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      // Calculate scale factor between image and viewport
      const scaleX = img.naturalWidth / window.innerWidth
      const scaleY = img.naturalHeight / window.innerHeight

      // Scale coordinates to match actual image dimensions
      const scaledX = Math.round(x * scaleX)
      const scaledY = Math.round(y * scaleY)
      const scaledWidth = Math.round(width * scaleX)
      const scaledHeight = Math.round(height * scaleY)

      const canvas = document.createElement('canvas')
      canvas.width = scaledWidth
      canvas.height = scaledHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, scaledX, scaledY, scaledWidth, scaledHeight, 0, 0, scaledWidth, scaledHeight)
      resolve(canvas.toDataURL('image/png'))
    }
    img.src = dataUrl
  })
}

// Create floating toolbar (visible in game client popup)
function createToolbar() {
  try {
    // Check if toolbar already exists
    if (document.getElementById('vmkpal-toolbar')) return

    // Main container - create first so it exists for position callback
    const container = document.createElement('div')
    container.id = 'vmkpal-toolbar'
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, sans-serif;
      cursor: move;
    `

    // Load saved position (edge-relative positioning)
    try {
      chrome.storage.local.get(['toolbarPositionEdge'], (result) => {
        if (chrome.runtime.lastError) {
          console.log('MyVMK Genie: Could not load toolbar position')
          return
        }
        if (result.toolbarPositionEdge) {
          const pos = result.toolbarPositionEdge
          // Apply edge-relative positioning
          container.style.left = pos.anchorLeft ? pos.left + 'px' : 'auto'
          container.style.right = pos.anchorLeft ? 'auto' : pos.right + 'px'
          container.style.top = pos.anchorTop ? pos.top + 'px' : 'auto'
          container.style.bottom = pos.anchorTop ? 'auto' : pos.bottom + 'px'
        }
      })
    } catch (e) {
      console.log('MyVMK Genie: Storage access error', e)
    }

    // Drag functionality
  let isDragging = false
  let dragOffset = { x: 0, y: 0 }

  container.addEventListener('mousedown', (e) => {
    // Don't drag if position is locked
    if (isPositionLocked) return

    // Only start drag if clicking on the container or menu button, not inside panel
    if (e.target.closest('#vmkpal-panel') && !e.target.closest('#vmkpal-panel-header')) {
      return
    }
    isDragging = true
    const rect = container.getBoundingClientRect()
    dragOffset.x = e.clientX - rect.left
    dragOffset.y = e.clientY - rect.top
    container.style.cursor = 'grabbing'
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return

    const x = e.clientX - dragOffset.x
    const y = e.clientY - dragOffset.y

    // Keep within viewport
    const maxX = window.innerWidth - container.offsetWidth
    const maxY = window.innerHeight - container.offsetHeight

    container.style.left = Math.max(0, Math.min(x, maxX)) + 'px'
    container.style.top = Math.max(0, Math.min(y, maxY)) + 'px'
    container.style.right = 'auto'
    container.style.bottom = 'auto'
  })

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false
      container.style.cursor = 'move'

      // Save position relative to nearest edges
      const rect = container.getBoundingClientRect()
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight

      // Determine which edges to anchor to (closest edge)
      const anchorLeft = rect.left < (windowWidth - rect.right)
      const anchorTop = rect.top < (windowHeight - rect.bottom)

      // Calculate distances from edges
      const posData = {
        anchorLeft,
        anchorTop,
        left: rect.left,
        right: windowWidth - rect.right,
        top: rect.top,
        bottom: windowHeight - rect.bottom
      }

      // Apply the edge-relative positioning immediately
      container.style.left = anchorLeft ? rect.left + 'px' : 'auto'
      container.style.right = anchorLeft ? 'auto' : (windowWidth - rect.right) + 'px'
      container.style.top = anchorTop ? rect.top + 'px' : 'auto'
      container.style.bottom = anchorTop ? 'auto' : (windowHeight - rect.bottom) + 'px'

      chrome.storage.local.set({ toolbarPositionEdge: posData })
    }
  })

  // Keep toolbar within viewport on window resize (edge-relative positioning handles most cases)
  function keepToolbarInBounds() {
    const rect = container.getBoundingClientRect()
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight

    // Only need to check if icon goes off-screen in extreme resize cases
    if (rect.left < 0 || rect.right > windowWidth || rect.top < 0 || rect.bottom > windowHeight) {
      // Clamp to visible area
      const clampedLeft = Math.max(0, Math.min(rect.left, windowWidth - container.offsetWidth))
      const clampedTop = Math.max(0, Math.min(rect.top, windowHeight - container.offsetHeight))

      // Re-determine anchor edges based on clamped position
      const anchorLeft = clampedLeft < (windowWidth - clampedLeft - container.offsetWidth)
      const anchorTop = clampedTop < (windowHeight - clampedTop - container.offsetHeight)

      container.style.left = anchorLeft ? clampedLeft + 'px' : 'auto'
      container.style.right = anchorLeft ? 'auto' : (windowWidth - clampedLeft - container.offsetWidth) + 'px'
      container.style.top = anchorTop ? clampedTop + 'px' : 'auto'
      container.style.bottom = anchorTop ? 'auto' : (windowHeight - clampedTop - container.offsetHeight) + 'px'
    }
  }

  window.addEventListener('resize', keepToolbarInBounds)

  // Single menu button (always visible)
  const quickBar = document.createElement('div')
  quickBar.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
  `

  // Menu toggle button
  const menuBtn = document.createElement('button')
  const genieIconUrl = chrome.runtime.getURL('myvmk-genie.png')
  menuBtn.innerHTML = `<img src="${genieIconUrl}" style="width: 50px; height: 50px; object-fit: contain;">`
  menuBtn.title = 'MyVMK Genie Menu'
  menuBtn.style.cssText = `
    width: 50px;
    height: 50px;
    border: none;
    border-radius: 12px;
    background: transparent;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    outline: none;
    box-shadow: 0 0 15px 5px rgba(139, 92, 246, 0.5), 0 0 30px 10px rgba(139, 92, 246, 0.3);
  `
  menuBtn.onmouseover = () => menuBtn.style.transform = 'scale(1.1)'
  menuBtn.onmouseout = () => menuBtn.style.transform = 'scale(1)'
  menuBtn.onclick = () => togglePanel()

  quickBar.appendChild(menuBtn)

  // Expandable panel
  const panel = document.createElement('div')
  panel.id = 'vmkpal-panel'
  panel.style.cssText = `
    display: none;
    position: absolute;
    bottom: 70px;
    right: 0;
    width: 320px;
    background: linear-gradient(135deg, #1e1b4b, #312e81);
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.1);
  `

  // Panel header (drag handle)
  const header = document.createElement('div')
  header.id = 'vmkpal-panel-header'
  header.style.cssText = `
    padding: 16px;
    background: rgba(255,255,255,0.05);
    border-bottom: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: move;
  `
  header.innerHTML = `
    <img src="${genieIconUrl}" style="width: 28px; height: 28px; object-fit: contain;">
    <div style="flex: 1;">
      <div style="color: white; font-weight: 600; font-size: 16px;">MyVMK Genie</div>
    </div>
    <button id="vmkpal-minimize-btn" style="
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: rgba(255,255,255,0.1);
      color: rgba(255,255,255,0.7);
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    " title="Minimize">−</button>
  `

  // Add minimize button functionality
  setTimeout(() => {
    const minimizeBtn = document.getElementById('vmkpal-minimize-btn')
    if (minimizeBtn) {
      minimizeBtn.onmouseenter = () => {
        minimizeBtn.style.background = 'rgba(255,255,255,0.2)'
        minimizeBtn.style.color = 'white'
      }
      minimizeBtn.onmouseleave = () => {
        minimizeBtn.style.background = 'rgba(255,255,255,0.1)'
        minimizeBtn.style.color = 'rgba(255,255,255,0.7)'
      }
      minimizeBtn.onclick = (e) => {
        e.stopPropagation()
        panel.style.display = 'none'
      }
    }
  }, 0)

  // Panel content wrapper
  const contentWrapper = document.createElement('div')
  contentWrapper.style.cssText = `max-height: 400px; overflow-y: auto;`

  // Main content (home view)
  const content = document.createElement('div')
  content.id = 'vmkpal-main-content'
  content.style.cssText = `padding: 12px;`

  // Feature view (for inline feature panels)
  const featureView = document.createElement('div')
  featureView.id = 'vmkpal-feature-view'
  featureView.style.cssText = `padding: 12px; display: none;`

  // Event countdown ticker (scrolling)
  const tickerContainer = document.createElement('div')
  tickerContainer.id = 'vmkpal-ticker'
  tickerContainer.style.cssText = `
    overflow: hidden;
    background: linear-gradient(90deg, rgba(245,158,11,0.2), rgba(251,191,36,0.2));
    border-radius: 8px;
    margin-bottom: 12px;
    padding: 8px 0;
    position: relative;
  `

  const tickerText = document.createElement('div')
  tickerText.id = 'vmkpal-ticker-text'
  tickerText.style.cssText = `
    display: inline-block;
    white-space: nowrap;
    color: #fbbf24;
    font-size: 12px;
    font-weight: 500;
    padding-left: 100%;
    animation: vmkpal-scroll 45s linear infinite;
  `
  tickerText.textContent = 'Loading next event...'

  // Add ticker animation styles
  if (!document.getElementById('vmkpal-ticker-styles')) {
    const tickerStyles = document.createElement('style')
    tickerStyles.id = 'vmkpal-ticker-styles'
    tickerStyles.textContent = `
      @keyframes vmkpal-scroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-100%); }
      }
    `
    document.head.appendChild(tickerStyles)
  }

  tickerContainer.appendChild(tickerText)
  content.appendChild(tickerContainer)

  // Room info box - hidden from UI but detection runs in background
  // if (DEV_MODE) {
  //   const roomInfoBox = document.createElement('div')
  //   roomInfoBox.id = 'vmkpal-room-info'
  //   roomInfoBox.style.cssText = `
  //     background: rgba(74, 222, 128, 0.1);
  //     border: 1px solid rgba(74, 222, 128, 0.3);
  //     border-radius: 8px;
  //     padding: 10px 12px;
  //     margin-bottom: 12px;
  //     display: flex;
  //     align-items: center;
  //     gap: 10px;
  //   `
  //   roomInfoBox.innerHTML = `
  //     <span style="font-size: 18px;">📍</span>
  //     <div style="flex: 1; min-width: 0;">
  //       <div style="color: rgba(255,255,255,0.5); font-size: 9px; text-transform: uppercase; margin-bottom: 2px;">Current Room</div>
  //       <div id="vmkpal-room-name" style="color: #4ade80; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Detecting...</div>
  //       <div id="vmkpal-room-land" style="color: rgba(255,255,255,0.5); font-size: 10px;"></div>
  //     </div>
  //   `
  //   content.appendChild(roomInfoBox)
  // }

  // Quick actions row (Screenshot & Record)
  const quickActions = document.createElement('div')
  quickActions.style.cssText = `
    display: flex;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  `

  // Screenshot helper text (use Alt+S keyboard shortcut)
  const screenshotHelper = document.createElement('div')
  screenshotHelper.innerHTML = '📸 <span style="opacity:0.7">Ctrl+Shift+S</span>'
  screenshotHelper.style.cssText = `
    flex: 1;
    padding: 12px;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.6);
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  `

  // Record button
  recordBtn = document.createElement('button')
  recordBtn.innerHTML = '🎥 Record'
  recordBtn.style.cssText = `
    flex: 1;
    padding: 12px;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    background: rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.8);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `
  recordBtn.onmouseover = () => {
    recordBtn.style.background = 'rgba(255,255,255,0.1)'
    recordBtn.style.borderColor = 'rgba(255,255,255,0.2)'
    recordBtn.style.transform = 'scale(1.02)'
  }
  recordBtn.onmouseout = () => {
    recordBtn.style.background = 'rgba(255,255,255,0.05)'
    recordBtn.style.borderColor = 'rgba(255,255,255,0.1)'
    recordBtn.style.transform = 'scale(1)'
  }
  recordBtn.onclick = () => {
    recordBtn.blur() // Prevent spacebar re-trigger
    if (isRecording) {
      stopRecording()
    } else {
      startRecordingDirect()
    }
  }

  quickActions.appendChild(screenshotHelper)
  quickActions.appendChild(recordBtn)
  content.appendChild(quickActions)

  // Add feature grid
  const featureGrid = document.createElement('div')
  featureGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 8px;
  `

  // featureGrid.appendChild(createFeatureButton('👤', 'Accounts', createAccountsPanel))
  featureGrid.appendChild(createFeatureButton('💬', 'Phrases', createPhrasesPanel))
  featureGrid.appendChild(createFeatureButton('🎵', 'Audio', createAudioPanel))
  featureGrid.appendChild(createFeatureButton('📅', 'Events', createEventsPanel))
  // featureGrid.appendChild(createFeatureButton('🎮', 'Find Game', createLfgPanel)) // Hidden until feature is ready
  featureGrid.appendChild(createFeatureButton('✨', 'Overlays', createOverlaysPanel))
  featureGrid.appendChild(createFeatureButton('📖', 'Commands', createCommandsPanel))
  featureGrid.appendChild(createActionButton('🏆', 'Prizes', createPrizeTrackerPanel))
  if (DEV_MODE) {
    featureGrid.appendChild(createFeatureButton('🎫', 'Queue', createQueueAlertsPanel))
    featureGrid.appendChild(createFeatureButton('🎧', 'Room Audio', createAudioLearningPanel))
  }
  featureGrid.appendChild(createFeatureButton('⚙️', 'Settings', createSettingsPanel))
  featureGrid.appendChild(createToggleButton({enabled: '🔒', disabled: '🔓'}, 'Lock Position', togglePositionLock, () => isPositionLocked))

  content.appendChild(featureGrid)

  // Add both views to wrapper
  contentWrapper.appendChild(content)
  contentWrapper.appendChild(featureView)

  panel.appendChild(header)
  panel.appendChild(contentWrapper)

    container.appendChild(panel)
    container.appendChild(quickBar)
    document.body.appendChild(container)

    // Now that ticker is in DOM, start updating it
    updateEventTicker()

    // Load saved settings
    loadSettings()
  } catch (err) {
    console.error('MyVMK Genie: Error creating toolbar', err)
  }
}

// Create a quick action button
function createQuickBtn(emoji, title, color, onClick) {
  const btn = document.createElement('button')
  btn.innerHTML = emoji
  btn.title = title
  btn.style.cssText = `
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: linear-gradient(135deg, ${color}, ${adjustColor(color, -20)});
    color: white;
    font-size: 20px;
    cursor: pointer;
    box-shadow: 0 4px 12px ${color}66;
    transition: transform 0.2s;
  `
  btn.onmouseover = () => btn.style.transform = 'scale(1.1)'
  btn.onmouseout = () => btn.style.transform = 'scale(1)'
  btn.onclick = onClick
  return btn
}

// Adjust hex color brightness
function adjustColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount))
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`
}

// Toggle panel visibility
function togglePanel() {
  const panel = document.getElementById('vmkpal-panel')
  const toolbar = document.getElementById('vmkpal-toolbar')
  if (panel && toolbar) {
    const isOpening = panel.style.display === 'none'
    panel.style.display = isOpening ? 'block' : 'none'

    // Update icon state for small icon mode
    updateIconState()

    // When closing, blur any focused element to prevent spacebar from triggering buttons
    if (!isOpening) {
      document.activeElement?.blur()
    }

    if (isOpening) {
      // Update room info display
      updateRoomInfoDisplay()
      // Position panel based on toolbar location
      const toolbarRect = toolbar.getBoundingClientRect()
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight

      // Check if toolbar is on left or right half of screen
      const isOnLeftSide = toolbarRect.left < windowWidth / 2

      // Check if toolbar is near top or bottom
      const isNearBottom = toolbarRect.top > windowHeight / 2

      // Horizontal positioning
      if (isOnLeftSide) {
        panel.style.left = '0'
        panel.style.right = 'auto'
      } else {
        panel.style.left = 'auto'
        panel.style.right = '0'
      }

      // Vertical positioning
      if (isNearBottom) {
        panel.style.bottom = '70px'
        panel.style.top = 'auto'
      } else {
        panel.style.top = '70px'
        panel.style.bottom = 'auto'
      }
    }
  }
}

// Create a toggle button for the grid (for features like rain overlay)
// icon can be a string (static) or object {enabled: '🔒', disabled: '🔓'} for dynamic icons
function createToggleButton(icon, label, toggleFn, isEnabledFn) {
  const btn = document.createElement('button')

  const getIcon = () => {
    if (typeof icon === 'object' && icon.enabled && icon.disabled) {
      return isEnabledFn() ? icon.enabled : icon.disabled
    }
    return icon
  }

  const updateButton = () => {
    const enabled = isEnabledFn()
    btn.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 12px 8px;
      background: ${enabled ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.05)'};
      border: 1px solid ${enabled ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255,255,255,0.1)'};
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
    `
    btn.innerHTML = `
      <span style="font-size: 20px;">${getIcon()}</span>
      <span style="color: rgba(255,255,255,0.8); font-size: 10px; font-weight: 500;">${label}</span>
    `
  }

  updateButton()

  btn.onmouseover = () => {
    btn.style.transform = 'scale(1.05)'
  }
  btn.onmouseout = () => {
    btn.style.transform = 'scale(1)'
  }
  btn.onclick = () => {
    toggleFn()
    updateButton()
    // Blur to prevent spacebar from re-triggering
    btn.blur()
  }
  return btn
}

// Toggle rain overlay (canvas-based like The Swan game)
function toggleRainOverlay() {
  isRainEnabled = !isRainEnabled

  if (isRainEnabled) {
    startRainEffect()
    showNotification('🌧️ Rain enabled', 'success')
  } else {
    stopRainEffect()
    showNotification('☀️ Rain disabled', 'info')
  }

  chrome.storage.local.set({ rainEnabled: isRainEnabled })
}

function createRainDrop(randomY = false) {
  const bounds = getGameCanvasBounds()
  return {
    x: Math.random() * (bounds.width + 100) - 50,
    y: randomY ? Math.random() * bounds.height : -RAIN_LENGTH_MAX,
    speed: RAIN_SPEED_MIN + Math.random() * (RAIN_SPEED_MAX - RAIN_SPEED_MIN),
    length: RAIN_LENGTH_MIN + Math.random() * (RAIN_LENGTH_MAX - RAIN_LENGTH_MIN),
    drift: -30 - Math.random() * 20
  }
}

function initRainDrops() {
  rainDrops = []
  for (let i = 0; i < RAIN_DROP_COUNT; i++) {
    rainDrops.push(createRainDrop(true))
  }
  lastRainTime = performance.now()
}

function updateRainDrops() {
  const now = performance.now()
  const dt = (now - lastRainTime) / 1000
  lastRainTime = now

  const bounds = getGameCanvasBounds()

  for (let i = 0; i < rainDrops.length; i++) {
    const drop = rainDrops[i]
    drop.y += drop.speed * dt
    drop.x += drop.drift * dt

    if (drop.y > bounds.height + drop.length || drop.x < -50) {
      rainDrops[i] = createRainDrop(false)
    }
  }
}

function renderRain() {
  if (!rainCtx || !isRainEnabled) return

  rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height)
  updateRainDrops()

  rainCtx.strokeStyle = `rgba(180, 200, 220, ${RAIN_OPACITY})`
  rainCtx.lineWidth = 1.5
  rainCtx.lineCap = 'round'

  for (const drop of rainDrops) {
    rainCtx.beginPath()
    rainCtx.moveTo(drop.x, drop.y)
    rainCtx.lineTo(drop.x - 3, drop.y + drop.length)
    rainCtx.stroke()
  }

  rainAnimationId = requestAnimationFrame(renderRain)
}

function startRainEffect() {
  const bounds = getGameCanvasBounds()

  if (!rainCanvas) {
    rainCanvas = document.createElement('canvas')
    rainCanvas.id = 'vmkpal-rain-canvas'
    rainCanvas.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
    `
    rainCtx = rainCanvas.getContext('2d')
    document.body.appendChild(rainCanvas)
  }

  // Apply bounds
  rainCanvas.style.left = bounds.left + 'px'
  rainCanvas.style.top = bounds.top + 'px'
  rainCanvas.width = bounds.width
  rainCanvas.height = bounds.height

  rainCanvas.style.display = 'block'
  initRainDrops()
  renderRain()
}

function stopRainEffect() {
  if (rainAnimationId) {
    cancelAnimationFrame(rainAnimationId)
    rainAnimationId = null
  }
  if (rainCanvas) {
    rainCanvas.style.display = 'none'
  }
}

// Money Rain Effect
function toggleMoneyRain() {
  isMoneyRainEnabled = !isMoneyRainEnabled

  if (isMoneyRainEnabled) {
    startMoneyRain()
    showNotification('💸 Money rain enabled', 'success')
  } else {
    stopMoneyRain()
    showNotification('💵 Money rain disabled', 'info')
  }

  chrome.storage.local.set({ moneyRainEnabled: isMoneyRainEnabled })
}

function createMoneyDrop(randomY = false) {
  const bounds = getGameCanvasBounds()
  return {
    x: Math.random() * bounds.width,
    y: randomY ? Math.random() * bounds.height : -50,
    speed: MONEY_SPEED_MIN + Math.random() * (MONEY_SPEED_MAX - MONEY_SPEED_MIN),
    symbol: MONEY_SYMBOLS[Math.floor(Math.random() * MONEY_SYMBOLS.length)],
    size: MONEY_SIZES[Math.floor(Math.random() * MONEY_SIZES.length)],
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 180,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 2 + Math.random() * 2,
    wobbleAmount: 30 + Math.random() * 20
  }
}

function initMoneyDrops() {
  moneyDrops = []
  for (let i = 0; i < MONEY_DROP_COUNT; i++) {
    moneyDrops.push(createMoneyDrop(true))
  }
  lastMoneyTime = performance.now()
}

function updateMoneyDrops() {
  const now = performance.now()
  const dt = (now - lastMoneyTime) / 1000
  lastMoneyTime = now

  const bounds = getGameCanvasBounds()

  for (let i = 0; i < moneyDrops.length; i++) {
    const drop = moneyDrops[i]
    drop.y += drop.speed * dt
    drop.rotation += drop.rotationSpeed * dt
    drop.wobble += drop.wobbleSpeed * dt

    if (drop.y > bounds.height + 50) {
      moneyDrops[i] = createMoneyDrop(false)
    }
  }
}

function renderMoney() {
  if (!moneyCtx || !isMoneyRainEnabled) return

  moneyCtx.clearRect(0, 0, moneyCanvas.width, moneyCanvas.height)
  updateMoneyDrops()

  for (const drop of moneyDrops) {
    const wobbleX = Math.sin(drop.wobble) * drop.wobbleAmount

    moneyCtx.save()
    moneyCtx.translate(drop.x + wobbleX, drop.y)
    moneyCtx.rotate(drop.rotation * Math.PI / 180)
    moneyCtx.font = `${drop.size}px serif`
    moneyCtx.textAlign = 'center'
    moneyCtx.textBaseline = 'middle'
    moneyCtx.fillText(drop.symbol, 0, 0)
    moneyCtx.restore()
  }

  moneyAnimationId = requestAnimationFrame(renderMoney)
}

function startMoneyRain() {
  const bounds = getGameCanvasBounds()

  if (!moneyCanvas) {
    moneyCanvas = document.createElement('canvas')
    moneyCanvas.id = 'vmkpal-money-canvas'
    moneyCanvas.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483645;
    `
    moneyCtx = moneyCanvas.getContext('2d')
    document.body.appendChild(moneyCanvas)
  }

  // Apply bounds
  moneyCanvas.style.left = bounds.left + 'px'
  moneyCanvas.style.top = bounds.top + 'px'
  moneyCanvas.width = bounds.width
  moneyCanvas.height = bounds.height

  moneyCanvas.style.display = 'block'
  initMoneyDrops()
  renderMoney()
}

function stopMoneyRain() {
  if (moneyAnimationId) {
    cancelAnimationFrame(moneyAnimationId)
    moneyAnimationId = null
  }
  if (moneyCanvas) {
    moneyCanvas.style.display = 'none'
  }
}

// Fireworks Effect
function toggleFireworks() {
  isFireworksEnabled = !isFireworksEnabled

  if (isFireworksEnabled) {
    manuallyDisabledEffects.delete('fireworks') // User re-enabled, clear manual disable
    startFireworks()
    showNotification('🎆 Fireworks enabled', 'success')
  } else {
    manuallyDisabledEffects.add('fireworks') // Track that user manually disabled
    stopFireworks()
    showNotification('🎇 Fireworks disabled', 'info')
  }

  chrome.storage.local.set({ fireworksEnabled: isFireworksEnabled })
}

function createRocket() {
  const bounds = getGameCanvasBounds()
  const colorSet = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)]
  const explosionType = EXPLOSION_TYPES[Math.floor(Math.random() * EXPLOSION_TYPES.length)]

  // In Castle Gardens, start rockets from behind the castle overlay
  // Otherwise, start from the bottom of the screen
  const inCastleGardens = currentRoomId === CASTLE_GARDENS_ID
  const startY = inCastleGardens
    ? bounds.height * 0.55 + Math.random() * (bounds.height * 0.1)
    : bounds.height + 10
  const speed = inCastleGardens ? 200 + Math.random() * 100 : 280 + Math.random() * 120

  return {
    x: Math.random() * (bounds.width * 0.7) + bounds.width * 0.15,
    y: startY,
    targetY: bounds.height * 0.08 + Math.random() * (bounds.height * 0.25),
    speed: speed,
    colors: colorSet,
    explosionType: explosionType,
    trail: [],
    angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.25,
    wobble: Math.random() * 0.015
  }
}

function createParticle(x, y, colors, explosionType, angle, speed) {
  // Adjust particle behavior based on explosion type
  let trailLength = 8
  let drag = 0.985
  let baseDecay = 0.006 + Math.random() * 0.004

  if (explosionType === 'willow') {
    trailLength = 15
    drag = 0.975
    baseDecay *= 0.7
  } else if (explosionType === 'crackle') {
    trailLength = 4
    speed *= 1.3
    baseDecay *= 1.5
  } else if (explosionType === 'peony') {
    trailLength = 10
    drag = 0.98
  }

  // Intensity-based decay adjustment
  if (fireworksIntensity > 1.5) {
    baseDecay *= 1 + (fireworksIntensity - 1.5) * 0.6
  }

  return {
    x: x,
    y: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    colors: colors,
    life: 1.0,
    decay: baseDecay,
    size: 2 + Math.random() * 2,
    drag: drag,
    trail: [],
    trailLength: trailLength,
    twinkle: Math.random() > 0.6,
    twinkleSpeed: 5 + Math.random() * 10
  }
}

function launchRocket() {
  rockets.push(createRocket())
}

function explodeRocket(rocket) {
  const { x, y, colors, explosionType } = rocket
  const count = explosionType === 'ring' ? 60 : PARTICLE_COUNT

  if (explosionType === 'ring') {
    // Ring explosion - particles in a circle
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const speed = 140 + Math.random() * 40
      particles.push(createParticle(x, y, colors, explosionType, angle, speed))
    }
    // Inner ring
    for (let i = 0; i < count / 2; i++) {
      const angle = (i / (count / 2)) * Math.PI * 2
      const speed = 80 + Math.random() * 30
      particles.push(createParticle(x, y, colors, explosionType, angle, speed))
    }
  } else if (explosionType === 'starburst') {
    // Starburst - radial lines with gaps
    const arms = 8 + Math.floor(Math.random() * 6)
    for (let arm = 0; arm < arms; arm++) {
      const baseAngle = (arm / arms) * Math.PI * 2
      for (let i = 0; i < 12; i++) {
        const angle = baseAngle + (Math.random() - 0.5) * 0.15
        const speed = 60 + i * 15 + Math.random() * 20
        particles.push(createParticle(x, y, colors, explosionType, angle, speed))
      }
    }
  } else {
    // Starburst/willow/peony/crackle - spherical burst
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 80 + Math.random() * 140
      particles.push(createParticle(x, y, colors, explosionType, angle, speed))
    }
  }

  // Secondary sparkle burst for some types
  if (explosionType === 'peony' || explosionType === 'willow') {
    setTimeout(() => {
      if (!isFireworksEnabled) return
      for (let i = 0; i < 25; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 40 + Math.random() * 60
        const p = createParticle(x, y, colors, 'crackle', angle, speed)
        p.decay *= 2
        p.size *= 0.6
        particles.push(p)
      }
    }, 150)
  }
}

function updateFireworks(dt) {
  // Update rockets
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rocket = rockets[i]

    // Add trail point
    rocket.trail.push({ x: rocket.x, y: rocket.y, life: 1 })
    if (rocket.trail.length > 20) rocket.trail.shift()

    // Move rocket with slight curve
    const vx = Math.cos(rocket.angle) * rocket.speed
    const vy = Math.sin(rocket.angle) * rocket.speed
    rocket.x += vx * dt + Math.sin(rocket.y * rocket.wobble) * 0.8
    rocket.y += vy * dt

    // Check if reached target
    if (rocket.y <= rocket.targetY) {
      explodeRocket(rocket)
      rockets.splice(i, 1)
    }

    // Fade trail
    for (const t of rocket.trail) {
      t.life -= dt * 2.5
    }
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]

    // Add trail point
    if (p.trail.length === 0 ||
        Math.abs(p.x - p.trail[p.trail.length - 1].x) > 2 ||
        Math.abs(p.y - p.trail[p.trail.length - 1].y) > 2) {
      p.trail.push({ x: p.x, y: p.y, life: p.life })
    }
    while (p.trail.length > p.trailLength) p.trail.shift()

    // Apply velocity
    p.x += p.vx * dt
    p.y += p.vy * dt

    // Apply gravity
    p.vy += GRAVITY * dt

    // Apply drag
    p.vx *= p.drag
    p.vy *= p.drag

    // Decay life
    p.life -= p.decay

    // Remove dead particles
    if (p.life <= 0) {
      particles.splice(i, 1)
    }
  }
}

function renderFireworks() {
  if (!fireworksCtx || !isFireworksEnabled) return

  const now = performance.now()
  const dt = Math.min((now - lastFireworkTime) / 1000, 0.1)
  lastFireworkTime = now

  // Clear canvas completely (transparent)
  fireworksCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height)

  // Launch new rockets
  if (now > nextLaunchTime && fireworksIntensity > 0) {
    const baseRockets = Math.ceil(fireworksIntensity)
    for (let i = 0; i < baseRockets; i++) {
      if (Math.random() < fireworksIntensity) launchRocket()
    }
    if (fireworksIntensity > 1.5 && Math.random() > 0.5) launchRocket()
    if (fireworksIntensity > 2 && Math.random() > 0.3) launchRocket()

    const intervalMultiplier = Math.max(0.3, 1 / fireworksIntensity)
    nextLaunchTime = now + (LAUNCH_INTERVAL_MIN + Math.random() * (LAUNCH_INTERVAL_MAX - LAUNCH_INTERVAL_MIN)) * intervalMultiplier
  }

  // Update physics
  updateFireworks(dt)

  // Draw rocket trails as streaking lines
  for (const rocket of rockets) {
    if (rocket.trail.length > 1) {
      fireworksCtx.beginPath()
      fireworksCtx.moveTo(rocket.trail[0].x, rocket.trail[0].y)
      for (let i = 1; i < rocket.trail.length; i++) {
        fireworksCtx.lineTo(rocket.trail[i].x, rocket.trail[i].y)
      }
      fireworksCtx.lineTo(rocket.x, rocket.y)

      const gradient = fireworksCtx.createLinearGradient(
        rocket.trail[0].x, rocket.trail[0].y,
        rocket.x, rocket.y
      )
      gradient.addColorStop(0, 'rgba(255, 200, 100, 0)')
      gradient.addColorStop(0.5, 'rgba(255, 220, 150, 0.4)')
      gradient.addColorStop(1, 'rgba(255, 255, 200, 0.9)')

      fireworksCtx.strokeStyle = gradient
      fireworksCtx.lineWidth = 2
      fireworksCtx.stroke()
    }

    // Draw rocket head with bright glow
    fireworksCtx.shadowBlur = 15
    fireworksCtx.shadowColor = '#ffffcc'
    fireworksCtx.beginPath()
    fireworksCtx.arc(rocket.x, rocket.y, 3, 0, Math.PI * 2)
    fireworksCtx.fillStyle = '#fff'
    fireworksCtx.fill()
    fireworksCtx.shadowBlur = 0
  }

  // Draw particles with trails
  for (const p of particles) {
    const colors = p.colors

    // Draw trail as gradient line
    if (p.trail.length > 1) {
      fireworksCtx.beginPath()
      fireworksCtx.moveTo(p.trail[0].x, p.trail[0].y)
      for (let i = 1; i < p.trail.length; i++) {
        fireworksCtx.lineTo(p.trail[i].x, p.trail[i].y)
      }
      fireworksCtx.lineTo(p.x, p.y)

      const trailAlpha = p.life * 0.6
      fireworksCtx.strokeStyle = `rgba(${colors.outer}, ${trailAlpha * 0.4})`
      fireworksCtx.lineWidth = Math.max(1, p.size * p.life * 0.8)
      fireworksCtx.lineCap = 'round'
      fireworksCtx.stroke()
    }

    // Twinkle effect
    let twinkleMult = 1
    if (p.twinkle) {
      twinkleMult = 0.5 + 0.5 * Math.sin(now * p.twinkleSpeed * 0.001)
    }

    const particleSize = Math.max(0.5, p.size * p.life * twinkleMult)
    const alpha = p.life * twinkleMult

    // Draw particle with layered glow
    // Outer glow
    fireworksCtx.shadowBlur = 12
    fireworksCtx.shadowColor = `rgba(${colors.outer}, ${alpha * 0.8})`
    fireworksCtx.beginPath()
    fireworksCtx.arc(p.x, p.y, particleSize * 1.5, 0, Math.PI * 2)
    fireworksCtx.fillStyle = `rgba(${colors.outer}, ${alpha * 0.3})`
    fireworksCtx.fill()

    // Mid layer
    fireworksCtx.beginPath()
    fireworksCtx.arc(p.x, p.y, particleSize, 0, Math.PI * 2)
    fireworksCtx.fillStyle = `rgba(${colors.mid}, ${alpha * 0.7})`
    fireworksCtx.fill()

    // Core (brightest)
    fireworksCtx.beginPath()
    fireworksCtx.arc(p.x, p.y, particleSize * 0.5, 0, Math.PI * 2)
    fireworksCtx.fillStyle = `rgba(${colors.core}, ${alpha})`
    fireworksCtx.fill()

    fireworksCtx.shadowBlur = 0
  }

  fireworksAnimationId = requestAnimationFrame(renderFireworks)
}

function startFireworks() {
  const bounds = getGameCanvasBounds()

  if (!fireworksCanvas) {
    fireworksCanvas = document.createElement('canvas')
    fireworksCanvas.id = 'vmkpal-fireworks-canvas'
    fireworksCanvas.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483644;
      background: transparent;
    `
    fireworksCtx = fireworksCanvas.getContext('2d')
    document.body.appendChild(fireworksCanvas)
  }

  // Apply bounds
  fireworksCanvas.style.left = bounds.left + 'px'
  fireworksCanvas.style.top = bounds.top + 'px'
  fireworksCanvas.width = bounds.width
  fireworksCanvas.height = bounds.height

  fireworksCanvas.style.display = 'block'
  rockets = []
  particles = []
  lastFireworkTime = performance.now()
  nextLaunchTime = performance.now() + 500
  renderFireworks()
}

function stopFireworks() {
  if (fireworksAnimationId) {
    cancelAnimationFrame(fireworksAnimationId)
    fireworksAnimationId = null
  }
  if (fireworksCanvas && fireworksCtx) {
    // Clear with black first to remove fade trails, then clear to transparent
    fireworksCtx.fillStyle = 'rgba(0, 0, 0, 1)'
    fireworksCtx.fillRect(0, 0, fireworksCanvas.width, fireworksCanvas.height)
    fireworksCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height)
    fireworksCanvas.style.display = 'none'
  }
  rockets = []
  particles = []
  fireworksIntensity = 1.0 // Reset intensity
}

// ============================================
// SPOTLIGHT EFFECT
// ============================================

function startSpotlights() {
  const bounds = getGameCanvasBounds()

  if (!spotlightCanvas) {
    spotlightCanvas = document.createElement('canvas')
    spotlightCanvas.id = 'vmkpal-spotlight-canvas'
    spotlightCanvas.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483643;
      background: transparent;
    `
    spotlightCtx = spotlightCanvas.getContext('2d')
    document.body.appendChild(spotlightCanvas)
  }

  spotlightCanvas.style.left = bounds.left + 'px'
  spotlightCanvas.style.top = bounds.top + 'px'
  spotlightCanvas.width = bounds.width
  spotlightCanvas.height = bounds.height
  spotlightCanvas.style.display = 'block'

  // Create initial spotlights - 3 on left, 3 on right, synced within groups
  spotlights = []
  const centerX = bounds.width / 2
  const leftGroupPhase = Math.random() * Math.PI * 2
  const rightGroupPhase = Math.random() * Math.PI * 2
  const leftSweepCenter = -Math.PI / 2 - 0.15 // Pointing slightly left
  const rightSweepCenter = -Math.PI / 2 + 0.15 // Pointing slightly right

  // Left group - 3 spotlights
  for (let i = 0; i < 3; i++) {
    const x = centerX * 0.15 + (i * centerX * 0.25) // Spread across left side
    spotlights.push(createSpotlightAt(x, bounds.width, bounds.height, 'left', leftGroupPhase, leftSweepCenter))
  }

  // Right group - 3 spotlights
  for (let i = 0; i < 3; i++) {
    const x = centerX + centerX * 0.35 + (i * centerX * 0.25) // Spread across right side
    spotlights.push(createSpotlightAt(x, bounds.width, bounds.height, 'right', rightGroupPhase, rightSweepCenter))
  }

  isSpotlightsEnabled = true
  lastSpotlightTime = 0 // Reset timing for smooth start
  renderSpotlights()
}

function createSpotlight(canvasWidth, canvasHeight) {
  return createSpotlightAt(Math.random() * canvasWidth, canvasWidth, canvasHeight, null, null, null)
}

function createSpotlightAt(x, canvasWidth, canvasHeight, group = null, sharedPhase = null, sharedCenter = null) {
  const colors = [
    [255, 255, 255], // white
    [200, 200, 255], // blue-white
    [255, 200, 200], // pink-white
    [200, 255, 200], // green-white
    [255, 255, 200]  // yellow-white
  ]
  const startAngle = sharedCenter !== null ? sharedCenter : -Math.PI / 2 + (Math.random() - 0.5) * 0.3
  const phase = sharedPhase !== null ? sharedPhase : Math.random() * Math.PI * 2
  return {
    x: x,
    baseY: canvasHeight,
    angle: startAngle,
    width: 25 + Math.random() * 15,
    length: canvasHeight * 0.85,
    colorRGB: colors[Math.floor(Math.random() * colors.length)],
    baseOpacity: 0.35,
    opacity: 1.0, // Current opacity multiplier (0-1)
    targetOpacity: 1.0, // Target opacity for fading
    group: group, // 'left', 'right', or null for independent
    // Faster movement for more dynamic effect
    sweepSpeed: 0.15 + Math.random() * 0.08, // Faster sweep
    sweepRange: 0.25 + Math.random() * 0.15, // Good range
    sweepCenter: startAngle,
    sweepPhase: phase
  }
}

function updateSpotlights(dt) {
  // Track group phases to keep groups synced
  let leftPhase = null
  let rightPhase = null

  for (const spot of spotlights) {
    // For grouped spotlights, sync to group phase
    if (spot.group === 'left') {
      if (leftPhase === null) {
        spot.sweepPhase += spot.sweepSpeed * dt
        leftPhase = spot.sweepPhase
      } else {
        spot.sweepPhase = leftPhase
      }
    } else if (spot.group === 'right') {
      if (rightPhase === null) {
        spot.sweepPhase += spot.sweepSpeed * dt
        rightPhase = spot.sweepPhase
      } else {
        spot.sweepPhase = rightPhase
      }
    } else {
      // Independent spotlight
      spot.sweepPhase += spot.sweepSpeed * dt
    }

    // Calculate angle from phase
    const sineValue = Math.sin(spot.sweepPhase)
    spot.angle = spot.sweepCenter + sineValue * spot.sweepRange

    // Smoothly fade opacity toward target
    const opacitySpeed = 0.5 // How fast to fade (per second)
    if (spot.opacity < spot.targetOpacity) {
      spot.opacity = Math.min(spot.targetOpacity, spot.opacity + opacitySpeed * dt)
    } else if (spot.opacity > spot.targetOpacity) {
      spot.opacity = Math.max(spot.targetOpacity, spot.opacity - opacitySpeed * dt)
    }
  }
}

function renderSpotlights() {
  if (!spotlightCtx || !isSpotlightsEnabled) return

  const now = performance.now()
  const dt = lastSpotlightTime ? (now - lastSpotlightTime) / 1000 : 1 / 60
  lastSpotlightTime = now

  spotlightCtx.clearRect(0, 0, spotlightCanvas.width, spotlightCanvas.height)

  updateSpotlights(dt)

  // Draw each spotlight beam
  for (const spot of spotlights) {
    // Skip if fully transparent
    if (spot.opacity <= 0.01) continue

    spotlightCtx.save()
    spotlightCtx.translate(spot.x, spot.baseY)
    spotlightCtx.rotate(spot.angle + Math.PI / 2)

    // Calculate opacity-adjusted colors
    const [r, g, b] = spot.colorRGB
    const baseAlpha = spot.baseOpacity * spot.opacity
    const midAlpha = baseAlpha * 0.4
    const glowAlpha = 0.25 * spot.opacity

    // Create gradient along the beam
    const gradient = spotlightCtx.createLinearGradient(0, 0, 0, -spot.length)
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${baseAlpha})`)
    gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${midAlpha})`)
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

    // Draw cone beam (narrower)
    spotlightCtx.beginPath()
    spotlightCtx.moveTo(-spot.width / 3, 0)
    spotlightCtx.lineTo(-spot.width * 1.5, -spot.length)
    spotlightCtx.lineTo(spot.width * 1.5, -spot.length)
    spotlightCtx.lineTo(spot.width / 3, 0)
    spotlightCtx.closePath()

    spotlightCtx.fillStyle = gradient
    spotlightCtx.fill()

    // Add a subtle glow at the base
    const glowGradient = spotlightCtx.createRadialGradient(0, 0, 0, 0, 0, spot.width * 1.5)
    glowGradient.addColorStop(0, `rgba(255, 255, 255, ${glowAlpha})`)
    glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    spotlightCtx.beginPath()
    spotlightCtx.arc(0, 0, spot.width * 1.5, 0, Math.PI * 2)
    spotlightCtx.fillStyle = glowGradient
    spotlightCtx.fill()

    spotlightCtx.restore()
  }

  spotlightAnimationId = requestAnimationFrame(renderSpotlights)
}

function stopSpotlights() {
  isSpotlightsEnabled = false
  if (spotlightAnimationId) {
    cancelAnimationFrame(spotlightAnimationId)
    spotlightAnimationId = null
  }
  if (spotlightCanvas) {
    spotlightCanvas.style.display = 'none'
    spotlightCtx.clearRect(0, 0, spotlightCanvas.width, spotlightCanvas.height)
  }
  spotlights = []
}

// ============================================
// HAPPILY EVER AFTER CHOREOGRAPHED SHOW
// ============================================

// Choreography timeline synced to: https://www.youtube.com/watch?v=ypp4iuJUW2I
// Timestamps in seconds from video start (no offset)
// Spotlights: 6 total (3 left, 3 right) - they fade dim/bright, never disappear
const HAPPILY_EVER_AFTER_CHOREOGRAPHY = [
  // === OPENING (0:00-0:45) - Night fades in, then spotlights ===
  { time: 0, action: 'fireworks', intensity: 0 },
  { time: 0, action: 'night', enabled: true },
  { time: 15, action: 'spotlights', enabled: true }, // Spotlights fade in at 15 seconds

  // === FIRST FIREWORKS (0:45) - Music builds ===
  { time: 45, action: 'fireworks', intensity: 0.3 },

  // === "HAPPILY EVER AFTER" THEME (1:30-2:30) ===
  { time: 90, action: 'fireworks', intensity: 0.5 },
  { time: 90, action: 'spotlights', enabled: false }, // Fade dim
  { time: 110, action: 'fireworks', intensity: 0.7 },
  { time: 130, action: 'fireworks', intensity: 0.9 },
  { time: 150, action: 'fireworks', intensity: 1.1 },

  // === PINOCCHIO / EARLY DISNEY (2:30-4:00) ===
  { time: 170, action: 'fireworks', intensity: 0.6 },
  { time: 190, action: 'fireworks', intensity: 0.8 },
  { time: 210, action: 'fireworks', intensity: 1.0 },
  { time: 230, action: 'fireworks', intensity: 1.2 },

  // === MOANA SECTION (4:00-5:30) - "How Far I'll Go" ===
  { time: 250, action: 'fireworks', intensity: 0.7 },
  { time: 270, action: 'fireworks', intensity: 0.9 },
  { time: 290, action: 'fireworks', intensity: 1.1 },
  { time: 310, action: 'fireworks', intensity: 1.3 },
  { time: 330, action: 'fireworks', intensity: 1.5 },

  // === FROZEN SECTION (5:30-7:00) - "Let It Go" quieter start ===
  { time: 350, action: 'fireworks', intensity: 0.4 },
  { time: 350, action: 'spotlights', enabled: true }, // Fade bright
  { time: 380, action: 'fireworks', intensity: 0.6 },
  { time: 400, action: 'fireworks', intensity: 0.9 },
  { time: 400, action: 'spotlights', enabled: false }, // Fade dim
  { time: 420, action: 'fireworks', intensity: 1.2 },

  // === TANGLED SECTION (7:00-8:30) - "I See the Light" ===
  { time: 440, action: 'fireworks', intensity: 0.5 },
  { time: 440, action: 'spotlights', enabled: true }, // Fade bright
  { time: 460, action: 'fireworks', intensity: 0.7 },
  { time: 480, action: 'fireworks', intensity: 0.9 },
  { time: 500, action: 'fireworks', intensity: 1.1 },
  { time: 500, action: 'spotlights', enabled: false }, // Fade dim
  { time: 510, action: 'fireworks', intensity: 1.3 },

  // === BRAVE SECTION (8:30-10:00) ===
  { time: 530, action: 'fireworks', intensity: 0.8 },
  { time: 550, action: 'fireworks', intensity: 1.0 },
  { time: 570, action: 'fireworks', intensity: 1.2 },
  { time: 590, action: 'fireworks', intensity: 1.4 },

  // === BIG HERO 6 (10:00-11:00) - Action sequence ===
  { time: 610, action: 'fireworks', intensity: 1.3 },
  { time: 630, action: 'fireworks', intensity: 1.5 },
  { time: 650, action: 'fireworks', intensity: 1.7 },

  // === ZOOTOPIA (11:00-12:00) - "Try Everything" ===
  { time: 670, action: 'fireworks', intensity: 1.1 },
  { time: 690, action: 'fireworks', intensity: 1.3 },
  { time: 710, action: 'fireworks', intensity: 1.5 },

  // === PRINCESS MEDLEY (12:00-14:00) ===
  { time: 730, action: 'fireworks', intensity: 1.0 },
  { time: 730, action: 'spotlights', enabled: true }, // Fade bright
  { time: 750, action: 'fireworks', intensity: 1.2 },
  { time: 770, action: 'fireworks', intensity: 1.3 },
  { time: 790, action: 'fireworks', intensity: 1.4 },
  { time: 810, action: 'fireworks', intensity: 1.5 },
  { time: 830, action: 'fireworks', intensity: 1.6 },

  // === "HAPPILY EVER AFTER" REPRISE (14:00-16:00) - Building ===
  { time: 850, action: 'fireworks', intensity: 1.4 },
  { time: 850, action: 'spotlights', enabled: false }, // Fade dim
  { time: 870, action: 'fireworks', intensity: 1.6 },
  { time: 890, action: 'fireworks', intensity: 1.8 },
  { time: 910, action: 'fireworks', intensity: 2.0 },
  { time: 930, action: 'fireworks', intensity: 2.2 },
  { time: 950, action: 'fireworks', intensity: 2.4 },

  // === GRAND FINALE (16:00-17:30) - Maximum intensity ===
  { time: 970, action: 'fireworks', intensity: 2.6 },
  { time: 970, action: 'spotlights', enabled: true }, // Fade bright for finale
  { time: 985, action: 'fireworks', intensity: 2.8 },
  { time: 1000, action: 'fireworks', intensity: 3.0 },
  { time: 1000, action: 'spotlights', enabled: false }, // Fade dim
  { time: 1015, action: 'fireworks', intensity: 3.2 },
  { time: 1030, action: 'fireworks', intensity: 3.5 },
  { time: 1040, action: 'fireworks', intensity: 3.0 },
  { time: 1050, action: 'fireworks', intensity: 2.5 },

  // === ENDING (17:30-18:00) - Gentle fade ===
  { time: 1060, action: 'fireworks', intensity: 1.5 },
  { time: 1060, action: 'spotlights', enabled: true }, // Fade bright for ending
  { time: 1070, action: 'fireworks', intensity: 0.8 },
  { time: 1080, action: 'fireworks', intensity: 0.3 },

  // === END ===
  { time: 1090, action: 'fireworks', intensity: 0 },
  { time: 1090, action: 'spotlights', enabled: false }, // Fade dim at end
  { time: 1095, action: 'end' }
]

let happilyEverAfterYouTubeId = 'ypp4iuJUW2I'
let showStartTime = 0
let lastChoreographyIndex = -1

function startHappilyEverAfterShow(offsetSeconds = 0) {
  const isLateJoin = offsetSeconds > 5
  console.log('MyVMK Genie: Starting Happily Ever After show!' + (isLateJoin ? ` (syncing to ${Math.floor(offsetSeconds)}s)` : ''))

  // Start the YouTube audio (minimized player) - seek if late joining
  const youtubeUrl = `https://www.youtube.com/watch?v=${happilyEverAfterYouTubeId}`
  playAudio(youtubeUrl, true, offsetSeconds)

  // Start Tinkerbell (event mode - limited to top 70%)
  startTinkerbellEffect(true)

  // Start night overlay (fades in slowly via CSS transition)
  startNightOverlay(true)

  // Start stars overlay
  if (!isStarsOverlayEnabled) {
    toggleStarsOverlay()
  }

  // Note: Spotlights start at 15 seconds via choreography (not immediately)

  // Initialize show timing - adjust for late join offset
  showStartTime = performance.now() - (offsetSeconds * 1000)
  choreographyActive = true

  // For late joiners, find the correct starting point in choreography
  // and apply current state (fireworks intensity, spotlights, etc.)
  if (isLateJoin) {
    // Find the last choreography index before our current time
    lastChoreographyIndex = -1
    let currentFireworksIntensity = 0
    let spotlightsEnabled = false

    for (let i = 0; i < HAPPILY_EVER_AFTER_CHOREOGRAPHY.length; i++) {
      const event = HAPPILY_EVER_AFTER_CHOREOGRAPHY[i]
      if (event.time <= offsetSeconds) {
        lastChoreographyIndex = i
        // Track state without executing (we'll apply final state)
        if (event.action === 'fireworks') {
          currentFireworksIntensity = event.intensity
        } else if (event.action === 'spotlights') {
          spotlightsEnabled = event.enabled
        }
      } else {
        break
      }
    }

    // Apply current state
    if (currentFireworksIntensity > 0) {
      isFireworksEnabled = true
      fireworksIntensity = currentFireworksIntensity
      startFireworks()
    }
    if (spotlightsEnabled) {
      startSpotlights()
    }

    console.log('MyVMK Genie: Late join - starting at choreography index', lastChoreographyIndex, 'fireworks:', currentFireworksIntensity, 'spotlights:', spotlightsEnabled)
  } else {
    lastChoreographyIndex = -1
  }

  // Start the choreography loop
  choreographyInterval = setInterval(() => {
    if (!choreographyActive) {
      clearInterval(choreographyInterval)
      return
    }

    const elapsedSeconds = (performance.now() - showStartTime) / 1000

    // Process all choreography events up to current time
    for (let i = lastChoreographyIndex + 1; i < HAPPILY_EVER_AFTER_CHOREOGRAPHY.length; i++) {
      const event = HAPPILY_EVER_AFTER_CHOREOGRAPHY[i]
      if (event.time <= elapsedSeconds) {
        executeChoreographyEvent(event)
        lastChoreographyIndex = i
      } else {
        break
      }
    }
  }, 100) // Check every 100ms
}

function executeChoreographyEvent(event) {
  console.log('MyVMK Genie: Choreography event:', event)

  switch (event.action) {
    case 'fireworks':
      if (event.intensity > 0 && !isFireworksEnabled) {
        isFireworksEnabled = true
        startFireworks()
      }
      fireworksIntensity = event.intensity
      if (event.intensity === 0 && isFireworksEnabled) {
        isFireworksEnabled = false
        stopFireworks()
      }
      break

    case 'spotlights':
      if (event.enabled === true && !isSpotlightsEnabled) {
        startSpotlights()
      } else if (event.enabled === false && isSpotlightsEnabled) {
        // Fade out spotlights instead of stopping them abruptly
        for (const spot of spotlights) {
          spot.targetOpacity = 0.15 // Fade to very dim, not completely off
        }
      } else if (event.enabled === true && isSpotlightsEnabled) {
        // Fade spotlights back in
        for (const spot of spotlights) {
          spot.targetOpacity = 1.0
        }
      }
      // Ignore count changes - keep the 6 spotlight configuration
      break

    case 'night':
      if (event.enabled) {
        startNightOverlay(true)
      } else {
        stopNightOverlay()
      }
      break

    case 'end':
      stopHappilyEverAfterShow()
      break
  }
}

function stopHappilyEverAfterShow() {
  console.log('MyVMK Genie: Stopping Happily Ever After show')
  choreographyActive = false

  if (choreographyInterval) {
    clearInterval(choreographyInterval)
    choreographyInterval = null
  }

  // Stop audio
  stopAudio()

  // Stop Tinkerbell
  stopTinkerbellEffect()

  // Stop stars overlay
  if (isStarsOverlayEnabled) {
    toggleStarsOverlay()
  }

  // Stop all effects
  if (isFireworksEnabled) {
    isFireworksEnabled = false
    stopFireworks()
  }
  stopSpotlights()
  stopNightOverlay()

  fireworksIntensity = 1.0
  lastChoreographyIndex = -1
}

// Snow Effect
function toggleSnowOverlay() {
  isSnowEnabled = !isSnowEnabled

  if (isSnowEnabled) {
    // User manually enabled snow - reset the Matterhorn preference
    if (currentRoomId === MATTERHORN_ID) {
      matterhornSnowDisabledByUser = false
    }
    startSnowEffect()
    showNotification('❄️ Snow enabled', 'success')
  } else {
    // User manually disabled snow - track preference if in Matterhorn
    if (currentRoomId === MATTERHORN_ID) {
      matterhornSnowDisabledByUser = true
    }
    stopSnowEffect()
    showNotification('☀️ Snow disabled', 'info')
  }

  chrome.storage.local.set({ snowEnabled: isSnowEnabled })
}

function createSnowflake(randomY = false) {
  const bounds = getGameCanvasBounds()
  const size = 2 + Math.random() * 4 // Varying sizes for depth effect

  return {
    x: Math.random() * (bounds.width + 100) - 50,
    y: randomY ? Math.random() * bounds.height : -10,
    speed: SNOW_SPEED_MIN + Math.random() * (SNOW_SPEED_MAX - SNOW_SPEED_MIN),
    size: size,
    opacity: 0.4 + Math.random() * 0.6,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 1 + Math.random() * 2,
    wobbleAmount: 20 + Math.random() * 30,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 60
  }
}

function initSnowflakes() {
  snowflakes = []
  for (let i = 0; i < SNOWFLAKE_COUNT; i++) {
    snowflakes.push(createSnowflake(true))
  }
  lastSnowTime = performance.now()
}

function updateSnowflakes(dt) {
  const bounds = getGameCanvasBounds()

  for (let i = 0; i < snowflakes.length; i++) {
    const flake = snowflakes[i]

    // Fall down
    flake.y += flake.speed * dt

    // Wobble side to side
    flake.wobble += flake.wobbleSpeed * dt
    flake.x += Math.sin(flake.wobble) * flake.wobbleAmount * dt

    // Rotate
    flake.rotation += flake.rotationSpeed * dt

    // Reset if off screen
    if (flake.y > bounds.height + 10 || flake.x < -50 || flake.x > bounds.width + 50) {
      snowflakes[i] = createSnowflake(false)
      snowflakes[i].x = Math.random() * (bounds.width + 100) - 50
    }
  }
}

let snowOpacity = 1
let snowFadeDirection = 0 // 0 = none, 1 = fading in, -1 = fading out
let snowFadeCallback = null
const SNOW_FADE_SPEED = 0.3 // Opacity change per second

function renderSnow() {
  if (!snowCtx) return

  // Handle fade in/out
  if (snowFadeDirection !== 0) {
    const fadeAmount = SNOW_FADE_SPEED / 60 // Assuming ~60fps
    if (snowFadeDirection > 0) {
      // Fading in
      snowOpacity = Math.min(1, snowOpacity + fadeAmount)
      if (snowOpacity >= 1) {
        snowFadeDirection = 0
      }
    } else {
      // Fading out
      snowOpacity = Math.max(0, snowOpacity - fadeAmount)
      if (snowOpacity <= 0) {
        snowFadeDirection = 0
        if (snowFadeCallback) {
          snowFadeCallback()
          snowFadeCallback = null
          return // Stop rendering after fade out complete
        }
      }
    }
    if (snowCanvas) {
      snowCanvas.style.opacity = snowOpacity
    }
  }

  if (!isSnowEnabled && snowFadeDirection === 0) return

  const now = performance.now()
  const dt = Math.min((now - lastSnowTime) / 1000, 0.1)
  lastSnowTime = now

  snowCtx.clearRect(0, 0, snowCanvas.width, snowCanvas.height)
  updateSnowflakes(dt)

  for (const flake of snowflakes) {
    snowCtx.save()
    snowCtx.translate(flake.x, flake.y)
    snowCtx.rotate(flake.rotation * Math.PI / 180)

    // Draw snowflake
    snowCtx.beginPath()
    snowCtx.arc(0, 0, flake.size, 0, Math.PI * 2)

    // Gradient for soft glow effect
    const gradient = snowCtx.createRadialGradient(0, 0, 0, 0, 0, flake.size)
    gradient.addColorStop(0, `rgba(255, 255, 255, ${flake.opacity})`)
    gradient.addColorStop(0.5, `rgba(220, 240, 255, ${flake.opacity * 0.8})`)
    gradient.addColorStop(1, `rgba(200, 220, 255, 0)`)

    snowCtx.fillStyle = gradient
    snowCtx.fill()

    snowCtx.restore()
  }

  snowAnimationId = requestAnimationFrame(renderSnow)
}

function startSnowEffect() {
  const bounds = getGameCanvasBounds()

  if (!snowCanvas) {
    snowCanvas = document.createElement('canvas')
    snowCanvas.id = 'vmkpal-snow-canvas'
    snowCanvas.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483643;
      transition: opacity 0.1s linear;
    `
    snowCtx = snowCanvas.getContext('2d')
    document.body.appendChild(snowCanvas)
  }

  // Apply bounds
  snowCanvas.style.left = bounds.left + 'px'
  snowCanvas.style.top = bounds.top + 'px'
  snowCanvas.width = bounds.width
  snowCanvas.height = bounds.height

  snowCanvas.style.display = 'block'

  // Start with low opacity and fade in
  snowOpacity = 0.1
  snowCanvas.style.opacity = snowOpacity
  snowFadeDirection = 1 // Fading in
  snowFadeCallback = null

  initSnowflakes()
  renderSnow()
}

function stopSnowEffect(immediate = false) {
  if (immediate) {
    // Immediate stop (for cleanup)
    if (snowAnimationId) {
      cancelAnimationFrame(snowAnimationId)
      snowAnimationId = null
    }
    if (snowCanvas) {
      snowCanvas.style.display = 'none'
      snowCanvas.style.opacity = '0'
    }
    snowOpacity = 0
    snowFadeDirection = 0
    return
  }

  // Gradual fade out
  snowFadeDirection = -1
  snowFadeCallback = () => {
    if (snowAnimationId) {
      cancelAnimationFrame(snowAnimationId)
      snowAnimationId = null
    }
    if (snowCanvas) {
      snowCanvas.style.display = 'none'
    }
    snowOpacity = 0
    snowFadeDirection = 0
  }
}

// Custom Emoji Rain Effect
function toggleEmojiRain() {
  isEmojiRainEnabled = !isEmojiRainEnabled

  if (isEmojiRainEnabled) {
    startEmojiRain()
    showNotification(`${selectedEmoji} Emoji rain enabled`, 'success')
  } else {
    stopEmojiRain()
    showNotification('Emoji rain disabled', 'info')
  }

  chrome.storage.local.set({ emojiRainEnabled: isEmojiRainEnabled })
}

function createEmojiDrop(randomY = false) {
  const bounds = getGameCanvasBounds()
  return {
    x: Math.random() * bounds.width,
    y: randomY ? Math.random() * bounds.height : -50,
    speed: EMOJI_SPEED_MIN + Math.random() * (EMOJI_SPEED_MAX - EMOJI_SPEED_MIN),
    size: 20 + Math.random() * 16,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 120,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 1.5 + Math.random() * 2,
    wobbleAmount: 25 + Math.random() * 25
  }
}

function initEmojiDrops() {
  emojiDrops = []
  for (let i = 0; i < EMOJI_DROP_COUNT; i++) {
    emojiDrops.push(createEmojiDrop(true))
  }
  lastEmojiTime = performance.now()
}

function updateEmojiDrops(dt) {
  const bounds = getGameCanvasBounds()

  for (let i = 0; i < emojiDrops.length; i++) {
    const drop = emojiDrops[i]
    drop.y += drop.speed * dt
    drop.rotation += drop.rotationSpeed * dt
    drop.wobble += drop.wobbleSpeed * dt

    if (drop.y > bounds.height + 50) {
      emojiDrops[i] = createEmojiDrop(false)
    }
  }
}

function renderEmojiRain() {
  if (!emojiCtx || !isEmojiRainEnabled) return

  const now = performance.now()
  const dt = Math.min((now - lastEmojiTime) / 1000, 0.1)
  lastEmojiTime = now

  emojiCtx.clearRect(0, 0, emojiCanvas.width, emojiCanvas.height)
  updateEmojiDrops(dt)

  for (const drop of emojiDrops) {
    const wobbleX = Math.sin(drop.wobble) * drop.wobbleAmount

    emojiCtx.save()
    emojiCtx.translate(drop.x + wobbleX, drop.y)
    emojiCtx.rotate(drop.rotation * Math.PI / 180)
    emojiCtx.font = `${drop.size}px serif`
    emojiCtx.textAlign = 'center'
    emojiCtx.textBaseline = 'middle'
    emojiCtx.fillText(selectedEmoji, 0, 0)
    emojiCtx.restore()
  }

  emojiAnimationId = requestAnimationFrame(renderEmojiRain)
}

function startEmojiRain() {
  const bounds = getGameCanvasBounds()

  if (!emojiCanvas) {
    emojiCanvas = document.createElement('canvas')
    emojiCanvas.id = 'vmkpal-emoji-canvas'
    emojiCanvas.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483642;
    `
    emojiCtx = emojiCanvas.getContext('2d')
    document.body.appendChild(emojiCanvas)
  }

  // Apply bounds
  emojiCanvas.style.left = bounds.left + 'px'
  emojiCanvas.style.top = bounds.top + 'px'
  emojiCanvas.width = bounds.width
  emojiCanvas.height = bounds.height

  emojiCanvas.style.display = 'block'
  initEmojiDrops()
  renderEmojiRain()
}

function stopEmojiRain() {
  if (emojiAnimationId) {
    cancelAnimationFrame(emojiAnimationId)
    emojiAnimationId = null
  }
  if (emojiCanvas) {
    emojiCanvas.style.display = 'none'
  }
}

function setSelectedEmoji(emoji) {
  selectedEmoji = emoji
  chrome.storage.local.set({ selectedEmoji })
}

// Haunted Mansion Ghost Effect
function createGhost() {
  const bounds = getGameCanvasBounds()
  const imageFile = GHOST_IMAGES[Math.floor(Math.random() * GHOST_IMAGES.length)]
  const imageUrl = chrome.runtime.getURL(imageFile)

  // Create ghost element
  const ghost = document.createElement('img')
  ghost.src = imageUrl
  ghost.className = 'vmkpal-ghost'
  ghost.style.cssText = `
    position: fixed;
    width: 50px;
    height: auto;
    pointer-events: none;
    opacity: 0;
    z-index: 2147483640;
    filter: drop-shadow(0 0 12px rgba(${GHOST_GLOW_COLOR}, 0.8))
            drop-shadow(0 0 24px rgba(${GHOST_GLOW_COLOR}, 0.5))
            drop-shadow(0 0 36px rgba(${GHOST_GLOW_COLOR}, 0.3));
    transition: opacity 2s ease-in-out;
  `

  // Random starting position within game bounds
  const startX = bounds.left + Math.random() * (bounds.width - 50)
  const startY = bounds.top + Math.random() * (bounds.height - 60)
  ghost.style.left = startX + 'px'
  ghost.style.top = startY + 'px'

  document.body.appendChild(ghost)

  // Ghost movement data
  const ghostData = {
    element: ghost,
    x: startX,
    y: startY,
    vx: (Math.random() - 0.5) * 30, // Horizontal drift
    vy: (Math.random() - 0.5) * 20, // Vertical drift
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.5 + Math.random() * 0.5,
    startTime: performance.now(),
    fadeInComplete: false
  }

  activeGhosts.push(ghostData)

  // Fade in
  requestAnimationFrame(() => {
    ghost.style.opacity = '0.85'
  })

  // Schedule fade out and removal
  setTimeout(() => {
    ghost.style.opacity = '0'
    setTimeout(() => {
      ghost.remove()
      const index = activeGhosts.indexOf(ghostData)
      if (index > -1) {
        activeGhosts.splice(index, 1)
      }
    }, 2000) // Wait for fade out transition
  }, GHOST_LIFETIME - 2000) // Start fade out 2s before lifetime ends
}

function updateGhosts() {
  if (!isGhostEffectActive) return

  const bounds = getGameCanvasBounds()
  const now = performance.now()

  for (const ghost of activeGhosts) {
    // Wobble effect
    ghost.wobblePhase += ghost.wobbleSpeed * 0.016 // ~60fps

    // Update position with drift and wobble
    ghost.x += ghost.vx * 0.016
    ghost.y += ghost.vy * 0.016

    // Add floating wobble
    const wobbleX = Math.sin(ghost.wobblePhase) * 15
    const wobbleY = Math.sin(ghost.wobblePhase * 0.7) * 10

    // Keep within bounds (with soft bounce)
    if (ghost.x < bounds.left || ghost.x > bounds.left + bounds.width - 50) {
      ghost.vx *= -0.8
      ghost.x = Math.max(bounds.left, Math.min(ghost.x, bounds.left + bounds.width - 50))
    }
    if (ghost.y < bounds.top || ghost.y > bounds.top + bounds.height - 60) {
      ghost.vy *= -0.8
      ghost.y = Math.max(bounds.top, Math.min(ghost.y, bounds.top + bounds.height - 60))
    }

    // Apply position
    ghost.element.style.left = (ghost.x + wobbleX) + 'px'
    ghost.element.style.top = (ghost.y + wobbleY) + 'px'

    // Subtle rotation for ghostly effect
    const rotation = Math.sin(ghost.wobblePhase * 0.5) * 5
    ghost.element.style.transform = `rotate(${rotation}deg)`
  }

  ghostAnimationId = requestAnimationFrame(updateGhosts)
}

function startGhostEffect() {
  if (isGhostEffectActive) return

  isGhostEffectActive = true
  console.log('MyVMK Genie: Starting Haunted Mansion ghost effect')

  // Start animation loop
  updateGhosts()

  // Spawn first ghost immediately
  if (activeGhosts.length < GHOST_MAX_COUNT) {
    createGhost()
  }

  // Spawn ghosts periodically
  ghostSpawnInterval = setInterval(() => {
    if (activeGhosts.length < GHOST_MAX_COUNT && isGhostEffectActive) {
      createGhost()
    }
  }, GHOST_SPAWN_INTERVAL)
}

function stopGhostEffect() {
  if (!isGhostEffectActive) return

  isGhostEffectActive = false
  console.log('MyVMK Genie: Stopping Haunted Mansion ghost effect')

  // Clear spawn interval
  if (ghostSpawnInterval) {
    clearInterval(ghostSpawnInterval)
    ghostSpawnInterval = null
  }

  // Cancel animation
  if (ghostAnimationId) {
    cancelAnimationFrame(ghostAnimationId)
    ghostAnimationId = null
  }

  // Fade out and remove all ghosts
  for (const ghost of activeGhosts) {
    ghost.element.style.opacity = '0'
    setTimeout(() => {
      ghost.element.remove()
    }, 2000)
  }
  activeGhosts = []
}

// Check if ghost effect should be active based on current room
function checkGhostEffectRoom() {
  // Show ghost only in HM Lobby
  if (currentRoomId === HAUNTED_MANSION_LOBBY_ID && !isInHMGame) {
    if (!isGhostEffectActive) {
      startGhostEffect()
    }
    return
  }

  // No ghost in HM Game or anywhere else
  if (isGhostEffectActive) {
    stopGhostEffect()
  }
}

// Tinkerbell Effect for Fantasyland Courtyard
function createTinkerbell() {
  if (tinkerbellElement) return // Already exists

  const bounds = getGameCanvasBounds()
  const imageUrl = chrome.runtime.getURL(TINKERBELL_IMAGE)

  // Create Tinkerbell element
  const tink = document.createElement('img')
  tink.src = imageUrl
  tink.className = 'vmkpal-tinkerbell'
  tink.style.cssText = `
    position: fixed;
    width: 24px;
    height: auto;
    pointer-events: none;
    opacity: 0;
    z-index: 2147483640;
    filter: drop-shadow(0 0 5px rgba(${TINKERBELL_GLOW_COLOR}, 0.9))
            drop-shadow(0 0 10px rgba(${TINKERBELL_GLOW_COLOR}, 0.6))
            drop-shadow(0 0 15px rgba(${TINKERBELL_GLOW_COLOR}, 0.4));
    transition: opacity 1s ease-in-out, transform 0.3s ease;
  `

  // Start near center of game area (or upper area if event mode)
  const startX = bounds.left + bounds.width / 2
  const maxHeight = tinkerbellEventMode ? bounds.height * 0.7 : bounds.height
  const startY = bounds.top + maxHeight / 2
  tink.style.left = startX + 'px'
  tink.style.top = startY + 'px'

  document.body.appendChild(tink)
  tinkerbellElement = tink

  // Tinkerbell movement data - more erratic pixie-like movement
  tinkerbellData = {
    x: startX,
    y: startY,
    targetX: startX,
    targetY: startY,
    phase: 0,
    speed: 3,
    lastTargetChange: performance.now(),
    targetChangeInterval: 2000 + Math.random() * 2000, // Change target every 2-4 seconds
    facingLeft: false,
    lastDustSpawn: performance.now()
  }

  // Fade in
  requestAnimationFrame(() => {
    tink.style.opacity = '1'
  })
}

// Create a pixie dust particle
function createPixieDust(x, y) {
  const particle = document.createElement('div')
  particle.className = 'vmkpal-pixie-dust'
  particle.style.cssText = `
    position: fixed;
    width: 2px;
    height: 2px;
    background: rgb(${TINKERBELL_GLOW_COLOR});
    border-radius: 50%;
    pointer-events: none;
    z-index: 2147483639;
    left: ${x + Math.random() * 10 - 5}px;
    top: ${y + Math.random() * 10 - 5}px;
    opacity: 0.8;
    box-shadow: 0 0 3px rgba(${TINKERBELL_GLOW_COLOR}, 0.8);
  `
  document.body.appendChild(particle)

  // Animate falling and fading
  const startTime = performance.now()
  const duration = 800 + Math.random() * 400 // 0.8-1.2 seconds
  const startY = parseFloat(particle.style.top)
  const drift = (Math.random() - 0.5) * 20 // Random horizontal drift

  function animateDust() {
    const elapsed = performance.now() - startTime
    const progress = elapsed / duration

    if (progress >= 1) {
      particle.remove()
      return
    }

    // Fall down slowly with slight drift
    particle.style.top = (startY + progress * 30) + 'px'
    particle.style.left = (parseFloat(particle.style.left) + drift * 0.02) + 'px'
    particle.style.opacity = 0.8 * (1 - progress)
    particle.style.transform = `scale(${1 - progress * 0.5})`

    requestAnimationFrame(animateDust)
  }

  requestAnimationFrame(animateDust)
  pixieDustParticles.push(particle)

  // Clean up old references
  if (pixieDustParticles.length > 50) {
    pixieDustParticles = pixieDustParticles.filter(p => document.body.contains(p))
  }
}

function updateTinkerbell() {
  if (!isTinkerbellActive || !tinkerbellElement || !tinkerbellData) return

  const bounds = getGameCanvasBounds()
  const now = performance.now()
  const data = tinkerbellData

  // Calculate max Y based on event mode (70% for events, 100% for Fantasyland)
  const maxHeight = tinkerbellEventMode ? bounds.height * 0.7 : bounds.height

  // Change target position periodically for wandering behavior
  if (now - data.lastTargetChange > data.targetChangeInterval) {
    data.targetX = bounds.left + 40 + Math.random() * (bounds.width - 80)
    data.targetY = bounds.top + 40 + Math.random() * (maxHeight - 80)
    data.targetChangeInterval = 3000 + Math.random() * 3000 // 3-6 seconds between targets
    data.lastTargetChange = now
  }

  // Smooth easing toward target (no sudden movements)
  const dx = data.targetX - data.x
  const dy = data.targetY - data.y

  // Gentle easing - move 1% of remaining distance each frame
  data.x += dx * 0.015
  data.y += dy * 0.015

  // Keep within bounds
  data.x = Math.max(bounds.left + 20, Math.min(data.x, bounds.left + bounds.width - 60))
  data.y = Math.max(bounds.top + 20, Math.min(data.y, bounds.top + maxHeight - 60))

  // Flip Tinkerbell based on movement direction
  if (Math.abs(dx) > 1) { // Only flip if moving significantly
    const shouldFaceLeft = dx < 0
    if (shouldFaceLeft !== data.facingLeft) {
      data.facingLeft = shouldFaceLeft
      tinkerbellElement.style.transform = shouldFaceLeft ? 'scaleX(-1)' : 'scaleX(1)'
    }
  }

  // Spawn pixie dust particles occasionally
  if (now - data.lastDustSpawn > 100) { // Every 100ms
    createPixieDust(data.x + 12, data.y + 15) // Center of Tinkerbell
    data.lastDustSpawn = now
  }

  // Apply position
  tinkerbellElement.style.left = data.x + 'px'
  tinkerbellElement.style.top = data.y + 'px'

  tinkerbellAnimationId = requestAnimationFrame(updateTinkerbell)
}

function startTinkerbellEffect(eventMode = false) {
  if (isTinkerbellActive) return

  isTinkerbellActive = true
  tinkerbellEventMode = eventMode
  createTinkerbell()
  updateTinkerbell()
}

function stopTinkerbellEffect() {
  if (!isTinkerbellActive) return

  isTinkerbellActive = false
  tinkerbellEventMode = false

  if (tinkerbellAnimationId) {
    cancelAnimationFrame(tinkerbellAnimationId)
    tinkerbellAnimationId = null
  }

  if (tinkerbellElement) {
    tinkerbellElement.style.opacity = '0'
    setTimeout(() => {
      if (tinkerbellElement) {
        tinkerbellElement.remove()
        tinkerbellElement = null
      }
      tinkerbellData = null
    }, 1000)
  }

  // Clean up any remaining pixie dust
  pixieDustParticles.forEach(p => {
    if (p && p.parentNode) p.remove()
  })
  pixieDustParticles = []
}

function checkTinkerbellRoom() {
  // Show Tinkerbell only in Fantasyland Courtyard
  if (currentRoomId === FANTASYLAND_COURTYARD_ID) {
    if (!isTinkerbellActive) {
      startTinkerbellEffect()
    }
    return
  }

  // Remove Tinkerbell in any other room
  if (isTinkerbellActive) {
    stopTinkerbellEffect()
  }
}

// Butterfly flight patterns - each butterfly has unique movement characteristics
const BUTTERFLY_PATTERNS = [
  { // Butterfly 1: Gentle floater - slow, wide arcs, very smooth
    moveSpeed: 0.003,
    wobbleSpeed: 0.015,
    wobbleAmount: 0.3,
    wobbleInfluence: 0.08,
    targetInterval: 8000,
    phaseOffset: 0
  },
  { // Butterfly 2: Drifter - medium speed, figure-8 pattern
    moveSpeed: 0.004,
    wobbleSpeed: 0.025,
    wobbleAmount: 0.6,
    wobbleInfluence: 0.12,
    targetInterval: 6000,
    phaseOffset: Math.PI * 0.66
  },
  { // Butterfly 3: Explorer - slightly faster, more direct paths
    moveSpeed: 0.005,
    wobbleSpeed: 0.02,
    wobbleAmount: 0.4,
    wobbleInfluence: 0.1,
    targetInterval: 5000,
    phaseOffset: Math.PI * 1.33
  }
]

// Butterfly Effect for Snow White Hide 'n Seek Forest
function createButterfly(index) {
  const bounds = getGameCanvasBounds()
  const pattern = BUTTERFLY_PATTERNS[index]

  // Use specific butterfly image for this index
  const imageUrl = chrome.runtime.getURL(BUTTERFLY_IMAGES[index])

  // Create butterfly element
  const butterfly = document.createElement('img')
  butterfly.src = imageUrl
  butterfly.className = 'vmkpal-butterfly'

  // Start from different positions for each butterfly
  const startPositions = [
    { x: bounds.left + bounds.width * 0.25, y: bounds.top + bounds.height * 0.3 },
    { x: bounds.left + bounds.width * 0.75, y: bounds.top + bounds.height * 0.5 },
    { x: bounds.left + bounds.width * 0.5, y: bounds.top + bounds.height * 0.7 }
  ]
  const startPos = startPositions[index]

  butterfly.style.cssText = `
    position: fixed;
    width: 18px;
    height: auto;
    pointer-events: none;
    opacity: 0;
    z-index: 2147483640;
    filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.5));
    transition: opacity 1.5s ease-in-out;
    left: ${startPos.x}px;
    top: ${startPos.y}px;
  `

  document.body.appendChild(butterfly)

  const data = {
    element: butterfly,
    x: startPos.x,
    y: startPos.y,
    targetX: bounds.left + 50 + Math.random() * (bounds.width - 100),
    targetY: bounds.top + 50 + Math.random() * (bounds.height - 100),
    phase: pattern.phaseOffset,
    pattern: pattern,
    lastTargetChange: performance.now()
  }

  butterflyElements.push(butterfly)
  butterflyData.push(data)

  // Fade in with slight delay per butterfly
  setTimeout(() => {
    butterfly.style.opacity = '1'
  }, index * 500)
}

function updateButterflies() {
  if (!isButterflyActive) return

  const bounds = getGameCanvasBounds()
  const now = performance.now()

  for (let i = 0; i < butterflyData.length; i++) {
    const data = butterflyData[i]
    const butterfly = data.element
    const pattern = data.pattern

    // Change target position periodically based on pattern
    if (now - data.lastTargetChange > pattern.targetInterval) {
      data.targetX = bounds.left + 60 + Math.random() * (bounds.width - 120)
      data.targetY = bounds.top + 60 + Math.random() * (bounds.height - 120)
      data.lastTargetChange = now
    }

    // Move toward target with pattern-specific wobble
    const dx = data.targetX - data.x
    const dy = data.targetY - data.y

    data.phase += pattern.wobbleSpeed
    const wobbleX = Math.sin(data.phase) * pattern.wobbleAmount
    const wobbleY = Math.cos(data.phase * 1.3) * pattern.wobbleAmount

    // Apply pattern-specific movement
    data.x += dx * pattern.moveSpeed + wobbleX * pattern.wobbleInfluence
    data.y += dy * pattern.moveSpeed + wobbleY * pattern.wobbleInfluence

    // Keep within bounds
    data.x = Math.max(bounds.left + 15, Math.min(data.x, bounds.left + bounds.width - 35))
    data.y = Math.max(bounds.top + 15, Math.min(data.y, bounds.top + bounds.height - 35))

    // Apply position and flip based on direction
    butterfly.style.left = data.x + 'px'
    butterfly.style.top = data.y + 'px'

    // Flip butterfly to face movement direction (default image faces right)
    if (dx < -0.5) {
      butterfly.style.transform = 'scaleX(-1)'
    } else if (dx > 0.5) {
      butterfly.style.transform = 'scaleX(1)'
    }
  }

  butterflyAnimationId = requestAnimationFrame(updateButterflies)
}

function startButterflyEffect() {
  if (isButterflyActive) return

  isButterflyActive = true

  // Create all 3 butterflies permanently
  for (let i = 0; i < 3; i++) {
    createButterfly(i)
  }

  updateButterflies()
}

function stopButterflyEffect() {
  if (!isButterflyActive) return

  isButterflyActive = false

  if (butterflyAnimationId) {
    cancelAnimationFrame(butterflyAnimationId)
    butterflyAnimationId = null
  }

  if (butterflySpawnTimer) {
    clearTimeout(butterflySpawnTimer)
    butterflySpawnTimer = null
  }

  // Fade out all butterflies
  butterflyElements.forEach(butterfly => {
    butterfly.style.opacity = '0'
  })

  setTimeout(() => {
    butterflyElements.forEach(butterfly => butterfly.remove())
    butterflyElements = []
    butterflyData = []
  }, 1500)
}

function checkButterflyRoom() {
  // Show butterflies only in Snow White Forest
  if (currentRoomId === SNOW_WHITE_FOREST_ID) {
    if (!isButterflyActive) {
      startButterflyEffect()
    }
    return
  }

  // Remove butterflies in any other room
  if (isButterflyActive) {
    stopButterflyEffect()
  }
}

function checkMatterhornRoom() {
  // Only check if we've actually detected a room via audio this session
  // This prevents snow from auto-enabling due to stale room data from storage
  if (!hasDetectedRoomThisSession) {
    return
  }

  // Auto-enable snow in Matterhorn (unless user manually disabled it)
  if (currentRoomId === MATTERHORN_ID) {
    if (!isSnowEnabled && !matterhornSnowDisabledByUser) {
      isSnowEnabled = true
      startSnowEffect()
    }
    return
  }

  // Reset user preference when leaving Matterhorn (so snow auto-enables next visit)
  if (matterhornSnowDisabledByUser) {
    matterhornSnowDisabledByUser = false
  }

  // Auto-disable snow when leaving Matterhorn
  if (isSnowEnabled) {
    isSnowEnabled = false
    stopSnowEffect()
    console.log('MyVMK Genie: Auto-disabled snow (left Matterhorn)')
  }
}

const CASTLE_GARDENS_ID = 30

function checkCastleGardensRoom() {
  if (!hasDetectedRoomThisSession) return

  // Show castle overlay in Castle Gardens
  if (currentRoomId === CASTLE_GARDENS_ID) {
    if (!isCastleOverlayActive) {
      startCastleOverlay()
    }
  } else {
    // Stop castle overlay when leaving Castle Gardens
    if (isCastleOverlayActive) {
      stopCastleOverlay()
    }
  }
}

// ============================================
// KINGDOM SYNC EFFECTS
// ============================================

// Firefly Effect - glowing dots that pulse/twinkle
function initFireflies() {
  const width = fireflyCanvas ? fireflyCanvas.width : 800
  const height = fireflyCanvas ? fireflyCanvas.height : 600
  fireflies = []
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    fireflies.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 2 + Math.random() * 2,
      pulseSpeed: 0.5 + Math.random() * 1.5,
      pulsePhase: Math.random() * Math.PI * 2,
      driftX: (Math.random() - 0.5) * 0.3,
      driftY: (Math.random() - 0.5) * 0.3
    })
  }
}

function startFireflyEffect() {
  const bounds = getGameCanvasBounds()

  if (!fireflyCanvas) {
    fireflyCanvas = document.createElement('canvas')
    fireflyCanvas.id = 'vmkpal-firefly-canvas'
    fireflyCanvas.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483642;
    `
    fireflyCtx = fireflyCanvas.getContext('2d')
    document.body.appendChild(fireflyCanvas)
  }

  // Apply bounds
  fireflyCanvas.style.left = bounds.left + 'px'
  fireflyCanvas.style.top = bounds.top + 'px'
  fireflyCanvas.width = bounds.width
  fireflyCanvas.height = bounds.height

  fireflyCanvas.style.display = 'block'
  isFirefliesActive = true
  initFireflies()
  renderFireflies()
  console.log('MyVMK Genie: Started firefly effect')
}

function renderFireflies() {
  if (!fireflyCtx || !isFirefliesActive) return

  const now = performance.now() / 1000
  const width = fireflyCanvas.width
  const height = fireflyCanvas.height

  fireflyCtx.clearRect(0, 0, width, height)

  for (const fly of fireflies) {
    // Pulse brightness using sine wave
    const pulse = (Math.sin(now * fly.pulseSpeed + fly.pulsePhase) + 1) / 2
    const alpha = 0.3 + pulse * 0.7

    // Gentle drift
    fly.x += fly.driftX
    fly.y += fly.driftY

    // Wrap around canvas bounds
    if (fly.x < 0) fly.x = width
    if (fly.x > width) fly.x = 0
    if (fly.y < 0) fly.y = height
    if (fly.y > height) fly.y = 0

    // Draw glowing dot
    const gradient = fireflyCtx.createRadialGradient(
      fly.x, fly.y, 0,
      fly.x, fly.y, fly.size * 3
    )
    gradient.addColorStop(0, `rgba(255, 255, 150, ${alpha})`)
    gradient.addColorStop(0.3, `rgba(200, 255, 100, ${alpha * 0.6})`)
    gradient.addColorStop(1, 'rgba(100, 200, 50, 0)')

    fireflyCtx.beginPath()
    fireflyCtx.arc(fly.x, fly.y, fly.size * 3, 0, Math.PI * 2)
    fireflyCtx.fillStyle = gradient
    fireflyCtx.fill()
  }

  fireflyAnimationId = requestAnimationFrame(renderFireflies)
}

function stopFireflyEffect() {
  if (fireflyAnimationId) {
    cancelAnimationFrame(fireflyAnimationId)
    fireflyAnimationId = null
  }
  if (fireflyCanvas) {
    fireflyCanvas.style.display = 'none'
  }
  isFirefliesActive = false
  console.log('MyVMK Genie: Stopped firefly effect')
}

// Fog Effect - ambient fog overlay covering full canvas
function startFogEffect(isLight = false) {
  if (isFogActive) return
  isFogActive = true

  const bounds = getGameCanvasBounds()
  const baseOpacity = isLight ? 0.15 : 0.25

  // Add keyframes for cloud drift animation
  if (!document.getElementById('vmkpal-fog-keyframes')) {
    const style = document.createElement('style')
    style.id = 'vmkpal-fog-keyframes'
    style.textContent = `
      @keyframes vmkpal-fog-drift-1 {
        0% { transform: translateX(-60px) translateY(0); }
        50% { transform: translateX(80px) translateY(-15px); }
        100% { transform: translateX(-60px) translateY(0); }
      }
      @keyframes vmkpal-fog-drift-2 {
        0% { transform: translateX(70px) translateY(10px); }
        50% { transform: translateX(-90px) translateY(-8px); }
        100% { transform: translateX(70px) translateY(10px); }
      }
      @keyframes vmkpal-fog-drift-3 {
        0% { transform: translateX(-50px) translateY(-12px); }
        50% { transform: translateX(100px) translateY(18px); }
        100% { transform: translateX(-50px) translateY(-12px); }
      }
      @keyframes vmkpal-fog-drift-4 {
        0% { transform: translateX(80px) translateY(5px); }
        50% { transform: translateX(-70px) translateY(-20px); }
        100% { transform: translateX(80px) translateY(5px); }
      }
    `
    document.head.appendChild(style)
  }

  fogOverlay = document.createElement('div')
  fogOverlay.id = 'vmkpal-fog-overlay'
  fogOverlay.style.cssText = `
    position: fixed;
    left: ${bounds.left}px;
    top: ${bounds.top}px;
    width: ${bounds.width}px;
    height: ${bounds.height}px;
    pointer-events: none;
    z-index: 2147483635;
    opacity: 0;
    transition: opacity 2s ease-in;
    overflow: hidden;
    background: linear-gradient(to bottom,
      rgba(200, 210, 220, ${baseOpacity * 0.1}) 0%,
      rgba(200, 210, 220, ${baseOpacity * 0.2}) 50%,
      rgba(210, 220, 230, ${baseOpacity * 0.3}) 100%);
  `

  // Create wispy cloud streaks across the canvas
  const cloudWisps = [
    // Top layer wisps
    { x: '-25%', y: '2%', w: '85%', h: '10%', opacity: baseOpacity * 0.6, duration: 8, anim: 1 },
    { x: '40%', y: '5%', w: '75%', h: '8%', opacity: baseOpacity * 0.5, duration: 10, anim: 2 },
    { x: '-10%', y: '10%', w: '95%', h: '12%', opacity: baseOpacity * 0.7, duration: 7, anim: 3 },
    { x: '20%', y: '15%', w: '80%', h: '9%', opacity: baseOpacity * 0.55, duration: 9, anim: 4 },
    // Upper-mid wisps
    { x: '-20%', y: '22%', w: '90%', h: '11%', opacity: baseOpacity * 0.65, duration: 6, anim: 1 },
    { x: '35%', y: '26%', w: '85%', h: '8%', opacity: baseOpacity * 0.5, duration: 11, anim: 2 },
    { x: '5%', y: '32%', w: '100%', h: '13%', opacity: baseOpacity * 0.75, duration: 8, anim: 3 },
    { x: '-15%', y: '38%', w: '80%', h: '10%', opacity: baseOpacity * 0.6, duration: 9, anim: 4 },
    // Mid wisps
    { x: '25%', y: '42%', w: '90%', h: '12%', opacity: baseOpacity * 0.7, duration: 7, anim: 1 },
    { x: '-5%', y: '48%', w: '85%', h: '9%', opacity: baseOpacity * 0.55, duration: 10, anim: 2 },
    { x: '30%', y: '52%', w: '95%', h: '14%', opacity: baseOpacity * 0.8, duration: 8, anim: 3 },
    { x: '-20%', y: '58%', w: '80%', h: '11%', opacity: baseOpacity * 0.65, duration: 9, anim: 4 },
    // Lower wisps
    { x: '15%', y: '62%', w: '100%', h: '13%', opacity: baseOpacity * 0.75, duration: 6, anim: 1 },
    { x: '-10%', y: '68%', w: '90%', h: '10%', opacity: baseOpacity * 0.6, duration: 10, anim: 2 },
    { x: '25%', y: '72%', w: '85%', h: '15%', opacity: baseOpacity * 0.85, duration: 7, anim: 3 },
    { x: '-15%', y: '78%', w: '95%', h: '12%', opacity: baseOpacity * 0.7, duration: 8, anim: 4 },
    // Bottom wisps
    { x: '10%', y: '82%', w: '100%', h: '14%', opacity: baseOpacity * 0.8, duration: 6, anim: 1 },
    { x: '-5%', y: '88%', w: '90%', h: '16%', opacity: baseOpacity * 0.9, duration: 7, anim: 2 },
    { x: '20%', y: '92%', w: '85%', h: '12%', opacity: baseOpacity * 0.75, duration: 8, anim: 3 },
  ]

  cloudWisps.forEach((wisp) => {
    const wispDiv = document.createElement('div')
    wispDiv.style.cssText = `
      position: absolute;
      left: ${wisp.x};
      top: ${wisp.y};
      width: ${wisp.w};
      height: ${wisp.h};
      pointer-events: none;
      background: linear-gradient(90deg,
        transparent 0%,
        rgba(220, 225, 235, ${wisp.opacity * 0.3}) 15%,
        rgba(215, 220, 230, ${wisp.opacity}) 35%,
        rgba(220, 225, 235, ${wisp.opacity * 0.8}) 65%,
        rgba(215, 220, 230, ${wisp.opacity * 0.4}) 85%,
        transparent 100%);
      animation: vmkpal-fog-drift-${wisp.anim} ${wisp.duration}s ease-in-out infinite;
      filter: blur(8px);
      border-radius: 50%;
    `
    fogOverlay.appendChild(wispDiv)
  })

  document.body.appendChild(fogOverlay)

  // Fade in
  requestAnimationFrame(() => {
    if (fogOverlay) fogOverlay.style.opacity = '1'
  })
  console.log('MyVMK Genie: Started fog effect', isLight ? '(light)' : '(normal)')
}

function stopFogEffect() {
  if (!isFogActive || !fogOverlay) return
  isFogActive = false

  fogOverlay.style.opacity = '0'
  const overlayToRemove = fogOverlay
  fogOverlay = null
  setTimeout(() => {
    if (overlayToRemove && overlayToRemove.parentNode) {
      overlayToRemove.remove()
    }
  }, 2000)
  console.log('MyVMK Genie: Stopped fog effect')
}

// Castle Gardens Overlay - castle image in front of fireworks
function startCastleOverlay() {
  if (isCastleOverlayActive) return
  isCastleOverlayActive = true

  const bounds = getGameCanvasBounds()

  castleOverlay = document.createElement('div')
  castleOverlay.id = 'vmkpal-castle-overlay'
  castleOverlay.style.cssText = `
    position: fixed;
    left: ${bounds.left}px;
    top: ${bounds.top}px;
    width: ${bounds.width}px;
    height: ${bounds.height}px;
    pointer-events: none;
    z-index: 2147483646;
    background-image: url('${chrome.runtime.getURL('castle-gardens.png')}');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    opacity: 0;
    transition: opacity 1s ease-in;
  `
  document.body.appendChild(castleOverlay)

  requestAnimationFrame(() => {
    if (castleOverlay) castleOverlay.style.opacity = '1'
  })
  console.log('MyVMK Genie: Started Castle Gardens overlay')
}

function stopCastleOverlay() {
  if (!isCastleOverlayActive || !castleOverlay) return
  isCastleOverlayActive = false

  castleOverlay.style.opacity = '0'
  const overlayToRemove = castleOverlay
  castleOverlay = null
  setTimeout(() => {
    if (overlayToRemove && overlayToRemove.parentNode) {
      overlayToRemove.remove()
    }
  }, 1000)
  console.log('MyVMK Genie: Stopped Castle Gardens overlay')
}

// Map Button Overlay - detects when user clicks the globe/map icon on toolbar
function startMapButtonOverlay(callback) {
  if (mapButtonOverlay) return // Already active

  onMapButtonClick = callback

  const bounds = getGameCanvasBounds()
  if (!bounds.found) {
    console.log('MyVMK Genie: Cannot create map button overlay - game canvas not found')
    return
  }

  // Globe icon position relative to game canvas
  // At 800x600: globe is ~40px from left, ~30px from bottom, ~28x28px
  // These are percentages of canvas size for scaling
  const globeLeftPercent = 0.05  // 40/800 (moved left ~30px)
  const globeBottomOffset = 30   // Fixed pixel offset from bottom (moved down)
  const iconSize = 28

  mapButtonOverlay = document.createElement('div')
  mapButtonOverlay.id = 'vmkpal-map-button-overlay'
  mapButtonOverlay.style.cssText = `
    position: fixed;
    left: ${bounds.left + (bounds.width * globeLeftPercent)}px;
    top: ${bounds.top + bounds.height - globeBottomOffset}px;
    width: ${iconSize}px;
    height: ${iconSize}px;
    cursor: pointer;
    z-index: 2147483647;
    background: transparent;
  `

  // Capture mousedown to detect click, then allow it to pass through
  mapButtonOverlay.addEventListener('mousedown', (e) => {
    console.log('MyVMK Genie: Map button clicked')
    console.log('MyVMK Genie: onMapButtonClick callback exists:', !!onMapButtonClick)

    // Fire our callback
    if (onMapButtonClick) {
      console.log('MyVMK Genie: Calling hideOverlaysForMap callback...')
      try {
        onMapButtonClick()
        console.log('MyVMK Genie: Callback completed')
      } catch (err) {
        console.error('MyVMK Genie: Callback error:', err)
      }
    } else {
      console.log('MyVMK Genie: No callback registered!')
    }

    // Allow click to pass through to the game
    mapButtonOverlay.style.pointerEvents = 'none'

    // Get the element underneath and dispatch a click to it
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY)
    if (elementBelow) {
      const clickEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button
      })
      elementBelow.dispatchEvent(clickEvent)
    }

    // Re-enable pointer events after a short delay
    setTimeout(() => {
      if (mapButtonOverlay) {
        mapButtonOverlay.style.pointerEvents = 'auto'
      }
    }, 100)
  })

  document.body.appendChild(mapButtonOverlay)
  console.log('MyVMK Genie: Map button overlay created')
}

function stopMapButtonOverlay() {
  if (!mapButtonOverlay) return

  mapButtonOverlay.remove()
  mapButtonOverlay = null
  onMapButtonClick = null
  console.log('MyVMK Genie: Map button overlay removed')
}

function updateMapButtonOverlayPosition() {
  if (!mapButtonOverlay) return

  const bounds = getGameCanvasBounds()
  if (!bounds.found) return

  const globeLeftPercent = 0.05
  const globeBottomOffset = 30

  mapButtonOverlay.style.left = `${bounds.left + (bounds.width * globeLeftPercent)}px`
  mapButtonOverlay.style.top = `${bounds.top + bounds.height - globeBottomOffset}px`
}

// Hide all overlays when map is opened
function hideOverlaysForMap() {
  console.log('MyVMK Genie: hideOverlaysForMap called')

  // Only save state if this is the first time (not already in map mode)
  // This prevents overwriting saved state with already-hidden state
  if (!isMapOpen) {
    overlaysHiddenForMap = {
      rain: isRainEnabled,
      snow: isSnowEnabled,
      fireworks: isFireworksEnabled,
      money: isMoneyRainEnabled,
      emoji: isEmojiRainEnabled,
      stars: isStarsOverlayEnabled,
      night: isNightOverlayEnabled,
      fireflies: isFirefliesActive,
      fog: isFogActive,
      kingdomSyncNight: isKingdomSyncNightActive,
      castle: isCastleOverlayActive,
      tinkerbell: isTinkerbellActive,
      butterflies: isButterflyActive,
      ghost: isGhostEffectActive,
      spotlights: isSpotlightsEnabled
    }
    console.log('MyVMK Genie: Saved overlay state:', overlaysHiddenForMap)
  }

  isMapOpen = true
  console.log('MyVMK Genie: Hiding overlays for map view')

  // Stop all visual effects
  if (isRainEnabled) {
    stopRainEffect()
    isRainEnabled = false
  }
  if (isSnowEnabled) {
    stopSnowEffect()
    isSnowEnabled = false
  }
  if (isFireworksEnabled) {
    stopFireworks()
    isFireworksEnabled = false
  }
  if (isMoneyRainEnabled) {
    stopMoneyRain()
    isMoneyRainEnabled = false
  }
  if (isEmojiRainEnabled) {
    stopEmojiRain()
    isEmojiRainEnabled = false
  }
  if (isStarsOverlayEnabled) {
    const starsOverlay = document.getElementById('vmkpal-stars-overlay')
    if (starsOverlay) starsOverlay.style.display = 'none'
  }
  if (isNightOverlayEnabled) {
    stopNightOverlay()
    isNightOverlayEnabled = false
  }
  if (isFirefliesActive) {
    stopFireflyEffect()
  }
  if (isFogActive) {
    stopFogEffect()
  }
  if (isKingdomSyncNightActive) {
    stopKingdomSyncNight()
  }
  if (isCastleOverlayActive) {
    stopCastleOverlay()
  }
  if (isTinkerbellActive) {
    stopTinkerbellEffect()
  }
  if (isButterflyActive) {
    stopButterflyEffect()
  }
  if (isGhostEffectActive) {
    stopGhostEffect()
  }
  if (isSpotlightsEnabled) {
    stopSpotlights()
    isSpotlightsEnabled = false
  }

  console.log('MyVMK Genie: All overlays hidden for map')
}

// Restore overlays after map is closed (called when room is detected again)
function restoreOverlaysAfterMap() {
  if (!isMapOpen) return // Map wasn't open
  isMapOpen = false

  console.log('MyVMK Genie: Restoring overlays after map closed')

  // Restore overlays that were active before map opened
  if (overlaysHiddenForMap.rain) {
    isRainEnabled = true
    startRainEffect()
  }
  if (overlaysHiddenForMap.snow) {
    isSnowEnabled = true
    startSnowEffect()
  }
  if (overlaysHiddenForMap.fireworks) {
    isFireworksEnabled = true
    startFireworks()
  }
  if (overlaysHiddenForMap.money) {
    isMoneyRainEnabled = true
    startMoneyRain()
  }
  if (overlaysHiddenForMap.emoji) {
    isEmojiRainEnabled = true
    startEmojiRain()
  }
  if (overlaysHiddenForMap.stars) {
    const starsOverlay = document.getElementById('vmkpal-stars-overlay')
    if (starsOverlay) starsOverlay.style.display = ''
  }
  if (overlaysHiddenForMap.night) {
    isNightOverlayEnabled = true
    startNightOverlay()
  }
  if (overlaysHiddenForMap.spotlights) {
    isSpotlightsEnabled = true
    startSpotlights()
  }

  // Room-specific effects will be restored by checkRoomAmbientEffects
  // (fireflies, fog, castle, tinkerbell, butterflies, ghost, kingdom sync night)

  overlaysHiddenForMap = {}
  console.log('MyVMK Genie: Overlays restored')
}

// Subtle Night Effect - lighter than regular night overlay
function startKingdomSyncNight() {
  if (isKingdomSyncNightActive) return
  isKingdomSyncNightActive = true

  const bounds = getGameCanvasBounds()

  // Create subtle night overlay (lighter than regular night)
  let nightDiv = document.getElementById('vmkpal-kingdomsync-night')
  if (!nightDiv) {
    nightDiv = document.createElement('div')
    nightDiv.id = 'vmkpal-kingdomsync-night'
    nightDiv.style.cssText = `
      position: fixed;
      left: ${bounds.left}px;
      top: ${bounds.top}px;
      width: ${bounds.width}px;
      height: ${bounds.height}px;
      pointer-events: none;
      z-index: 2147483629;
      background: linear-gradient(
        to bottom,
        rgba(10, 15, 40, 0.2) 0%,
        rgba(15, 20, 50, 0.25) 50%,
        rgba(10, 15, 40, 0.2) 100%
      );
      mix-blend-mode: multiply;
      opacity: 0;
      transition: opacity 4s ease-in;
    `
    document.body.appendChild(nightDiv)
  }

  requestAnimationFrame(() => {
    if (nightDiv) nightDiv.style.opacity = '1'
  })
  console.log('MyVMK Genie: Started Kingdom Sync night mode')
}

function stopKingdomSyncNight() {
  if (!isKingdomSyncNightActive) return
  isKingdomSyncNightActive = false

  const nightDiv = document.getElementById('vmkpal-kingdomsync-night')
  if (nightDiv) {
    nightDiv.style.opacity = '0'
    setTimeout(() => {
      const div = document.getElementById('vmkpal-kingdomsync-night')
      if (div) div.remove()
    }, 4000)
  }
  console.log('MyVMK Genie: Stopped Kingdom Sync night mode')
}

// Check if it's night time in Eastern timezone (8PM-6AM)
function isKingdomSyncNightTime() {
  const now = new Date()
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hour = eastern.getHours()
  return hour >= 20 || hour < 6
}

function checkKingdomSyncNight() {
  if (!isKingdomSyncEnabled) {
    if (isKingdomSyncNightActive) stopKingdomSyncNight()
    return
  }

  if (isKingdomSyncNightTime()) {
    if (!isKingdomSyncNightActive) startKingdomSyncNight()
  } else {
    if (isKingdomSyncNightActive) stopKingdomSyncNight()
  }
}

// Determine if rare effect should show (30% chance, cached per session)
function shouldShowRareEffect(roomKey) {
  if (kingdomSyncFireflyRooms.has(roomKey)) {
    return kingdomSyncFireflyRooms.get(roomKey)
  }
  const showEffect = Math.random() < 0.3
  kingdomSyncFireflyRooms.set(roomKey, showEffect)
  return showEffect
}

// Main Kingdom Sync room check - called on room change
function checkKingdomSyncEffects() {
  if (!isKingdomSyncEnabled || !hasDetectedRoomThisSession) {
    // If Kingdom Sync is disabled, stop effects
    if (isFirefliesActive) stopFireflyEffect()
    if (isFogActive) stopFogEffect()
    return
  }

  const roomId = currentRoomId
  const ROOMS = KINGDOM_SYNC_ROOMS

  let showFireflies = false
  let showFog = false
  let isLightFog = false

  // Frontierland Dock - Always fireflies
  if (roomId === ROOMS.FRONTIERLAND_DOCK) {
    showFireflies = true
  }
  // Frontierland Hub - Rare fireflies
  else if (roomId === ROOMS.FRONTIERLAND_HUB) {
    showFireflies = shouldShowRareEffect(roomId)
  }
  // Mark Twain Steamboat - Rare fireflies
  else if (roomId === ROOMS.MARK_TWAIN_STEAMBOAT) {
    showFireflies = shouldShowRareEffect(roomId)
  }
  // Africa (both room IDs) - Rare fireflies
  else if (ROOMS.AFRICA.includes(roomId)) {
    showFireflies = shouldShowRareEffect(roomId)
  }
  // Pixar Pier - Fireflies only at night (8PM-6AM), rare light fog
  else if (roomId === ROOMS.PIXAR_PIER) {
    if (isKingdomSyncNightTime()) {
      showFireflies = true
      showFog = shouldShowRareEffect(roomId + '_fog')
      isLightFog = true
    }
  }
  // Pirate Treehouse - Always fireflies + fog
  else if (roomId === ROOMS.PIRATE_TREEHOUSE) {
    showFireflies = true
    showFog = true
  }
  // Explorer's Tent - Always fireflies, rare light fog
  else if (roomId === ROOMS.EXPLORERS_TENT) {
    showFireflies = true
    showFog = shouldShowRareEffect(roomId + '_fog')
    isLightFog = true
  }

  // Apply firefly effect
  if (showFireflies && !isFirefliesActive) {
    startFireflyEffect()
  } else if (!showFireflies && isFirefliesActive) {
    stopFireflyEffect()
  }

  // Apply fog effect
  if (showFog && !isFogActive) {
    startFogEffect(isLightFog)
  } else if (!showFog && isFogActive) {
    stopFogEffect()
  }

  // Check night time
  checkKingdomSyncNight()
}

// ============================================
// SCREEN SHAKE EFFECT
// ============================================

const SHAKE_INTENSITIES = {
  light: { offset: 3, interval: 50 },
  medium: { offset: 7, interval: 40 },
  heavy: { offset: 14, interval: 30 }
}

function startShakeEffect(intensity) {
  // Stop any existing shake first
  if (activeShakeIntensity) {
    stopShakeEffect()
  }

  const canvas = document.getElementById('gameCanvas') || document.querySelector('canvas')
  if (!canvas) {
    showNotification('Game canvas not found', 'error')
    return
  }

  activeShakeIntensity = intensity
  const config = SHAKE_INTENSITIES[intensity]

  // Store original transform
  canvas.dataset.originalTransform = canvas.style.transform || ''

  function shake() {
    if (!activeShakeIntensity) return

    const offsetX = (Math.random() - 0.5) * 2 * config.offset
    const offsetY = (Math.random() - 0.5) * 2 * config.offset
    canvas.style.transform = `translate(${offsetX}px, ${offsetY}px)`

    shakeAnimationId = setTimeout(shake, config.interval)
  }

  shake()
  showNotification(`📳 ${intensity.charAt(0).toUpperCase() + intensity.slice(1)} shake enabled`, 'success')
}

function stopShakeEffect() {
  if (!activeShakeIntensity) return

  const canvas = document.getElementById('gameCanvas') || document.querySelector('canvas')
  if (canvas) {
    canvas.style.transform = canvas.dataset.originalTransform || ''
  }

  if (shakeAnimationId) {
    clearTimeout(shakeAnimationId)
    shakeAnimationId = null
  }

  const wasIntensity = activeShakeIntensity
  activeShakeIntensity = null
  showNotification(`📳 ${wasIntensity.charAt(0).toUpperCase() + wasIntensity.slice(1)} shake disabled`, 'info')
}

function toggleShakeEffect(intensity) {
  if (activeShakeIntensity === intensity) {
    stopShakeEffect()
  } else {
    startShakeEffect(intensity)
  }
}

// ============================================
// CANVAS FLIP EFFECTS
// ============================================

function flipCanvas(type) {
  const canvas = document.getElementById('gameCanvas') || document.querySelector('canvas')
  if (!canvas) {
    showNotification('Game canvas not found', 'error')
    return
  }

  // Stop any shake effect first
  if (activeShakeIntensity) {
    stopShakeEffect()
  }

  // Set up transition for smooth animation
  const originalTransition = canvas.style.transition
  const originalTransform = canvas.style.transform || ''

  canvas.style.transition = 'transform 0.8s ease-in-out'
  canvas.style.transformStyle = 'preserve-3d'

  // Apply the flip based on type
  let flipTransform = ''
  let emoji = '🔄'

  switch (type) {
    case 'horizontal':
      flipTransform = 'rotateY(360deg)'
      emoji = '↔️'
      break
    case 'vertical':
      flipTransform = 'rotateX(360deg)'
      emoji = '↕️'
      break
    case 'spin':
      flipTransform = 'rotate(360deg)'
      emoji = '🔄'
      break
  }

  canvas.style.transform = flipTransform
  showNotification(`${emoji} ${type.charAt(0).toUpperCase() + type.slice(1)} flip!`, 'success')

  // Reset after animation completes
  setTimeout(() => {
    canvas.style.transition = originalTransition
    canvas.style.transform = originalTransform
  }, 850)
}

// ============================================
// CANVAS EXPLOSION/SHATTER EFFECT
// ============================================

function explodeCanvas() {
  const canvas = document.getElementById('gameCanvas') || document.querySelector('canvas')
  if (!canvas) {
    showNotification('Game canvas not found', 'error')
    return
  }

  const bounds = canvas.getBoundingClientRect()
  const cols = 12
  const rows = 8
  const pieceWidth = bounds.width / cols
  const pieceHeight = bounds.height / rows

  // Try to capture canvas image
  let canvasDataUrl = null
  try {
    canvasDataUrl = canvas.toDataURL('image/png')
  } catch (e) {
    // Canvas might be tainted, use fallback colors
  }

  // Create container for pieces
  const container = document.createElement('div')
  container.id = 'vmkpal-explosion-container'
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 2147483647;
    overflow: hidden;
  `
  document.body.appendChild(container)

  // Hide original canvas briefly
  const originalOpacity = canvas.style.opacity
  canvas.style.opacity = '0'

  // Create pieces
  const pieces = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const piece = document.createElement('div')
      const x = bounds.left + col * pieceWidth
      const y = bounds.top + row * pieceHeight

      // Calculate center of canvas for explosion direction
      const centerX = bounds.left + bounds.width / 2
      const centerY = bounds.top + bounds.height / 2

      // Direction from center (normalized and amplified)
      const dirX = (x + pieceWidth / 2 - centerX) / bounds.width
      const dirY = (y + pieceHeight / 2 - centerY) / bounds.height

      piece.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: ${pieceWidth}px;
        height: ${pieceHeight}px;
        ${canvasDataUrl
          ? `background-image: url(${canvasDataUrl});
             background-size: ${bounds.width}px ${bounds.height}px;
             background-position: -${col * pieceWidth}px -${row * pieceHeight}px;`
          : `background: linear-gradient(135deg,
               hsl(${Math.random() * 60 + 200}, 70%, 50%),
               hsl(${Math.random() * 60 + 200}, 70%, 30%));`
        }
        border: 1px solid rgba(255,255,255,0.3);
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
        transition: all 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        transform-origin: center center;
      `

      container.appendChild(piece)
      pieces.push({
        element: piece,
        dirX: dirX,
        dirY: dirY,
        rotation: (Math.random() - 0.5) * 720
      })
    }
  }

  // Trigger explosion animation after a brief moment
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pieces.forEach(p => {
        const distance = 300 + Math.random() * 400
        const finalX = p.dirX * distance
        const finalY = p.dirY * distance + 200 // Add gravity effect
        p.element.style.transform = `translate(${finalX}px, ${finalY}px) rotate(${p.rotation}deg) scale(0.3)`
        p.element.style.opacity = '0'
      })
    })
  })

  showNotification('💥 Explosion!', 'success')

  // Clean up and restore canvas
  setTimeout(() => {
    canvas.style.opacity = originalOpacity || '1'
    container.remove()
  }, 1300)
}

// ============================================
// NEON RAVE EFFECT (DEV_MODE only)
// ============================================

function toggleRaveEffect() {
  isRaveEnabled = !isRaveEnabled

  if (isRaveEnabled) {
    startRaveEffect()
    showNotification('🎉 Rave mode activated!', 'success')
  } else {
    stopRaveEffect()
    showNotification('🎉 Rave mode off', 'info')
  }
}

function startRaveEffect() {
  const bounds = getGameCanvasBounds()

  if (!raveCanvas) {
    raveCanvas = document.createElement('canvas')
    raveCanvas.id = 'vmkpal-rave-canvas'
    raveCanvas.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483645;
      mix-blend-mode: screen;
    `
    raveCtx = raveCanvas.getContext('2d')
    document.body.appendChild(raveCanvas)
  }

  raveCanvas.style.left = bounds.left + 'px'
  raveCanvas.style.top = bounds.top + 'px'
  raveCanvas.width = bounds.width
  raveCanvas.height = bounds.height
  raveCanvas.style.display = 'block'

  raveStartTime = performance.now()
  renderRave()
}

function stopRaveEffect() {
  if (raveAnimationId) {
    cancelAnimationFrame(raveAnimationId)
    raveAnimationId = null
  }
  if (raveCanvas) {
    raveCanvas.style.display = 'none'
  }
  isRaveEnabled = false
}

function renderRave() {
  if (!raveCtx || !isRaveEnabled) return

  const now = performance.now()
  const elapsed = (now - raveStartTime) / 1000
  const width = raveCanvas.width
  const height = raveCanvas.height

  // Clear with slight fade for trails
  raveCtx.fillStyle = 'rgba(0, 0, 0, 0.3)'
  raveCtx.fillRect(0, 0, width, height)

  // Beat frequency (simulated 120 BPM = 2 beats per second)
  const beatPhase = (elapsed * 2) % 1
  const beatIntensity = Math.pow(1 - beatPhase, 3)

  // Strobe flash on beat
  if (beatIntensity > 0.8) {
    const flashColor = RAVE_COLORS[Math.floor(elapsed * 2) % RAVE_COLORS.length]
    raveCtx.fillStyle = flashColor + '40' // 25% opacity
    raveCtx.fillRect(0, 0, width, height)
  }

  // Laser beams
  const numLasers = 6
  for (let i = 0; i < numLasers; i++) {
    const laserPhase = elapsed * (0.3 + i * 0.1) + i * 0.5
    const angle = Math.sin(laserPhase) * 0.8 + Math.PI / 2
    const originX = (i / (numLasers - 1)) * width
    const originY = 0

    const endX = originX + Math.cos(angle) * height * 1.5
    const endY = originY + Math.sin(angle) * height * 1.5

    const color = RAVE_COLORS[i % RAVE_COLORS.length]

    // Laser glow
    const gradient = raveCtx.createLinearGradient(originX, originY, endX, endY)
    gradient.addColorStop(0, color + 'ff')
    gradient.addColorStop(0.5, color + '80')
    gradient.addColorStop(1, color + '00')

    raveCtx.strokeStyle = gradient
    raveCtx.lineWidth = 3 + beatIntensity * 4
    raveCtx.shadowColor = color
    raveCtx.shadowBlur = 20 + beatIntensity * 30
    raveCtx.beginPath()
    raveCtx.moveTo(originX, originY)
    raveCtx.lineTo(endX, endY)
    raveCtx.stroke()
  }

  // Neon light bars at bottom
  const numBars = 16
  const barWidth = width / numBars
  for (let i = 0; i < numBars; i++) {
    const barPhase = elapsed * 4 + i * 0.3
    const barHeight = (Math.sin(barPhase) * 0.5 + 0.5) * height * 0.4
    const color = RAVE_COLORS[(i + Math.floor(elapsed * 2)) % RAVE_COLORS.length]

    raveCtx.fillStyle = color + '60'
    raveCtx.shadowColor = color
    raveCtx.shadowBlur = 15
    raveCtx.fillRect(i * barWidth + 2, height - barHeight, barWidth - 4, barHeight)
  }

  // Pulsing circles from center
  const numCircles = 3
  for (let i = 0; i < numCircles; i++) {
    const circlePhase = ((elapsed * 0.5) + i * 0.33) % 1
    const radius = circlePhase * Math.max(width, height) * 0.8
    const alpha = (1 - circlePhase) * 0.3

    const color = RAVE_COLORS[(i + Math.floor(elapsed)) % RAVE_COLORS.length]
    raveCtx.strokeStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, '0')
    raveCtx.lineWidth = 3
    raveCtx.shadowColor = color
    raveCtx.shadowBlur = 20
    raveCtx.beginPath()
    raveCtx.arc(width / 2, height / 2, radius, 0, Math.PI * 2)
    raveCtx.stroke()
  }

  // Scanning spotlight
  const spotlightAngle = elapsed * 1.5
  const spotX = width / 2 + Math.cos(spotlightAngle) * width * 0.4
  const spotY = height / 2 + Math.sin(spotlightAngle * 0.7) * height * 0.3
  const spotGradient = raveCtx.createRadialGradient(spotX, spotY, 0, spotX, spotY, 150)
  const spotColor = RAVE_COLORS[Math.floor(elapsed * 3) % RAVE_COLORS.length]
  spotGradient.addColorStop(0, spotColor + '60')
  spotGradient.addColorStop(0.5, spotColor + '20')
  spotGradient.addColorStop(1, spotColor + '00')
  raveCtx.fillStyle = spotGradient
  raveCtx.fillRect(0, 0, width, height)

  raveCtx.shadowBlur = 0

  raveAnimationId = requestAnimationFrame(renderRave)
}

// ============================================
// CASTLE TEST OVERLAY (DEV_MODE)
// Test fixed percentage-based positioning
// ============================================

let castleTestOverlay = null

function toggleCastleTestOverlay() {
  isCastleTestOverlayEnabled = !isCastleTestOverlayEnabled

  if (isCastleTestOverlayEnabled) {
    createCastleTestOverlay()
    showNotification('🏰 Castle overlay enabled', 'success')
  } else {
    removeCastleTestOverlay()
    showNotification('🏰 Castle overlay disabled', 'info')
  }
}

function createCastleTestOverlay() {
  if (castleTestOverlay) return

  const bounds = getGameCanvasBounds()
  console.log('MyVMK Genie: Creating castle overlay, canvas bounds:', bounds)

  castleTestOverlay = document.createElement('div')
  castleTestOverlay.id = 'vmkpal-castle-test-overlay'
  castleTestOverlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 2147483647;
    background-image: url('${chrome.runtime.getURL('castle-gardens.png')}');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  `

  document.body.appendChild(castleTestOverlay)
  updateCastleTestOverlayPosition()
}

function updateCastleTestOverlayPosition() {
  if (!castleTestOverlay) return

  const bounds = getGameCanvasBounds()

  // Castle position as percentage of game canvas
  // Adjust these values to match the castle location in your screenshot
  const leftPercent = 0.02    // 2% from left edge
  const topPercent = 0.03     // 3% from top
  const widthPercent = 0.50   // 50% of canvas width
  const heightPercent = 0.75  // 75% of canvas height

  const left = bounds.left + bounds.width * leftPercent
  const top = bounds.top + bounds.height * topPercent
  const width = bounds.width * widthPercent
  const height = bounds.height * heightPercent

  console.log('MyVMK Genie: Castle overlay position:', { left, top, width, height, bounds })

  castleTestOverlay.style.left = left + 'px'
  castleTestOverlay.style.top = top + 'px'
  castleTestOverlay.style.width = width + 'px'
  castleTestOverlay.style.height = height + 'px'
}

function removeCastleTestOverlay() {
  if (castleTestOverlay) {
    castleTestOverlay.remove()
    castleTestOverlay = null
  }
  isCastleTestOverlayEnabled = false
}

// ============================================
// GENIE EVENTS SYSTEM
// Fetch and trigger remote scheduled events
// ============================================

async function fetchGenieEvents() {
  try {
    console.log('MyVMK Genie: Fetching events from', GENIE_EVENTS_URL)
    const response = await fetch(GENIE_EVENTS_URL)

    if (!response.ok) {
      console.log('MyVMK Genie: Fetch failed with status', response.status)
      return
    }

    const json = await response.json()
    console.log('MyVMK Genie: Raw response', json)

    // JSONBin wraps data in 'record' property
    const data = json.record || json

    // Genie events (admin) - can trigger overlays + audio
    if (data && Array.isArray(data.genieEvents)) {
      scheduledGenieEvents = data.genieEvents.filter(e => e.enabled !== false)
      console.log('MyVMK Genie: Loaded', scheduledGenieEvents.length, 'genie events')
    }

    // Community events (player) - audio only
    if (data && Array.isArray(data.communityEvents)) {
      scheduledCommunityEvents = data.communityEvents.filter(e => e.enabled !== false)
      console.log('MyVMK Genie: Loaded', scheduledCommunityEvents.length, 'community events')
    }

    // Custom ticker text from admin panel
    if (data && typeof data.tickerText === 'string') {
      customTickerText = data.tickerText
      console.log('MyVMK Genie: Custom ticker text:', customTickerText || '(default)')
    }

    // Custom ticker icon from admin panel
    if (data && typeof data.tickerIcon === 'string') {
      customTickerIcon = data.tickerIcon
      console.log('MyVMK Genie: Custom ticker icon:', customTickerIcon || '(default)')
    }

    // Room collectibles
    if (data && Array.isArray(data.collectibles)) {
      roomCollectibles = data.collectibles.filter(c => c.enabled !== false)
      console.log('MyVMK Genie: Loaded', roomCollectibles.length, 'room collectibles')
      // Check if we need to spawn a collectible for current room
      checkRoomCollectibles()
    }

    // Re-render ticker to include newly loaded events
    renderTickerContent()
  } catch (e) {
    console.error('MyVMK Genie: Error fetching events', e)
  }
}

function checkGenieEvents() {
  const now = new Date()

  // Check Genie events (admin - overlays + audio)
  let foundActiveGenieEvent = false
  for (const event of scheduledGenieEvents) {
    // Skip test events unless test mode is enabled
    if (event.test && !isTestModeEnabled) continue

    const startTime = new Date(event.startTime)
    const endTime = new Date(startTime.getTime() + (event.durationMinutes || 5) * 60 * 1000)
    const isTimeActive = now >= startTime && now <= endTime
    const isRoomMatch = !event.roomId || currentRoomId === event.roomId

    if (isTimeActive && isRoomMatch) {
      foundActiveGenieEvent = true
      // Start event if: no active event, different event, OR same event but different room (joined mid-event)
      const needsStart = !activeGenieEvent ||
                         activeGenieEvent.id !== event.id ||
                         activeGenieEventRoomId !== currentRoomId
      if (needsStart) {
        startGenieEvent(event)
      }
      break
    }
  }
  if (!foundActiveGenieEvent && activeGenieEvent) {
    stopGenieEvent()
  }

  // Check Community events (player - audio only)
  let foundActiveCommunityEvent = false
  for (const event of scheduledCommunityEvents) {
    // Skip test events unless test mode is enabled
    if (event.test && !isTestModeEnabled) continue

    const startTime = new Date(event.startTime)
    const endTime = new Date(startTime.getTime() + (event.durationMinutes || 5) * 60 * 1000)
    const isTimeActive = now >= startTime && now <= endTime
    const isRoomMatch = !event.roomId || currentRoomId === event.roomId

    if (isTimeActive && isRoomMatch) {
      foundActiveCommunityEvent = true
      // Start event if: no active event, different event, OR same event but different room (joined mid-event)
      const needsStart = !activeCommunityEvent ||
                         activeCommunityEvent.id !== event.id ||
                         activeCommunityEventRoomId !== currentRoomId
      if (needsStart) {
        startCommunityEvent(event)
      }
      break
    }
  }
  if (!foundActiveCommunityEvent && activeCommunityEvent) {
    stopCommunityEvent()
  }

  // Check for event notifications (1 hour and 1 minute before)
  // Combine all event types: Genie, Community, and Host (ICS)
  const allEventsForNotification = [
    ...scheduledGenieEvents.map(e => ({
      id: e.id,
      title: e.title,
      startTimeMs: new Date(e.startTime).getTime(),
      roomName: e.roomName,
      durationMinutes: e.durationMinutes || 5,
      test: e.test
    })),
    ...scheduledCommunityEvents.map(e => ({
      id: e.id,
      title: e.title,
      startTimeMs: new Date(e.startTime).getTime(),
      roomName: e.roomName,
      durationMinutes: e.durationMinutes || 5,
      test: e.test
    })),
    ...cachedIcsEvents.map(e => ({
      id: e.title + '_' + e.timestamp, // ICS events don't have IDs, create one
      title: e.title,
      startTimeMs: e.timestamp,
      roomName: e.location,
      durationMinutes: e.endTimestamp ? Math.round((e.endTimestamp - e.timestamp) / 60000) : 60,
      test: false
    }))
  ]

  for (const event of allEventsForNotification) {
    // Skip test events unless test mode is enabled
    if (event.test && !isTestModeEnabled) continue

    const timeUntilStart = event.startTimeMs - now.getTime()

    // 1 hour notification: "[event name] begins in 1 hour"
    const oneHourMs = 60 * 60 * 1000
    if (timeUntilStart > 0 && timeUntilStart <= oneHourMs && timeUntilStart > oneHourMs - 30000 && !notifiedHourBeforeEvents.has(event.id)) {
      notifiedHourBeforeEvents.add(event.id)
      showBeeBanner(`${event.title} begins in 1 hour`)
    }

    // 1 minute notification: "[event name] starting in 1 minute in [room]"
    const oneMinuteMs = 60 * 1000
    if (timeUntilStart > 0 && timeUntilStart <= oneMinuteMs && !notifiedUpcomingEvents.has(event.id)) {
      notifiedUpcomingEvents.add(event.id)
      const message = event.roomName
        ? `${event.title} starting in 1 minute in ${event.roomName}`
        : `${event.title} starting in 1 minute`
      showBeeBanner(message)
    }

    // Clean up old notifications (events that have already ended)
    const endTimeMs = event.startTimeMs + event.durationMinutes * 60 * 1000
    if (now.getTime() > endTimeMs) {
      notifiedUpcomingEvents.delete(event.id)
      notifiedHourBeforeEvents.delete(event.id)
    }
  }
}

// Helper to start a single effect
function startEffect(effectName, eventMode = false, offsetSeconds = 0) {
  // Skip if user manually disabled this effect during the event
  if (manuallyDisabledEffects.has(effectName)) {
    console.log('MyVMK Genie: Skipping effect (manually disabled):', effectName)
    return
  }

  console.log('MyVMK Genie: Starting effect:', effectName, eventMode ? '(event mode)' : '', offsetSeconds > 0 ? `at ${Math.floor(offsetSeconds)}s` : '')
  switch (effectName) {
    case 'fireworks':
      isFireworksEnabled = true
      if (eventMode && offsetSeconds === 0) {
        // Delay fireworks start for events (only if not late joining)
        setTimeout(() => {
          if (isFireworksEnabled) startFireworks()
        }, 2500)
      } else {
        startFireworks()
      }
      break
    case 'rain':
      isRainEnabled = true
      startRainEffect()
      break
    case 'snow':
      isSnowEnabled = true
      startSnowEffect()
      break
    case 'money':
      isMoneyRainEnabled = true
      startMoneyRain()
      break
    case 'emoji':
      isEmojiRainEnabled = true
      startEmojiRain()
      break
    case 'night':
      startNightOverlay(eventMode)
      break
    case 'stars':
      if (!isStarsOverlayEnabled) {
        toggleStarsOverlay()
      }
      break
    case 'happilyEverAfter':
      startHappilyEverAfterShow(offsetSeconds)
      break
    case 'spotlights':
      startSpotlights()
      break
  }
}

// Helper to stop a single effect
function stopEffect(effectName) {
  console.log('MyVMK Genie: Stopping effect:', effectName)
  switch (effectName) {
    case 'fireworks':
      isFireworksEnabled = false
      stopFireworks()
      break
    case 'rain':
      isRainEnabled = false
      stopRainEffect()
      break
    case 'snow':
      isSnowEnabled = false
      stopSnowEffect()
      break
    case 'money':
      isMoneyRainEnabled = false
      stopMoneyRain()
      break
    case 'emoji':
      isEmojiRainEnabled = false
      stopEmojiRain()
      break
    case 'night':
      stopNightOverlay()
      break
    case 'stars':
      if (isStarsOverlayEnabled) {
        toggleStarsOverlay()
      }
      break
    case 'happilyEverAfter':
      stopHappilyEverAfterShow()
      break
    case 'spotlights':
      stopSpotlights()
      break
  }
}

// Start night overlay (for events)
function startNightOverlay(eventMode = false) {
  if (isNightOverlayEnabled) return // Already on
  isNightOverlayEnabled = true
  let overlay = document.getElementById('vmkpal-night-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'vmkpal-night-overlay'
    document.body.appendChild(overlay)
  }

  if (eventMode) {
    // Event mode: fade in slowly with darker overlay
    updateNightOverlayBounds(true) // Pass true for darker version
    overlay.style.display = 'block'
    overlay.style.opacity = '0'
    overlay.style.transition = 'opacity 4s ease-in'
    // Trigger reflow to ensure transition works
    overlay.offsetHeight
    overlay.style.opacity = '1'
  } else {
    updateNightOverlayBounds(false)
    overlay.style.display = 'block'
    overlay.style.transition = 'none'
    overlay.style.opacity = '1'
  }
}

// Stop night overlay (for events)
function stopNightOverlay() {
  isNightOverlayEnabled = false
  const overlay = document.getElementById('vmkpal-night-overlay')
  if (overlay) {
    overlay.style.display = 'none'
  }
}

function startGenieEvent(event) {
  // If same event already running in this room, skip
  if (activeGenieEvent && activeGenieEvent.id === event.id && activeGenieEventRoomId === currentRoomId) {
    return // Already running in this room
  }

  const isJoiningMidEvent = activeGenieEvent && activeGenieEvent.id === event.id

  // Clear manually disabled effects when a truly new event starts (not just room change)
  if (!isJoiningMidEvent) {
    manuallyDisabledEffects.clear()
  }

  // Stop previous effects if switching events or rooms
  if (activeGenieEvent) {
    const prevEffects = activeGenieEvent.effects || (activeGenieEvent.effect ? [activeGenieEvent.effect] : [])
    prevEffects.forEach(stopEffect)
    if (activeGenieEvent.includeTinkerbell) {
      stopTinkerbellEffect()
    }
  }

  console.log('MyVMK Genie: Starting event:', event, 'in room:', currentRoomId)
  activeGenieEvent = event
  activeGenieEventRoomId = currentRoomId

  // Calculate elapsed seconds for late joiners
  const eventStartTime = new Date(event.startTime)
  const now = new Date()
  const elapsedSeconds = Math.max(0, (now - eventStartTime) / 1000)
  const isLateJoin = elapsedSeconds > 5 // More than 5 seconds = late join

  if (isLateJoin) {
    console.log('MyVMK Genie: Late join detected, syncing to', Math.floor(elapsedSeconds), 'seconds')
  }

  // Trigger effects - support both array (effects) and single (effect) for backwards compat
  const effects = event.effects || (event.effect ? [event.effect] : [])
  console.log('MyVMK Genie: Effects to trigger:', effects)
  effects.forEach(effect => startEffect(effect, true, isLateJoin ? elapsedSeconds : 0)) // Pass offset for late joiners

  // Start Tinkerbell if included
  if (event.includeTinkerbell) {
    console.log('MyVMK Genie: Starting Tinkerbell effect (event mode)')
    startTinkerbellEffect(true) // Event mode - limit to top 70% of canvas
  }

  // Play audio if specified (uses existing YouTube player - mutes game audio)
  // Start minimized so it doesn't cover the game
  if (event.audioUrl) {
    playAudio(event.audioUrl, true, isLateJoin ? elapsedSeconds : 0)
  }

  // Show notification with bee image (only once per event, not on every room change)
  if (!notifiedActiveEvents.has(event.id)) {
    notifiedActiveEvents.add(event.id)
    const beeIconUrl = chrome.runtime.getURL('bee-static.png')
    showNotification(`<img src="${beeIconUrl}" style="width: 20px; height: 20px;">${event.title}${isJoiningMidEvent ? ' in progress!' : ' starting!'}`, 'success', 2000, true)
  }

  // Check for theme unlock
  if (event.unlockTheme && !unlockedThemes.includes(event.unlockTheme)) {
    unlockedThemes.push(event.unlockTheme)
    chrome.storage.local.set({ unlockedThemes })
    const themeName = event.unlockTheme === 'dark' ? 'Dark' : event.unlockTheme === 'pink' ? 'Pink' : event.unlockTheme
    setTimeout(() => {
      showNotification(`🎁 You unlocked the ${themeName} theme!`, 'success', 4000, true)
    }, 2500) // Delay so it doesn't overlap with event notification
  }
}

function stopGenieEvent() {
  if (!activeGenieEvent) return

  const event = activeGenieEvent
  activeGenieEvent = null
  activeGenieEventRoomId = null
  manuallyDisabledEffects.clear() // Reset for next event
  notifiedActiveEvents.delete(event.id) // Allow notification again if event restarts

  // Stop effects - support both array (effects) and single (effect) for backwards compat
  const effects = event.effects || (event.effect ? [event.effect] : [])
  effects.forEach(stopEffect)

  // Stop Tinkerbell if it was included
  if (event.includeTinkerbell) {
    stopTinkerbellEffect()
  }

  // Stop audio (restores game audio)
  stopAudio()
}

// === ROOM COLLECTIBLES ===
// Clickable items that appear in specific rooms and unlock themes when clicked

function checkRoomCollectibles() {
  // Remove existing collectible if we changed rooms
  if (activeCollectible) {
    const collectibleRoomId = parseInt(activeCollectible.dataset.roomId)
    if (collectibleRoomId !== currentRoomId) {
      removeCollectible()
    }
  }

  // Check if there's a collectible for the current room
  // Use parseInt to handle string/number type mismatch from JSONBin
  const collectible = roomCollectibles.find(c => parseInt(c.roomId) === currentRoomId)
  if (collectible && !activeCollectible) {
    spawnCollectible(collectible)
  }
}

function spawnCollectible(collectible) {
  if (activeCollectible) return // Already have one

  console.log('MyVMK Genie: Spawning collectible:', collectible.name, 'in room', currentRoomId)

  // Create the collectible element
  const el = document.createElement('div')
  el.id = 'vmkpal-collectible'
  el.dataset.roomId = collectible.roomId
  el.dataset.unlockTheme = collectible.unlockTheme
  el.dataset.collectibleId = collectible.id

  const size = collectible.size || 60
  el.style.cssText = `
    position: fixed;
    width: ${size}px;
    height: ${size}px;
    z-index: 2147483640;
    cursor: pointer;
    pointer-events: auto;
    transition: transform 0.1s ease;
    filter: drop-shadow(0 0 10px rgba(180, 0, 0, 0.8));
  `

  // Create the image
  const img = document.createElement('img')
  img.src = collectible.imageUrl
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  `
  el.appendChild(img)

  // Add hover effect
  el.addEventListener('mouseenter', () => {
    el.style.transform = 'scale(1.2)'
    el.style.filter = 'drop-shadow(0 0 20px rgba(180, 0, 0, 1))'
  })
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'scale(1)'
    el.style.filter = 'drop-shadow(0 0 10px rgba(180, 0, 0, 0.8))'
  })

  // Add click handler
  el.addEventListener('click', () => handleCollectibleClick(collectible))

  document.body.appendChild(el)
  activeCollectible = el

  // Start movement animation
  animateCollectible(el, collectible.speed || 'medium')
}

function animateCollectible(el, speed) {
  const speedMap = { slow: 0.008, medium: 0.015, fast: 0.025 }
  const easingSpeed = speedMap[speed] || 0.015

  const bounds = getGameCanvasBounds()
  const size = el.offsetWidth || 60

  // Initialize floating data (like Tinkerbell)
  const data = {
    x: bounds.left + 40 + Math.random() * (bounds.width - 80),
    y: bounds.top + 40 + Math.random() * (bounds.height - 80),
    targetX: bounds.left + 40 + Math.random() * (bounds.width - 80),
    targetY: bounds.top + 40 + Math.random() * (bounds.height - 80),
    lastTargetChange: performance.now(),
    targetChangeInterval: 2000 + Math.random() * 3000 // 2-5 seconds between targets
  }

  // Set initial position
  el.style.left = data.x + 'px'
  el.style.top = data.y + 'px'

  function float() {
    if (!activeCollectible || activeCollectible !== el) return

    const now = performance.now()
    const currentBounds = getGameCanvasBounds()

    // Change target position periodically for wandering behavior
    if (now - data.lastTargetChange > data.targetChangeInterval) {
      data.targetX = currentBounds.left + 40 + Math.random() * (currentBounds.width - 80)
      data.targetY = currentBounds.top + 40 + Math.random() * (currentBounds.height - 80)
      data.targetChangeInterval = 2000 + Math.random() * 3000
      data.lastTargetChange = now
    }

    // Smooth easing toward target (gentle floating movement)
    const dx = data.targetX - data.x
    const dy = data.targetY - data.y
    data.x += dx * easingSpeed
    data.y += dy * easingSpeed

    // Keep within game canvas bounds
    data.x = Math.max(currentBounds.left + 20, Math.min(data.x, currentBounds.left + currentBounds.width - size - 20))
    data.y = Math.max(currentBounds.top + 20, Math.min(data.y, currentBounds.top + currentBounds.height - size - 20))

    el.style.left = data.x + 'px'
    el.style.top = data.y + 'px'

    requestAnimationFrame(float)
  }

  float()
}

function handleCollectibleClick(collectible) {
  const themeId = collectible.unlockTheme
  const themeName = themeId === 'dark' ? 'Dark' : themeId === 'pink' ? 'Pink' : themeId

  if (unlockedThemes.includes(themeId)) {
    // Already unlocked - show message
    showNotification(`✨ You already have the ${themeName} theme!`, 'success', 2000, true)
  } else {
    // Unlock the theme!
    unlockedThemes.push(themeId)
    chrome.storage.local.set({ unlockedThemes })

    // Visual feedback - make collectible spin and fade
    if (activeCollectible) {
      activeCollectible.style.transition = 'all 0.5s ease'
      activeCollectible.style.transform = 'scale(2) rotate(360deg)'
      activeCollectible.style.opacity = '0'
    }

    // Show unlock notification
    showNotification(`🎁 You unlocked the ${themeName} theme!`, 'success', 4000, true)

    console.log('MyVMK Genie: Theme unlocked via collectible:', themeId)
  }
}

function removeCollectible() {
  if (activeCollectible) {
    activeCollectible.remove()
    activeCollectible = null
  }
}

// Community Events - audio only, no overlays
function startCommunityEvent(event) {
  // If same event already running in this room, skip
  if (activeCommunityEvent && activeCommunityEvent.id === event.id && activeCommunityEventRoomId === currentRoomId) {
    return
  }

  const isJoiningMidEvent = activeCommunityEvent && activeCommunityEvent.id === event.id

  activeCommunityEvent = event
  activeCommunityEventRoomId = currentRoomId

  // Calculate elapsed seconds for late joiners
  const eventStartTime = new Date(event.startTime)
  const now = new Date()
  const elapsedSeconds = Math.max(0, (now - eventStartTime) / 1000)
  const isLateJoin = elapsedSeconds > 5

  // Play audio if specified (uses existing YouTube player - mutes game audio)
  // Start minimized so it doesn't cover the game
  if (event.audioUrl) {
    playAudio(event.audioUrl, true, isLateJoin ? elapsedSeconds : 0)
  }

  // Show notification with bee image (only once per event, not on every room change)
  if (!notifiedActiveEvents.has(event.id)) {
    notifiedActiveEvents.add(event.id)
    const beeIconUrl = chrome.runtime.getURL('bee-static.png')
    showNotification(`<img src="${beeIconUrl}" style="width: 20px; height: 20px;">${event.title}${isJoiningMidEvent ? ' in progress!' : ' starting!'}`, 'info', 2000, true)
  }
}

function stopCommunityEvent() {
  if (!activeCommunityEvent) return

  const event = activeCommunityEvent
  activeCommunityEvent = null
  activeCommunityEventRoomId = null
  notifiedActiveEvents.delete(event.id) // Allow notification again if event restarts

  // Stop audio (restores game audio)
  stopAudio()
}

function startGenieEventSystem() {
  // Fetch events immediately
  fetchGenieEvents()

  // Then fetch periodically
  setInterval(fetchGenieEvents, GENIE_EVENTS_FETCH_INTERVAL)

  // Check for active events every 10 seconds
  genieEventCheckInterval = setInterval(checkGenieEvents, 30000) // Check every 30 seconds
}

// Get scheduled Genie events for calendar display
function getScheduledGenieEvents() {
  return scheduledGenieEvents.map(event => ({
    id: event.id,
    title: event.title,
    description: event.description || '',
    roomName: event.roomName || 'TBD',
    startTime: new Date(event.startTime),
    durationMinutes: event.durationMinutes || 5,
    type: 'genie'
  }))
}

// Toggle position lock
function togglePositionLock() {
  isPositionLocked = !isPositionLocked

  if (isPositionLocked) {
    showNotification('🔒 Position locked', 'success')
  } else {
    showNotification('🔓 Position unlocked', 'info')
  }

  // Save preference
  chrome.storage.local.set({ positionLocked: isPositionLocked })
}

// Toggle stars overlay (on top of game)
function toggleStarsOverlay() {
  isStarsOverlayEnabled = !isStarsOverlayEnabled

  let overlay = document.getElementById('vmkpal-stars-overlay')

  if (isStarsOverlayEnabled) {
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'vmkpal-stars-overlay'
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483645;
      `

      // Create stars for overlay
      const starCount = Math.floor((window.innerWidth * window.innerHeight) / 6000)
      for (let i = 0; i < starCount; i++) {
        const star = document.createElement('div')
        star.className = 'vmkpal-star'
        star.style.left = Math.random() * 100 + '%'
        star.style.top = Math.random() * 100 + '%'
        star.style.setProperty('--delay', Math.random() * 4 + 's')
        star.style.setProperty('--duration', (2 + Math.random() * 3) + 's')
        const size = 1 + Math.random() * 2
        star.style.width = size + 'px'
        star.style.height = size + 'px'
        overlay.appendChild(star)
      }

      document.body.appendChild(overlay)
    }
    overlay.style.display = 'block'
    showNotification('✨ Stars overlay enabled', 'success')
  } else {
    if (overlay) {
      overlay.style.display = 'none'
    }
    showNotification('✨ Stars overlay disabled', 'info')
  }

  chrome.storage.local.set({ starsOverlayEnabled: isStarsOverlayEnabled })
}

// Toggle night overlay (dark tint over game)
function toggleNightOverlay() {
  isNightOverlayEnabled = !isNightOverlayEnabled

  let overlay = document.getElementById('vmkpal-night-overlay')

  if (isNightOverlayEnabled) {
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'vmkpal-night-overlay'
      document.body.appendChild(overlay)
    }
    updateNightOverlayBounds()
    overlay.style.display = 'block'
    showNotification('🌙 Night mode enabled', 'success')
  } else {
    if (overlay) {
      overlay.style.display = 'none'
    }
    showNotification('🌙 Night mode disabled', 'info')
  }

  chrome.storage.local.set({ nightOverlayEnabled: isNightOverlayEnabled })
}

// Update night overlay to match game canvas bounds
// If darker is true, use a more intense darkness for events
function updateNightOverlayBounds(darker = false) {
  const overlay = document.getElementById('vmkpal-night-overlay')
  if (!overlay) return

  const bounds = getGameCanvasBounds()

  // Event mode uses darker values
  const opacity1 = darker ? 0.55 : 0.45
  const opacity2 = darker ? 0.45 : 0.35
  const opacity3 = darker ? 0.5 : 0.4

  overlay.style.cssText = `
    position: fixed;
    top: ${bounds.top}px;
    left: ${bounds.left}px;
    width: ${bounds.width}px;
    height: ${bounds.height}px;
    pointer-events: none;
    z-index: 2147483647;
    background: linear-gradient(
      to bottom,
      rgba(5, 10, 30, ${opacity1}) 0%,
      rgba(10, 15, 40, ${opacity2}) 50%,
      rgba(5, 10, 30, ${opacity3}) 100%
    );
    mix-blend-mode: multiply;
  `
}

// Overlays Panel - Toggle various visual overlays
function createOverlaysPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'

  // Grid container
  const grid = document.createElement('div')
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  `

  // Rain toggle
  grid.appendChild(createOverlayToggle(
    '🌧️',
    'Rain',
    () => isRainEnabled,
    toggleRainOverlay
  ))

  // Stars overlay toggle
  grid.appendChild(createOverlayToggle(
    '✨',
    'Stars',
    () => isStarsOverlayEnabled,
    toggleStarsOverlay
  ))

  // Night overlay toggle
  grid.appendChild(createOverlayToggle(
    '🌙',
    'Night',
    () => isNightOverlayEnabled,
    toggleNightOverlay
  ))

  // Money rain toggle
  grid.appendChild(createOverlayToggle(
    '💸',
    'Money',
    () => isMoneyRainEnabled,
    toggleMoneyRain
  ))

  // Fireworks toggle
  grid.appendChild(createOverlayToggle(
    '🎆',
    'Fireworks',
    () => isFireworksEnabled,
    toggleFireworks
  ))

  // Snow toggle
  grid.appendChild(createOverlayToggle(
    '❄️',
    'Snow',
    () => isSnowEnabled,
    toggleSnowOverlay
  ))

  // DEV_MODE only: Testing effects (shake, flip, explode)
  if (DEV_MODE) {
    // Shake toggles (light, medium, heavy)
    grid.appendChild(createOverlayToggle(
      '📳',
      'Shake Light',
      () => activeShakeIntensity === 'light',
      () => toggleShakeEffect('light')
    ))

    grid.appendChild(createOverlayToggle(
      '📳',
      'Shake Med',
      () => activeShakeIntensity === 'medium',
      () => toggleShakeEffect('medium')
    ))

    grid.appendChild(createOverlayToggle(
      '📳',
      'Shake Heavy',
      () => activeShakeIntensity === 'heavy',
      () => toggleShakeEffect('heavy')
    ))

    // Flip actions (one-time animations)
    grid.appendChild(createOverlayAction(
      '↔️',
      'Flip H',
      () => flipCanvas('horizontal')
    ))

    grid.appendChild(createOverlayAction(
      '↕️',
      'Flip V',
      () => flipCanvas('vertical')
    ))

    grid.appendChild(createOverlayAction(
      '🔄',
      'Spin',
      () => flipCanvas('spin')
    ))

    grid.appendChild(createOverlayAction(
      '💥',
      'Explode',
      () => explodeCanvas()
    ))

    // Neon Rave toggle
    grid.appendChild(createOverlayToggle(
      '🎉',
      'Rave',
      () => isRaveEnabled,
      toggleRaveEffect
    ))
  }

  div.appendChild(grid)

  // Emoji Rain Section
  const emojiSection = document.createElement('div')
  emojiSection.style.cssText = `
    margin-top: 12px;
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 10px;
  `

  // Header row with title and toggle
  const emojiHeader = document.createElement('div')
  emojiHeader.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  `

  const emojiTitle = document.createElement('div')
  emojiTitle.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `
  emojiTitle.innerHTML = `
    <span style="font-size: 18px;">${selectedEmoji}</span>
    <span style="color: white; font-size: 12px; font-weight: 500;">Emoji Rain</span>
  `

  const emojiToggleBtn = document.createElement('button')
  const updateEmojiToggle = () => {
    emojiToggleBtn.textContent = isEmojiRainEnabled ? 'ON' : 'OFF'
    emojiToggleBtn.style.cssText = `
      padding: 5px 10px;
      border: none;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      ${isEmojiRainEnabled
        ? 'background: linear-gradient(135deg, #10b981, #059669); color: white;'
        : 'background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5);'
      }
    `
    // Update the title emoji display
    emojiTitle.innerHTML = `
      <span style="font-size: 18px;">${selectedEmoji}</span>
      <span style="color: white; font-size: 12px; font-weight: 500;">Emoji Rain</span>
    `
  }
  updateEmojiToggle()

  emojiToggleBtn.onclick = () => {
    toggleEmojiRain()
    updateEmojiToggle()
  }

  emojiHeader.appendChild(emojiTitle)
  emojiHeader.appendChild(emojiToggleBtn)
  emojiSection.appendChild(emojiHeader)

  // Emoji picker grid
  const emojiGrid = document.createElement('div')
  emojiGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  `

  EMOJI_PRESETS.forEach(emoji => {
    const emojiBtn = document.createElement('button')
    emojiBtn.textContent = emoji
    emojiBtn.style.cssText = `
      padding: 6px;
      border: 2px solid ${selectedEmoji === emoji ? '#8b5cf6' : 'transparent'};
      border-radius: 6px;
      background: ${selectedEmoji === emoji ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)'};
      font-size: 18px;
      cursor: pointer;
      transition: all 0.2s;
    `

    emojiBtn.onmouseenter = () => {
      if (selectedEmoji !== emoji) {
        emojiBtn.style.background = 'rgba(255,255,255,0.1)'
      }
    }
    emojiBtn.onmouseleave = () => {
      emojiBtn.style.background = selectedEmoji === emoji ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)'
    }

    emojiBtn.onclick = () => {
      setSelectedEmoji(emoji)
      // Update all emoji buttons
      emojiGrid.querySelectorAll('button').forEach(btn => {
        const isSelected = btn.textContent === emoji
        btn.style.border = isSelected ? '2px solid #8b5cf6' : '2px solid transparent'
        btn.style.background = isSelected ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)'
      })
      updateEmojiToggle()
    }

    emojiGrid.appendChild(emojiBtn)
  })

  emojiSection.appendChild(emojiGrid)

  // Custom emoji input
  const customRow = document.createElement('div')
  customRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    max-width: 100%;
    box-sizing: border-box;
  `

  const customLabel = document.createElement('span')
  customLabel.textContent = 'Custom:'
  customLabel.style.cssText = `
    color: rgba(255,255,255,0.6);
    font-size: 10px;
    flex-shrink: 0;
  `

  const customInput = document.createElement('input')
  customInput.type = 'text'
  customInput.placeholder = '🎀'
  customInput.value = ''
  customInput.style.cssText = `
    width: 50px;
    padding: 6px;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 6px;
    background: rgba(255,255,255,0.05);
    color: white;
    font-size: 16px;
    text-align: center;
    outline: none;
    box-sizing: border-box;
    flex-shrink: 0;
  `
  customInput.onfocus = () => customInput.style.borderColor = '#8b5cf6'
  customInput.onblur = () => customInput.style.borderColor = 'rgba(255,255,255,0.15)'

  // Prevent event propagation for input
  customInput.addEventListener('mousedown', (e) => e.stopPropagation())
  customInput.addEventListener('click', (e) => e.stopPropagation())
  customInput.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' && customInput.value.trim()) {
      applyCustomEmoji()
    }
  }, true)
  customInput.addEventListener('keyup', (e) => e.stopPropagation())
  customInput.addEventListener('keypress', (e) => e.stopPropagation())
  customInput.addEventListener('paste', (e) => e.stopPropagation())

  const applyBtn = document.createElement('button')
  applyBtn.textContent = 'Use'
  applyBtn.style.cssText = `
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    color: white;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
    flex-shrink: 0;
  `
  applyBtn.onmouseenter = () => applyBtn.style.opacity = '0.9'
  applyBtn.onmouseleave = () => applyBtn.style.opacity = '1'

  const applyCustomEmoji = () => {
    const emoji = customInput.value.trim()
    if (emoji) {
      setSelectedEmoji(emoji)
      // Deselect all preset buttons
      emojiGrid.querySelectorAll('button').forEach(btn => {
        btn.style.border = '2px solid transparent'
        btn.style.background = 'rgba(255,255,255,0.05)'
      })
      updateEmojiToggle()
      customInput.value = ''
      showNotification(`${emoji} Selected!`, 'success')
    }
  }

  applyBtn.onclick = applyCustomEmoji

  customRow.appendChild(customLabel)
  customRow.appendChild(customInput)
  customRow.appendChild(applyBtn)
  emojiSection.appendChild(customRow)

  div.appendChild(emojiSection)

  return div
}

// Helper to create overlay toggle square button
function createOverlayAction(icon, label, actionFn) {
  const btn = document.createElement('button')

  btn.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 12px 8px;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    background: rgba(255,255,255,0.08);
    color: white;
  `

  btn.innerHTML = `
    <span style="font-size: 22px;">${icon}</span>
    <span style="font-size: 10px; font-weight: 500;">${label}</span>
  `

  btn.onclick = () => {
    actionFn()
    // Brief highlight effect
    btn.style.background = 'linear-gradient(135deg, #10b981, #059669)'
    setTimeout(() => {
      btn.style.background = 'rgba(255,255,255,0.08)'
    }, 300)
  }

  btn.onmouseenter = () => {
    btn.style.background = 'rgba(255,255,255,0.15)'
  }

  btn.onmouseleave = () => {
    btn.style.background = 'rgba(255,255,255,0.08)'
  }

  return btn
}

function createOverlayToggle(icon, label, isEnabledFn, toggleFn) {
  const btn = document.createElement('button')

  const updateStyle = () => {
    const enabled = isEnabledFn()
    btn.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 12px 8px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
      ${enabled
        ? 'background: linear-gradient(135deg, #10b981, #059669); color: white;'
        : 'background: rgba(255,255,255,0.08); color: white;'
      }
    `
  }

  updateStyle()

  btn.innerHTML = `
    <span style="font-size: 22px;">${icon}</span>
    <span style="font-size: 10px; font-weight: 500;">${label}</span>
  `

  btn.onclick = () => {
    toggleFn()
    updateStyle()
  }

  btn.onmouseenter = () => {
    if (!isEnabledFn()) {
      btn.style.background = 'rgba(255,255,255,0.15)'
    }
  }

  btn.onmouseleave = () => {
    updateStyle()
  }

  return btn
}

// Commands Panel - MyVMK command reference guide
function createCommandsPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 8px;'

  // All commands data
  const allCommands = [
    { category: 'General Commands', command: '!me (text)', desc: 'Sends a message in the room with your character name.', copyText: '!me ' },
    { category: 'General Commands', command: '!s / !sig / !signature', desc: 'Updates your signature with any text placed after the command.', copyText: '!sig ' },
    { category: 'General Commands', command: '!notrades / !toggletrades', desc: 'Stops you from getting trade requests. Type again to re-enable.', copyText: '!notrades' },
    { category: 'General Commands', command: '!nofriends', desc: 'Stops you from getting friend requests. Type again to re-enable.', copyText: '!nofriends' },
    { category: 'General Commands', command: '!invisiblemode', desc: 'Enables invisible mode so you appear offline. Type again or relog to disable.', copyText: '!invisiblemode' },
    { category: 'General Commands', command: '!lucky', desc: 'Sends you to a random guest room.', copyText: '!lucky' },
    { category: 'General Commands', command: '!sniff (user)', desc: 'Sniffs a user and randomly generates a scent.', copyText: '!sniff ' },
    { category: 'General Commands', command: '!roll #', desc: 'Rolls a random number between 1 and #.', copyText: '!roll ' },
    { category: 'General Commands', command: '::screenshot', desc: 'Downloads a picture of the room (hides chat bubbles).', copyText: '::screenshot' },
    { category: 'General Commands', command: '::screenshot av', desc: 'Downloads a picture of the room (hides avatars).', copyText: '::screenshot av' },
    { category: 'General Commands', command: '::screenshot chat', desc: 'Downloads a picture of the room (includes chat bubbles).', copyText: '::screenshot chat' },
    { category: 'General Commands', command: '::presets', desc: 'Opens a popup interface to view, delete, and edit clothing presets.', copyText: '::presets' },
    { category: 'General Commands', command: '::discordtrade', desc: 'Opens a searchable interface for trades and Discord\'s #trading-post.', copyText: '::discordtrade' },
    { category: 'General Commands', command: '::up', desc: 'Clears your game window of chats.', copyText: '::up' },
    { category: 'General Commands', command: '::nolanyards', desc: 'Prevents opening a user\'s pin lanyard. Type again to re-enable.', copyText: '::nolanyards' },
    { category: 'General Commands', command: '::avatars', desc: 'Lists all users in the same room.', copyText: '::avatars' },
    { category: 'General Commands', command: '::cratewins', desc: 'Displays all items you won from crates.', copyText: '::cratewins' },
    { category: 'Keyboard Shortcuts', shortcut: 'Hold Shift + Click a User', desc: 'Types the user\'s name into the chat box.' },
    { category: 'Keyboard Shortcuts', shortcut: 'Hold Shift + Press Next in Messages', desc: 'Deletes all messages.' },
    { category: 'Keyboard Shortcuts', shortcut: 'Hold Shift + Press - or + in Shops', desc: 'Bulk adds/subtracts 10 of an item.' },
    { category: 'Keyboard Shortcuts', shortcut: 'Hold Shift + Highlight in Inventory', desc: 'Allows you to sell the entire stack of a sellable item.' },
    { category: 'Keyboard Shortcuts', shortcut: 'Right Click on Item While Trading', desc: 'Opens a dropdown for bulk adding items.' },
    { category: 'Guest Room Commands', command: '!spin', desc: 'Spins all generators in the current room.', copyText: '!spin' },
    { category: 'Guest Room Commands', command: '!resetstates rng', desc: 'Resets only the random number generators to zero.', copyText: '!resetstates rng' },
    { category: 'Guest Room Commands', command: '!resetstates', desc: 'Resets all items in the room to default state (Generators, Flaming Ransacked Windows, Lanterns, Candles, etc.).', copyText: '!resetstates' },
    { category: 'Guest Room Commands', command: '!kick (user)', desc: 'Kicks a specific user from the guest room.', copyText: '!kick ' },
    { category: 'Guest Room Commands', command: '!q / !queue', desc: 'Shows users, queue size, and room capacity.', copyText: '!q' },
    { category: 'Guest Room Commands', command: '!preload', desc: 'Toggles loading of all items in a room before entering. Type again to disable.', copyText: '!preload' },
    { category: 'Guest Room Commands', command: '!cage (username)', desc: 'Only available in Oogie\'s Lair guestroom; sends a user to the cage.', copyText: '!cage ' },
    { category: 'Furniture Shortcuts', shortcut: 'Hold Shift While Placing Furniture', desc: 'Places multiples of an item consecutively if you have several in inventory.' },
    { category: 'Furniture Shortcuts', shortcut: 'Hold Shift + Click a Furniture Item', desc: 'Puts the item back into your inventory.' },
    { category: 'Furniture Shortcuts', shortcut: 'Hold Control + Click/Scroll a Furniture Item', desc: 'Rotates the item before placing it.' }
  ]

  // Copy feedback tooltip
  let copyTooltip = null
  function showCopyFeedback(element, text) {
    if (copyTooltip) copyTooltip.remove()

    copyTooltip = document.createElement('div')
    copyTooltip.textContent = 'Copied!'
    copyTooltip.style.cssText = `
      position: absolute;
      background: #10b981;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      z-index: 10000;
      pointer-events: none;
      animation: fadeOut 1s forwards;
    `

    const rect = element.getBoundingClientRect()
    copyTooltip.style.left = rect.right + 8 + 'px'
    copyTooltip.style.top = rect.top + 'px'

    document.body.appendChild(copyTooltip)

    setTimeout(() => {
      if (copyTooltip) {
        copyTooltip.remove()
        copyTooltip = null
      }
    }, 1000)
  }

  // Search bar
  const searchContainer = document.createElement('div')
  searchContainer.style.cssText = 'margin-bottom: 12px;'

  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = 'Search commands...'
  searchInput.style.cssText = `
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    color: white;
    font-size: 12px;
    outline: none;
  `
  searchInput.onfocus = () => searchInput.style.borderColor = '#8b5cf6'
  searchInput.onblur = () => searchInput.style.borderColor = 'rgba(255,255,255,0.15)'

  // Prevent event propagation to fix input issues
  searchInput.addEventListener('mousedown', (e) => e.stopPropagation())
  searchInput.addEventListener('click', (e) => e.stopPropagation())
  searchInput.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      return true
    }
  }, true)
  searchInput.addEventListener('keyup', (e) => e.stopPropagation())
  searchInput.addEventListener('keypress', (e) => e.stopPropagation())
  searchInput.addEventListener('paste', (e) => e.stopPropagation())
  searchInput.addEventListener('copy', (e) => e.stopPropagation())
  searchInput.addEventListener('cut', (e) => e.stopPropagation())

  const hint = document.createElement('div')
  hint.style.cssText = `
    font-size: 9px;
    color: rgba(255,255,255,0.4);
    margin-top: 4px;
  `
  hint.textContent = 'Click any green command to copy'

  searchContainer.appendChild(searchInput)
  searchContainer.appendChild(hint)
  div.appendChild(searchContainer)

  // Content area (uses parent scroll)
  const contentArea = document.createElement('div')

  // Helper to create command row
  function createCommandRow(item) {
    const row = document.createElement('div')
    row.className = 'command-row'
    row.style.cssText = `
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    `

    if (item.command) {
      const cmd = document.createElement('div')
      cmd.style.cssText = `
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 11px;
        color: #4ade80;
        background: rgba(74, 222, 128, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        display: inline-block;
        margin-bottom: 4px;
        cursor: pointer;
        transition: all 0.2s;
      `
      cmd.textContent = item.command
      cmd.title = 'Click to copy'

      cmd.onmouseenter = () => {
        cmd.style.background = 'rgba(74, 222, 128, 0.25)'
        cmd.style.transform = 'scale(1.02)'
      }
      cmd.onmouseleave = () => {
        cmd.style.background = 'rgba(74, 222, 128, 0.1)'
        cmd.style.transform = 'scale(1)'
      }
      cmd.onclick = () => {
        navigator.clipboard.writeText(item.copyText || item.command)
        showCopyFeedback(cmd, item.copyText || item.command)
      }

      row.appendChild(cmd)
    }

    if (item.shortcut) {
      const shortcut = document.createElement('div')
      shortcut.style.cssText = `
        font-size: 11px;
        color: #818cf8;
        font-weight: 600;
        margin-bottom: 4px;
      `
      shortcut.textContent = item.shortcut
      row.appendChild(shortcut)
    }

    const desc = document.createElement('div')
    desc.style.cssText = `
      font-size: 10px;
      color: rgba(255,255,255,0.7);
      line-height: 1.4;
    `
    desc.textContent = item.desc
    row.appendChild(desc)

    return row
  }

  // Render commands grouped by category
  function renderCommands(filter = '') {
    contentArea.innerHTML = ''
    const lowerFilter = filter.toLowerCase()

    const filteredCommands = filter
      ? allCommands.filter(item =>
          (item.command && item.command.toLowerCase().includes(lowerFilter)) ||
          (item.shortcut && item.shortcut.toLowerCase().includes(lowerFilter)) ||
          item.desc.toLowerCase().includes(lowerFilter) ||
          item.category.toLowerCase().includes(lowerFilter)
        )
      : allCommands

    if (filteredCommands.length === 0) {
      const noResults = document.createElement('div')
      noResults.style.cssText = `
        text-align: center;
        color: rgba(255,255,255,0.5);
        font-size: 12px;
        padding: 20px;
      `
      noResults.textContent = 'No commands found'
      contentArea.appendChild(noResults)
      return
    }

    // Group by category
    const categories = {}
    filteredCommands.forEach(item => {
      if (!categories[item.category]) categories[item.category] = []
      categories[item.category].push(item)
    })

    // Render each category
    Object.keys(categories).forEach(categoryName => {
      const section = document.createElement('div')
      section.style.cssText = 'margin-bottom: 16px;'

      const header = document.createElement('div')
      header.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: #fbbf24;
        margin-bottom: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(251, 191, 36, 0.3);
      `
      header.textContent = categoryName
      section.appendChild(header)

      categories[categoryName].forEach(item => {
        section.appendChild(createCommandRow(item))
      })

      contentArea.appendChild(section)
    })
  }

  // Initial render
  renderCommands()

  // Search handler
  searchInput.oninput = (e) => {
    renderCommands(e.target.value)
  }

  div.appendChild(contentArea)

  return div
}

// Settings Panel - Extension settings and customization
function createSettingsPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'

  // Small Icon Toggle
  const smallIconToggle = createSettingToggle(
    '🔍',
    'Small Icon',
    'Use a smaller floating menu icon',
    () => isSmallIconEnabled,
    () => {
      isSmallIconEnabled = !isSmallIconEnabled
      chrome.storage.local.set({ isSmallIconEnabled })
      applyIconSize()
    }
  )
  div.appendChild(smallIconToggle.element)

  // Theme Selector Section
  const isDarkUnlocked = unlockedThemes.includes('dark')

  const themeSection = document.createElement('div')
  themeSection.style.cssText = `
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 8px;
  `

  const themeLabel = document.createElement('div')
  themeLabel.textContent = 'THEME'
  themeLabel.style.cssText = `
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
    margin-bottom: 12px;
    color: white;
  `
  themeSection.appendChild(themeLabel)

  const themeGrid = document.createElement('div')
  themeGrid.style.cssText = `
    display: flex;
    gap: 10px;
    justify-content: flex-start;
  `

  // Helper to create theme option
  function createThemeOption(id, imgSrc, isLocked = false) {
    const isSelected = (id === 'default' && !isPinkTheme && !isDarkTheme) ||
                       (id === 'pink' && isPinkTheme) ||
                       (id === 'dark' && isDarkTheme)

    const option = document.createElement('div')
    option.dataset.themeId = id
    option.style.cssText = `
      position: relative;
      width: 60px;
      height: 60px;
      border-radius: 12px;
      cursor: ${isLocked ? 'not-allowed' : 'pointer'};
      transition: all 0.2s ease;
      border: 3px solid ${isSelected ? '#8b5cf6' : 'transparent'};
      box-shadow: ${isSelected ? '0 0 15px rgba(139, 92, 246, 0.5)' : 'none'};
      opacity: ${isLocked ? '0.4' : '1'};
      overflow: hidden;
    `

    const img = document.createElement('img')
    img.src = imgSrc
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 9px;
    `
    option.appendChild(img)

    // Lock overlay for locked themes
    if (isLocked) {
      const lockOverlay = document.createElement('div')
      lockOverlay.style.cssText = `
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 9px;
        font-size: 24px;
      `
      lockOverlay.textContent = '🔒'
      option.appendChild(lockOverlay)

      // Tooltip for locked theme
      option.title = 'Find the hidden item to unlock Dark Theme!'
    }

    // Hover effects
    if (!isLocked) {
      option.addEventListener('mouseenter', () => {
        if (!isSelected) {
          option.style.transform = 'scale(1.05)'
          option.style.borderColor = 'rgba(139, 92, 246, 0.5)'
        }
      })
      option.addEventListener('mouseleave', () => {
        if (!isSelected) {
          option.style.transform = 'scale(1)'
          option.style.borderColor = 'transparent'
        }
      })

      // Click to select theme
      option.addEventListener('click', () => {
        if (id === 'default') {
          isPinkTheme = false
          isDarkTheme = false
        } else if (id === 'pink') {
          isPinkTheme = true
          isDarkTheme = false
        } else if (id === 'dark') {
          isPinkTheme = false
          isDarkTheme = true
        }
        chrome.storage.local.set({ isPinkTheme, isDarkTheme })
        applyTheme()
        updateThemeSelection()
      })
    }

    return option
  }

  // Update visual selection state
  function updateThemeSelection() {
    themeGrid.querySelectorAll('[data-theme-id]').forEach(opt => {
      const id = opt.dataset.themeId
      const isSelected = (id === 'default' && !isPinkTheme && !isDarkTheme) ||
                         (id === 'pink' && isPinkTheme) ||
                         (id === 'dark' && isDarkTheme)
      opt.style.borderColor = isSelected ? '#8b5cf6' : 'transparent'
      opt.style.boxShadow = isSelected ? '0 0 15px rgba(139, 92, 246, 0.5)' : 'none'
    })
  }

  // Create theme options
  const defaultTheme = createThemeOption('default', chrome.runtime.getURL('myvmk-genie.png'))
  const pinkTheme = createThemeOption('pink', chrome.runtime.getURL('myvmk-genie-lamp-logo-pink.png'))
  const darkTheme = createThemeOption('dark', chrome.runtime.getURL('myvmk-genie-lamp-logo-jafar.png'), !isDarkUnlocked)

  themeGrid.appendChild(defaultTheme)
  themeGrid.appendChild(pinkTheme)
  themeGrid.appendChild(darkTheme)
  themeSection.appendChild(themeGrid)
  div.appendChild(themeSection)

  // Kingdom Sync Toggle
  const kingdomSyncSection = document.createElement('div')
  kingdomSyncSection.style.cssText = `
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: background 0.2s;
  `
  kingdomSyncSection.addEventListener('mouseenter', () => {
    kingdomSyncSection.style.background = 'rgba(255,255,255,0.1)'
  })
  kingdomSyncSection.addEventListener('mouseleave', () => {
    kingdomSyncSection.style.background = 'rgba(255,255,255,0.05)'
  })

  const kingdomSyncIcon = document.createElement('img')
  kingdomSyncIcon.src = chrome.runtime.getURL('genie-kingdomsync-logo.png')
  kingdomSyncIcon.style.cssText = 'width: 40px; height: 40px; border-radius: 8px;'

  const kingdomSyncText = document.createElement('div')
  kingdomSyncText.style.cssText = 'flex: 1;'
  kingdomSyncText.innerHTML = `
    <div style="font-weight: 600; color: white;">Kingdom Sync</div>
    <div style="font-size: 11px; color: rgba(255,255,255,0.5);">Enhanced ambient effects & night mode</div>
  `

  const kingdomSyncToggleBtn = document.createElement('div')
  kingdomSyncToggleBtn.style.cssText = `
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
  `

  function updateKingdomSyncToggle() {
    if (isKingdomSyncEnabled) {
      kingdomSyncToggleBtn.textContent = 'ON'
      kingdomSyncToggleBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)'
      kingdomSyncToggleBtn.style.color = 'white'
    } else {
      kingdomSyncToggleBtn.textContent = 'OFF'
      kingdomSyncToggleBtn.style.background = 'rgba(255,255,255,0.1)'
      kingdomSyncToggleBtn.style.color = 'rgba(255,255,255,0.6)'
    }
  }
  updateKingdomSyncToggle()

  kingdomSyncSection.onclick = () => {
    isKingdomSyncEnabled = !isKingdomSyncEnabled
    chrome.storage.local.set({ isKingdomSyncEnabled })
    updateKingdomSyncToggle()

    if (isKingdomSyncEnabled) {
      // Reset rare effect decisions for fresh experience
      kingdomSyncFireflyRooms.clear()
      checkKingdomSyncEffects()
    } else {
      // Stop all Kingdom Sync effects
      stopFireflyEffect()
      stopFogEffect()
      stopKingdomSyncNight()
    }
  }

  kingdomSyncSection.appendChild(kingdomSyncIcon)
  kingdomSyncSection.appendChild(kingdomSyncText)
  kingdomSyncSection.appendChild(kingdomSyncToggleBtn)
  div.appendChild(kingdomSyncSection)

  // Test Mode Toggle (admin only - shows test events)
  const testModeToggle = createSettingToggle(
    '🧪',
    'Test Mode',
    'Show and trigger test events',
    () => isTestModeEnabled,
    () => {
      isTestModeEnabled = !isTestModeEnabled
      chrome.storage.local.set({ isTestModeEnabled })
      renderTickerContent() // Re-render ticker to show/hide test events
    }
  )
  div.appendChild(testModeToggle.element)

  // Background Color Section
  const bgSection = document.createElement('div')
  bgSection.style.cssText = `
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 8px;
  `

  const bgHeader = document.createElement('div')
  bgHeader.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  `
  bgHeader.innerHTML = `
    <span style="font-size: 24px;">🎨</span>
    <div>
      <div style="color: white; font-size: 13px; font-weight: 500;">Background Color</div>
      <div style="color: rgba(255,255,255,0.5); font-size: 10px;">Customize panel background</div>
    </div>
  `
  bgSection.appendChild(bgHeader)

  // Color picker row
  const colorRow = document.createElement('div')
  colorRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  `

  const colorInput = document.createElement('input')
  colorInput.type = 'color'
  colorInput.value = customBackgroundColor || '#1e1b4b'
  colorInput.style.cssText = `
    width: 40px;
    height: 32px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
  `

  const colorPreview = document.createElement('div')
  colorPreview.style.cssText = `
    flex: 1;
    height: 32px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.2);
  `

  const updateColorPreview = () => {
    colorPreview.style.background = colorInput.value
  }
  updateColorPreview()

  colorInput.addEventListener('input', updateColorPreview)

  colorRow.appendChild(colorInput)
  colorRow.appendChild(colorPreview)
  bgSection.appendChild(colorRow)

  // Buttons row
  const btnRow = document.createElement('div')
  btnRow.style.cssText = `
    display: flex;
    gap: 8px;
  `

  const applyBtn = document.createElement('button')
  applyBtn.textContent = 'Apply Color'
  applyBtn.style.cssText = `
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: 6px;
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  `
  applyBtn.onmouseenter = () => applyBtn.style.opacity = '0.9'
  applyBtn.onmouseleave = () => applyBtn.style.opacity = '1'
  applyBtn.onclick = () => {
    customBackgroundColor = colorInput.value
    chrome.storage.local.set({ customBackgroundColor })
    applyBackgroundColor()
  }

  const resetBtn = document.createElement('button')
  resetBtn.textContent = 'Reset to Default'
  resetBtn.style.cssText = `
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: 6px;
    background: rgba(255,255,255,0.1);
    color: white;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  `
  resetBtn.onmouseenter = () => resetBtn.style.background = 'rgba(255,255,255,0.2)'
  resetBtn.onmouseleave = () => resetBtn.style.background = 'rgba(255,255,255,0.1)'
  resetBtn.onclick = () => {
    customBackgroundColor = null
    colorInput.value = '#1e1b4b'
    updateColorPreview()
    chrome.storage.local.remove('customBackgroundColor')
    applyBackgroundColor()
  }

  btnRow.appendChild(applyBtn)
  btnRow.appendChild(resetBtn)
  bgSection.appendChild(btnRow)

  div.appendChild(bgSection)

  // Load saved settings to update UI
  chrome.storage.local.get(['isSmallIconEnabled', 'customBackgroundColor', 'isPinkTheme', 'isDarkTheme', 'unlockedThemes', 'isTestModeEnabled'], (result) => {
    if (result.isSmallIconEnabled !== undefined) {
      isSmallIconEnabled = result.isSmallIconEnabled
      smallIconToggle.updateState()
    }
    if (result.unlockedThemes) {
      unlockedThemes = result.unlockedThemes
    }
    if (result.isPinkTheme !== undefined) {
      isPinkTheme = result.isPinkTheme
    }
    if (result.isDarkTheme !== undefined) {
      isDarkTheme = result.isDarkTheme
    }
    // Update theme selection UI
    updateThemeSelection()
    if (result.isTestModeEnabled !== undefined) {
      isTestModeEnabled = result.isTestModeEnabled
      testModeToggle.updateState()
    }
    if (result.customBackgroundColor) {
      customBackgroundColor = result.customBackgroundColor
      colorInput.value = customBackgroundColor
      updateColorPreview()
    }
  })

  // Changelog Button
  const changelogBtn = document.createElement('button')
  changelogBtn.innerHTML = '📋 Change Log'
  changelogBtn.style.cssText = `
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 8px;
    background: rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.8);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
    margin-top: 8px;
  `
  changelogBtn.onmouseenter = () => changelogBtn.style.background = 'rgba(255,255,255,0.1)'
  changelogBtn.onmouseleave = () => changelogBtn.style.background = 'rgba(255,255,255,0.05)'
  changelogBtn.onclick = () => openFeaturePanel('📋', 'Change Log', createChangelogPanel)
  div.appendChild(changelogBtn)

  // Refresh Events Button
  const refreshEventsBtn = document.createElement('button')
  refreshEventsBtn.innerHTML = '🔄 Refresh Events'
  refreshEventsBtn.style.cssText = `
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 8px;
    background: rgba(139, 92, 246, 0.2);
    color: rgba(255,255,255,0.8);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
    margin-top: 8px;
  `
  refreshEventsBtn.onmouseenter = () => refreshEventsBtn.style.background = 'rgba(139, 92, 246, 0.3)'
  refreshEventsBtn.onmouseleave = () => refreshEventsBtn.style.background = 'rgba(139, 92, 246, 0.2)'
  refreshEventsBtn.onclick = async () => {
    refreshEventsBtn.innerHTML = '🔄 Refreshing...'
    refreshEventsBtn.style.opacity = '0.7'
    await fetchGenieEvents()
    refreshEventsBtn.innerHTML = '✅ Events Refreshed!'
    setTimeout(() => {
      refreshEventsBtn.innerHTML = '🔄 Refresh Events'
      refreshEventsBtn.style.opacity = '1'
    }, 2000)
    showNotification(`Loaded ${scheduledGenieEvents.length} genie events`, 'success')
  }
  div.appendChild(refreshEventsBtn)

  // Credits
  const credits = document.createElement('div')
  credits.style.cssText = 'text-align: center; color: rgba(255,255,255,0.4); font-size: 10px; margin-top: 16px; line-height: 1.5;'
  credits.innerHTML = 'Created by bsims<br>Designs and Creative by Bib and alphablue'
  div.appendChild(credits)

  // Version info (reads from manifest.json)
  const versionInfo = document.createElement('div')
  versionInfo.style.cssText = 'text-align: center; color: rgba(255,255,255,0.3); font-size: 10px; margin-top: 8px;'
  const manifestVersion = chrome.runtime.getManifest().version
  versionInfo.textContent = `MyVMK Genie v${manifestVersion}`
  div.appendChild(versionInfo)

  return div
}

// Changelog data
const CHANGELOG = [
  {
    version: '2.1.3',
    date: '2025-03-20',
    changes: [
      'Kingdom Sync: Enhanced ambient experience with room-specific effects',
      'Fireflies in Frontierland areas, fog in Adventureland',
      'Subtle night overlay during evening hours (8PM-6AM Eastern)',
      'Castle Gardens Overlay: Castle image with fireworks behind',
      'Map Detection: Overlays hide when opening map, restore on room entry',
      'Enhanced fireworks with multiple explosion types and better effects',
      'Matterhorn snow now fades in/out smoothly',
      'Fixed admin panel timezone parsing for event scheduling'
    ]
  },
  {
    version: '2.1.2',
    date: '2025-03-18',
    changes: [
      'Room Collectibles: Hidden clickable items in rooms that unlock themes!',
      'Redesigned theme selector with visual icons',
      'Collectibles float within game canvas with gentle movement',
      'Audio player supports WatchParty.me and direct MP3/audio URLs',
      'Visual audio player with play/pause, seek, volume, and loop controls',
      'Fixed Matterhorn snow not auto-disabling when leaving the room',
      'Fixed potential idle crashes by pausing effects when tab is hidden',
      'Improved room detection reliability with backup detection'
    ]
  },
  {
    version: '2.1.1',
    date: '2025-03-18',
    changes: [
      'Theme Unlocks: Attend Genie Events to unlock exclusive themes!',
      'Added Dark Theme (Jafar) - unlockable by collecting hidden item',
      'Fixed Prize Tracker minimize/restore not working properly'
    ]
  },
  {
    version: '2.1.0',
    date: '2025-03-17',
    changes: [
      'Firefox extension now available',
      'Added Pirate Treasure Room audio detection',
      'Prize Tracker panel with embedded compact view',
      'Bidirectional sync between extension and main Prize Tracker site',
      'Save/Sync buttons for manual data sync'
    ]
  },
  {
    version: '2.0.8',
    date: '2025-03-17',
    changes: [
      'Snow auto-enables in Matterhorn (can be manually disabled)',
      'Bee banner notifications for all events at 1 hour and 1 minute before',
      'Fixed ICS events (Double Credits, etc.) staying visible until they end',
      'Fixed room effects (Tinkerbell, butterflies, ghost) following to other rooms',
      'Increased max event duration to 24 hours in admin panel'
    ]
  },
  {
    version: '2.0.7',
    date: '2025-03-17',
    changes: [
      'Added minimize button to panel header',
      'Added close button to screenshot popup',
      'Screenshot shortcut changed to Ctrl+Shift+S (Cmd+Shift+S on Mac)'
    ]
  },
  {
    version: '2.0.6',
    date: '2025-03-17',
    changes: [
      'Test Events: Create private test events via admin panel',
      'Test Mode toggle in Settings to see/trigger test events',
      'Custom ticker icon support via admin panel'
    ]
  },
  {
    version: '2.0.5',
    date: '2025-03-17',
    changes: [
      'Reduced permission warnings (removed unused scripting permission)',
      'Removed room entry notification popup'
    ]
  },
  {
    version: '2.0.4',
    date: '2025-03-17',
    changes: [
      'Custom ticker icon support via admin panel',
      'Ticker separator changed to bullet for consistency'
    ]
  },
  {
    version: '2.0.3',
    date: '2025-03-16',
    changes: [
      'Removed erroneous testing feature'
    ]
  },
  {
    version: '2.0.2',
    date: '2025-03-16',
    changes: [
      'Ticker shows all events (Host, Genie, Community) in continuous scroll',
      'Events stay visible until they end with LIVE badge',
      'Slowed ticker scroll for better readability',
      'Added public event calendar page'
    ]
  },
  {
    version: '2.0.1',
    date: '2025-03-16',
    changes: [
      'Tightened permissions for faster Chrome Web Store review',
      'Screenshot shortcut now Alt+S (shown as helper text)',
      'Performance optimizations (reduced background intervals)',
      'Butterflies now flip to face movement direction'
    ]
  },
  {
    version: '2.0.0',
    date: '2025-03-15',
    changes: [
      'Official public release',
      'Happily Ever After choreographed show',
      'Spotlight system with synced left/right groups',
      'Pre-event notifications',
      'Stars overlay effect'
    ]
  },
  {
    version: '1.1.8',
    date: '2025-03-14',
    changes: [
      'Genie Events now trigger all overlay effects correctly',
      'YouTube player starts minimized during events',
      'Added Night overlay to event effects',
      'Multiple effects can be selected per event',
      'Events are editable in admin page'
    ]
  },
  {
    version: '1.1.7',
    date: '2025-03-13',
    changes: [
      'Added Genie Events system with all overlay effects',
      'Events support YouTube audio with embedded player',
      'Added Refresh Events button in Settings',
      'Fireworks now explode in top 30% of screen'
    ]
  },
  {
    version: '1.1.6',
    date: '2025-03-13',
    changes: [
      'Added Tinkerbell effect in Fantasyland Courtyard',
      'Improved Haunted Mansion game detection',
      'Ghost (Beadie) now only appears in HM Lobby'
    ]
  },
  {
    version: '1.1.5',
    date: '2025-03-13',
    changes: [
      'Added Pink Theme toggle in Settings',
      'Theme changes logo, background, and panel colors',
      'Fixed floating icon corner transparency'
    ]
  },
  {
    version: '1.1.4',
    date: '2025-03-13',
    changes: [
      'Change Log now opens within extension panel',
      'Better vertical alignment for ticker logos',
      'Extension only loads on game client pages'
    ]
  },
  {
    version: '1.1.3',
    date: '2025-03-13',
    changes: [
      'Added welcome message that alternates with event ticker',
      'Lock Position button shows locked/unlocked icons',
      'Ticker content swaps only when off-screen'
    ]
  },
  {
    version: '1.1.2',
    date: '2025-03-13',
    changes: [
      'Narrowed host permissions to MyVMK domains only'
    ]
  },
  {
    version: '1.1.1',
    date: '2025-03-13',
    changes: [
      'Optimized initial load time',
      'Removed unnecessary cache clearing',
      'Deferred non-critical initialization',
      'Debug logging only in internal mode'
    ]
  },
  {
    version: '1.1.0',
    date: '2025-03-13',
    changes: [
      'Alt+S now shows clipboard/download dialog',
      'Added region select for screenshots',
      'Click and drag to capture specific area'
    ]
  },
  {
    version: '1.0.9',
    date: '2025-03-13',
    changes: [
      'Slowed down event ticker scroll speed'
    ]
  },
  {
    version: '1.0.8',
    date: '2025-03-13',
    changes: [
      'Fixed spacebar re-triggering buttons',
      'All buttons now blur after click'
    ]
  },
  {
    version: '1.0.7',
    date: '2025-03-13',
    changes: [
      'Right-click paste now works in Audio URL field',
      'Screenshot modal with clipboard/download options',
      'Preview image before saving'
    ]
  },
  {
    version: '1.0.6',
    date: '2025-03-13',
    changes: [
      'Sticky back button header in sub-menus',
      'No more scrolling up to find back button'
    ]
  },
  {
    version: '1.0.5',
    date: '2025-03-13',
    changes: [
      'Mac keyboard support (Ctrl+# instead of Alt+#)',
      'Auto-detects Mac vs Windows/Linux',
      'UI shows correct shortcut per platform'
    ]
  },
  {
    version: '1.0.4',
    date: '2025-03-13',
    changes: [
      'Moved Save Phrases button to top',
      'Smaller, more compact save button'
    ]
  },
  {
    version: '1.0.3',
    date: '2025-03-13',
    changes: [
      'Added DEV_MODE for dev features',
      'Queue, Room Audio, Current Room hidden in production'
    ]
  }
]

// Create changelog panel for inline display
function createChangelogPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 8px;'

  CHANGELOG.forEach((release, index) => {
    const item = document.createElement('div')
    item.style.cssText = 'margin-bottom: 12px;'

    const header = document.createElement('div')
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      background: rgba(255,255,255,0.08);
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    `
    header.innerHTML = `
      <div>
        <span style="color: #8b5cf6; font-weight: 600; font-size: 13px;">v${release.version}</span>
        <span style="color: rgba(255,255,255,0.4); font-size: 11px; margin-left: 8px;">${release.date}</span>
      </div>
      <span class="arrow" style="color: rgba(255,255,255,0.4); font-size: 12px;">${index === 0 ? '▲' : '▼'}</span>
    `

    const content = document.createElement('div')
    content.style.cssText = `
      display: ${index === 0 ? 'block' : 'none'};
      padding: 10px 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 0 0 8px 8px;
      margin-top: -4px;
    `
    content.innerHTML = `
      <ul style="margin: 0; padding-left: 16px; color: rgba(255,255,255,0.7); font-size: 11px; line-height: 1.6;">
        ${release.changes.map(c => `<li>${c}</li>`).join('')}
      </ul>
    `

    header.onmouseenter = () => header.style.background = 'rgba(255,255,255,0.12)'
    header.onmouseleave = () => header.style.background = 'rgba(255,255,255,0.08)'
    header.onclick = () => {
      const isVisible = content.style.display === 'block'
      content.style.display = isVisible ? 'none' : 'block'
      header.querySelector('.arrow').textContent = isVisible ? '▼' : '▲'
    }

    item.appendChild(header)
    item.appendChild(content)
    div.appendChild(item)
  })

  return div
}

// Helper to create settings toggle row
function createSettingToggle(icon, label, description, isEnabledFn, toggleFn) {
  const row = document.createElement('div')
  row.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 8px;
  `

  const iconSpan = document.createElement('span')
  iconSpan.style.fontSize = '24px'
  iconSpan.textContent = icon

  const info = document.createElement('div')
  info.style.cssText = 'flex: 1;'
  info.innerHTML = `
    <div style="color: white; font-size: 13px; font-weight: 500;">${label}</div>
    <div style="color: rgba(255,255,255,0.5); font-size: 10px;">${description}</div>
  `

  const toggle = document.createElement('button')
  const updateToggle = () => {
    const enabled = isEnabledFn()
    toggle.textContent = enabled ? 'ON' : 'OFF'
    toggle.style.cssText = `
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      ${enabled
        ? 'background: linear-gradient(135deg, #10b981, #059669); color: white;'
        : 'background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.5);'
      }
    `
  }

  updateToggle()

  toggle.onclick = () => {
    toggleFn()
    updateToggle()
  }

  row.appendChild(iconSpan)
  row.appendChild(info)
  row.appendChild(toggle)

  return { element: row, updateState: updateToggle }
}

// Audio Learning Panel - Map room audio to room IDs
function createAudioLearningPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'

  // Header/Instructions
  const header = document.createElement('div')
  header.style.cssText = `
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 12px;
  `
  header.innerHTML = `
    <div style="color: #fbbf24; font-size: 13px; font-weight: 600; margin-bottom: 6px;">Audio Room Learning Mode</div>
    <div style="color: rgba(255,255,255,0.7); font-size: 11px; line-height: 1.5;">
      Visit each room in the game. When audio plays, it will be detected below.
      Select the room name and save to create a mapping.
    </div>
  `
  div.appendChild(header)

  // Current Audio Detection
  const audioSection = document.createElement('div')
  audioSection.style.cssText = `
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 12px;
  `

  const audioLabel = document.createElement('div')
  audioLabel.style.cssText = 'color: rgba(255,255,255,0.5); font-size: 10px; text-transform: uppercase; margin-bottom: 8px;'
  audioLabel.textContent = 'Detected Audio'
  audioSection.appendChild(audioLabel)

  // Folder name display (key identifier)
  const folderDisplay = document.createElement('div')
  folderDisplay.id = 'vmkpal-detected-folder'
  folderDisplay.style.cssText = `
    padding: 8px;
    background: rgba(74, 222, 128, 0.15);
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: 6px;
    color: #4ade80;
    font-family: monospace;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
  `
  const currentFolder = getAudioFolder(detectedAudioUrl)
  folderDisplay.textContent = currentFolder || 'Waiting for audio...'
  audioSection.appendChild(folderDisplay)

  // Full URL display (smaller, for reference)
  const audioDisplay = document.createElement('div')
  audioDisplay.id = 'vmkpal-detected-audio'
  audioDisplay.style.cssText = `
    padding: 6px;
    background: rgba(0,0,0,0.3);
    border-radius: 4px;
    color: rgba(255,255,255,0.5);
    font-family: monospace;
    font-size: 9px;
    word-break: break-all;
    max-height: 40px;
    overflow: hidden;
  `
  audioDisplay.textContent = detectedAudioUrl || 'No audio detected yet'
  audioSection.appendChild(audioDisplay)
  div.appendChild(audioSection)

  // Room Selector
  const roomSection = document.createElement('div')
  roomSection.style.cssText = `
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 12px;
  `

  const roomLabel = document.createElement('div')
  roomLabel.style.cssText = 'color: rgba(255,255,255,0.5); font-size: 10px; text-transform: uppercase; margin-bottom: 8px;'
  roomLabel.textContent = 'Select Room'
  roomSection.appendChild(roomLabel)

  const roomSelect = document.createElement('select')
  roomSelect.style.cssText = `
    width: 100%;
    padding: 8px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px;
    background: rgba(255,255,255,0.1);
    color: white;
    font-size: 12px;
    cursor: pointer;
  `
  roomSelect.innerHTML = '<option value="">-- Select a room --</option>'

  // Sort rooms alphabetically by name
  const sortedRooms = Object.entries(ROOM_MAP).sort((a, b) => a[1].localeCompare(b[1]))
  for (const [id, name] of sortedRooms) {
    const option = document.createElement('option')
    option.value = id
    option.textContent = `${name} (ID: ${id})`
    option.style.background = '#1e1b4b'
    roomSelect.appendChild(option)
  }
  roomSection.appendChild(roomSelect)
  div.appendChild(roomSection)

  // Save button
  const saveBtn = document.createElement('button')
  saveBtn.textContent = 'Save Audio-Room Mapping'
  saveBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 6px;
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 12px;
    transition: opacity 0.2s;
  `
  saveBtn.onmouseenter = () => saveBtn.style.opacity = '0.9'
  saveBtn.onmouseleave = () => saveBtn.style.opacity = '1'
  saveBtn.onclick = () => {
    const audioUrl = detectedAudioUrl
    const roomId = parseInt(roomSelect.value)

    if (!audioUrl) {
      showAudioStatus('No audio detected yet!', 'error')
      return
    }
    if (isNaN(roomId)) {
      showAudioStatus('Please select a room!', 'error')
      return
    }

    // Save the mapping
    audioRoomMappings[audioUrl] = roomId
    chrome.storage.local.set({ audioRoomMappings })

    const roomName = ROOM_MAP[roomId] || `Room ${roomId}`
    showAudioStatus(`Saved: ${roomName}`, 'success')
    updateMappingsList()
  }
  div.appendChild(saveBtn)

  // Status message
  const status = document.createElement('div')
  status.id = 'vmkpal-audio-status'
  status.style.cssText = `
    text-align: center;
    font-size: 11px;
    padding: 6px;
    margin-bottom: 12px;
  `
  div.appendChild(status)

  // Saved Mappings List
  const mappingsSection = document.createElement('div')
  mappingsSection.style.cssText = `
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 12px;
  `

  const mappingsHeader = document.createElement('div')
  mappingsHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  `
  mappingsHeader.innerHTML = `
    <span style="color: rgba(255,255,255,0.5); font-size: 10px; text-transform: uppercase;">Saved Mappings</span>
    <span id="vmkpal-mappings-count" style="color: #4ade80; font-size: 10px;">${Object.keys(audioRoomMappings).length} rooms</span>
  `
  mappingsSection.appendChild(mappingsHeader)

  const mappingsList = document.createElement('div')
  mappingsList.id = 'vmkpal-mappings-list'
  mappingsList.style.cssText = `
    max-height: 150px;
    overflow-y: auto;
  `
  mappingsSection.appendChild(mappingsList)
  div.appendChild(mappingsSection)

  // Export button
  const exportBtn = document.createElement('button')
  exportBtn.textContent = 'Export Mappings (Copy to Clipboard)'
  exportBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 6px;
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 8px;
    transition: opacity 0.2s;
  `
  exportBtn.onmouseenter = () => exportBtn.style.opacity = '0.9'
  exportBtn.onmouseleave = () => exportBtn.style.opacity = '1'
  exportBtn.onclick = () => {
    const exportData = JSON.stringify(audioRoomMappings, null, 2)
    navigator.clipboard.writeText(exportData).then(() => {
      showAudioStatus('Mappings copied to clipboard!', 'success')
    }).catch(() => {
      showAudioStatus('Failed to copy', 'error')
    })
  }
  div.appendChild(exportBtn)

  // Clear all button
  const clearBtn = document.createElement('button')
  clearBtn.textContent = 'Clear All Mappings'
  clearBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  `
  clearBtn.onmouseenter = () => clearBtn.style.background = 'rgba(239, 68, 68, 0.3)'
  clearBtn.onmouseleave = () => clearBtn.style.background = 'rgba(239, 68, 68, 0.2)'
  clearBtn.onclick = () => {
    if (confirm('Clear all audio-room mappings?')) {
      audioRoomMappings = {}
      chrome.storage.local.remove('audioRoomMappings')
      showAudioStatus('All mappings cleared', 'success')
      updateMappingsList()
    }
  }
  div.appendChild(clearBtn)

  // Helper functions
  function showAudioStatus(message, type) {
    const statusEl = document.getElementById('vmkpal-audio-status')
    if (statusEl) {
      statusEl.textContent = message
      statusEl.style.color = type === 'success' ? '#4ade80' : '#ef4444'
      setTimeout(() => {
        statusEl.textContent = ''
      }, 3000)
    }
  }

  function updateMappingsList() {
    const listEl = document.getElementById('vmkpal-mappings-list')
    const countEl = document.getElementById('vmkpal-mappings-count')
    if (!listEl) return

    const count = Object.keys(audioRoomMappings).length
    if (countEl) countEl.textContent = `${count} rooms`

    if (count === 0) {
      listEl.innerHTML = '<div style="color: rgba(255,255,255,0.4); font-size: 11px; text-align: center; padding: 8px;">No mappings yet</div>'
      return
    }

    listEl.innerHTML = ''
    for (const [url, roomId] of Object.entries(audioRoomMappings)) {
      const roomName = ROOM_MAP[roomId] || `Room ${roomId}`
      const item = document.createElement('div')
      item.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        background: rgba(0,0,0,0.2);
        border-radius: 4px;
        margin-bottom: 4px;
      `

      const info = document.createElement('div')
      info.style.cssText = 'flex: 1; min-width: 0;'
      info.innerHTML = `
        <div style="color: white; font-size: 11px; font-weight: 500;">${roomName}</div>
        <div style="color: rgba(255,255,255,0.4); font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${url.split('/').pop()}</div>
      `

      const deleteBtn = document.createElement('button')
      deleteBtn.textContent = '×'
      deleteBtn.style.cssText = `
        width: 20px;
        height: 20px;
        border: none;
        border-radius: 4px;
        background: rgba(239, 68, 68, 0.3);
        color: #ef4444;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        flex-shrink: 0;
        margin-left: 8px;
      `
      deleteBtn.onclick = () => {
        delete audioRoomMappings[url]
        chrome.storage.local.set({ audioRoomMappings })
        updateMappingsList()
      }

      item.appendChild(info)
      item.appendChild(deleteBtn)
      listEl.appendChild(item)
    }
  }

  // Initialize the list
  updateMappingsList()

  // Update audio display periodically
  const updateAudioDisplay = () => {
    const folderEl = document.getElementById('vmkpal-detected-folder')
    const displayEl = document.getElementById('vmkpal-detected-audio')
    if (detectedAudioUrl) {
      if (folderEl) {
        const folder = getAudioFolder(detectedAudioUrl)
        folderEl.textContent = folder || 'Unknown folder'
        folderEl.style.color = '#4ade80'
      }
      if (displayEl) {
        displayEl.textContent = detectedAudioUrl
      }
    }
  }
  setInterval(updateAudioDisplay, 2000) // Update every 2 seconds

  return div
}

// Apply icon size based on setting
function applyIconSize() {
  const menuBtn = document.querySelector('#vmkpal-toolbar button[title="MyVMK Genie Menu"]')
  if (!menuBtn) return

  const img = menuBtn.querySelector('img')
  if (!img) return

  const panel = document.getElementById('vmkpal-panel')
  const isMenuOpen = panel && panel.style.display !== 'none'
  const colors = getThemeColors()

  if (isSmallIconEnabled) {
    // Small icon - use questcover icons with open/closed states
    const iconUrl = isMenuOpen
      ? chrome.runtime.getURL('genie-questcover-clicked2.png')
      : chrome.runtime.getURL('genie-questcover-unclicked.png')
    img.src = iconUrl
    img.style.width = '28px'
    img.style.height = '28px'
    menuBtn.style.width = '32px'
    menuBtn.style.height = '32px'
    menuBtn.style.boxShadow = isPinkTheme
      ? '0 0 10px 3px rgba(219, 39, 119, 0.5), 0 0 20px 6px rgba(219, 39, 119, 0.3)'
      : '0 0 10px 3px rgba(139, 92, 246, 0.5), 0 0 20px 6px rgba(139, 92, 246, 0.3)'
  } else {
    // Large icon - use theme-appropriate genie icon
    img.src = colors.logo
    img.style.width = '50px'
    img.style.height = '50px'
    menuBtn.style.width = '50px'
    menuBtn.style.height = '50px'
    menuBtn.style.boxShadow = colors.glow
  }
}

// Update icon state when menu opens/closes
function updateIconState() {
  if (isSmallIconEnabled) {
    applyIconSize()
  }
}

// Get current theme colors
function getThemeColors() {
  if (isDarkTheme) {
    return {
      gradient: 'linear-gradient(135deg, #1a1a1a, #2d2d2d)',
      gradientRgba: 'linear-gradient(135deg, rgba(26, 26, 26, 0.98), rgba(45, 45, 45, 0.98))',
      glow: '0 0 15px 5px rgba(180, 0, 0, 0.5), 0 0 30px 10px rgba(180, 0, 0, 0.3)',
      bgImage: chrome.runtime.getURL('gene-background-jafar2.png'),
      logo: chrome.runtime.getURL('myvmk-genie-lamp-logo-jafar.png'),
      bgGradient: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)'
    }
  }
  if (isPinkTheme) {
    return {
      gradient: 'linear-gradient(135deg, #4b1437, #78284f)',
      gradientRgba: 'linear-gradient(135deg, rgba(75, 20, 55, 0.98), rgba(120, 40, 80, 0.98))',
      glow: '0 0 15px 5px rgba(219, 39, 119, 0.5), 0 0 30px 10px rgba(219, 39, 119, 0.3)',
      bgImage: chrome.runtime.getURL('genie-background-smoky-pink.png'),
      logo: chrome.runtime.getURL('myvmk-genie-lamp-logo-pink.png'),
      bgGradient: 'linear-gradient(135deg, #4b1437 0%, #78284f 50%, #4b1437 100%)'
    }
  }
  return {
    gradient: 'linear-gradient(135deg, #1e1b4b, #312e81)',
    gradientRgba: 'linear-gradient(135deg, rgba(30, 27, 75, 0.98), rgba(49, 46, 129, 0.98))',
    glow: '0 0 15px 5px rgba(139, 92, 246, 0.5), 0 0 30px 10px rgba(139, 92, 246, 0.3)',
    bgImage: chrome.runtime.getURL('genie-background.png'),
    logo: chrome.runtime.getURL('myvmk-genie.png'),
    bgGradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)'
  }
}

// Apply theme (blue or pink)
function applyTheme() {
  const colors = getThemeColors()
  const panel = document.getElementById('vmkpal-panel')
  const menuBtn = document.querySelector('#vmkpal-container button')
  const featureView = document.getElementById('vmkpal-feature-view')
  const panelHeader = document.getElementById('vmkpal-panel-header')
  const featureHeader = document.getElementById('vmkpal-feature-header')

  // Update panel background
  if (panel) {
    panel.style.background = colors.gradient
  }

  // Update feature view background
  if (featureView) {
    featureView.style.background = colors.gradient
  }

  // Update feature header (sticky header in sub-panels)
  if (featureHeader) {
    featureHeader.style.background = colors.gradientRgba
  }

  // Update panel header icon
  if (panelHeader) {
    const headerImg = panelHeader.querySelector('img')
    if (headerImg) {
      headerImg.src = colors.logo
    }
  }

  // Update floating icon via applyIconSize (handles both small and large modes)
  applyIconSize()

  // Update page background (if no custom color set)
  const existingStyle = document.getElementById('vmkpal-border-fill')
  if (existingStyle && !customBackgroundColor) {
    existingStyle.textContent = existingStyle.textContent.replace(
      /html, body \{[^}]+\}/,
      `html, body {
        background: url('${colors.bgImage}') center center / cover no-repeat fixed,
                    ${colors.bgGradient} !important;
      }`
    )
  }
}

// Apply background color based on setting
function applyBackgroundColor() {
  const existingStyle = document.getElementById('vmkpal-border-fill')
  if (!existingStyle) return

  if (customBackgroundColor) {
    existingStyle.textContent = existingStyle.textContent.replace(
      /html, body \{[^}]+\}/,
      `html, body {
        background: linear-gradient(135deg, ${customBackgroundColor} 0%, ${adjustColor(customBackgroundColor, 20)} 50%, ${customBackgroundColor} 100%) !important;
      }`
    )
  } else {
    // Reset to default with image
    const bgImageUrl = chrome.runtime.getURL('genie-background.png')
    existingStyle.textContent = existingStyle.textContent.replace(
      /html, body \{[^}]+\}/,
      `html, body {
        background: url('${bgImageUrl}') center center / cover no-repeat fixed,
                    linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%) !important;
      }`
    )
  }
}

// Load settings on startup
function loadSettings() {
  chrome.storage.local.get(['isSmallIconEnabled', 'customBackgroundColor', 'isPinkTheme', 'isDarkTheme', 'unlockedThemes', 'isTestModeEnabled', 'isKingdomSyncEnabled'], (result) => {
    if (result.isSmallIconEnabled) {
      isSmallIconEnabled = result.isSmallIconEnabled
      setTimeout(applyIconSize, 100)
    }
    if (result.isPinkTheme) {
      isPinkTheme = result.isPinkTheme
      setTimeout(applyTheme, 100)
    }
    if (result.isDarkTheme) {
      isDarkTheme = result.isDarkTheme
      setTimeout(applyTheme, 100)
    }
    if (result.unlockedThemes) {
      unlockedThemes = result.unlockedThemes
    }
    if (result.customBackgroundColor) {
      customBackgroundColor = result.customBackgroundColor
      setTimeout(applyBackgroundColor, 100)
    }
    if (result.isTestModeEnabled) {
      isTestModeEnabled = result.isTestModeEnabled
    }
    if (result.isKingdomSyncEnabled) {
      isKingdomSyncEnabled = result.isKingdomSyncEnabled
    }
  })
}

// Create a small feature button for the grid
function createFeatureButton(icon, label, contentFn) {
  const btn = document.createElement('button')
  btn.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 12px 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
  `
  btn.innerHTML = `
    <span style="font-size: 20px;">${icon}</span>
    <span style="color: rgba(255,255,255,0.8); font-size: 10px; font-weight: 500;">${label}</span>
  `
  btn.onmouseover = () => {
    btn.style.background = 'rgba(255,255,255,0.1)'
    btn.style.borderColor = 'rgba(255,255,255,0.2)'
    btn.style.transform = 'scale(1.05)'
  }
  btn.onmouseout = () => {
    btn.style.background = 'rgba(255,255,255,0.05)'
    btn.style.borderColor = 'rgba(255,255,255,0.1)'
    btn.style.transform = 'scale(1)'
  }
  btn.onclick = () => {
    // Open a modal/panel with the content
    openFeaturePanel(icon, label, contentFn)
    // Blur to prevent spacebar from re-triggering
    btn.blur()
  }
  return btn
}

// Create a button that triggers a direct action (not a panel)
function createActionButton(icon, label, actionFn) {
  const btn = document.createElement('button')
  btn.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 12px 8px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
  `
  btn.innerHTML = `
    <span style="font-size: 20px;">${icon}</span>
    <span style="color: rgba(255,255,255,0.8); font-size: 10px; font-weight: 500;">${label}</span>
  `
  btn.onmouseover = () => {
    btn.style.background = 'rgba(255,255,255,0.1)'
    btn.style.borderColor = 'rgba(255,255,255,0.2)'
    btn.style.transform = 'scale(1.05)'
  }
  btn.onmouseout = () => {
    btn.style.background = 'rgba(255,255,255,0.05)'
    btn.style.borderColor = 'rgba(255,255,255,0.1)'
    btn.style.transform = 'scale(1)'
  }
  btn.onclick = () => {
    actionFn()
    btn.blur()
  }
  return btn
}

// Open a feature panel inline within the main panel
function openFeaturePanel(icon, title, contentFn) {
  const mainContent = document.getElementById('vmkpal-main-content')
  const featureView = document.getElementById('vmkpal-feature-view')

  if (!mainContent || !featureView) return

  // Hide main content, show feature view
  mainContent.style.display = 'none'
  featureView.style.display = 'block'

  // Clear and populate feature view
  featureView.innerHTML = ''

  // Header with back button (sticky at top)
  const colors = getThemeColors()
  const header = document.createElement('div')
  header.id = 'vmkpal-feature-header'
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 12px 0;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    position: sticky;
    top: 0;
    background: ${colors.gradientRgba};
    z-index: 10;
    margin-top: -12px;
    margin-left: -12px;
    margin-right: -12px;
    padding-left: 12px;
    padding-right: 12px;
  `

  const backBtn = document.createElement('button')
  backBtn.innerHTML = '←'
  backBtn.style.cssText = `
    background: rgba(255,255,255,0.1);
    border: none;
    color: white;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  `
  backBtn.onclick = () => {
    mainContent.style.display = 'block'
    featureView.style.display = 'none'
  }

  const titleDiv = document.createElement('div')
  titleDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; flex: 1;'
  titleDiv.innerHTML = `
    <span style="font-size: 20px;">${icon}</span>
    <span style="color: white; font-weight: 600; font-size: 16px;">${title}</span>
  `

  header.appendChild(backBtn)
  header.appendChild(titleDiv)

  const content = contentFn()

  featureView.appendChild(header)
  featureView.appendChild(content)
}

// Create a feature section (legacy - kept for compatibility)
function createFeatureSection(icon, title, subtitle, contentFn) {
  const section = document.createElement('div')
  section.style.cssText = `
    margin-bottom: 8px;
    background: rgba(255,255,255,0.05);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.05);
  `

  const header = document.createElement('div')
  header.style.cssText = `
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: background 0.2s;
  `
  header.onmouseover = () => header.style.background = 'rgba(255,255,255,0.05)'
  header.onmouseout = () => header.style.background = 'transparent'

  header.innerHTML = `
    <span style="font-size: 20px;">${icon}</span>
    <div style="flex: 1;">
      <div style="color: white; font-weight: 500; font-size: 14px;">${title}</div>
      <div style="color: rgba(255,255,255,0.5); font-size: 11px;">${subtitle}</div>
    </div>
    <span style="color: rgba(255,255,255,0.4); font-size: 12px;">▼</span>
  `

  const content = document.createElement('div')
  content.style.cssText = `
    display: none;
    padding: 0 12px 12px 12px;
    border-top: 1px solid rgba(255,255,255,0.05);
  `

  header.onclick = () => {
    const isOpen = content.style.display !== 'none'
    content.style.display = isOpen ? 'none' : 'block'
    header.querySelector('span:last-child').textContent = isOpen ? '▼' : '▲'
    if (!isOpen && contentFn) {
      content.innerHTML = ''
      content.appendChild(contentFn())
    }
  }

  section.appendChild(header)
  section.appendChild(content)
  return section
}

// Room Selector Panel - Manual room selection
function createRoomSelectorPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'

  // Search/filter input
  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = 'Search rooms...'
  searchInput.style.cssText = `
    width: 100%;
    padding: 10px;
    margin-bottom: 8px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.05);
    color: white;
    font-size: 13px;
    outline: none;
  `

  // Room select dropdown
  const select = document.createElement('select')
  select.id = 'vmkpal-room-select'
  select.style.cssText = `
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(30,27,75,0.9);
    color: white;
    font-size: 13px;
    cursor: pointer;
    outline: none;
  `

  // Add default option
  const defaultOpt = document.createElement('option')
  defaultOpt.value = ''
  defaultOpt.textContent = '-- Select a room --'
  select.appendChild(defaultOpt)

  // Get rooms sorted by name (uses ROOM_MAP from rooms.js)
  const rooms = getAllRoomsSorted()
  rooms.forEach(room => {
    const opt = document.createElement('option')
    opt.value = room.id
    opt.textContent = room.name
    if (currentRoom === room.name) {
      opt.selected = true
    }
    select.appendChild(opt)
  })

  // Handle room selection
  select.onchange = () => {
    const selectedId = select.value
    if (selectedId) {
      const roomName = getRoomName(parseInt(selectedId))
      const oldRoom = currentRoom
      currentRoom = roomName
      currentRoomId = parseInt(selectedId)

      // Update display
      updateRoomDisplay()

      // Save to storage
      chrome.storage.local.set({
        currentRoom: roomName,
        currentRoomId: parseInt(selectedId)
      })

      // Trigger room change handler
      onRoomChange(oldRoom, currentRoom)

      showNotification(`Room set: ${roomName}`, 'success')
    }
  }

  // Filter rooms on search
  searchInput.oninput = () => {
    const filter = searchInput.value.toLowerCase()
    Array.from(select.options).forEach((opt, i) => {
      if (i === 0) return // Skip default option
      const match = opt.textContent.toLowerCase().includes(filter)
      opt.style.display = match ? '' : 'none'
    })
  }

  // Load saved room from storage
  chrome.storage.local.get(['currentRoom', 'currentRoomId'], (result) => {
    if (result.currentRoomId) {
      select.value = result.currentRoomId
      currentRoom = result.currentRoom
      currentRoomId = result.currentRoomId
      updateRoomDisplay()
    }
  })

  div.appendChild(searchInput)
  div.appendChild(select)

  // Info text
  const info = document.createElement('p')
  info.style.cssText = 'color: rgba(255,255,255,0.4); font-size: 10px; margin-top: 8px;'
  info.textContent = 'Select your current room to enable room-specific audio'
  div.appendChild(info)

  return div
}

// Queue Alerts Panel
function createQueueAlertsPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'

  // Current queue status
  const statusDiv = document.createElement('div')
  statusDiv.style.cssText = `
    padding: 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 12px;
    text-align: center;
  `
  statusDiv.innerHTML = `
    <div style="color: rgba(255,255,255,0.5); font-size: 11px; margin-bottom: 4px;">Current Position</div>
    <div id="vmkpal-queue-display" style="color: #fbbf24; font-size: 24px; font-weight: 600;">${lastQueuePosition ? '#' + lastQueuePosition : '--'}</div>
    <div style="color: rgba(255,255,255,0.4); font-size: 10px; margin-top: 4px;">Auto-detected from game</div>
  `
  div.appendChild(statusDiv)

  // Alert threshold setting
  const thresholdDiv = document.createElement('div')
  thresholdDiv.style.cssText = 'margin-bottom: 12px;'
  thresholdDiv.innerHTML = `
    <label style="color: rgba(255,255,255,0.6); font-size: 11px; display: block; margin-bottom: 6px;">
      Alert when position reaches:
    </label>
  `

  const thresholdInput = document.createElement('input')
  thresholdInput.type = 'number'
  thresholdInput.min = '1'
  thresholdInput.max = '50'
  thresholdInput.id = 'vmkpal-queue-threshold'
  thresholdInput.style.cssText = `
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.05);
    color: white;
    font-size: 14px;
    text-align: center;
  `

  // Load saved threshold
  chrome.storage.local.get(['queueAlertThreshold'], (result) => {
    thresholdInput.value = result.queueAlertThreshold || 5
  })

  thresholdInput.onchange = () => {
    const value = parseInt(thresholdInput.value) || 5
    chrome.storage.local.set({ queueAlertThreshold: value })
    showNotification(`Queue alert set for position ${value}`, 'success')
  }

  thresholdDiv.appendChild(thresholdInput)
  div.appendChild(thresholdDiv)

  // Enable/disable toggle
  const toggleDiv = document.createElement('div')
  toggleDiv.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    margin-bottom: 12px;
  `

  const toggleLabel = document.createElement('span')
  toggleLabel.textContent = 'Sound & Visual Alerts'
  toggleLabel.style.cssText = 'color: white; font-size: 13px;'

  const toggleBtn = document.createElement('button')
  toggleBtn.style.cssText = `
    padding: 6px 16px;
    border-radius: 20px;
    border: none;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `

  function updateToggle(enabled) {
    if (enabled) {
      toggleBtn.textContent = 'ON'
      toggleBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)'
      toggleBtn.style.color = 'white'
    } else {
      toggleBtn.textContent = 'OFF'
      toggleBtn.style.background = 'rgba(255,255,255,0.1)'
      toggleBtn.style.color = 'rgba(255,255,255,0.5)'
    }
  }

  chrome.storage.local.get(['queueAlertsEnabled'], (result) => {
    updateToggle(result.queueAlertsEnabled !== false)
  })

  toggleBtn.onclick = () => {
    chrome.storage.local.get(['queueAlertsEnabled'], (result) => {
      const newValue = result.queueAlertsEnabled === false
      chrome.storage.local.set({ queueAlertsEnabled: newValue })
      updateToggle(newValue)
      showNotification(newValue ? 'Queue alerts enabled' : 'Queue alerts disabled', 'info')
    })
  }

  toggleDiv.appendChild(toggleLabel)
  toggleDiv.appendChild(toggleBtn)
  div.appendChild(toggleDiv)

  // OCR Scanning section
  const ocrSection = document.createElement('div')
  ocrSection.style.cssText = `
    padding: 12px;
    background: rgba(139, 92, 246, 0.1);
    border-radius: 8px;
    margin-bottom: 12px;
    border: 1px solid rgba(139, 92, 246, 0.2);
  `

  const ocrTitle = document.createElement('div')
  ocrTitle.style.cssText = 'color: #c4b5fd; font-size: 12px; font-weight: 500; margin-bottom: 8px;'
  ocrTitle.textContent = '🔍 Auto Queue Scanner'
  ocrSection.appendChild(ocrTitle)

  const ocrBtnRow = document.createElement('div')
  ocrBtnRow.style.cssText = 'display: flex; gap: 8px;'

  // Single scan button
  const scanBtn = document.createElement('button')
  scanBtn.textContent = '📷 Scan Now'
  scanBtn.style.cssText = `
    flex: 1;
    padding: 10px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    color: white;
    font-weight: 500;
    cursor: pointer;
    font-size: 12px;
  `
  scanBtn.onclick = async () => {
    scanBtn.textContent = '⏳ Scanning...'
    scanBtn.disabled = true
    const result = await scanForQueue()
    scanBtn.textContent = '📷 Scan Now'
    scanBtn.disabled = false
    if (result === null) {
      showNotification('No queue found - is VMK Pass popup visible?', 'info')
    }
  }
  ocrBtnRow.appendChild(scanBtn)

  // Auto-scan toggle
  const autoBtn = document.createElement('button')
  autoBtn.id = 'vmkpal-autoscan-btn'

  function updateAutoBtn() {
    if (ocrScanInterval) {
      autoBtn.textContent = '⏹️ Stop'
      autoBtn.style.cssText = `
        flex: 1;
        padding: 10px;
        border-radius: 8px;
        border: none;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
        font-weight: 500;
        cursor: pointer;
        font-size: 12px;
      `
    } else {
      autoBtn.textContent = '▶️ Auto'
      autoBtn.style.cssText = `
        flex: 1;
        padding: 10px;
        border-radius: 8px;
        border: none;
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.7);
        font-weight: 500;
        cursor: pointer;
        font-size: 12px;
      `
    }
  }
  updateAutoBtn()

  autoBtn.onclick = () => {
    if (ocrScanInterval) {
      stopAutoScan()
      showNotification('Auto-scan stopped', 'info')
    } else {
      startAutoScan(5000)
    }
    updateAutoBtn()
  }
  ocrBtnRow.appendChild(autoBtn)

  ocrSection.appendChild(ocrBtnRow)

  const ocrInfo = document.createElement('p')
  ocrInfo.style.cssText = 'color: rgba(255,255,255,0.4); font-size: 10px; margin-top: 8px; margin-bottom: 0;'
  ocrInfo.textContent = 'Reads queue number from screen using OCR. Keep VMK Pass visible.'
  ocrSection.appendChild(ocrInfo)

  div.appendChild(ocrSection)

  // Test alert button
  const testBtn = document.createElement('button')
  testBtn.textContent = '🔔 Test Alert Sound'
  testBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: white;
    font-weight: 500;
    cursor: pointer;
    font-size: 13px;
    margin-bottom: 12px;
  `
  testBtn.onclick = () => {
    showQueueAlert(3)
  }
  div.appendChild(testBtn)

  // Info text
  const info = document.createElement('p')
  info.style.cssText = 'color: rgba(255,255,255,0.4); font-size: 10px; margin-top: 0; line-height: 1.4;'
  info.textContent = 'When your queue position reaches the threshold, you\'ll hear beeps and see a notification.'
  div.appendChild(info)

  return div
}

// Game Accounts Panel
function createAccountsPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'

  chrome.storage.local.get(['gameAccounts'], (result) => {
    const accounts = result.gameAccounts || []

    if (accounts.length === 0) {
      div.innerHTML = `
        <p style="color: rgba(255,255,255,0.6); font-size: 12px; margin-bottom: 12px;">No accounts saved yet.</p>
      `
    } else {
      accounts.forEach((acc, i) => {
        const row = document.createElement('div')
        row.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          margin-bottom: 8px;
        `
        row.innerHTML = `
          <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #06b6d4, #0891b2); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
            ${acc.nickname?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div style="flex: 1;">
            <div style="color: white; font-size: 13px;">${acc.nickname || 'Account'}</div>
            <div style="color: rgba(255,255,255,0.5); font-size: 11px;">${acc.username}</div>
          </div>
        `
        const copyBtn = document.createElement('button')
        copyBtn.textContent = '📋'
        copyBtn.title = 'Copy password'
        copyBtn.style.cssText = `
          background: rgba(255,255,255,0.1);
          border: none;
          border-radius: 6px;
          padding: 6px 10px;
          color: white;
          cursor: pointer;
          font-size: 14px;
        `
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(acc.password || '')
          showNotification('Password copied!', 'success')
        }
        row.appendChild(copyBtn)
        div.appendChild(row)
      })
    }

    // Add account form
    const addForm = document.createElement('div')
    addForm.innerHTML = `
      <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; margin-top: 8px;">
        <input type="text" id="vmkpal-acc-nick" placeholder="Nickname" style="width: 100%; padding: 8px; margin-bottom: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white; font-size: 12px;">
        <input type="text" id="vmkpal-acc-user" placeholder="Username" style="width: 100%; padding: 8px; margin-bottom: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white; font-size: 12px;">
        <input type="password" id="vmkpal-acc-pass" placeholder="Password" style="width: 100%; padding: 8px; margin-bottom: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: white; font-size: 12px;">
        <button id="vmkpal-acc-add" style="width: 100%; padding: 8px; border-radius: 6px; border: none; background: linear-gradient(135deg, #06b6d4, #0891b2); color: white; font-weight: 500; cursor: pointer; font-size: 12px;">Add Account</button>
      </div>
    `
    div.appendChild(addForm)

    setTimeout(() => {
      document.getElementById('vmkpal-acc-add')?.addEventListener('click', () => {
        const nick = document.getElementById('vmkpal-acc-nick').value.trim()
        const user = document.getElementById('vmkpal-acc-user').value.trim()
        const pass = document.getElementById('vmkpal-acc-pass').value
        if (nick && user && pass) {
          accounts.push({ nickname: nick, username: user, password: pass })
          chrome.storage.local.set({ gameAccounts: accounts })
          showNotification('Account saved!', 'success')
          // Refresh panel
          div.innerHTML = ''
          div.appendChild(createAccountsPanel())
        }
      })
    }, 0)
  })

  return div
}

// Quick Phrases Panel
function createPhrasesPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'

  // Store references to input fields for saving
  const inputFields = []

  // Save button at top
  const saveBtn = document.createElement('button')
  saveBtn.textContent = '💾 Save Phrases'
  saveBtn.style.cssText = `
    width: 100%;
    margin-bottom: 10px;
    padding: 6px 10px;
    border-radius: 4px;
    border: none;
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    color: white;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
  `
  saveBtn.addEventListener('click', () => {
    const newPhrases = {}
    inputFields.forEach((input) => {
      const slot = parseInt(input.dataset.slot)
      const value = input.value.trim()
      if (value) {
        newPhrases[slot] = value
      }
    })

    // Save to storage
    chrome.storage.local.set({ phrases: newPhrases }, () => {
      // Update local cache
      phrasesCache = newPhrases
      showNotification('Phrases saved!', 'success')
    })
  })
  div.appendChild(saveBtn)

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
  keys.forEach((key, i) => {
    const slot = i + 1
    const phrase = phrasesCache[slot] || ''

    const row = document.createElement('div')
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    `

    // Key badge
    const keyBadge = document.createElement('span')
    keyBadge.textContent = key
    keyBadge.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 4px;
      background: rgba(139,92,246,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #c4b5fd;
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
    `
    row.appendChild(keyBadge)

    // Editable input field
    const input = document.createElement('input')
    input.type = 'text'
    input.value = phrase
    input.placeholder = `${modifierKey}+${key} phrase...`
    input.dataset.slot = slot
    input.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.08);
      color: white;
      font-size: 12px;
      outline: none;
      min-width: 0;
    `

    // Focus/blur styles
    input.addEventListener('focus', () => {
      input.style.borderColor = '#8b5cf6'
      input.style.background = 'rgba(255,255,255,0.12)'
    })
    input.addEventListener('blur', () => {
      input.style.borderColor = 'rgba(255,255,255,0.15)'
      input.style.background = 'rgba(255,255,255,0.08)'
    })

    // Prevent event propagation to fix input issues (same as audio panel)
    input.addEventListener('mousedown', (e) => e.stopPropagation())
    input.addEventListener('click', (e) => e.stopPropagation())
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      // Allow Ctrl+V paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        return true
      }
    }, true)
    input.addEventListener('keyup', (e) => e.stopPropagation())
    input.addEventListener('keypress', (e) => e.stopPropagation())
    input.addEventListener('paste', (e) => e.stopPropagation())
    input.addEventListener('copy', (e) => e.stopPropagation())
    input.addEventListener('cut', (e) => e.stopPropagation())

    row.appendChild(input)
    div.appendChild(row)
    inputFields.push(input)
  })

  // Help text
  const helpText = document.createElement('p')
  helpText.textContent = `Press ${modifierKey}+1 through ${modifierKey}+0 to send these phrases in chat`
  helpText.style.cssText = 'color: rgba(255,255,255,0.4); font-size: 10px; margin-top: 8px; text-align: center;'
  div.appendChild(helpText)

  return div
}

// Room Audio Panel
function createAudioPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'

  // Create label
  const label = document.createElement('label')
  label.textContent = 'YouTube video, playlist, or audio URL'
  label.style.cssText = 'color: rgba(255,255,255,0.6); font-size: 11px; display: block; margin-bottom: 6px;'
  div.appendChild(label)

  // Create input field programmatically
  const urlInput = document.createElement('input')
  urlInput.type = 'text'
  urlInput.placeholder = 'YouTube video, playlist, or audio URL...'
  urlInput.style.cssText = `
    width: 100%;
    padding: 10px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.1);
    color: white;
    font-size: 12px;
    margin-bottom: 8px;
    box-sizing: border-box;
    outline: none;
  `

  // Load saved URL
  chrome.storage.local.get(['currentAudioUrl'], (result) => {
    if (result.currentAudioUrl) {
      urlInput.value = result.currentAudioUrl
    }
  })

  // Focus/blur styles
  urlInput.addEventListener('focus', () => {
    urlInput.style.borderColor = '#8b5cf6'
    urlInput.style.background = 'rgba(255,255,255,0.15)'
  })
  urlInput.addEventListener('blur', () => {
    urlInput.style.borderColor = 'rgba(255,255,255,0.2)'
    urlInput.style.background = 'rgba(255,255,255,0.1)'
  })

  // Prevent event propagation to fix input issues (but allow context menu for right-click paste)
  urlInput.addEventListener('mousedown', (e) => e.stopPropagation())
  urlInput.addEventListener('click', (e) => e.stopPropagation())
  urlInput.addEventListener('contextmenu', (e) => e.stopPropagation()) // Allow right-click menu
  urlInput.addEventListener('keydown', (e) => {
    e.stopPropagation()
    // Ensure Ctrl+V works by not preventing default
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      // Allow paste to happen
      return true
    }
  }, true)
  urlInput.addEventListener('keyup', (e) => e.stopPropagation())
  urlInput.addEventListener('keypress', (e) => e.stopPropagation())
  urlInput.addEventListener('paste', (e) => e.stopPropagation())
  urlInput.addEventListener('copy', (e) => e.stopPropagation())
  urlInput.addEventListener('cut', (e) => e.stopPropagation())

  div.appendChild(urlInput)

  // Button container
  const btnContainer = document.createElement('div')
  btnContainer.style.cssText = 'display: flex; gap: 8px;'

  // Play button
  const playBtn = document.createElement('button')
  playBtn.textContent = '▶ Play'
  playBtn.style.cssText = 'flex: 1; padding: 10px; border-radius: 6px; border: none; background: linear-gradient(135deg, #10b981, #059669); color: white; cursor: pointer; font-weight: 500;'
  playBtn.addEventListener('click', () => {
    const url = urlInput.value.trim()
    if (url) {
      playAudio(url)
      chrome.storage.local.set({ currentAudioUrl: url })
    } else {
      showNotification('Enter a URL first', 'error')
    }
  })

  // Stop button
  const stopBtn = document.createElement('button')
  stopBtn.textContent = '⏹ Stop'
  stopBtn.style.cssText = 'flex: 1; padding: 10px; border-radius: 6px; border: none; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; cursor: pointer; font-weight: 500;'
  stopBtn.addEventListener('click', () => {
    stopAudio()
  })

  btnContainer.appendChild(playBtn)
  btnContainer.appendChild(stopBtn)
  div.appendChild(btnContainer)

  // Status indicator (shows if audio is playing)
  const statusDiv = document.createElement('div')
  statusDiv.style.cssText = 'margin-top: 12px; font-size: 11px;'
  if (youtubeIframe || audioPlayer) {
    statusDiv.innerHTML = `<span style="color: #10b981;">▶ Audio is playing</span>`
  }
  div.appendChild(statusDiv)

  // Help text
  const helpText = document.createElement('p')
  helpText.textContent = 'Supports: YouTube videos, playlists, and audio URLs'
  helpText.style.cssText = 'color: rgba(255,255,255,0.4); font-size: 10px; margin-top: 8px;'
  div.appendChild(helpText)

  return div
}

// Helper to escape HTML
function escapeHtml(str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Extract YouTube video ID from various URL formats
function getYouTubeVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// Extract YouTube playlist ID from URL
function getYouTubePlaylistId(url) {
  const patterns = [
    /[?&]list=([^&\n?#]+)/,
    /youtube\.com\/playlist\?list=([^&\n?#]+)/
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// Extract YouTube start time from URL (returns seconds or null)
function getYouTubeStartTime(url) {
  // Match t= or start= parameter (in seconds)
  const match = url.match(/[?&](?:t|start)=(\d+)/)
  if (match) return parseInt(match[1])
  return null
}

// Check if URL is a WatchParty.me room
function getWatchPartyUrl(url) {
  // Match watchparty.me room URLs like https://www.watchparty.me/watch/ROOMNAME
  // Returns the full URL if it's a valid WatchParty room, null otherwise
  const match = url.match(/watchparty\.me\/(watch\/[a-zA-Z0-9_-]+|[a-zA-Z0-9_-]+)/)
  if (match && match[1] && !['create', 'login', 'about', 'faq'].includes(match[1])) {
    // Return the full WatchParty URL
    return url.match(/https?:\/\/(?:www\.)?watchparty\.me\/[^\s]+/)?.[0] || null
  }
  return null
}

// Check if URL is a direct audio file
function isDirectAudioUrl(url) {
  return /\.(mp3|ogg|wav|m4a|aac|flac|webm)(\?|$)/i.test(url)
}

// Audio player
let audioPlayer = null
let youtubeIframe = null
let watchPartyWindow = null // Track WatchParty popup window
let watchPartyCurrentUrl = null // Store WatchParty URL for reopening
let watchPartyWatcher = null // Interval to detect popup close
let mutedElements = [] // Track elements we've muted
let persistentPlayerContainer = null // Persistent container for YouTube player
let isPlayerMinimized = false
let playerSize = { width: 400, height: 225 } // Default size

// Create persistent player container (lives outside the panel)
function ensurePersistentPlayerContainer() {
  if (!persistentPlayerContainer) {
    persistentPlayerContainer = document.createElement('div')
    persistentPlayerContainer.id = 'vmkpal-persistent-player'
    persistentPlayerContainer.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 340px;
      width: ${playerSize.width}px;
      z-index: 2147483645;
      pointer-events: auto;
    `
    document.body.appendChild(persistentPlayerContainer)

    // Load saved size
    chrome.storage.local.get(['playerSize'], (result) => {
      if (result.playerSize) {
        playerSize = result.playerSize
        persistentPlayerContainer.style.width = playerSize.width + 'px'
        const iframe = persistentPlayerContainer.querySelector('iframe')
        if (iframe) {
          iframe.style.height = playerSize.height + 'px'
        }
      }
    })

    // Load saved position
    chrome.storage.local.get(['playerPosition'], (result) => {
      if (result.playerPosition) {
        const pos = result.playerPosition
        persistentPlayerContainer.style.right = 'auto'
        persistentPlayerContainer.style.bottom = 'auto'
        persistentPlayerContainer.style.left = pos.x + 'px'
        persistentPlayerContainer.style.top = pos.y + 'px'
      }
    })

    // Make it draggable and resizable
    let isDragging = false
    let isResizing = false
    let dragOffset = { x: 0, y: 0 }
    let resizeStart = { x: 0, y: 0, width: 0, height: 0 }

    persistentPlayerContainer.addEventListener('mousedown', (e) => {
      // Don't drag if clicking on buttons, iframe, or resize handle
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'IFRAME' || e.target.id === 'vmkpal-resize-handle') {
        return
      }
      // Only drag from header area
      const header = persistentPlayerContainer.querySelector('#vmkpal-player-header')
      if (header && header.contains(e.target)) {
        isDragging = true
        const rect = persistentPlayerContainer.getBoundingClientRect()
        dragOffset.x = e.clientX - rect.left
        dragOffset.y = e.clientY - rect.top
        e.preventDefault()
      }
    })

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const x = e.clientX - dragOffset.x
        const y = e.clientY - dragOffset.y

        // Keep within viewport
        const maxX = window.innerWidth - persistentPlayerContainer.offsetWidth
        const maxY = window.innerHeight - persistentPlayerContainer.offsetHeight

        persistentPlayerContainer.style.left = Math.max(0, Math.min(x, maxX)) + 'px'
        persistentPlayerContainer.style.top = Math.max(0, Math.min(y, maxY)) + 'px'
        persistentPlayerContainer.style.right = 'auto'
        persistentPlayerContainer.style.bottom = 'auto'
      }

      if (isResizing) {
        const deltaX = e.clientX - resizeStart.x
        const deltaY = e.clientY - resizeStart.y

        const newWidth = Math.max(280, Math.min(800, resizeStart.width + deltaX))
        const newHeight = Math.max(158, Math.min(450, resizeStart.height + deltaY)) // 16:9 aspect min

        persistentPlayerContainer.style.width = newWidth + 'px'
        const iframe = persistentPlayerContainer.querySelector('iframe')
        if (iframe) {
          iframe.style.height = newHeight + 'px'
        }

        playerSize = { width: newWidth, height: newHeight }
      }
    })

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false

        // Save position
        const rect = persistentPlayerContainer.getBoundingClientRect()
        chrome.storage.local.set({
          playerPosition: { x: rect.left, y: rect.top }
        })
      }

      if (isResizing) {
        isResizing = false
        document.body.style.cursor = ''

        // Save size
        chrome.storage.local.set({ playerSize })
      }
    })

    // Set up resize handle listener (delegated since handle is created later)
    document.addEventListener('mousedown', (e) => {
      if (e.target.id === 'vmkpal-resize-handle') {
        isResizing = true
        document.body.style.cursor = 'se-resize'
        const iframe = persistentPlayerContainer.querySelector('iframe')
        resizeStart = {
          x: e.clientX,
          y: e.clientY,
          width: persistentPlayerContainer.offsetWidth,
          height: iframe ? iframe.offsetHeight : playerSize.height
        }
        e.preventDefault()
      }
    })
  }
  return persistentPlayerContainer
}

// Mute all game audio (audio/video elements and Web Audio API)
function muteGameAudio() {
  mutedElements = []

  // Mute all audio and video elements (except our own)
  document.querySelectorAll('audio, video').forEach(el => {
    if (el !== audioPlayer && !el.closest('#vmkpal-toolbar')) {
      if (!el.muted) {
        mutedElements.push({ element: el, wasMuted: el.muted, volume: el.volume })
        el.muted = true
      }
    }
  })

  // Mute all tracked audio via our interceptor (runs in page context)
  muteAllAudioContexts()

  console.log('MyVMK Genie: Muted game audio (DOM elements:', mutedElements.length, ')')
}

// Restore game audio
function unmuteGameAudio() {
  // Restore muted HTML elements
  mutedElements.forEach(item => {
    if (item.element) {
      item.element.muted = item.wasMuted
      if (item.volume !== undefined) {
        item.element.volume = item.volume
      }
    }
  })
  mutedElements = []

  // Unmute all tracked AudioContexts via our interceptor
  unmuteAllAudioContexts()

  console.log('MyVMK Genie: Restored game audio')
}

function playAudio(url, startMinimized = false, seekToSeconds = 0) {
  stopAudio(false) // Don't unmute yet, we're about to play new audio

  // Mute game audio
  muteGameAudio()

  const videoId = getYouTubeVideoId(url)
  const playlistId = getYouTubePlaylistId(url)
  const startTime = getYouTubeStartTime(url)
  const watchPartyUrl = getWatchPartyUrl(url)
  const isAudioFile = isDirectAudioUrl(url)

  if (videoId || playlistId) {
    // YouTube - embed as iframe in PERSISTENT container (survives panel navigation)
    const container = ensurePersistentPlayerContainer()
    isPlayerMinimized = startMinimized

    // Build the embed URL
    let embedUrl = 'https://www.youtube.com/embed/'
    if (playlistId && !videoId) {
      // Playlist only (no specific video) - use videoseries
      embedUrl += `videoseries?list=${playlistId}&autoplay=1`
    } else if (videoId && playlistId) {
      // Video within a playlist
      embedUrl += `${videoId}?autoplay=1&list=${playlistId}`
    } else {
      // Single video - loop it
      embedUrl += `${videoId}?autoplay=1&loop=1&playlist=${videoId}`
    }

    // Add start time - either from URL or from seek offset (for late joiners)
    const effectiveStartTime = seekToSeconds > 0 ? Math.floor(seekToSeconds) : startTime
    if (effectiveStartTime) {
      embedUrl += `&start=${effectiveStartTime}`
    }

    const isPlaylist = !!playlistId
    const playerLabel = isPlaylist ? '🎵 Playlist' : '▶ Video'

    // Apply saved size (or minimized width)
    container.style.width = startMinimized ? '200px' : playerSize.width + 'px'

    container.innerHTML = `
      <div id="vmkpal-player-wrapper" style="background: linear-gradient(135deg, #1e1b4b, #312e81); border-radius: 12px; padding: 10px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 32px rgba(0,0,0,0.4); position: relative;">
        <div id="vmkpal-player-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: ${startMinimized ? '0' : '8px'}; padding: 4px 2px; cursor: move;">
          <span style="color: #10b981; font-size: 12px; font-weight: 500;">${playerLabel}</span>
          <span style="color: rgba(255,255,255,0.4); font-size: 10px; margin-left: 4px;">⋮⋮ drag</span>
          <div style="margin-left: auto; display: flex; gap: 6px;">
            <button id="vmkpal-player-minimize" style="background: #6366f1; border: none; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 500;" title="${startMinimized ? 'Expand' : 'Minimize'}">${startMinimized ? '□' : '─'}</button>
            <button id="vmkpal-persistent-stop" style="background: #ef4444; border: none; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 500;" title="Stop & Close">✕</button>
          </div>
        </div>
        <div id="vmkpal-player-content" style="display: ${startMinimized ? 'none' : 'block'};">
          <iframe
            id="vmkpal-youtube-player"
            width="100%"
            height="${playerSize.height}"
            src="${embedUrl}"
            frameborder="0"
            allow="autoplay; encrypted-media; fullscreen"
            allowfullscreen
            style="border-radius: 8px; display: block;"
          ></iframe>
        </div>
        <div id="vmkpal-resize-handle" style="position: absolute; bottom: 4px; right: 4px; width: 16px; height: 16px; cursor: se-resize; opacity: 0.5; display: ${startMinimized ? 'none' : 'block'};" title="Drag to resize">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="rgba(255,255,255,0.6)">
            <path d="M14 14H10V12H12V10H14V14ZM14 8H12V6H14V8ZM8 14H6V12H8V14Z"/>
          </svg>
        </div>
      </div>
    `
    youtubeIframe = container.querySelector('iframe')

    // Add stop button handler
    const stopBtn = container.querySelector('#vmkpal-persistent-stop')
    if (stopBtn) {
      stopBtn.addEventListener('click', () => stopAudio())
    }

    // Add minimize/expand handler
    const minimizeBtn = container.querySelector('#vmkpal-player-minimize')
    const playerContent = container.querySelector('#vmkpal-player-content')
    const resizeHandle = container.querySelector('#vmkpal-resize-handle')
    if (minimizeBtn && playerContent) {
      minimizeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        isPlayerMinimized = !isPlayerMinimized
        if (isPlayerMinimized) {
          playerContent.style.display = 'none'
          if (resizeHandle) resizeHandle.style.display = 'none'
          minimizeBtn.textContent = '□'
          minimizeBtn.title = 'Expand'
          container.style.width = '200px'
        } else {
          playerContent.style.display = 'block'
          if (resizeHandle) resizeHandle.style.display = 'block'
          minimizeBtn.textContent = '─'
          minimizeBtn.title = 'Minimize'
          container.style.width = playerSize.width + 'px'
        }
      })
    }

    showNotification(isPlaylist ? '🔇 Game muted • Playing playlist' : '🔇 Game muted • Playing YouTube', 'success')
  } else if (watchPartyUrl) {
    // WatchParty.me - open in popup window (doesn't support iframe embedding)
    const popupWidth = 900
    const popupHeight = 600
    const left = (screen.width - popupWidth) / 2
    const top = (screen.height - popupHeight) / 2

    // Store URL for reopening
    watchPartyCurrentUrl = watchPartyUrl

    // Open the popup
    watchPartyWindow = window.open(
      watchPartyUrl,
      'vmkpal-watchparty',
      `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`
    )

    // Show control panel
    const container = ensurePersistentPlayerContainer()
    updateWatchPartyControlPanel(container, true)

    // Start watcher to detect when popup is closed externally
    if (watchPartyWatcher) clearInterval(watchPartyWatcher)
    watchPartyWatcher = setInterval(() => {
      if (watchPartyWindow && watchPartyWindow.closed) {
        // Popup was closed externally - restore game audio and update UI
        watchPartyWindow = null
        unmuteGameAudio()
        showNotification('🔊 WatchParty closed • Game audio restored', 'info')
        // Update control panel to show "closed" state
        const container = document.getElementById('vmkpal-persistent-player')
        if (container) {
          updateWatchPartyControlPanel(container, false)
        }
        clearInterval(watchPartyWatcher)
        watchPartyWatcher = null
      }
    }, 500)

    showNotification('🔇 Game muted • WatchParty opened in popup', 'success')
  } else if (isAudioFile) {
    // Direct audio file - show visual player with controls
    const container = ensurePersistentPlayerContainer()
    isPlayerMinimized = startMinimized

    // Extract filename for display
    const filename = url.split('/').pop().split('?')[0] || 'Audio'

    container.style.width = startMinimized ? '200px' : '320px'

    container.innerHTML = `
      <div id="vmkpal-player-wrapper" style="background: linear-gradient(135deg, #1e1b4b, #312e81); border-radius: 12px; padding: 10px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 32px rgba(0,0,0,0.4); position: relative;">
        <div id="vmkpal-player-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: ${startMinimized ? '0' : '8px'}; padding: 4px 2px; cursor: move;">
          <span style="color: #ec4899; font-size: 12px; font-weight: 500;">🎵 Audio</span>
          <span style="color: rgba(255,255,255,0.4); font-size: 10px; margin-left: 4px;">⋮⋮ drag</span>
          <div style="margin-left: auto; display: flex; gap: 6px;">
            <button id="vmkpal-player-minimize" style="background: #6366f1; border: none; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 500;" title="${startMinimized ? 'Expand' : 'Minimize'}">${startMinimized ? '□' : '─'}</button>
            <button id="vmkpal-persistent-stop" style="background: #ef4444; border: none; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 500;" title="Stop & Close">✕</button>
          </div>
        </div>
        <div id="vmkpal-player-content" style="display: ${startMinimized ? 'none' : 'block'};">
          <div style="color: rgba(255,255,255,0.8); font-size: 11px; margin-bottom: 8px; word-break: break-all; max-height: 32px; overflow: hidden;" title="${escapeHtml(filename)}">${escapeHtml(filename.length > 40 ? filename.substring(0, 40) + '...' : filename)}</div>
          <audio id="vmkpal-audio-element" src="${escapeHtml(url)}" loop style="width: 100%; height: 36px; border-radius: 6px;"></audio>
          <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
            <button id="vmkpal-audio-play" style="background: #10b981; border: none; color: white; width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;">▶</button>
            <input type="range" id="vmkpal-audio-seek" min="0" max="100" value="0" style="flex: 1; height: 6px; cursor: pointer; accent-color: #6366f1;">
            <span id="vmkpal-audio-time" style="color: rgba(255,255,255,0.6); font-size: 10px; min-width: 70px; text-align: right;">0:00 / 0:00</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
            <span style="color: rgba(255,255,255,0.5); font-size: 10px;">🔊</span>
            <input type="range" id="vmkpal-audio-volume" min="0" max="100" value="50" style="width: 80px; height: 4px; cursor: pointer; accent-color: #6366f1;">
            <label style="color: rgba(255,255,255,0.5); font-size: 10px; display: flex; align-items: center; gap: 4px; margin-left: auto; cursor: pointer;">
              <input type="checkbox" id="vmkpal-audio-loop" checked style="accent-color: #6366f1;"> Loop
            </label>
          </div>
        </div>
      </div>
    `

    const audioEl = container.querySelector('#vmkpal-audio-element')
    const playBtn = container.querySelector('#vmkpal-audio-play')
    const seekBar = container.querySelector('#vmkpal-audio-seek')
    const timeDisplay = container.querySelector('#vmkpal-audio-time')
    const volumeBar = container.querySelector('#vmkpal-audio-volume')
    const loopCheckbox = container.querySelector('#vmkpal-audio-loop')

    // Store reference
    audioPlayer = audioEl

    // Format time helper
    const formatTime = (seconds) => {
      if (isNaN(seconds)) return '0:00'
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // Play/pause button
    playBtn.addEventListener('click', () => {
      if (audioEl.paused) {
        audioEl.play()
        playBtn.textContent = '⏸'
      } else {
        audioEl.pause()
        playBtn.textContent = '▶'
      }
    })

    // Update time display and seek bar
    audioEl.addEventListener('timeupdate', () => {
      if (audioEl.duration) {
        seekBar.value = (audioEl.currentTime / audioEl.duration) * 100
        timeDisplay.textContent = `${formatTime(audioEl.currentTime)} / ${formatTime(audioEl.duration)}`
      }
    })

    // Seek bar
    seekBar.addEventListener('input', () => {
      if (audioEl.duration) {
        audioEl.currentTime = (seekBar.value / 100) * audioEl.duration
      }
    })

    // Volume bar
    volumeBar.addEventListener('input', () => {
      audioEl.volume = volumeBar.value / 100
    })

    // Loop checkbox
    loopCheckbox.addEventListener('change', () => {
      audioEl.loop = loopCheckbox.checked
    })

    // Auto-play
    audioEl.volume = 0.5
    audioEl.play().then(() => {
      playBtn.textContent = '⏸'
    }).catch(err => {
      console.log('Audio autoplay blocked:', err)
      showNotification('Click play to start audio', 'info')
    })

    // Add stop button handler
    const stopBtn = container.querySelector('#vmkpal-persistent-stop')
    if (stopBtn) {
      stopBtn.addEventListener('click', () => stopAudio())
    }

    // Add minimize/expand handler
    setupPlayerMinimizeHandler(container)

    showNotification('🔇 Game muted • Playing audio file', 'success')
  } else {
    // Unknown URL format - try as direct audio (legacy behavior)
    audioPlayer = new Audio(url)
    audioPlayer.loop = true
    audioPlayer.volume = 0.5
    audioPlayer.play().catch(err => {
      showNotification('Audio failed to play', 'error')
      unmuteGameAudio() // Restore game audio if our audio fails
    })
    showNotification('🔇 Game muted • Playing audio', 'success')
  }
}

// Helper to set up minimize/expand handler for player
function setupPlayerMinimizeHandler(container) {
  const minimizeBtn = container.querySelector('#vmkpal-player-minimize')
  const playerContent = container.querySelector('#vmkpal-player-content')
  const resizeHandle = container.querySelector('#vmkpal-resize-handle')
  if (minimizeBtn && playerContent) {
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      isPlayerMinimized = !isPlayerMinimized
      if (isPlayerMinimized) {
        playerContent.style.display = 'none'
        if (resizeHandle) resizeHandle.style.display = 'none'
        minimizeBtn.textContent = '□'
        minimizeBtn.title = 'Expand'
        container.style.width = '200px'
      } else {
        playerContent.style.display = 'block'
        if (resizeHandle) resizeHandle.style.display = 'block'
        minimizeBtn.textContent = '─'
        minimizeBtn.title = 'Minimize'
        container.style.width = playerSize.width + 'px'
      }
    })
  }
}

// Update WatchParty control panel UI
function updateWatchPartyControlPanel(container, isOpen) {
  container.style.width = '240px'

  if (isOpen) {
    container.innerHTML = `
      <div id="vmkpal-player-wrapper" style="background: linear-gradient(135deg, #1e1b4b, #312e81); border-radius: 12px; padding: 10px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 32px rgba(0,0,0,0.4); position: relative;">
        <div id="vmkpal-player-header" style="display: flex; align-items: center; gap: 8px; padding: 4px 2px; cursor: move;">
          <span style="color: #f59e0b; font-size: 12px; font-weight: 500;">🎬 WatchParty</span>
          <span style="color: rgba(255,255,255,0.4); font-size: 10px; margin-left: 4px;">⋮⋮ drag</span>
          <div style="margin-left: auto; display: flex; gap: 6px;">
            <button id="vmkpal-watchparty-focus" style="background: #6366f1; border: none; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 500;" title="Focus WatchParty window">↗</button>
            <button id="vmkpal-persistent-stop" style="background: #ef4444; border: none; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 500;" title="Close WatchParty">✕</button>
          </div>
        </div>
        <div id="vmkpal-watchparty-status" style="color: rgba(255,255,255,0.5); font-size: 10px; margin-top: 6px; text-align: center;">
          🔇 Playing in popup window
        </div>
      </div>
    `
  } else {
    container.innerHTML = `
      <div id="vmkpal-player-wrapper" style="background: linear-gradient(135deg, #1e1b4b, #312e81); border-radius: 12px; padding: 10px; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 8px 32px rgba(0,0,0,0.4); position: relative;">
        <div id="vmkpal-player-header" style="display: flex; align-items: center; gap: 8px; padding: 4px 2px; cursor: move;">
          <span style="color: #f59e0b; font-size: 12px; font-weight: 500;">🎬 WatchParty</span>
          <span style="color: rgba(255,255,255,0.4); font-size: 10px; margin-left: 4px;">⋮⋮ drag</span>
          <div style="margin-left: auto; display: flex; gap: 6px;">
            <button id="vmkpal-watchparty-reopen" style="background: #10b981; border: none; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 500;" title="Reopen WatchParty">↗ Reopen</button>
            <button id="vmkpal-persistent-stop" style="background: #ef4444; border: none; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 500;" title="Dismiss">✕</button>
          </div>
        </div>
        <div id="vmkpal-watchparty-status" style="color: rgba(255,255,255,0.5); font-size: 10px; margin-top: 6px; text-align: center;">
          🔊 Popup closed • Click Reopen to continue
        </div>
      </div>
    `
  }

  // Add event handlers
  const focusBtn = container.querySelector('#vmkpal-watchparty-focus')
  const reopenBtn = container.querySelector('#vmkpal-watchparty-reopen')
  const stopBtn = container.querySelector('#vmkpal-persistent-stop')

  if (focusBtn) {
    focusBtn.addEventListener('click', () => {
      if (watchPartyWindow && !watchPartyWindow.closed) {
        watchPartyWindow.focus()
      }
    })
  }

  if (reopenBtn) {
    reopenBtn.addEventListener('click', () => {
      if (watchPartyCurrentUrl) {
        // Reopen and mute game audio again
        muteGameAudio()
        const popupWidth = 900
        const popupHeight = 600
        const left = (screen.width - popupWidth) / 2
        const top = (screen.height - popupHeight) / 2
        watchPartyWindow = window.open(
          watchPartyCurrentUrl,
          'vmkpal-watchparty',
          `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`
        )
        updateWatchPartyControlPanel(container, true)
        // Restart watcher
        if (watchPartyWatcher) clearInterval(watchPartyWatcher)
        watchPartyWatcher = setInterval(() => {
          if (watchPartyWindow && watchPartyWindow.closed) {
            watchPartyWindow = null
            unmuteGameAudio()
            showNotification('🔊 WatchParty closed • Game audio restored', 'info')
            const container = document.getElementById('vmkpal-persistent-player')
            if (container) {
              updateWatchPartyControlPanel(container, false)
            }
            clearInterval(watchPartyWatcher)
            watchPartyWatcher = null
          }
        }, 500)
        showNotification('🔇 Game muted • WatchParty reopened', 'success')
      }
    })
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => stopAudio())
  }
}

function stopAudio(restoreGameAudio = true) {
  if (audioPlayer) {
    audioPlayer.pause()
    audioPlayer = null
  }
  if (youtubeIframe) {
    // Clear persistent container
    if (persistentPlayerContainer) {
      persistentPlayerContainer.innerHTML = ''
    }
    youtubeIframe = null
  }
  if (watchPartyWindow || watchPartyCurrentUrl) {
    // Close WatchParty popup window
    if (watchPartyWindow && !watchPartyWindow.closed) {
      watchPartyWindow.close()
    }
    watchPartyWindow = null
    watchPartyCurrentUrl = null
    // Clear watcher
    if (watchPartyWatcher) {
      clearInterval(watchPartyWatcher)
      watchPartyWatcher = null
    }
    // Clear the control panel
    if (persistentPlayerContainer) {
      persistentPlayerContainer.innerHTML = ''
    }
  }

  // Restore game audio
  if (restoreGameAudio) {
    unmuteGameAudio()
    showNotification('🔊 Game audio restored', 'info')
  }
}

// ============================================
// PRIZE TRACKER PANEL (iframe with chrome.storage sync)
// ============================================

const PRIZE_TRACKER_URL = 'https://bsims-codes.github.io/myvmk-monthly-prize-tracker/'
const PRIZE_TRACKER_EMBED_URL = PRIZE_TRACKER_URL + '?embed=true'
let prizeTrackerContainer = null
let prizeTrackerSize = { width: 380, height: 500 }

function createPrizeTrackerPanel() {
  // Toggle panel visibility if it exists
  if (prizeTrackerContainer) {
    const isVisible = prizeTrackerContainer.style.display !== 'none'
    prizeTrackerContainer.style.display = isVisible ? 'none' : 'block'
    return
  }

  // Create the persistent container
  prizeTrackerContainer = document.createElement('div')
  prizeTrackerContainer.id = 'vmkpal-prize-tracker'
  prizeTrackerContainer.style.cssText = `
    position: fixed;
    top: 50px;
    left: 50px;
    width: ${prizeTrackerSize.width}px;
    height: ${prizeTrackerSize.height}px;
    min-width: 300px;
    min-height: 250px;
    max-width: 90vw;
    max-height: 90vh;
    z-index: 2147483645;
    background: #1a1a2e;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
  `

  // Create header
  const header = document.createElement('div')
  header.id = 'vmkpal-prize-tracker-header'
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: linear-gradient(135deg, #2d2d44 0%, #1a1a2e 100%);
    cursor: move;
    user-select: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  `

  const title = document.createElement('span')
  title.textContent = '🏆 Prize Tracker'
  title.style.cssText = 'color: #fff; font-size: 13px; font-weight: 500;'

  const headerButtons = document.createElement('div')
  headerButtons.style.cssText = 'display: flex; gap: 6px;'

  const btnStyle = `
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  `

  // Open in new tab button
  const openBtn = document.createElement('button')
  openBtn.innerHTML = '↗'
  openBtn.title = 'Open in new tab'
  openBtn.style.cssText = btnStyle
  openBtn.onclick = () => window.open(PRIZE_TRACKER_URL, '_blank')

  // Refresh button
  const refreshBtn = document.createElement('button')
  refreshBtn.innerHTML = '↻'
  refreshBtn.title = 'Refresh'
  refreshBtn.style.cssText = btnStyle
  refreshBtn.onclick = () => {
    const iframe = prizeTrackerContainer.querySelector('iframe')
    if (iframe) iframe.src = iframe.src
  }

  // Save button - force sync to chrome.storage
  const saveBtn = document.createElement('button')
  saveBtn.innerHTML = '💾'
  saveBtn.title = 'Save changes to sync'
  saveBtn.style.cssText = btnStyle
  saveBtn.onclick = () => {
    const iframe = prizeTrackerContainer.querySelector('iframe')
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'PRIZE_TRACKER_SAVE' }, '*')
      saveBtn.innerHTML = '✓'
      saveBtn.style.background = 'rgba(0, 200, 100, 0.3)'
      setTimeout(() => {
        saveBtn.innerHTML = '💾'
        saveBtn.style.background = 'rgba(255, 255, 255, 0.1)'
      }, 1500)
    }
  }

  // Minimize button
  let isMinimized = false
  let savedHeight = prizeTrackerSize.height
  const minimizeBtn = document.createElement('button')
  minimizeBtn.innerHTML = '−'
  minimizeBtn.title = 'Minimize'
  minimizeBtn.style.cssText = btnStyle
  minimizeBtn.onclick = () => {
    const contentEl = prizeTrackerContainer.querySelector('#vmkpal-prize-tracker-content')
    const resizeHandle = prizeTrackerContainer.querySelector('#vmkpal-prize-tracker-resize')
    const resizeBorder = prizeTrackerContainer.querySelector('div[style*="pointer-events: none"]')

    if (isMinimized) {
      // Restore
      prizeTrackerContainer.style.minHeight = '250px'
      prizeTrackerContainer.style.height = savedHeight + 'px'
      contentEl.style.display = 'flex'
      if (resizeHandle) resizeHandle.style.display = 'block'
      if (resizeBorder) resizeBorder.style.display = 'block'
      minimizeBtn.innerHTML = '−'
      minimizeBtn.title = 'Minimize'
      isMinimized = false
    } else {
      // Save current height before minimizing
      savedHeight = prizeTrackerContainer.offsetHeight
      // Minimize - remove min-height constraint to allow collapse
      contentEl.style.display = 'none'
      if (resizeHandle) resizeHandle.style.display = 'none'
      if (resizeBorder) resizeBorder.style.display = 'none'
      prizeTrackerContainer.style.minHeight = '0'
      prizeTrackerContainer.style.height = 'auto'
      minimizeBtn.innerHTML = '□'
      minimizeBtn.title = 'Restore'
      isMinimized = true
    }
  }

  // Close button
  const closeBtn = document.createElement('button')
  closeBtn.innerHTML = '×'
  closeBtn.title = 'Close'
  closeBtn.style.cssText = btnStyle
  closeBtn.onclick = () => {
    prizeTrackerContainer.style.display = 'none'
  }

  headerButtons.appendChild(openBtn)
  headerButtons.appendChild(refreshBtn)
  headerButtons.appendChild(saveBtn)
  headerButtons.appendChild(minimizeBtn)
  headerButtons.appendChild(closeBtn)
  header.appendChild(title)
  header.appendChild(headerButtons)

  // Create content area with iframe
  const content = document.createElement('div')
  content.id = 'vmkpal-prize-tracker-content'
  content.style.cssText = 'flex: 1; position: relative; overflow: hidden;'

  const iframe = document.createElement('iframe')
  iframe.src = PRIZE_TRACKER_EMBED_URL
  iframe.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
    background: #0b0d12;
  `
  content.appendChild(iframe)

  // Create resize handle (bottom-right corner)
  const resizeHandle = document.createElement('div')
  resizeHandle.id = 'vmkpal-prize-tracker-resize'
  resizeHandle.style.cssText = `
    position: absolute;
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    z-index: 10;
  `
  // Add grip lines SVG
  resizeHandle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16" style="display:block;">
      <path d="M14 14L14 8M14 14L8 14M10 14L14 10M14 14L6 14M14 6L6 14"
            stroke="rgba(255,255,255,0.5)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>
  `

  // Add resize border effect on all edges
  const resizeBorder = document.createElement('div')
  resizeBorder.style.cssText = `
    position: absolute;
    inset: 0;
    pointer-events: none;
    border: 2px solid transparent;
    border-radius: 8px;
    transition: border-color 0.2s;
  `
  prizeTrackerContainer.appendChild(resizeBorder)

  // Show resize border on hover near edges
  prizeTrackerContainer.addEventListener('mousemove', (e) => {
    const rect = prizeTrackerContainer.getBoundingClientRect()
    const edgeThreshold = 8
    const nearEdge = (
      e.clientX - rect.left < edgeThreshold ||
      rect.right - e.clientX < edgeThreshold ||
      e.clientY - rect.top < edgeThreshold ||
      rect.bottom - e.clientY < edgeThreshold
    )
    resizeBorder.style.borderColor = nearEdge ? 'rgba(122, 162, 255, 0.5)' : 'transparent'
  })
  prizeTrackerContainer.addEventListener('mouseleave', () => {
    resizeBorder.style.borderColor = 'transparent'
  })

  prizeTrackerContainer.appendChild(header)
  prizeTrackerContainer.appendChild(content)
  prizeTrackerContainer.appendChild(resizeHandle)
  document.body.appendChild(prizeTrackerContainer)

  // Load saved position and size
  chrome.storage.local.get(['prizeTrackerPosition', 'prizeTrackerSize'], (result) => {
    if (result.prizeTrackerPosition) {
      const pos = result.prizeTrackerPosition
      prizeTrackerContainer.style.left = pos.x + 'px'
      prizeTrackerContainer.style.top = pos.y + 'px'
    }
    if (result.prizeTrackerSize) {
      prizeTrackerSize = result.prizeTrackerSize
      prizeTrackerContainer.style.width = prizeTrackerSize.width + 'px'
      prizeTrackerContainer.style.height = prizeTrackerSize.height + 'px'
    }
  })

  // Make draggable
  let isDragging = false
  let dragOffset = { x: 0, y: 0 }

  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return
    isDragging = true
    const rect = prizeTrackerContainer.getBoundingClientRect()
    dragOffset.x = e.clientX - rect.left
    dragOffset.y = e.clientY - rect.top
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const x = e.clientX - dragOffset.x
      const y = e.clientY - dragOffset.y
      const maxX = window.innerWidth - prizeTrackerContainer.offsetWidth
      const maxY = window.innerHeight - prizeTrackerContainer.offsetHeight
      prizeTrackerContainer.style.left = Math.max(0, Math.min(x, maxX)) + 'px'
      prizeTrackerContainer.style.top = Math.max(0, Math.min(y, maxY)) + 'px'
    }
  })

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false
      const rect = prizeTrackerContainer.getBoundingClientRect()
      chrome.storage.local.set({
        prizeTrackerPosition: { x: rect.left, y: rect.top }
      })
    }
  })

  // Make resizable
  let isResizing = false
  let resizeStart = { x: 0, y: 0, width: 0, height: 0 }

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true
    resizeStart = {
      x: e.clientX,
      y: e.clientY,
      width: prizeTrackerContainer.offsetWidth,
      height: prizeTrackerContainer.offsetHeight
    }
    e.preventDefault()
    e.stopPropagation()
  })

  document.addEventListener('mousemove', (e) => {
    if (isResizing) {
      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y
      const newWidth = Math.max(280, Math.min(1200, resizeStart.width + deltaX))
      const newHeight = Math.max(300, Math.min(1000, resizeStart.height + deltaY))
      prizeTrackerContainer.style.width = newWidth + 'px'
      prizeTrackerContainer.style.height = newHeight + 'px'
      prizeTrackerSize = { width: newWidth, height: newHeight }
    }
  })

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false
      chrome.storage.local.set({ prizeTrackerSize })
    }
  })
}

// Events Panel - Shows upcoming events from ICS
function createEventsPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'
  div.innerHTML = `<p style="color: rgba(255,255,255,0.5); font-size: 11px;">Loading events...</p>`

  // Load events
  loadTodaysEvents().then(result => {
    const { allUpcomingEvents } = result
    div.innerHTML = ''

    // Show up to 5 upcoming events
    const eventsToShow = allUpcomingEvents.slice(0, 5)

    if (eventsToShow.length === 0) {
      div.innerHTML = `<p style="color: rgba(255,255,255,0.5); font-size: 12px; text-align: center; padding: 12px;">No upcoming events</p>`
    } else {
      // Icons for different event types
      const hostIconUrl = chrome.runtime.getURL('genie-host-events.png')
      const genieIconUrl = chrome.runtime.getURL('genie-genie-events.png')
      const communityIconUrl = chrome.runtime.getURL('genie-community-events.png')
      const doubleCreditsIconUrl = chrome.runtime.getURL('genie-double-credits.png')

      eventsToShow.forEach(event => {
        // Check if this is a Double Credits event
        const isDoubleCredits = event.title && event.title.toLowerCase().includes('double credits')

        // Different colors and icons by event type
        let color, iconUrl, iconTitle
        if (isDoubleCredits) {
          color = '#fbbf24' // Gold for Double Credits
          iconUrl = doubleCreditsIconUrl
          iconTitle = 'Double Credits'
        } else if (event.type === 'genie') {
          color = '#ec4899' // Pink for Genie events
          iconUrl = genieIconUrl
          iconTitle = 'Genie Event'
        } else if (event.type === 'community') {
          color = '#10b981' // Green for Community events
          iconUrl = communityIconUrl
          iconTitle = 'Community Event'
        } else {
          color = '#f59e0b' // Orange for Host events
          iconUrl = hostIconUrl
          iconTitle = 'Host Event'
        }

        const row = document.createElement('div')
        row.style.cssText = `
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px;
          background: ${event.isLive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)'};
          border-radius: 8px;
          margin-bottom: 6px;
          border-left: 3px solid ${event.isLive ? '#10b981' : color};
        `
        const liveBadge = event.isLive ? '<span style="background: #10b981; color: white; font-size: 9px; padding: 2px 6px; border-radius: 10px; margin-left: 6px; font-weight: 600;">LIVE</span>' : ''
        row.innerHTML = `
          <div style="flex: 1; min-width: 0;">
            <div style="color: white; font-size: 12px; font-weight: 500; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(event.title)}${liveBadge}</div>
            <div style="color: rgba(255,255,255,0.5); font-size: 10px;">${event.dateStr} • ${event.timeStr}${event.location ? ' • ' + escapeHtml(event.location) : ''}</div>
          </div>
          <img src="${iconUrl}" alt="${iconTitle}" title="${iconTitle}" style="width: 24px; height: 24px; object-fit: contain;">
        `
        div.appendChild(row)
      })
    }

    // Full calendar link
    const link = document.createElement('button')
    link.innerHTML = '📅 View Full Calendar'
    link.style.cssText = `
      width: 100%;
      margin-top: 10px;
      padding: 10px;
      border-radius: 6px;
      border: none;
      background: linear-gradient(135deg, #8b5cf6, #7c3aed);
      color: white;
      font-weight: 500;
      cursor: pointer;
      font-size: 12px;
    `
    link.onclick = () => window.open('https://bsims-codes.github.io/MyVMK-Genie-dev/calendar.html', '_blank')
    div.appendChild(link)
  })

  return div
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  if (!str) return ''
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// Load upcoming events from ICS - simplified version
async function loadTodaysEvents() {
  const allUpcomingEvents = []
  const now = Date.now()
  const icsUrl = 'https://bsims-codes.github.io/myvmk-ics/myvmk.ics'

  try {
    // Always fetch fresh - no caching complexity
    const response = await fetch(icsUrl + '?t=' + now) // Cache bust
    const icsText = await response.text()

    // Parse ICS and get events
    const events = parseICSSimple(icsText)
    console.log('MyVMK Genie: Parsed', events.length, 'events from ICS')

    // Filter to upcoming or currently active events (show until they END)
    const upcomingIcsEvents = []
    events.forEach(event => {
      // Use endTimestamp if available, otherwise just check start time
      const endTime = event.endTimestamp || event.timestamp
      if (endTime > now) {
        event.type = 'host' // Mark as host event
        // Mark as live if currently happening
        event.isLive = event.endTimestamp && now >= event.timestamp && now <= event.endTimestamp
        upcomingIcsEvents.push(event)
        allUpcomingEvents.push(event)
      }
    })
    // Cache ICS events for notification system
    cachedIcsEvents = upcomingIcsEvents
  } catch (err) {
    console.error('MyVMK Genie: Failed to fetch ICS:', err)
  }

  // Also include scheduled Genie events (admin)
  // Show events until they END (not just until they start)
  scheduledGenieEvents.forEach(event => {
    // Skip test events unless test mode is enabled
    if (event.test && !isTestModeEnabled) return

    const startTime = new Date(event.startTime).getTime()
    const endTime = startTime + (event.durationMinutes || 5) * 60 * 1000
    if (endTime > now) {
      const isLive = now >= startTime && now <= endTime
      allUpcomingEvents.push({
        title: event.title,
        timestamp: startTime,
        location: event.roomName || '',
        dateStr: formatDateStr(new Date(event.startTime)),
        timeStr: formatTimeStr(new Date(event.startTime)),
        type: 'genie',
        isLive: isLive
      })
    }
  })

  // Also include scheduled Community events (player)
  // Show events until they END (not just until they start)
  scheduledCommunityEvents.forEach(event => {
    // Skip test events unless test mode is enabled
    if (event.test && !isTestModeEnabled) return

    const startTime = new Date(event.startTime).getTime()
    const endTime = startTime + (event.durationMinutes || 5) * 60 * 1000
    if (endTime > now) {
      const isLive = now >= startTime && now <= endTime
      allUpcomingEvents.push({
        title: event.title,
        timestamp: startTime,
        location: event.roomName || '',
        dateStr: formatDateStr(new Date(event.startTime)),
        timeStr: formatTimeStr(new Date(event.startTime)),
        type: 'community',
        submittedBy: event.submittedBy,
        isLive: isLive
      })
    }
  })

  // Sort by timestamp
  allUpcomingEvents.sort((a, b) => a.timestamp - b.timestamp)

  console.log('MyVMK Genie: Found', allUpcomingEvents.length, 'upcoming events')
  if (allUpcomingEvents.length > 0) {
    console.log('MyVMK Genie: Next event:', allUpcomingEvents[0].title, 'at', new Date(allUpcomingEvents[0].timestamp).toString())
  }

  const nextEvent = allUpcomingEvents[0] || null
  return { todayEvents: [], nextEvent, allUpcomingEvents }
}

// Format date string for Genie events
function formatDateStr(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`
}

// Format time string for Genie events
function formatTimeStr(date) {
  let hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${hours}:${minutes} ${ampm} ET`
}

// Simple ICS parser - returns array of {title, timestamp, location, dateStr, timeStr}
function parseICSSimple(icsText) {
  const events = []
  const lines = icsText.replace(/\r\n /g, '').split(/\r\n|\n|\r/)

  let currentEvent = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {}
    } else if (line === 'END:VEVENT' && currentEvent) {
      if (currentEvent.title && currentEvent.timestamp) {
        events.push({
          title: currentEvent.title,
          timestamp: currentEvent.timestamp,
          endTimestamp: currentEvent.endTimestamp || null,
          location: currentEvent.location || null,
          dateStr: currentEvent.dateStr,
          timeStr: currentEvent.timeStr,
          source: 'official'
        })
      }
      currentEvent = null
    } else if (currentEvent) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue

      const key = line.substring(0, colonIdx)
      const value = line.substring(colonIdx + 1)

      if (key.startsWith('DTSTART')) {
        const parsed = parseICSDateSimple(value)
        if (parsed) {
          currentEvent.timestamp = parsed.timestamp
          currentEvent.dateStr = parsed.dateStr
          currentEvent.timeStr = parsed.timeStr
        }
      } else if (key.startsWith('DTEND')) {
        const parsed = parseICSDateSimple(value)
        if (parsed) {
          currentEvent.endTimestamp = parsed.timestamp
        }
      } else if (key === 'SUMMARY') {
        currentEvent.title = value.replace(/\\,/g, ',').replace(/\\n/g, ' ').trim()
      } else if (key === 'LOCATION') {
        currentEvent.location = value.replace(/\\,/g, ',').trim()
      }
    }
  }

  return events
}

// Simple ICS date parser - treats times as Eastern Time
function parseICSDateSimple(dateStr) {
  // Match YYYYMMDD or YYYYMMDDTHHMMSS[Z]
  const match = dateStr.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?(Z?))?/)
  if (!match) return null

  const year  = parseInt(match[1])
  const month = parseInt(match[2])
  const day   = parseInt(match[3])
  const hour  = match[4] ? parseInt(match[4]) : 0
  const min   = match[5] ? parseInt(match[5]) : 0
  const isUtc = match[6] === 'Z'

  let date
  if (isUtc) {
    // Explicit UTC suffix — parse directly as UTC
    date = new Date(Date.UTC(year, month - 1, day, hour, min, 0))
  } else {
    // Floating or TZID=America/New_York time — always treat as Eastern Time.
    // Use Intl.DateTimeFormat to determine the exact ET→UTC offset for this
    // date (handles DST automatically; no hard-coded offsets).
    const trialUtc = new Date(Date.UTC(year, month - 1, day, hour, min, 0))
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    })
    const parts = fmt.formatToParts(trialUtc)
    const etYear  = parseInt(parts.find(p => p.type === 'year').value)
    const etMonth = parseInt(parts.find(p => p.type === 'month').value)
    const etDay   = parseInt(parts.find(p => p.type === 'day').value)
    const etHour  = parseInt(parts.find(p => p.type === 'hour').value) % 24
    const etMin   = parseInt(parts.find(p => p.type === 'minute').value)
    const trialEtMs = Date.UTC(etYear, etMonth - 1, etDay, etHour, etMin, 0)
    const etOffsetMs = trialUtc.getTime() - trialEtMs // positive = ET lags behind UTC
    date = new Date(trialUtc.getTime() + etOffsetMs)
  }

  // Format for display in Eastern Time
  const dateOptions = { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }
  const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }

  const dateStr2 = date.toLocaleDateString('en-US', dateOptions)
  const timeStr  = date.toLocaleTimeString('en-US', timeOptions) + ' ET'

  return {
    timestamp: date.getTime(),
    dateStr: dateStr2,
    timeStr: timeStr
  }
}

// Get countdown string (e.g., "2 days, 5 hours")
function getCountdown(targetDate) {
  const now = new Date()
  const diff = targetDate - now

  if (diff <= 0) return 'Starting now!'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`
  } else {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  }
}

// Update the room info display box
function updateRoomInfoDisplay() {
  const roomNameEl = document.getElementById('vmkpal-room-name')
  const roomLandEl = document.getElementById('vmkpal-room-land')

  if (roomNameEl) {
    if (currentRoom) {
      roomNameEl.textContent = currentRoom
      roomNameEl.style.color = '#4ade80'
    } else {
      roomNameEl.textContent = 'Not detected yet'
      roomNameEl.style.color = 'rgba(255,255,255,0.4)'
    }
  }

  if (roomLandEl) {
    if (currentLand) {
      roomLandEl.textContent = currentLand
    } else if (currentRoomId) {
      roomLandEl.textContent = `Room ID: ${currentRoomId}`
    } else {
      roomLandEl.textContent = ''
    }
  }

  // Check for room-specific effects (like Haunted Mansion ghosts, Tinkerbell)
  checkGhostEffectRoom()
  checkTinkerbellRoom()
  checkButterflyRoom()
  checkMatterhornRoom()
  checkGenieEvents()
}

// Render the ticker as one continuous scroll: Welcome + all upcoming events
async function renderTickerContent() {
  const tickerTextEl = document.getElementById('vmkpal-ticker-text')
  if (!tickerTextEl) return

  const hostIconUrl = chrome.runtime.getURL('genie-host-events.png')
  const genieLogoUrl = chrome.runtime.getURL('genie-genie-events.png')
  const communityIconUrl = chrome.runtime.getURL('genie-community-events.png')
  const doubleCreditsIconUrl = chrome.runtime.getURL('genie-double-credits.png')

  try {
    const { allUpcomingEvents } = await loadTodaysEvents()

    // Build continuous ticker content - use custom text/icon if set, otherwise default
    const welcomeMessage = customTickerText || 'Welcome to MyVMK Genie'
    const welcomeIconUrl = customTickerIcon || genieLogoUrl
    let tickerContent = `<img src="${welcomeIconUrl}" style="height: 22px; width: auto; vertical-align: -5px; margin-right: 6px;">${welcomeMessage}`

    // Add upcoming events (up to 3)
    const eventsToShow = allUpcomingEvents.slice(0, 3)
    if (eventsToShow.length > 0) {
      tickerContent += '   •   '

      eventsToShow.forEach((event, index) => {
        const eventDate = new Date(event.timestamp)
        const countdown = event.isLive ? '🔴 LIVE' : getCountdown(eventDate)
        const eventName = event.title
        const timeStr = event.timeStr || 'TBD'

        // Different icons by event type
        const isDoubleCredits = event.title && event.title.toLowerCase().includes('double credits')
        let iconUrl
        if (isDoubleCredits) {
          iconUrl = doubleCreditsIconUrl
        } else if (event.type === 'genie') {
          iconUrl = genieLogoUrl
        } else if (event.type === 'community') {
          iconUrl = communityIconUrl
        } else {
          iconUrl = hostIconUrl
        }

        const iconHtml = `<img src="${iconUrl}" style="height: 22px; width: auto; vertical-align: -5px; margin-right: 6px;">`
        tickerContent += `${iconHtml}${countdown}: ${eventName} (${timeStr})`

        if (index < eventsToShow.length - 1) {
          tickerContent += '   •   '
        }
      })
    }

    tickerContent += '   •   '
    // Duplicate for seamless loop
    tickerTextEl.innerHTML = tickerContent + tickerContent

  } catch (err) {
    console.error('Failed to update ticker:', err)
    tickerTextEl.innerHTML = '📅 Check events calendar for updates   •   '
  }
}

// Start the event ticker - renders once and updates periodically
function updateEventTicker() {
  const tickerText = document.getElementById('vmkpal-ticker-text')
  if (!tickerText) return

  // If already set up, don't add another listener
  if (tickerIntervalId) return

  // Initial render
  renderTickerContent()

  // Mark as initialized
  tickerIntervalId = true

  // Update content every 60 seconds to refresh countdowns
  setInterval(renderTickerContent, 60000)
}


// LFG Panel
function createLfgPanel() {
  const div = document.createElement('div')
  div.style.cssText = 'padding-top: 12px;'
  div.innerHTML = `
    <p style="color: rgba(255,255,255,0.6); font-size: 12px; margin-bottom: 12px;">Find other players to join games.</p>
    <button onclick="window.open('http://localhost:3000/lfg', '_blank')" style="width: 100%; padding: 10px; border-radius: 6px; border: none; background: linear-gradient(135deg, #ec4899, #db2777); color: white; font-weight: 500; cursor: pointer; font-size: 12px;">Open Looking for Game</button>
  `
  return div
}

// Fill black borders with themed background and twinkling stars
function fillBorderBackground() {
  const bgImageUrl = chrome.runtime.getURL('genie-background.png')
  const style = document.createElement('style')
  style.id = 'vmkpal-border-fill'
  style.textContent = `
    html, body {
      background: url('${bgImageUrl}') center center / cover no-repeat fixed,
                  linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%) !important;
    }

    /* Twinkling Stars - behind everything */
    #vmkpal-stars {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: -1;
    }
    .vmkpal-star {
      position: absolute;
      width: 2px;
      height: 2px;
      background: #fff;
      border-radius: 50%;
      opacity: 0;
      animation: vmkpal-twinkle var(--duration, 3s) ease-in-out infinite;
      animation-delay: var(--delay, 0s);
    }
    .vmkpal-star::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
      height: 6px;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.6) 0%, transparent 70%);
      border-radius: 50%;
    }
    @keyframes vmkpal-twinkle {
      0%, 100% { opacity: 0.2; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.2); }
    }

    /* Game canvas should have solid background to cover stars */
    canvas {
      position: relative;
      z-index: 1;
    }

    /* Ensure iframes (if game uses them) also cover stars */
    iframe {
      position: relative;
      z-index: 1;
    }
  `
  document.head.appendChild(style)

  // Create stars container
  createTwinklingStars()
}

// Create twinkling stars
function createTwinklingStars() {
  // Remove existing stars
  const existing = document.getElementById('vmkpal-stars')
  if (existing) existing.remove()

  const container = document.createElement('div')
  container.id = 'vmkpal-stars'

  // Calculate star count based on screen size
  const starCount = Math.floor((window.innerWidth * window.innerHeight) / 8000)

  for (let i = 0; i < starCount; i++) {
    const star = document.createElement('div')
    star.className = 'vmkpal-star'
    star.style.left = Math.random() * 100 + '%'
    star.style.top = Math.random() * 100 + '%'
    star.style.setProperty('--delay', Math.random() * 4 + 's')
    star.style.setProperty('--duration', (2 + Math.random() * 3) + 's')

    // Random size between 1-3px
    const size = 1 + Math.random() * 2
    star.style.width = size + 'px'
    star.style.height = size + 'px'

    container.appendChild(star)
  }

  document.body.appendChild(container)
}

// Initialize
async function init() {
  console.log('MyVMK Genie initializing...')

  // Critical: Create toolbar first for fast UI appearance
  loadPhrases()
  createToolbar()

  // Fill black borders with themed background
  fillBorderBackground()

  // Restore overlay states and audio mappings (non-blocking)
  chrome.storage.local.get(['rainEnabled', 'starsOverlayEnabled', 'nightOverlayEnabled', 'moneyRainEnabled', 'fireworksEnabled', 'snowEnabled', 'emojiRainEnabled', 'selectedEmoji', 'positionLocked', 'audioRoomMappings'], (result) => {
    if (result.audioRoomMappings) {
      audioRoomMappings = result.audioRoomMappings
    }
    if (result.selectedEmoji) {
      selectedEmoji = result.selectedEmoji
    }
    if (result.positionLocked) {
      isPositionLocked = true
    }
    // Defer overlay restoration to avoid blocking
    setTimeout(() => {
      if (result.rainEnabled) {
        isRainEnabled = false
        toggleRainOverlay()
      }
      if (result.starsOverlayEnabled) {
        isStarsOverlayEnabled = false
        toggleStarsOverlay()
      }
      if (result.nightOverlayEnabled) {
        isNightOverlayEnabled = false
        toggleNightOverlay()
      }
      if (result.moneyRainEnabled) {
        isMoneyRainEnabled = false
        toggleMoneyRain()
      }
      if (result.fireworksEnabled) {
        isFireworksEnabled = false
        toggleFireworks()
      }
      if (result.snowEnabled) {
        isSnowEnabled = false
        toggleSnowOverlay()
      }
      if (result.emojiRainEnabled) {
        isEmojiRainEnabled = false
        toggleEmojiRain()
      }
    }, 100)
  })

  // Listen for audio detection events from page context via postMessage (crosses isolated world boundary)
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'vmkgenie-audio-detected' && event.data.url) {
      detectedAudioUrl = event.data.url

      // Check if this audio matches a known room
      const matchedRoom = findRoomByAudio(detectedAudioUrl)
      if (matchedRoom !== null) {
        hasDetectedRoomThisSession = true
        currentRoomId = matchedRoom.id
        currentRoom = ROOM_MAP[matchedRoom.id] || `Room ${matchedRoom.id}`
        currentLand = matchedRoom.land
        updateRoomInfoDisplay()
        checkGhostEffectRoom()
        checkTinkerbellRoom()
        checkButterflyRoom()
        checkMatterhornRoom()
        checkGenieEvents()
      }
    }

    // Detect HM LOBBY audio playing (HML-*) - resets game state
    if (event.data && event.data.type === 'vmkgenie-hm-lobby-audio') {
      hasDetectedRoomThisSession = true
      isInHMGame = false
      currentRoomId = HAUNTED_MANSION_LOBBY_ID
      currentRoom = ROOM_MAP[HAUNTED_MANSION_LOBBY_ID] || 'Haunted Mansion Lobby'
      currentLand = 'New Orleans Square'
      updateRoomInfoDisplay()
      checkGhostEffectRoom()
      checkTinkerbellRoom()
      checkButterflyRoom()
      checkMatterhornRoom()
      checkGenieEvents()
    }

    // Detect HM GAME entered via stage data fetch
    if (event.data && event.data.type === 'vmkgenie-hm-game-entered') {
      hasDetectedRoomThisSession = true
      isInHMGame = true
      currentRoomId = HAUNTED_MANSION_GAME_ID
      currentRoom = ROOM_MAP[HAUNTED_MANSION_GAME_ID] || 'Haunted Mansion Game'
      currentLand = 'New Orleans Square'
      updateRoomInfoDisplay()
      checkGhostEffectRoom()
      checkTinkerbellRoom()
      checkButterflyRoom()
      checkMatterhornRoom()
      checkGenieEvents()
    }

    // Detect NPC sound files (backup detection via fetch/XHR interception)
    if (event.data && event.data.type === 'vmkgenie-npc-audio-detected' && event.data.url) {
      const url = event.data.url
      const match = url.match(/\/npcs\/([^\/]+)\//)
      if (match && match[1]) {
        const npcFolder = match[1]
        console.log('MyVMK Genie: NPC audio detected (interceptor):', npcFolder)

        // Check our mapping
        if (NPC_ROOM_MAP[npcFolder]) {
          const roomInfo = NPC_ROOM_MAP[npcFolder]
          if (roomInfo.id !== currentRoomId) {
            hasDetectedRoomThisSession = true
            setRoomFromNetwork(roomInfo.id, roomInfo.name)
          }
        }
      }
    }

    // Detect room_sound files (backup detection via fetch/XHR interception)
    if (event.data && event.data.type === 'vmkgenie-room-audio-detected' && event.data.url) {
      const url = event.data.url
      console.log('MyVMK Genie: Room audio detected (interceptor):', url)

      const matchedRoom = findRoomByAudio(url)
      if (matchedRoom !== null && matchedRoom.id !== currentRoomId) {
        hasDetectedRoomThisSession = true
        currentRoomId = matchedRoom.id
        currentRoom = ROOM_MAP[matchedRoom.id] || `Room ${matchedRoom.id}`
        currentLand = matchedRoom.land
        console.log('MyVMK Genie: Auto-detected room (interceptor):', currentRoom, currentLand ? `(${currentLand})` : '')
        updateRoomInfoDisplay()
        checkGhostEffectRoom()
        checkTinkerbellRoom()
        checkButterflyRoom()
        checkMatterhornRoom()
        checkGenieEvents()
      }
    }

    // Detect room JSON config files (backup detection via fetch/XHR interception)
    if (event.data && event.data.type === 'vmkgenie-room-json-detected' && event.data.url) {
      const url = event.data.url
      const jsonMatch = url.match(/vmk_(?:snd_)?(?!avatar_|npc_|item_|furniture_|pin_|badge_)([a-z_]+)\.json$/i)
      if (jsonMatch && jsonMatch[1]) {
        const roomKey = jsonMatch[1]
        console.log('MyVMK Genie: Room JSON detected (interceptor):', roomKey)

        // Try to find matching room in AUDIO_ROOM_MAP
        const sndKey = `vmk_snd_${roomKey}`
        if (typeof AUDIO_ROOM_MAP !== 'undefined' && AUDIO_ROOM_MAP[sndKey]) {
          const roomInfo = AUDIO_ROOM_MAP[sndKey]
          if (roomInfo.id !== currentRoomId) {
            hasDetectedRoomThisSession = true
            currentRoomId = roomInfo.id
            currentRoom = ROOM_MAP[roomInfo.id] || `Room ${roomInfo.id}`
            currentLand = roomInfo.land
            console.log('MyVMK Genie: Auto-detected room from JSON (interceptor):', currentRoom, currentLand ? `(${currentLand})` : '')
            updateRoomInfoDisplay()
            checkGhostEffectRoom()
            checkTinkerbellRoom()
            checkButterflyRoom()
            checkMatterhornRoom()
            checkGenieEvents()
          }
        }
      }
    }
  })

  // Defer non-critical initialization
  setTimeout(() => {
    startRoomWatcher()
    startGenieEventSystem()
    startAmbientEffectWatcher()
    // Start map button overlay to detect when user opens map
    startMapButtonOverlay(() => {
      hideOverlaysForMap()
    })
    // Queue monitoring commented out for future reference
    // if (DEV_MODE) {
    //   startQueueMonitor()
    // }
  }, 500)

  // Handle resize to update overlay positions to match game canvas
  window.addEventListener('resize', () => {
    updateOverlayBounds()
    // Update castle test overlay if enabled
    if (isCastleTestOverlayEnabled) {
      updateCastleTestOverlayPosition()
    }
  })

  // Handle visibility change - pause/resume effects when tab is hidden/visible
  // This prevents memory issues and timing problems when tab is backgrounded for long periods
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Tab is hidden - pause canvas-based effects to save resources
      console.log('MyVMK Genie: Tab hidden - pausing effects')
      if (rainAnimationId) { cancelAnimationFrame(rainAnimationId); rainAnimationId = null }
      if (snowAnimationId) { cancelAnimationFrame(snowAnimationId); snowAnimationId = null }
      if (fireworksAnimationId) { cancelAnimationFrame(fireworksAnimationId); fireworksAnimationId = null }
      if (moneyAnimationId) { cancelAnimationFrame(moneyAnimationId); moneyAnimationId = null }
      if (spotlightAnimationId) { cancelAnimationFrame(spotlightAnimationId); spotlightAnimationId = null }
      if (emojiAnimationId) { cancelAnimationFrame(emojiAnimationId); emojiAnimationId = null }
      if (raveAnimationId) { cancelAnimationFrame(raveAnimationId); raveAnimationId = null }
      if (ghostAnimationId) { cancelAnimationFrame(ghostAnimationId); ghostAnimationId = null }
      if (tinkerbellAnimationId) { cancelAnimationFrame(tinkerbellAnimationId); tinkerbellAnimationId = null }
      if (butterflyAnimationId) { cancelAnimationFrame(butterflyAnimationId); butterflyAnimationId = null }
      if (fireflyAnimationId) { cancelAnimationFrame(fireflyAnimationId); fireflyAnimationId = null }
    } else {
      // Tab is visible - resume effects that were active
      console.log('MyVMK Genie: Tab visible - resuming effects')
      if (isRainEnabled && !rainAnimationId) renderRain()
      if (isSnowEnabled && !snowAnimationId) renderSnow()
      if (isFireworksEnabled && !fireworksAnimationId) renderFireworks()
      if (isMoneyRainEnabled && !moneyAnimationId) renderMoney()
      if (isSpotlightsEnabled && !spotlightAnimationId) renderSpotlights()
      if (isEmojiRainEnabled && !emojiAnimationId) renderEmojiRain()
      if (isRaveEnabled && !raveAnimationId) renderRave()
      if (isGhostEffectActive && !ghostAnimationId) updateGhosts()
      if (isTinkerbellActive && !tinkerbellAnimationId) updateTinkerbell()
      if (isButterflyActive && !butterflyAnimationId) updateButterflies()
      if (isFirefliesActive && !fireflyAnimationId) renderFireflies()
    }
  })

  // Check Kingdom Sync night time every minute
  setInterval(() => {
    if (isKingdomSyncEnabled) {
      checkKingdomSyncNight()
    }
  }, 60000)

  // Debug only in internal mode
  if (DEV_MODE) {
    setTimeout(() => runDebug(), 3000)
  }
}

// Wait for page to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
