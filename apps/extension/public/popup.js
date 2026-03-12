// MyVMK Genie - Popup Script (Simple local storage version)

const phrasesList = document.getElementById('phrases-list')
const saveBtn = document.getElementById('save-btn')
const status = document.getElementById('status')

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

// Initialize
async function init() {
  // Load existing phrases
  const result = await chrome.storage.local.get(['phrases'])
  const phrases = result.phrases || {}

  // Create input fields
  phrasesList.innerHTML = keys.map((key, i) => {
    const slot = i + 1
    const value = phrases[slot] || ''
    return `
      <div class="phrase-row">
        <span class="phrase-key">${key}</span>
        <input
          type="text"
          class="phrase-input"
          data-slot="${slot}"
          value="${escapeHtml(value)}"
          placeholder="Phrase for Alt+${key}..."
          maxlength="200"
        >
      </div>
    `
  }).join('')
}

// Save phrases
async function savePhrases() {
  saveBtn.disabled = true
  saveBtn.textContent = 'Saving...'

  const phrases = {}
  document.querySelectorAll('.phrase-input').forEach(input => {
    const slot = parseInt(input.dataset.slot)
    const value = input.value.trim()
    if (value) {
      phrases[slot] = value
    }
  })

  await chrome.storage.local.set({ phrases })

  saveBtn.disabled = false
  saveBtn.textContent = 'Save Phrases'
  status.textContent = 'Saved!'

  setTimeout(() => {
    status.textContent = ''
  }, 2000)
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// Event listeners
saveBtn.addEventListener('click', savePhrases)

// Save on Enter key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('phrase-input')) {
    savePhrases()
  }
})

// Initialize
init()
