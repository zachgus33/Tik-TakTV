type Entry<T> = { savedAt: number; value: T };

const database = "nuvio-live-cache";
const store = "entries";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readLiveCache<T>(
  key: string,
  maxAge = 24 * 60 * 60_000,
): Promise<T | null> {
  if (!("indexedDB" in window)) return null;
  try {
    const db = await open();
    const entry = await new Promise<Entry<T> | undefined>((resolve, reject) => {
      const transaction = db.transaction(store, "readonly");
      const request = transaction.objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return entry && Date.now() - entry.savedAt < maxAge ? entry.value : null;
  } catch {
    return null;
  }
}

export async function writeLiveCache(key: string, value: unknown) {
  if (!("indexedDB" in window)) return;
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(store, "readwrite");
      transaction.objectStore(store).put({ savedAt: Date.now(), value }, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    // Private browsing and storage pressure must not prevent live television.
  }
}
