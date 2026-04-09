const KICAD_SYM_VERSIONS = [20211014, 20220914, 20230620, 20231120, 20241209, 20251024];
const EASYEDA_SYMBOL_GRID_PX = 5;

function safeFloat(value, fallback = 0) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function safeBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["true", "1", "yes", "on", "show"].includes(value.toLowerCase());
  }

  return Boolean(value);
}

function pxToMm(dim) {
  return 10 * safeFloat(dim) * 0.0254;
}

function pxToMmGrid(dim, grid = 1.27) {
  const mmValue = pxToMm(dim);
  return Math.round(mmValue / grid) * grid;
}

function snapBbox(bbox, gridPx = EASYEDA_SYMBOL_GRID_PX) {
  return {
    x: Math.round(safeFloat(bbox?.x) / gridPx) * gridPx,
    y: Math.round(safeFloat(bbox?.y) / gridPx) * gridPx,
  };
}

function sanitizeComponentName(name) {
  let cleaned = String(name || "").trim();
  const paren = cleaned.indexOf("(");
  const bracket = cleaned.indexOf("[");
  const cutPositions = [paren, bracket].filter((v) => v >= 0);
  if (cutPositions.length > 0) {
    const cutAt = Math.min(...cutPositions);
    cleaned = cleaned.slice(0, cutAt).trim();
  }
  return cleaned;
}

function sanitizeFootprintName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_\-.]/g, "_");
}

function chooseFootprintName(partId, cadData) {
  const para = cadData?.packageDetail?.dataStr?.head?.c_para || {};
  const candidates = [
    para.package,
    cadData?.packageDetail?.title,
    cadData?.package,
    cadData?.title,
    partId,
  ];

  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) {
      return sanitizeFootprintName(candidate);
    }
  }

  return sanitizeFootprintName(partId);
}

function escapeKiCadText(input) {
  return String(input || "").replace(/"/g, "'");
}

function chooseSymbolName(partId, cadData) {
  const candidates = [
    cadData?.dataStr?.head?.c_para?.name,
    cadData?.name,
    cadData?.title,
    cadData?.display_title,
    partId,
  ];

  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) {
      return sanitizeComponentName(candidate).replace(/\s+/g, "_");
    }
  }

  return partId;
}

function mapPinType(value) {
  const pinType = safeInt(value, 0);
  switch (pinType) {
    case 1:
      return "input";
    case 2:
      return "output";
    case 3:
      return "bidirectional";
    case 4:
      return "power_in";
    default:
      return "unspecified";
  }
}

function pinStyle(dotDisplayed, clockDisplayed) {
  if (dotDisplayed && clockDisplayed) {
    return "inverted_clock";
  }
  if (dotDisplayed) {
    return "inverted";
  }
  if (clockDisplayed) {
    return "clock";
  }
  return "line";
}

function parsePin(line) {
  const segments = String(line || "").split("^^").map((item) => item.split("~"));
  const settings = segments[0] || [];
  const dot = segments[1] || [];
  const path = segments[2] || [];
  const name = segments[3] || [];
  const num = segments[4] || [];
  const dotBis = segments[5] || [];
  const clock = segments[6] || [];

  let lengthPx = 0;
  const pinPath = String(path[0] || "").replace(/v/g, "h");
  const match = pinPath.match(/h\s*(-?[\d.]+)/i);
  if (match) {
    lengthPx = Math.abs(safeFloat(match[1], 0));
  }

  const pinNumber = String(num[4] || settings[3] || "").replace(/\s+/g, "");
  const pinName = String(name[4] || "").replace(/\s+/g, "");

  return {
    posX: safeFloat(settings[4]),
    posY: safeFloat(settings[5]),
    rotation: safeInt(settings[6]),
    pinType: mapPinType(settings[2]),
    pinNumber,
    pinName,
    lengthPx,
    dotDisplayed: safeBool(dotBis[0], false),
    clockDisplayed: safeBool(clock[0], false),
  };
}

function parseRectangle(parts) {
  if (parts.length < 6) {
    return null;
  }

  let posX = safeFloat(parts[0]);
  let posY = safeFloat(parts[1]);
  let width = 0;
  let height = 0;

  if (parts[2] === "" && parts[3] === "") {
    width = safeFloat(parts[4]);
    height = safeFloat(parts[5]);
  } else {
    width = safeFloat(parts[4]);
    height = safeFloat(parts[5]);
  }

  return { posX, posY, width, height };
}

function parsePolylinePoints(pointsText, bbox, closePath = false) {
  const raw = String(pointsText || "").trim().split(/\s+/);
  if (raw.length < 4) {
    return null;
  }

  const points = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const x = pxToMm(safeFloat(raw[i]) - bbox.x);
    const y = -pxToMm(safeFloat(raw[i + 1]) - bbox.y);
    points.push([x, y]);
  }

  if (closePath && points.length > 1) {
    const [x0, y0] = points[0];
    const [xn, yn] = points[points.length - 1];
    if (x0 !== xn || y0 !== yn) {
      points.push([x0, y0]);
    }
  }

  return points;
}

