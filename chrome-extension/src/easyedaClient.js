const API_ENDPOINT = "https://easyeda.com/api/products/{lcsc_id}/components";
const ENDPOINT_3D_MODEL = "https://modules.easyeda.com/3dmodel/{uuid}";
const ENDPOINT_3D_MODEL_STEP = "https://modules.easyeda.com/qAxj6KHrDKw4blvCG8QJPs7Y/{uuid}";
const CANVAS_SCALE = 0.254;
const OUTLINE_FIX_THRESHOLD = 0.1;

function safeFloat(value, fallback = 0) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

async function readResponseMaybeGzip(response) {
  const buf = await response.arrayBuffer();
  const bytes = new Uint8Array(buf);

  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) {
    return new TextDecoder().decode(bytes);
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error("Gzip response needs DecompressionStream support in this browser.");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const decompressed = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(new Uint8Array(decompressed));
}

export async function getComponentData(lcscId) {
  const url = API_ENDPOINT.replace("{lcsc_id}", encodeURIComponent(lcscId));
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Encoding": "gzip, deflate",
      "Referer": "https://easyeda.com/",
      "User-Agent": "Mozilla/5.0 Chrome Extension",
    },
  });

  if (!response.ok) {
    throw new Error(`EasyEDA API failed (${response.status}) for ${lcscId}`);
  }

  const text = await readResponseMaybeGzip(response);
  const payload = JSON.parse(text);

  if (!payload || payload.success === false || !payload.result) {
    throw new Error(`Invalid component payload for ${lcscId}`);
  }

  return payload.result;
}

export function find3dModelUuid(candidate) {
  const info = find3dModelInfo(candidate);
  if (info?.uuid) {
    return info.uuid;
  }

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const stack = [candidate];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (
        typeof value === "string" &&
        key.toLowerCase().includes("uuid") &&
        /^[0-9a-f]{24,64}$/i.test(value)
      ) {
        return value;
      }

      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return null;
}

function getCanvasOrigin(cadData) {
  const dataStr = cadData?.packageDetail?.dataStr || {};
  const canvas = String(dataStr.canvas || "");
  const canvasParts = canvas.split("~");
  if (canvasParts.length > 17) {
    return {
      x: safeFloat(canvasParts[16]),
      y: safeFloat(canvasParts[17]),
    };
  }

  return {
    x: safeFloat(dataStr?.head?.x),
    y: safeFloat(dataStr?.head?.y),
  };
}

function getOutlineCentreMm(node, canvasOrigin) {
  const childNodes = Array.isArray(node?.childNodes) ? node.childNodes : [];
  const xs = [];
  const ys = [];

  for (const child of childNodes) {
    const points = String(child?.attrs?.points || "").split(/\s+/).filter(Boolean);
    for (let i = 0; i + 1 < points.length; i += 2) {
      xs.push((safeFloat(points[i]) - canvasOrigin.x) * CANVAS_SCALE);
      ys.push(-(safeFloat(points[i + 1]) - canvasOrigin.y) * CANVAS_SCALE);
    }
  }

  if (!xs.length) {
    return null;
  }

  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function parse3dModelInfoNode(node, canvasOrigin) {
  const attrs = node?.attrs || {};
  const cOrigin = String(attrs.c_origin || "0,0").split(",");
  const cRotation = String(attrs.c_rotation || "0,0,0").split(",");

  let tx = (safeFloat(cOrigin[0]) - canvasOrigin.x) * CANVAS_SCALE;
  let ty = -(safeFloat(cOrigin[1]) - canvasOrigin.y) * CANVAS_SCALE;
  const tz = safeFloat(attrs.z) * CANVAS_SCALE;

  const outline = getOutlineCentreMm(node, canvasOrigin);
  if (outline) {
    if (
      Math.abs(outline.x - tx) > OUTLINE_FIX_THRESHOLD ||
      Math.abs(outline.y - ty) > OUTLINE_FIX_THRESHOLD
    ) {
      tx = outline.x;
      ty = outline.y;
    }
  }

  const uuid = String(attrs.uuid || "");
  const name = String(attrs.title || "").trim();
  if (!uuid || !name) {
    return null;
  }

  return {
    uuid,
    name,
    translation: { x: tx, y: ty, z: tz },
    rotation: {
      x: safeFloat(cRotation[0]),
      y: safeFloat(cRotation[1]),
      z: safeFloat(cRotation[2]),
    },
  };
}

export function find3dModelInfo(cadData) {
  const shapeLines = cadData?.packageDetail?.dataStr?.shape;
  if (!Array.isArray(shapeLines)) {
    return null;
  }

  const canvasOrigin = getCanvasOrigin(cadData);
  for (const line of shapeLines) {
    const parts = String(line).split("~");
    if (parts[0] !== "SVGNODE" || !parts[1]) {
      continue;
    }

    try {
      const node = JSON.parse(parts[1]);
      const info = parse3dModelInfoNode(node, canvasOrigin);
      if (info) {
        return info;
      }
    } catch {
      // Ignore malformed SVGNODE and continue scanning.
    }
  }

  return null;
}

export async function get3dObj(uuid) {
  const url = ENDPOINT_3D_MODEL.replace("{uuid}", encodeURIComponent(uuid));
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`3D OBJ fetch failed (${response.status}) for ${uuid}`);
  }
  return readResponseMaybeGzip(response);
}

export async function get3dStep(uuid) {
  const url = ENDPOINT_3D_MODEL_STEP.replace("{uuid}", encodeURIComponent(uuid));
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`3D STEP fetch failed (${response.status}) for ${uuid}`);
  }
  return response.arrayBuffer();
}
