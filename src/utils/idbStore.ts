// Tiny IndexedDB key/value store — used for large datasets (delivery sheets with
// embedded images, uploaded source files) that exceed localStorage's ~5 MB quota.
const DB_NAME = 'gfi_erp_db';
const STORE = 'kv';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDB();
    const raw = await new Promise<any | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return raw as T | undefined;
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch (e) {
    console.warn('IndexedDB save failed:', e);
    return false;
  }
}

/** Migrate a legacy localStorage payload into IndexedDB (once), then clear the LS key. */
export async function migrateFromLS<T>(key: string): Promise<T | undefined> {
  const fromIdb = await idbGet<T>(key);
  if (fromIdb !== undefined) return fromIdb;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as T;
      await idbSet(key, parsed);
      localStorage.removeItem(key);
      return parsed;
    }
  } catch {}
  return undefined;
}

/** Close the cached connection (needed before deleteDatabase can succeed). */
export function idbCloseAll(): void {
  if (dbPromise) {
    dbPromise.then(db => db.close()).catch(() => {});
    dbPromise = null;
  }
}

/** Wipe ALL business data (both app databases + legacy localStorage keys), then reload. */
export async function wipeAllBusinessData(): Promise<void> {
  idbCloseAll();
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => {
      console.warn('wipe: blocked by another open tab — close other app tabs');
      setTimeout(resolve, 800);
    };
  });
  try {
    ['gfi_customer_accounts_v1', 'gfi_pending_deliveries_v1', 'gfi_pending_delivery_files_v1',
     'gfi_packing_master_v3', 'gfi_stock_status_11_10_2026', 'gfi_production_v1'].forEach(k => localStorage.removeItem(k));
  } catch {}
  // also try the secondary database if it exists
  await new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase('gfi_secure_db');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => setTimeout(resolve, 500);
  });
}