function parseSymbolData(cadData) {
  const shapes = Array.isArray(cadData?.dataStr?.shape) ? cadData.dataStr.shape : [];
  const rawBbox = cadData?.dataStr?.BBox || {};
  const bbox = snapBbox({ x: safeFloat(rawBbox.x), y: safeFloat(rawBbox.y) });

  const parsed = {
    bbox,
    pins: [],
    rectangles: [],
    circles: [],
    polylines: [],
    polygons: [],
    texts: [],
  };

  for (const shape of shapes) {
    const chunks = String(shape).split("~");
    const designator = chunks[0];
    const fields = chunks.slice(1);

    if (designator === "P") {
      parsed.pins.push(parsePin(shape));
      continue;
    }

    if (designator === "R") {
      const rect = parseRectangle(fields);
      if (rect) {
        parsed.rectangles.push(rect);
      }
      continue;
    }

    if (designator === "C") {
      if (fields.length >= 3) {
        parsed.circles.push({
          cx: safeFloat(fields[0]),
          cy: safeFloat(fields[1]),
          r: safeFloat(fields[2]),
          filled: fields[6] && fields[6].toLowerCase() !== "none",
        });
      }
      continue;
    }

    if (designator === "PL") {
      const points = parsePolylinePoints(fields[0], bbox, false);
      if (points) {
        parsed.polylines.push(points);
      }
      continue;
    }

    if (designator === "PG") {
      const points = parsePolylinePoints(fields[0], bbox, true);
      if (points) {
        parsed.polygons.push(points);
      }
      continue;
    }

    if (designator === "T") {
      if (fields.length >= 12 && fields[11]) {
        const fontRaw = String(fields[6] || "");
        const fontPt = fontRaw.includes("pt") ? safeFloat(fontRaw.replace("pt", ""), 7) : safeFloat(fontRaw, 7);
        parsed.texts.push({
          text: fields[11],
          x: safeFloat(fields[1]),
          y: safeFloat(fields[2]),
          rotation: safeFloat(fields[3]),
          fontSizeMm: Math.round(fontPt * 0.3528 * 1000) / 1000,
        });
      }
    }
  }

  return parsed;
}

function renderProperty(name, value, y, { hide = false, id = null, version = 20231120 } = {}) {
  const idLine = version < 20220914 && id !== null ? `\n      (id ${id})` : "";
  const hideLegacy = hide && version < 20251024 ? " hide" : "";
  const hideNew = hide && version >= 20251024 ? "\n      (hide yes)" : "";
  return `    (property "${escapeKiCadText(name)}" "${escapeKiCadText(value)}"${idLine}\n      (at 0 ${y.toFixed(2)} 0)${hideNew}\n      (effects (font (size 1.27 1.27))${hideLegacy})\n    )`;
}

function renderPin(pin, bbox) {
  const orientation = (180 + safeInt(pin.rotation, 0)) % 360;
  const x = pxToMmGrid(pin.posX - bbox.x);
  const y = -pxToMmGrid(pin.posY - bbox.y);
  const length = pxToMmGrid(pin.lengthPx || 10);
  const style = pinStyle(pin.dotDisplayed, pin.clockDisplayed);

  return `      (pin ${pin.pinType} ${style}\n        (at ${x.toFixed(2)} ${y.toFixed(2)} ${orientation})\n        (length ${length.toFixed(2)})\n        (name "${escapeKiCadText(pin.pinName || "~")}" (effects (font (size 1.27 1.27))))\n        (number "${escapeKiCadText(pin.pinNumber || "0")}" (effects (font (size 1.27 1.27))))\n      )`;
}

function renderRectangle(rect, bbox) {
  const x0 = pxToMm(rect.posX - bbox.x);
  const y0 = -pxToMm(rect.posY - bbox.y);
  const x1 = x0 + pxToMm(rect.width);
  const y1 = y0 - pxToMm(rect.height);
  return `      (rectangle (start ${x0.toFixed(2)} ${y0.toFixed(2)}) (end ${x1.toFixed(2)} ${y1.toFixed(2)})\n        (stroke (width 0) (type default))\n        (fill (type background))\n      )`;
}

function renderCircle(circle, bbox) {
  const cx = pxToMm(circle.cx - bbox.x);
  const cy = -pxToMm(circle.cy - bbox.y);
  const radius = pxToMm(circle.r);
  const fill = circle.filled ? "background" : "none";
  return `      (circle\n        (center ${cx.toFixed(2)} ${cy.toFixed(2)})\n        (radius ${radius.toFixed(2)})\n        (stroke (width 0) (type default))\n        (fill (type ${fill}))\n      )`;
}

function renderPolyline(points, closed = false) {
  const pts = points.map(([x, y]) => `(xy ${x.toFixed(2)} ${y.toFixed(2)})`).join(" ");
  const fill = closed ? "background" : "none";
  return `      (polyline\n        (pts ${pts})\n        (stroke (width 0) (type default))\n        (fill (type ${fill}))\n      )`;
}

