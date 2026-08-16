const DB_VERSION = 1
const STORE = 'kv'

function dbName(userId: string) {
  return `personal-workbench:${userId}`
}

function openDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(dbName(userId), DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

export async function getLocalValue<T>(userId: string, key: string): Promise<T | undefined> {
  const db = await openDb(userId)
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'))
    })
  } finally {
    db.close()
  }
}

export async function setLocalValue<T>(userId: string, key: string, value: T): Promise<void> {
  const db = await openDb(userId)
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'))
    })
  } finally {
    db.close()
  }
}

export async function deleteLocalValue(userId: string, key: string): Promise<void> {
  const db = await openDb(userId)
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
    })
  } finally {
    db.close()
  }
}

export async function listLocalValues<T>(userId: string, prefix: string): Promise<Array<{ key: string; value: T }>> {
  const db = await openDb(userId)
  try {
    return await new Promise((resolve, reject) => {
      const result: Array<{ key: string; value: T }> = []
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve(result)
          return
        }
        const key = String(cursor.key)
        if (key.startsWith(prefix)) result.push({ key, value: cursor.value as T })
        cursor.continue()
      }
      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'))
    })
  } finally {
    db.close()
  }
}

export async function clearUserLocalData(userId: string): Promise<void> {
  if (!('indexedDB' in window)) return
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName(userId))
    request.onsuccess = () => resolve()
    request.onblocked = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('IndexedDB cleanup failed'))
  }).catch(() => undefined)
}

export const localKeys = {
  queryCache: 'query-cache:v1',
  syncState: 'sync-state:v1',
  outboxPrefix: 'outbox:v1:',
  commandPrefix: 'command:v2:',
  syncHistoryPrefix: 'sync-history:v2:',
  syncMetadata: 'sync-metadata:v2',
  notificationReceiptPrefix: 'notification:v1:',
  avatar: (path: string) => `avatar:v1:${path}`
}
