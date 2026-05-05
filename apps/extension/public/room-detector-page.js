// MyVMK Genie - Room Detector (runs in PAGE context)
// Mirrors the structural room-detection used by the BertoGz "myVmk Trunk"
// extension: latches the game's room-loader function by regex-matching its
// minified source for the dispose() guard, then watches the meta object for
// id/name/isMine changes. Posts updates to the content script via postMessage.

(function () {
  'use strict'

  if (window.__vmkGenieRoomDetectorInstalled) return
  window.__vmkGenieRoomDetectorInstalled = true

  const SOURCE = 'vmkgenie-room-detector'
  const ROOM_LOADER_DISPOSE_PATTERN = /void\s*0\s*!==\s*([a-zA-Z_$][\w$]*)\s*&&\s*\(\s*\1\s*\.\s*dispose\s*\(\s*\)\s*/
  const ROOM_META_STABLE_KEYS = ['public', 'name', 'description', 'id']
  const ROOM_META_MINE_KEY = 'x___rKgc'
  const SKIP_ROOT_KEYS = new Set([
    'document', 'location', 'navigator', 'history',
    'localStorage', 'sessionStorage', 'indexedDB',
    'frames', 'self', 'parent', 'top', 'opener', 'window', 'globalThis',
    '__vmkGenieRoomDetectorInstalled', '__vmkGenieInventoryInstalled',
  ])
  const LATCH_RETRY_INTERVAL_MS = 1000
  const POLL_INTERVAL_MS = 250

  let latched = false
  let hookedKey = null
  let internalVarName = null
  let cachedMetaPath = null
  let lastSig = null

  function safeOwnNames(o) {
    try { return Object.getOwnPropertyNames(o) } catch (e) { return [] }
  }

  function looksLikeRoomMeta(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
    try {
      for (const k of ROOM_META_STABLE_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) return false
      }
      return typeof obj.public === 'boolean'
    } catch (e) { return false }
  }

  function findRoomMetaPath() {
    const names = safeOwnNames(window)
    const candidates = []
    for (const k of names) {
      if (SKIP_ROOT_KEYS.has(k)) continue
      let v
      try { v = window[k] } catch (e) { continue }
      if (v && typeof v === 'object' && !Array.isArray(v) && looksLikeRoomMeta(v)) {
        candidates.push(k)
      }
    }
    if (candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0]
    // If multiple candidates, prefer one with the obfuscated mine-key.
    for (const k of candidates) {
      try {
        const o = window[k]
        if (o && Object.prototype.hasOwnProperty.call(o, ROOM_META_MINE_KEY)
            && typeof o[ROOM_META_MINE_KEY] === 'boolean') {
          return k
        }
      } catch (e) {}
    }
    return candidates[0]
  }

  function readIsMine(meta) {
    if (!meta || typeof meta !== 'object') return false
    try {
      if (Object.prototype.hasOwnProperty.call(meta, ROOM_META_MINE_KEY)) {
        return meta[ROOM_META_MINE_KEY] === true
      }
    } catch (e) { return false }
    // Fallback: if the obfuscated key got renamed in a build, look for a
    // single non-`public` boolean — that's typically the mine flag.
    const names = safeOwnNames(meta)
    const bools = []
    for (const k of names) {
      if (k === 'public') continue
      try { if (typeof meta[k] === 'boolean') bools.push(k) } catch (e) {}
    }
    if (bools.length === 1) return meta[bools[0]] === true
    return false
  }

  function applyLatchHook() {
    if (latched) return true
    let names
    try { names = safeOwnNames(window) } catch (e) { return false }
    for (const prop of names) {
      if (SKIP_ROOT_KEYS.has(prop)) continue
      try {
        const fn = window[prop]
        if (typeof fn !== 'function' || fn._vmkGenieLatched) continue
        let body
        try { body = Function.prototype.toString.call(fn) } catch (e) { continue }
        const m = body.match(ROOM_LOADER_DISPOSE_PATTERN)
        if (!m) continue
        const varName = m[1]
        const original = fn
        const wrapper = function (...args) {
          const result = original.apply(this, args)
          try {
            if (this != null && this[varName]) {
              window.__vmkGenieRoom = this[varName]
            } else if (window[varName]) {
              window.__vmkGenieRoom = window[varName]
            }
          } catch (e) {}
          return result
        }
        wrapper._vmkGenieLatched = true
        window[prop] = wrapper
        latched = true
        hookedKey = prop
        internalVarName = varName
        return true
      } catch (e) {}
    }
    return false
  }

  function tick() {
    // Try to (re)latch if not yet done — the room loader may not exist on
    // window during very early page load.
    if (!latched) applyLatchHook()

    if (!cachedMetaPath) cachedMetaPath = findRoomMetaPath()
    let meta = null
    if (cachedMetaPath) {
      try { meta = window[cachedMetaPath] } catch (e) { meta = null }
      if (!meta || !looksLikeRoomMeta(meta)) {
        // Path went stale; rediscover next tick.
        cachedMetaPath = null
      }
    }

    let id = null, name = null, isMine = false, found = false
    if (meta) {
      found = true
      try { if (meta.id != null) id = meta.id } catch (e) {}
      try { if (meta.name != null) name = meta.name } catch (e) {}
      try { isMine = readIsMine(meta) } catch (e) {}
    }

    const sig = found ? `${id}::${name}::${isMine ? '1' : '0'}` : 'NONE'
    if (sig !== lastSig) {
      lastSig = sig
      const payload = found ? { id, name, isMine } : { id: null, name: null, isMine: false }
      try {
        window.postMessage({
          source: SOURCE,
          kind: 'roomChange',
          payload,
          debug: { latched, hookedKey, internalVarName, metaPath: cachedMetaPath },
        }, '*')
      } catch (e) {}
    }
  }

  // Initial latch attempt (the loader may already exist) and slow retry loop.
  applyLatchHook()
  setInterval(() => { if (!latched) applyLatchHook() }, LATCH_RETRY_INTERVAL_MS)
  setInterval(tick, POLL_INTERVAL_MS)
  // Kick once immediately so subscribers get the current state ASAP.
  tick()

  try {
    window.postMessage({ source: SOURCE, kind: 'ready' }, '*')
  } catch (e) {}
})()
