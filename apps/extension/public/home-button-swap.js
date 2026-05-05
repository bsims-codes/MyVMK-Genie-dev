(function () {
  'use strict'

  const PLAY_IMG = chrome.runtime.getURL('genie-play-now-button.png')
  const BUTTON_WIDTH_PX = 200

  function setImportant(el, prop, value) {
    el.style.setProperty(prop, value, 'important')
  }

  function swapPlayButtons() {
    const buttons = document.querySelectorAll('a.btn.btn-large:not([data-genie-swapped])')
    if (!buttons.length) return
    buttons.forEach(btn => {
      btn.dataset.genieSwapped = '1'
      btn.innerHTML = ''
      setImportant(btn, 'background', 'none')
      setImportant(btn, 'background-color', 'transparent')
      setImportant(btn, 'background-image', 'none')
      setImportant(btn, 'border', '0')
      setImportant(btn, 'padding', '0')
      setImportant(btn, 'box-shadow', 'none')
      setImportant(btn, 'display', 'inline-block')
      setImportant(btn, 'line-height', '0')
      setImportant(btn, 'color', 'inherit')
      setImportant(btn, 'width', BUTTON_WIDTH_PX + 'px')
      setImportant(btn, 'height', 'auto')

      const img = document.createElement('img')
      img.src = PLAY_IMG
      img.alt = 'Play Now'
      setImportant(img, 'display', 'block')
      setImportant(img, 'width', '100%')
      setImportant(img, 'height', 'auto')
      setImportant(img, 'background', 'transparent')
      // Source PNG has opaque-black corners (alpha=255, rgb=0,0,0) — clip to a circle to hide them.
      setImportant(img, 'clip-path', 'circle(50% at 50% 50%)')
      setImportant(img, '-webkit-clip-path', 'circle(50% at 50% 50%)')
      btn.appendChild(img)
    })
  }

  function start() {
    swapPlayButtons()
    new MutationObserver(swapPlayButtons).observe(document.body, { childList: true, subtree: true })
  }

  if (document.body) {
    start()
  } else {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  }
})()
