/* PIXAGAVE — 永続化層
 * ゲーム状態は localStorage、画像(元写真 / スプライト)は IndexedDB。
 * 画像を localStorage に入れると 5MB 制限を即座に超えるため分離している。
 */

const DB_NAME = 'pixagave';
const DB_VERSION = 1;
const IMG_STORE = 'images';
const SAVE_KEY = 'pixagave.save.v1';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IMG_STORE)) {
        db.createObjectStore(IMG_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/* IndexedDB が使えない環境(プライベートモード等)向けのメモリフォールバック */
const memoryImages = new Map();

export async function putImage(key, dataUrl) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readwrite');
      tx.objectStore(IMG_STORE).put(dataUrl, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryImages.set(key, dataUrl);
  }
  return key;
}

export async function getImage(key) {
  if (!key) return null;
  if (memoryImages.has(key)) return memoryImages.get(key);
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IMG_STORE, 'readonly');
      const req = tx.objectStore(IMG_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function deleteImage(key) {
  memoryImages.delete(key);
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction(IMG_STORE, 'readwrite');
      tx.objectStore(IMG_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    /* noop */
  }
}

export async function allImageKeys() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(IMG_STORE, 'readonly');
      const req = tx.objectStore(IMG_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [...memoryImages.keys()];
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('[pixagave] save failed', err);
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* noop */
  }
}

/* 書き出し: 状態 + 画像をひとつの JSON にまとめる(機種変更・バックアップ用) */
export async function exportAll(state) {
  const keys = await allImageKeys();
  const images = {};
  for (const k of keys) {
    const v = await getImage(k);
    if (v) images[k] = v;
  }
  return JSON.stringify({ format: 'pixagave-export', version: 1, state, images });
}

export async function importAll(json) {
  const parsed = JSON.parse(json);
  if (parsed.format !== 'pixagave-export') throw new Error('形式が違います');
  for (const [k, v] of Object.entries(parsed.images || {})) {
    await putImage(k, v);
  }
  writeSave(parsed.state);
  return parsed.state;
}

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
