import {
  getDirectoryHandle,
  saveDirectoryHandle,
  getLibraryName,
  saveLibraryName,
} from "./storage.js";

const folderStatusEl = document.getElementById("folderStatus");
const partInputEl = document.getElementById("partInput");
const libraryNameEl = document.getElementById("libraryName");
const importManualBtn = document.getElementById("importManualBtn");
const importCurrentBtn = document.getElementById("importCurrentBtn");
const pickFolderBtn = document.getElementById("pickFolderBtn");
const logEl = document.getElementById("log");

const optSymbolEl = document.getElementById("optSymbol");
const optFootprintEl = document.getElementById("optFootprint");
const opt3dEl = document.getElementById("opt3d");

function appendLog(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function parsePartIds(rawInput) {
  const allMatches = rawInput.match(/C\d{2,}/gi) || [];
  return [...new Set(allMatches.map((id) => id.toUpperCase()))];
}

async function refreshFolderStatus() {
  const folderHandle = await getDirectoryHandle();
  folderStatusEl.textContent = folderHandle
    ? `Selected: ${folderHandle.name}`
    : "No folder selected";
}

async function runImport(partIds) {
  if (!partIds.length) {
    appendLog("No valid LCSC IDs found.");
    return;
  }

  const hasAtLeastOneAsset =
    optSymbolEl.checked || optFootprintEl.checked || opt3dEl.checked;

  if (!hasAtLeastOneAsset) {
    appendLog("Select at least one asset: Symbol, Footprint, or 3D.");
    return;
  }

  const folderHandle = await getDirectoryHandle();
  if (!folderHandle) {
    appendLog("Select an output folder first.");
    return;
  }

  const libraryName = (libraryNameEl.value || "easyeda2kicad").trim();
  await saveLibraryName(libraryName);

  appendLog(`Import started for ${partIds.length} part(s)...`);

  importManualBtn.disabled = true;
  importCurrentBtn.disabled = true;

  const response = await chrome.runtime.sendMessage({
    type: "IMPORT_PARTS",
    payload: {
      partIds,
      libraryName,
      options: {
        symbol: optSymbolEl.checked,
        footprint: optFootprintEl.checked,
        model3d: opt3dEl.checked,
      },
    },
  });

  importManualBtn.disabled = false;
  importCurrentBtn.disabled = false;

  if (!response?.ok) {
    appendLog(`Error: ${response?.error || "Unknown error"}`);
    return;
  }

  for (const result of response.results || []) {
    if (result.ok) {
      appendLog(`OK ${result.partId}`);
    } else {
      appendLog(`FAIL ${result.partId}: ${result.error}`);
    }
  }

  appendLog("Import finished.");
}

pickFolderBtn.addEventListener("click", async () => {
  try {
    const folder = await window.showDirectoryPicker({ mode: "readwrite" });
    await saveDirectoryHandle(folder);
    appendLog(`Folder selected: ${folder.name}`);
    await refreshFolderStatus();
  } catch (error) {
    appendLog(`Folder selection canceled or failed: ${error.message}`);
  }
});

importManualBtn.addEventListener("click", async () => {
  const partIds = parsePartIds(partInputEl.value || "");
  await runImport(partIds);
});

importCurrentBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const fromUrl = tab?.url?.match(/C\d{2,}/i)?.[0]?.toUpperCase() || null;

  let fromPage = null;
  try {
    const contentResp = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_DETECTED_PART",
    });
    fromPage = contentResp?.partId || null;
  } catch {
    fromPage = null;
  }

  const partId = fromPage || fromUrl;
  if (!partId) {
    appendLog("No LCSC part ID found on current tab.");
    return;
  }

  await runImport([partId]);
});

(async function init() {
  const libraryName = await getLibraryName();
  if (libraryName) {
    libraryNameEl.value = libraryName;
  }
  await refreshFolderStatus();
  appendLog("Ready.");
})();
