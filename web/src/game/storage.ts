import type { GameState } from './types'

const DB_NAME = 'fishbowl_pwa'
const DB_VERSION = 1
const STORE = 'kv'
const KEY = 'game_v1'

type SavedPayload = {
  state: GameState
  savedAt: number
}

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key: string): Promise<unknown | null> {
  const db = await openDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function lsGet(): SavedPayload | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedPayload
  } catch {
    return null
  }
}

function lsSet(payload: SavedPayload): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

function lsDel(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export function isInProgressGame(state: GameState): boolean {
  // Any non-empty setup beyond the blank host screen counts.
  if (state.currentRound !== null) return state.screen !== 'final'
  if (state.players.length > 0) return true
  if (state.items.length > 0) return true
  return false
}

export async function loadSavedGame(): Promise<SavedPayload | null> {
  // Prefer IndexedDB; fallback to localStorage.
  if (idbAvailable()) {
    try {
      const payload = (await idbGet(KEY)) as SavedPayload | null
      if (!payload?.state) return null
      return payload
    } catch {
      // fallback below
    }
  }
  return lsGet()
}

export async function saveGame(state: GameState): Promise<void> {
  const payload: SavedPayload = { state, savedAt: Date.now() }
  if (idbAvailable()) {
    try {
      await idbSet(KEY, payload)
      return
    } catch {
      // fallback below
    }
  }
  lsSet(payload)
}

export async function clearSavedGame(): Promise<void> {
  if (idbAvailable()) {
    try {
      await idbDel(KEY)
    } catch {
      // ignore
    }
  }
  lsDel()
}

