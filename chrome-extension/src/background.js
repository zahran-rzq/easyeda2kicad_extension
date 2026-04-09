import {
  getComponentData,
  get3dObj,
  get3dStep,
  find3dModelUuid,
} from "./easyedaClient.js";
import { getDirectoryHandle, getLibraryName } from "./storage.js";
import {
  ensureKiCadLayout,
  readTextFile,
  writeBinaryFile,
  writeTextFile,
} from "./fileWriter.js";
import {
  buildSymbolForLibrary,
  createEmptySymbolLib,
  readSymbolLibVersion,
  upsertSymbolInLib,
} from "./converters/symbol.js";
import { buildMinimalFootprint } from "./converters/footprint.js";

function toPartIds(input) {
  const values = Array.isArray(input) ? input : [];
  const merged = values.join(" ");
  const matches = merged.match(/C\d{2,}/gi) || [];
  return [...new Set(matches.map((id) => id.toUpperCase()))];
}

async function assertWritableDirectory() {
  const dir = await getDirectoryHandle();
  if (!dir) {
    throw new Error("No output folder selected. Open extension popup and browse folder.");
  }

  const permission = await dir.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    throw new Error(
      "Folder write permission is missing. Open the extension popup and run import again to grant access."
    );
  }

  return dir;
}

async function importPart(baseDir, partId, libraryName, options) {
  const cad = await getComponentData(partId);
  const layout = await ensureKiCadLayout(baseDir, libraryName);

  await writeTextFile(baseDir, `_easyeda_raw/${partId}.json`, JSON.stringify(cad, null, 2));

  const symbolName = cad?.dataStr?.head?.c_para?.name || partId;

  if (options.symbol) {
    let currentLib = "";
    try {
      currentLib = await readTextFile(baseDir, layout.symbolFile);
    } catch {
      // File does not exist yet.
    }

    const symbolVersion = readSymbolLibVersion(currentLib);
    const normalizedLib = currentLib || createEmptySymbolLib(symbolVersion);
    const { symbolName: normalizedSymbolName, symbolBlock } = buildSymbolForLibrary(
      partId,
      cad,
      libraryName,
      symbolVersion
    );

    const mergedLib = upsertSymbolInLib(normalizedLib, normalizedSymbolName, symbolBlock);
    await writeTextFile(baseDir, layout.symbolFile, mergedLib);
  }

  if (options.footprint) {
    const modelRef = `${libraryName}.3dshapes/${symbolName}.wrl`;
    const fp = buildMinimalFootprint(partId, cad, libraryName, options.model3d ? modelRef : null);
    await writeTextFile(baseDir, `${layout.prettyDir}/${fp.fpName}.kicad_mod`, fp.text);
  }

  if (options.model3d) {
    const uuid = find3dModelUuid(cad);
    if (uuid) {
      const [objText, stepBinary] = await Promise.all([get3dObj(uuid), get3dStep(uuid)]);
      await writeTextFile(baseDir, `${layout.shapesDir}/${symbolName}.obj`, objText);
      await writeBinaryFile(baseDir, `${layout.shapesDir}/${symbolName}.step`, stepBinary);
    }
  }
}

async function runImport(payload) {
  const baseDir = await assertWritableDirectory();
  const libraryName = (payload.libraryName || (await getLibraryName()) || "easyeda2kicad").trim();

  const options = {
    symbol: Boolean(payload.options?.symbol),
    footprint: Boolean(payload.options?.footprint),
    model3d: Boolean(payload.options?.model3d),
  };

  if (!options.symbol && !options.footprint && !options.model3d) {
    throw new Error("No assets selected.");
  }

  const partIds = toPartIds(payload.partIds || []);
  if (!partIds.length) {
    throw new Error("No valid LCSC IDs provided.");
  }

  const results = [];
  for (const partId of partIds) {
    try {
      await importPart(baseDir, partId, libraryName, options);
      results.push({ ok: true, partId });
    } catch (error) {
      results.push({ ok: false, partId, error: error.message || String(error) });
    }
  }

  return results;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "IMPORT_PARTS") {
    runImport(message.payload)
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === "CONTENT_IMPORT_PART") {
    runImport({
      partIds: [message.payload?.partId],
      options: { symbol: true, footprint: true, model3d: true },
    })
      .then((results) => {
        const failed = results.find((entry) => !entry.ok);
        if (failed) {
          sendResponse({ ok: false, error: failed.error || "Import failed" });
          return;
        }
        sendResponse({ ok: true, results });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  return false;
});
