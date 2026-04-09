async function ensureSubdir(baseHandle, folderName) {
  return baseHandle.getDirectoryHandle(folderName, { create: true });
}

async function ensurePath(baseHandle, relativePathParts) {
  if (relativePathParts.length === 1) {
    return { dir: baseHandle, fileName: relativePathParts[0] };
  }

  let current = baseHandle;
  for (const part of relativePathParts.slice(0, -1)) {
    current = await ensureSubdir(current, part);
  }

  return { dir: current, fileName: relativePathParts[relativePathParts.length - 1] };
}

export async function writeTextFile(baseHandle, relativePath, text) {
  const parts = relativePath.split("/").filter(Boolean);
  const { dir, fileName } = await ensurePath(baseHandle, parts);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function writeBinaryFile(baseHandle, relativePath, bytes) {
  const parts = relativePath.split("/").filter(Boolean);
  const { dir, fileName } = await ensurePath(baseHandle, parts);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

export async function ensureKiCadLayout(baseHandle, libraryName) {
  const prettyDirName = `${libraryName}.pretty`;
  const shapesDirName = `${libraryName}.3dshapes`;

  await ensureSubdir(baseHandle, prettyDirName);
  await ensureSubdir(baseHandle, shapesDirName);

  return {
    symbolFile: `${libraryName}.kicad_sym`,
    prettyDir: prettyDirName,
    shapesDir: shapesDirName,
  };
}
