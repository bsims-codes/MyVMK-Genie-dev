// MyVMK Genie - Background Service Worker

let mediaRecorder = null
let recordedChunks = []
let isRecording = false

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command)

  if (command === 'take-screenshot') {
    // Capture and send to content script to show dialog
    try {
      const dataUrl = await captureScreenshot()
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SCREENSHOT_DIALOG', dataUrl })
      }
    } catch (err) {
      console.error('Screenshot failed:', err)
    }
  }
})

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TAKE_SCREENSHOT') {
    takeScreenshot()
    sendResponse({ success: true })
  }

  if (message.type === 'CAPTURE_SCREENSHOT') {
    captureScreenshot().then(dataUrl => {
      sendResponse({ success: true, dataUrl })
    }).catch(err => {
      sendResponse({ success: false, error: err.message })
    })
    return true // Keep channel open for async response
  }

  if (message.type === 'DOWNLOAD_SCREENSHOT') {
    downloadScreenshot(message.dataUrl)
    sendResponse({ success: true })
  }

  if (message.type === 'CAPTURE_FOR_OCR') {
    captureForOCR().then(dataUrl => {
      sendResponse({ success: true, dataUrl })
    }).catch(err => {
      sendResponse({ success: false, error: err.message })
    })
    return true // Keep channel open for async response
  }

  if (message.type === 'START_RECORDING') {
    startRecording(sender.tab.id)
    sendResponse({ success: true })
  }

  if (message.type === 'STOP_RECORDING') {
    stopRecording()
    sendResponse({ success: true })
  }

  if (message.type === 'GET_RECORDING_STATE') {
    sendResponse({ isRecording })
  }

  return true
})

// Take screenshot and download as file
async function takeScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab) {
      console.log('No active tab')
      return
    }

    // Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' })

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `myvmk-screenshot-${timestamp}.png`

    // Download the image
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    })

    console.log('Screenshot saved:', filename)

    // Notify content script
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'SCREENSHOT_TAKEN' }).catch(() => {})
    }
  } catch (err) {
    console.error('Screenshot failed:', err)
  }
}

// Capture screenshot and return data URL (for clipboard/download choice)
async function captureScreenshot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  if (!tab) {
    throw new Error('No active tab')
  }

  // Capture visible tab
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' })
  return dataUrl
}

// Download a screenshot from data URL
function downloadScreenshot(dataUrl) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `myvmk-screenshot-${timestamp}.png`

  chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: false
  })

  console.log('Screenshot downloaded:', filename)
}

// Start recording the tab
async function startRecording(tabId) {
  if (isRecording) {
    console.log('Already recording')
    return
  }

  try {
    // Get the media stream from the tab
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    })

    // We need to get the stream in the content script since service workers
    // can't access getUserMedia directly. Send the streamId to content script.
    chrome.tabs.sendMessage(tabId, {
      type: 'START_RECORDING_WITH_STREAM',
      streamId: streamId
    })

    isRecording = true
    console.log('Recording started')

  } catch (err) {
    console.error('Failed to start recording:', err)
    chrome.tabs.sendMessage(tabId, {
      type: 'RECORDING_ERROR',
      error: err.message
    }).catch(() => {})
  }
}

// Stop recording
function stopRecording() {
  isRecording = false
  // The actual stopping happens in content script
  console.log('Recording stop requested')
}

// Capture tab for OCR processing
async function captureForOCR() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab) {
      throw new Error('No active tab')
    }

    // Capture visible tab as PNG data URL
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' })
    return dataUrl
  } catch (err) {
    console.error('Capture for OCR failed:', err)
    throw err
  }
}

// Initialize
console.log('MyVMK Genie background loaded')
