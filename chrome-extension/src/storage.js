const DB_NAME = "lcsc-kicad-extension";
const DB_VERSION = 1;
const HANDLE_STORE = "folder_handles";
const DIRECTORY_HANDLE_KEY = "output_dir";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDb();
  try {
    const tx = db.transaction(HANDLE_STORE, mode);
    const store = tx.objectStore(HANDLE_STORE);
    const result = await callback(store);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

function readRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDirectoryHandle(handle) {
  await withStore("readwrite", (store) => readRequest(store.put(handle, DIRECTORY_HANDLE_KEY)));
}

export async function getDirectoryHandle() {
  return withStore("readonly", (store) => readRequest(store.get(DIRECTORY_HANDLE_KEY)));
}

export async function saveLibraryName(libraryName) {
  await chrome.storage.local.set({ libraryName });
}

export async function getLibraryName() {
  const data = await chrome.storage.local.get("libraryName");
  return data.libraryName || "easyeda2kicad";
}

export async function saveExportStructure(structure) {
  await chrome.storage.local.set({ exportStructure: structure });
}

export async function getExportStructure() {
  const data = await chrome.storage.local.get("exportStructure");
  return data.exportStructure || "current";
}

export async function saveSymbolFileMode(mode) {
  await chrome.storage.local.set({ symbolFileMode: mode });
}

export async function getSymbolFileMode() {
  const data = await chrome.storage.local.get("symbolFileMode");
  return data.symbolFileMode || "shared";
}
