import {
  getComponentData,
  get3dStep,
  find3dModelInfo,
} from "./easyedaClient.js";
import {
  getDirectoryHandle,
  getLibraryName,
  getExportStructure,
  getSymbolFileMode,
} from "./storage.js";
import {
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

console.log("LCSC to KiCad background worker loaded v0.1.1");

function sanitizeFileName(name, fallback = "part") {
  const cleaned = String(name || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-.]/g, "_");
  return cleaned || fallback;
}

function getExportLayout(structure, libraryName) {
  if (structure === "split") {
    return {
      symbolDir: "symbols",
      symbolSharedFile: `symbols/${libraryName}.kicad_sym`,
      footprintDir: "footprint",
      modelDir: "footprint/packages3d",
      footprintLibraryName: "footprint",
      modelRefDir: "footprint/packages3d",
    };
  }

  return {
    symbolDir: "",
    symbolSharedFile: `${libraryName}.kicad_sym`,
    footprintDir: `${libraryName}.pretty`,
    modelDir: `${libraryName}.3dshapes`,
    footprintLibraryName: libraryName,
    modelRefDir: `${libraryName}.3dshapes`,
  };
}

function toPartIds(input) {
  const values = Array.isArray(input) ? input : [];
  const merged = values.join(" ");
  const matches = merged.match(/C\d{2,}/gi) || [];
  return [...new Set(matches.map((id) => id.toUpperCase()))];
}

async function assertWritableDirectory({ allowRequestPermission = false } = {}) {
  const dir = await getDirectoryHandle();
  if (!dir) {
    throw new Error("No output folder selected. Open extension popup and browse folder.");
  }

  let permission = await dir.queryPermission({ mode: "readwrite" });
  if (permission !== "granted" && allowRequestPermission) {
    permission = await dir.requestPermission({ mode: "readwrite" });
  }

  if (permission !== "granted") {
    throw new Error(
      "Folder write permission is missing. Open the extension popup and run import again to grant access."
    );
  }

  return dir;
}

async function importPart(baseDir, partId, libraryName, options, settings) {
  const cad = await getComponentData(partId);
  const outputFolderName = (baseDir?.name || "kicad_libs").replace(/\\/g, "/");
  const exportStructure = settings.exportStructure === "split" ? "split" : "current";
  const symbolFileMode = settings.symbolFileMode === "perPart" ? "perPart" : "shared";
  const layout = getExportLayout(exportStructure, libraryName);

  await writeTextFile(baseDir, `_easyeda_raw/${partId}.json`, JSON.stringify(cad, null, 2));

  const modelInfo = options.model3d ? find3dModelInfo(cad) : null;

  if (options.symbol) {
    if (symbolFileMode === "perPart") {
      const symbolVersion = 20231120;
      const { symbolName: normalizedSymbolName, symbolBlock } = buildSymbolForLibrary(
        partId,
        cad,
        layout.footprintLibraryName,
        symbolVersion
      );
      const symbolFilePath = layout.symbolDir
        ? `${layout.symbolDir}/${sanitizeFileName(normalizedSymbolName, partId)}.kicad_sym`
        : `${sanitizeFileName(normalizedSymbolName, partId)}.kicad_sym`;
      const oneSymbolLib = upsertSymbolInLib(
        createEmptySymbolLib(symbolVersion),
        normalizedSymbolName,
        symbolBlock
      );
      await writeTextFile(baseDir, symbolFilePath, oneSymbolLib);
    } else {
      let currentLib = "";
      try {
        currentLib = await readTextFile(baseDir, layout.symbolSharedFile);
      } catch {
        // File does not exist yet.
      }

      const currentVersion = readSymbolLibVersion(currentLib);
      const normalizedLib = currentLib || createEmptySymbolLib(currentVersion);
      const { symbolName: normalizedSymbolName, symbolBlock } = buildSymbolForLibrary(
        partId,
        cad,
        layout.footprintLibraryName,
        currentVersion
      );
      const mergedLib = upsertSymbolInLib(normalizedLib, normalizedSymbolName, symbolBlock);
      await writeTextFile(baseDir, layout.symbolSharedFile, mergedLib);
    }
  }

  if (options.footprint) {
    const modelRef = modelInfo
      ? {
          file: `\${KIPRJMOD}/${outputFolderName}/${layout.modelRefDir}/${modelInfo.name}.step`,
          translation: modelInfo.translation,
          rotation: {
            x: (360 - modelInfo.rotation.x) % 360,
            y: (360 - modelInfo.rotation.y) % 360,
            z: (360 - modelInfo.rotation.z) % 360,
          },
        }
      : null;
    const fp = buildMinimalFootprint(partId, cad, layout.footprintLibraryName, modelRef);
    await writeTextFile(baseDir, `${layout.footprintDir}/${fp.fpName}.kicad_mod`, fp.text);
  }

  if (options.model3d) {
    if (modelInfo?.uuid) {
      const stepBinary = await get3dStep(modelInfo.uuid);
      await writeBinaryFile(baseDir, `${layout.modelDir}/${modelInfo.name}.step`, stepBinary);
    }
  }
}

async function runImport(payload = {}, runtimeOptions = {}) {
  const baseDir = await assertWritableDirectory({
    allowRequestPermission: Boolean(runtimeOptions.allowRequestPermission),
  });
  const libraryName = (payload?.libraryName || (await getLibraryName()) || "easyeda2kicad").trim();
  const settings = {
    exportStructure:
      payload?.settings?.exportStructure || (await getExportStructure()) || "current",
    symbolFileMode: payload?.settings?.symbolFileMode || (await getSymbolFileMode()) || "shared",
  };

  const selectedAssets = {
    symbol: Boolean(payload?.options?.symbol),
    footprint: Boolean(payload?.options?.footprint),
    model3d: Boolean(payload?.options?.model3d),
  };

  if (!selectedAssets.symbol && !selectedAssets.footprint && !selectedAssets.model3d) {
    throw new Error("No assets selected.");
  }

  const partIds = toPartIds(payload?.partIds || []);
  if (!partIds.length) {
    throw new Error("No valid LCSC IDs provided.");
  }

  const results = [];
  for (const partId of partIds) {
    try {
      await importPart(baseDir, partId, libraryName, selectedAssets, settings);
      results.push({ ok: true, partId });
    } catch (error) {
      results.push({ ok: false, partId, error: error.message || String(error) });
    }
  }

  return results;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "IMPORT_PARTS") {
    runImport(message.payload, { allowRequestPermission: false })
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  }

  if (message?.type === "CONTENT_IMPORT_PART") {
    runImport({
      partIds: [message.payload?.partId],
      options: { symbol: true, footprint: true, model3d: true },
    }, { allowRequestPermission: true })
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
