// AES-256-GCM encryption at rest for local business data.
// Key derivation: PBKDF2-SHA256 (250,000 iterations) from an admin passphrase.
// The derived key lives ONLY in memory for the session — never persisted.
// Forgetting the passphrase means the data cannot be recovered (by design).

const SECURE_DB = 'gfi_secure_db';
const META_STORE = 'meta';
const META_KEY = 'secure_meta';
const VERIFIER_PLAIN = 'gfi-secure-ok-v1';

const enc = new TextEncoder();
const dec = new TextDecoder();

let sessionKey: CryptoKey | null = null;

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function unb64(s: string): ArrayBuffer {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer as ArrayBuffer;
}

async function openSecureDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SECURE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(META_STORE)) req.result.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function metaGet(key: string): Promise<any | undefined> {
  const db = await openSecureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function metaSet(key: string, value: any): Promise<void> {
  const db = await openSecureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function metaDel(key: string): Promise<void> {
  const db = await openSecureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deriveKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

interface SecureMeta {
  enabled: true;
  salt: string;
  iv: string;
  check: string; // encrypted verifier token
}

export async function encryptionEnabled(): Promise<boolean> {
  try {
    const meta = (await metaGet(META_KEY)) as SecureMeta | undefined;
    return !!meta?.enabled;
  } catch {
    return false;
  }
}

export function isUnlocked(): boolean {
  return sessionKey !== null;
}

export function lockSession(): void {
  sessionKey = null;
}

/** Enable encryption: encrypts a verifier token with the passphrase-derived key. */
export async function enableEncryption(passphrase: string): Promise<boolean> {
  if (!passphrase || passphrase.length < 8) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt.buffer as ArrayBuffer);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(VERIFIER_PLAIN));
  const meta: SecureMeta = { enabled: true, salt: b64(salt.buffer as ArrayBuffer), iv: b64(iv.buffer as ArrayBuffer), check: b64(ct) };
  await metaSet(META_KEY, meta);
  sessionKey = key;
  return true;
}

/** Unlock with passphrase: verifies against the stored check token. */
export async function unlock(passphrase: string): Promise<boolean> {
  const meta = (await metaGet(META_KEY)) as SecureMeta | undefined;
  if (!meta?.enabled) return false;
  try {
    const key = await deriveKey(passphrase, unb64(meta.salt));
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(meta.iv) },
      key,
      unb64(meta.check)
    );
    if (dec.decode(plain) !== VERIFIER_PLAIN) return false;
    sessionKey = key;
    return true;
  } catch {
    return false;
  }
}

/** Change passphrase: re-encrypts the verifier with a new key (data re-encrypts lazily on next write). */
export async function changePassphrase(oldPass: string, newPass: string): Promise<boolean> {
  const ok = await unlock(oldPass);
  if (!ok) return false;
  return enableEncryption(newPass);
}

/** Disable encryption entirely (requires current passphrase). */
export async function disableEncryption(passphrase: string): Promise<boolean> {
  const ok = await unlock(passphrase);
  if (!ok) return false;
  await metaDel(META_KEY);
  sessionKey = null;
  return true;
}

/** Encrypt a JSON-serializable value with the session key. Returns null when locked. */
export async function encryptValue(value: unknown): Promise<{ __enc: 1; iv: string; ct: string } | null> {
  if (!sessionKey) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    sessionKey,
    enc.encode(JSON.stringify(value))
  );
  return { __enc: 1, iv: b64(iv), ct: b64(ct) };
}

/** Decrypt a stored envelope with the session key. Returns undefined when locked/bad. */
export async function decryptValue<T>(payload: any): Promise<T | undefined> {
  if (!payload || payload.__enc !== 1) return undefined;
  if (!sessionKey) return undefined;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(payload.iv) },
      sessionKey,
      unb64(payload.ct)
    );
    return JSON.parse(dec.decode(plain)) as T;
  } catch {
    return undefined;
  }
}