function renderText(text, bbox) {
  const x = pxToMm(text.x - bbox.x);
  const y = -pxToMm(text.y - bbox.y);
  const size = Math.max(0.8, safeFloat(text.fontSizeMm, 1.27));
  return `      (text "${escapeKiCadText(text.text)}"\n        (at ${x.toFixed(2)} ${y.toFixed(2)} ${safeFloat(text.rotation, 0).toFixed(1)})\n        (effects (font (size ${size.toFixed(2)} ${size.toFixed(2)})))\n      )`;
}

function buildSymbolBlock(partId, cadData, libraryName, version = 20231120) {
  const symbolName = chooseSymbolName(partId, cadData);
  const footprintName = chooseFootprintName(partId, cadData);
  const parsed = parseSymbolData(cadData);
  const info = cadData?.dataStr?.head?.c_para || {};

  const description = cadData?.description || "Imported from LCSC";
  const datasheet = cadData?.lcsc?.url || (partId ? `https://www.lcsc.com/datasheet/${partId}.pdf` : "");
  const prefix = String(info.pre || "U").replace("?", "") || "U";
  const footprint = `${libraryName}:${footprintName}`;

  const primitives = [];
  for (const pin of parsed.pins) {
    primitives.push(renderPin(pin, parsed.bbox));
  }
  for (const rect of parsed.rectangles) {
    primitives.push(renderRectangle(rect, parsed.bbox));
  }
  for (const circle of parsed.circles) {
    primitives.push(renderCircle(circle, parsed.bbox));
  }
  for (const polyline of parsed.polylines) {
    primitives.push(renderPolyline(polyline, false));
  }
  for (const polygon of parsed.polygons) {
    primitives.push(renderPolyline(polygon, true));
  }
  for (const text of parsed.texts) {
    primitives.push(renderText(text, parsed.bbox));
  }

  const bodyContent = primitives.length
    ? primitives.join("\n")
    : `      (rectangle (start -2.54 2.54) (end 2.54 -2.54)\n        (stroke (width 0.254) (type default))\n        (fill (type none))\n      )`;

  const properties = [
    renderProperty("Reference", prefix, 5.08, { id: 0, version }),
    renderProperty("Value", symbolName, -5.08, { id: 1, version }),
    renderProperty("Footprint", footprint, -7.62, { hide: true, id: 2, version }),
    renderProperty("Datasheet", datasheet, -10.16, { hide: true, id: 3, version }),
    renderProperty("Manufacturer", String(info.Manufacturer || info.BOM_Manufacturer || ""), -12.70, {
      hide: true,
      id: 4,
      version,
    }),
    renderProperty("MPN", String(info["Manufacturer Part"] || info["BOM_Manufacturer Part"] || ""), -15.24, {
      hide: true,
      id: 5,
      version,
    }),
    renderProperty("LCSC Part", partId, -17.78, { hide: true, id: 6, version }),
    renderProperty("Description", description, -20.32, { hide: true, id: 9, version }),
  ].filter(Boolean);

  const symbolBlock = `  (symbol "${escapeKiCadText(symbolName)}"\n${properties.join("\n")}\n    (symbol "${escapeKiCadText(symbolName)}_0_1"\n${bodyContent}\n    )\n  )`;

  return {
    symbolName,
    symbolBlock,
  };
}

export function readSymbolLibVersion(libText) {
  if (!libText) {
    return KICAD_SYM_VERSIONS[0];
  }

  const match = String(libText).match(/\(version\s+(\d+)\)/);
  if (!match) {
    return KICAD_SYM_VERSIONS[0];
  }

  const fileVersion = safeInt(match[1], KICAD_SYM_VERSIONS[0]);
  let selected = KICAD_SYM_VERSIONS[0];
  for (const version of KICAD_SYM_VERSIONS) {
    if (version <= fileVersion) {
      selected = version;
    }
  }
  return selected;
}

export function createEmptySymbolLib(version) {
  return `(kicad_symbol_lib\n  (version ${version})\n  (generator "lcsc-kicad-chrome")\n)\n`;
}

export function upsertSymbolInLib(libText, symbolName, symbolBlock) {
  const escapedName = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\n(\\s*)\\(symbol \"${escapedName}\".*?\\n\\1\\)(?=\\n|$)`, "s");

  if (pattern.test(libText)) {
    return libText.replace(pattern, `\n${symbolBlock}`);
  }

  const closing = libText.lastIndexOf(")");
  if (closing < 0) {
    return `${createEmptySymbolLib(readSymbolLibVersion(libText)).trimEnd()}\n${symbolBlock}\n)\n`;
  }

  const prefix = libText.slice(0, closing).trimEnd();
  const suffix = libText.slice(closing);
  return `${prefix}\n${symbolBlock}\n${suffix}`;
}

export function buildSymbolForLibrary(partId, cadData, libraryName, version = 20231120) {
  return buildSymbolBlock(partId, cadData, libraryName, version);
}
