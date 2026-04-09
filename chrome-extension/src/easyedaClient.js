const API_ENDPOINT = "https://easyeda.com/api/products/{lcsc_id}/components";
const ENDPOINT_3D_MODEL = "https://modules.easyeda.com/3dmodel/{uuid}";
const ENDPOINT_3D_MODEL_STEP = "https://modules.easyeda.com/qAxj6KHrDKw4blvCG8QJPs7Y/{uuid}";

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
