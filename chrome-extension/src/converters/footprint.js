const PAD_SHAPE = {
  ELLIPSE: "circle",
  RECT: "rect",
  OVAL: "oval",
  POLYGON: "custom",
};

const PAD_LAYER = {
  1: "F.Cu F.Paste F.Mask",
  2: "B.Cu B.Paste B.Mask",
  3: "F.SilkS",
  11: "*.Cu *.Paste *.Mask",
  13: "F.Fab",
  15: "Dwgs.User",
};

const PAD_LAYER_THT = {
  1: "F.Cu F.Mask",
  2: "B.Cu B.Mask",
  3: "F.SilkS",
  11: "*.Cu *.Mask",
  13: "F.Fab",
  15: "Dwgs.User",
};

const LAYERS = {
  1: "F.Cu",
  2: "B.Cu",
  3: "F.SilkS",
  4: "B.SilkS",
  5: "F.Paste",
  6: "B.Paste",
  7: "F.Mask",
  8: "B.Mask",
  10: "Edge.Cuts",
  12: "Cmts.User",
  13: "F.Fab",
  14: "B.Fab",
  15: "Dwgs.User",
  99: "F.CrtYd",
  100: "F.Fab",
  101: "F.SilkS",
};

const SOLID_REGION_LAYERS = new Set([3, 4, 13, 14, 99]);

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
    return ["true", "1", "yes", "on", "show", "y"].includes(value.toLowerCase());
  }

  return Boolean(value);
}

function fpToKi(dim) {
  if (dim === "" || dim === null || dim === undefined) {
    return 0;
  }

  const value = safeFloat(dim, 0);
  return Number.isFinite(value) ? Math.round(value * 10 * 0.0254 * 1e6) / 1e6 : 0;
}

function angleToKi(rotation) {
  const rot = safeFloat(rotation, 0);
  if (rot > 180) {
    return -(360 - rot);
  }
  return rot;
}

function sanitizeName(name) {
  return String(name || "").trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_\-.]/g, "_");
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
      return sanitizeName(candidate);
    }
  }

  return sanitizeName(partId);
}

function rotate(x, y, degrees) {
  const radians = (degrees / 180) * 2 * Math.PI;
  const newX = x * Math.cos(radians) - y * Math.sin(radians);
  const newY = x * Math.sin(radians) + y * Math.cos(radians);
  return [newX, newY];
}

function toRadians(n) {
  return (n / 180) * Math.PI;
}

function toDegrees(n) {
  return (n / Math.PI) * 180;
}

function computeArc(startX, startY, radiusX, radiusY, angle, largeArcFlag, sweepFlag, endX, endY) {
  const dx2 = (startX - endX) / 2;
  const dy2 = (startY - endY) / 2;
  const angleRad = toRadians(angle % 360);
  const cosAngle = Math.cos(angleRad);
  const sinAngle = Math.sin(angleRad);

  const x1 = cosAngle * dx2 + sinAngle * dy2;
  const y1 = -sinAngle * dx2 + cosAngle * dy2;

  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1Sq = x1 * x1;
  const y1Sq = y1 * y1;

  const radiiCheck = rxSq !== 0 && rySq !== 0 ? x1Sq / rxSq + y1Sq / rySq : 0;
  if (radiiCheck > 1) {
    rx = Math.sqrt(radiiCheck) * rx;
    ry = Math.sqrt(radiiCheck) * ry;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  let sq = 0;
  if (rxSq * y1Sq + rySq * x1Sq > 0) {
    sq = (rxSq * rySq - rxSq * y1Sq - rySq * x1Sq) / (rxSq * y1Sq + rySq * x1Sq);
  }
  sq = Math.max(sq, 0);
  const coef = sign * Math.sqrt(sq);
  const cx1 = coef * ((rx * y1) / ry);
  const cy1 = rx !== 0 ? coef * (-(ry * x1) / rx) : 0;

  const sx2 = (startX + endX) / 2;
  const sy2 = (startY + endY) / 2;
  const cx = sx2 + (cosAngle * cx1 - sinAngle * cy1);
  const cy = sy2 + (sinAngle * cx1 + cosAngle * cy1);

  const ux = rx !== 0 ? (x1 - cx1) / rx : 0;
  const uy = ry !== 0 ? (y1 - cy1) / ry : 0;
  const vx = rx !== 0 ? (-x1 - cx1) / rx : 0;
  const vy = ry !== 0 ? (-y1 - cy1) / ry : 0;

  const n = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  const p = ux * vx + uy * vy;
  const sign2 = ux * vy - uy * vx < 0 ? -1 : 1;
  let angleExtent = n !== 0 ? toDegrees(sign2 * Math.acos(Math.max(-1, Math.min(1, p / n)))) : 719;
  if (!sweepFlag && angleExtent > 0) {
    angleExtent -= 360;
  } else if (sweepFlag && angleExtent < 0) {
    angleExtent += 360;
  }

  const angleExtentSign = angleExtent < 0 ? 1 : -1;
  angleExtent = (Math.abs(angleExtent) % 360) * angleExtentSign;

  return [cx, cy, angleExtent];
}

function drillToKi(holeRadius, holeLength, padHeight, padWidth) {
  if (holeRadius > 0 && holeLength !== 0) {
    const maxDistanceHole = Math.max(holeRadius * 2, holeLength);
    const pos0 = padHeight - maxDistanceHole;
    const pos90 = padWidth - maxDistanceHole;
    const maxDistance = Math.max(pos0, pos90);

    if (maxDistance === pos0) {
      return `(drill oval ${(holeRadius * 2).toFixed(3)} ${holeLength.toFixed(3)})`;
    }
    return `(drill oval ${holeLength.toFixed(3)} ${(holeRadius * 2).toFixed(3)})`;
  }

  if (holeRadius > 0) {
    return `(drill ${(2 * holeRadius).toFixed(3)})`;
  }

  return "";
}

function parseSolidRegionPath(path, bboxXPx, bboxYPx) {
  const points = [];
  let curX = 0;
  let curY = 0;

  for (const token of String(path || "").trim().split(/(?=[MLHVAZmlhvaz])/)) {
    const part = token.trim();
    if (!part) {
      continue;
    }

    const cmd = part[0].toUpperCase();
    const args = part
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);

    if (cmd === "M" && args.length >= 2) {
      curX = safeFloat(args[0]);
      curY = safeFloat(args[1]);
      points.push([fpToKi(curX - bboxXPx), fpToKi(curY - bboxYPx)]);
    } else if (cmd === "L" && args.length >= 2) {
      curX = safeFloat(args[0]);
      curY = safeFloat(args[1]);
      points.push([fpToKi(curX - bboxXPx), fpToKi(curY - bboxYPx)]);
    } else if (cmd === "H" && args.length >= 1) {
      curX = safeFloat(args[0]);
      points.push([fpToKi(curX - bboxXPx), fpToKi(curY - bboxYPx)]);
    } else if (cmd === "V" && args.length >= 1) {
      curY = safeFloat(args[0]);
      points.push([fpToKi(curX - bboxXPx), fpToKi(curY - bboxYPx)]);
    } else if (cmd === "A" && args.length >= 7) {
      curX = safeFloat(args[5]);
      curY = safeFloat(args[6]);
      points.push([fpToKi(curX - bboxXPx), fpToKi(curY - bboxYPx)]);
    } else if (cmd === "Z" && points.length > 0) {
      const [x0, y0] = points[0];
      const [xn, yn] = points[points.length - 1];
      if (x0 !== xn || y0 !== yn) {
        points.push([x0, y0]);
      }
    }
  }

  return points;
}

function parseFootprintShapes(cadData) {
  const dataStr = cadData?.packageDetail?.dataStr || {};
  const head = dataStr?.head || {};
  const shapeLines = Array.isArray(dataStr?.shape) ? dataStr.shape : [];

  const bboxXPx = safeFloat(head.x);
  const bboxYPx = safeFloat(head.y);
  const bboxX = fpToKi(bboxXPx);
  const bboxY = fpToKi(bboxYPx);

  const parsed = {
    bboxXPx,
    bboxYPx,
    bboxX,
    bboxY,
    pads: [],
    tracks: [],
    holes: [],
    vias: [],
    circles: [],
    rectangles: [],
    arcs: [],
    texts: [],
    solidRegions: [],
  };

  for (const line of shapeLines) {
    const fields = String(line).split("~");
    const kind = fields[0];
    const v = fields.slice(1);

    if (kind === "PAD") {
      parsed.pads.push({
        shape: String(v[0] || "").toUpperCase(),
        centerX: fpToKi(v[1]),
        centerY: fpToKi(v[2]),
        width: fpToKi(v[3]),
        height: fpToKi(v[4]),
        layerId: safeInt(v[5]),
        number: String(v[7] || ""),
        holeRadius: fpToKi(v[8]),
        points: String(v[9] || ""),
        rotation: safeFloat(v[10]),
        id: String(v[11] || ""),
        holeLength: fpToKi(v[12]),
        isPlated: safeBool(v[14], true),
      });
      continue;
    }

    if (kind === "TRACK") {
      parsed.tracks.push({
        strokeWidth: Math.max(fpToKi(v[0]), 0.01),
        layerId: safeInt(v[1]),
        points: String(v[3] || ""),
      });
      continue;
    }

    if (kind === "HOLE") {
      parsed.holes.push({
        centerX: fpToKi(v[0]),
        centerY: fpToKi(v[1]),
        radius: fpToKi(v[2]),
      });
      continue;
    }

    if (kind === "VIA") {
      parsed.vias.push({
        centerX: fpToKi(v[0]),
        centerY: fpToKi(v[1]),
        diameter: fpToKi(v[2]),
        radius: fpToKi(v[4]),
      });
      continue;
    }

    if (kind === "CIRCLE") {
      parsed.circles.push({
        cx: fpToKi(v[0]),
        cy: fpToKi(v[1]),
        radius: fpToKi(v[2]),
        strokeWidth: Math.max(fpToKi(v[3]), 0.01),
        layerId: safeInt(v[4]),
      });
      continue;
    }

    if (kind === "RECT") {
      parsed.rectangles.push({
        x: fpToKi(v[0]),
        y: fpToKi(v[1]),
        width: fpToKi(v[2]),
        height: fpToKi(v[3]),
        layerId: safeInt(v[4]),
        strokeWidth: Math.max(fpToKi(v[7]), 0.01),
      });
      continue;
    }

    if (kind === "ARC") {
      parsed.arcs.push({
        strokeWidth: Math.max(fpToKi(v[0]), 0.01),
        layerId: safeInt(v[1]),
        path: String(v[3] || ""),
      });
      continue;
    }

    if (kind === "TEXT") {
      parsed.texts.push({
        type: String(v[0] || ""),
        centerX: fpToKi(v[1]),
        centerY: fpToKi(v[2]),
        strokeWidth: Math.max(fpToKi(v[3]), 0.01),
        rotation: safeFloat(v[4]),
        layerId: safeInt(v[6]),
        fontSize: Math.max(fpToKi(v[8] || 7), 1),
        text: String(v[9] || ""),
        isDisplayed: safeBool(v[11], true),
      });
      continue;
    }

    if (kind === "SOLIDREGION") {
      parsed.solidRegions.push({
        layerId: safeInt(v[0], 3),
        path: String(v[2] || ""),
        regionType: String(v[3] || "solid"),
      });
    }
  }

  return parsed;
}

function parseArcPath(path) {
  const normalized = String(path || "")
    .replace(/,/g, " ")
    .replace("M ", "M")
    .replace("A ", "A")
    .replace(/\s+/g, " ")
    .trim();

  const splitA = normalized.split("A");
  if (splitA.length < 2 || !splitA[0].startsWith("M")) {
    return null;
  }

  const startParts = splitA[0]
    .slice(1)
    .trim()
    .split(" ")
    .filter(Boolean);
  const arcParts = splitA[1].trim().split(" ").filter(Boolean);

  if (startParts.length < 2 || arcParts.length < 7) {
    return null;
  }

  return {
    startX: startParts[0],
    startY: startParts[1],
    rx: arcParts[0],
    ry: arcParts[1],
    xAxisRotation: arcParts[2],
    largeArc: arcParts[3],
    sweep: arcParts[4],
    endX: arcParts[5],
    endY: arcParts[6],
  };
}

function getFootprintType(cadData) {
  const assembly = cadData?.customData?.jlcPara?.assemblyProcess;
  if (assembly) {
    return String(assembly).toUpperCase() === "SMT" ? "smd" : "tht";
  }

  const smtFlag = Boolean(cadData?.SMT);
  const title = String(cadData?.packageDetail?.title || "");
  if (smtFlag && !title.includes("-TH_")) {
    return "smd";
  }
  return "tht";
}

function toFixed(value, digits) {
  return Number(value).toFixed(digits);
}

function toTrackLine(startX, startY, endX, endY, layer, width) {
  return `\t(fp_line (start ${toFixed(startX, 2)} ${toFixed(startY, 2)}) (end ${toFixed(endX, 2)} ${toFixed(endY, 2)}) (layer ${layer}) (width ${toFixed(width, 2)}))\n`;
}

function buildPadPolygon(pointsText, bboxX, bboxY, posX, posY) {
  const pointList = String(pointsText || "")
    .trim()
    .split(/\s+/)
    .map((v) => fpToKi(v));

  if (pointList.length < 6) {
    return "";
  }

  let path = "";
  for (let i = 0; i + 1 < pointList.length; i += 2) {
    const relX = pointList[i] - bboxX - posX;
    const relY = pointList[i + 1] - bboxY - posY;
    path += `(xy ${toFixed(relX, 6)} ${toFixed(relY, 6)})`;
  }

  return `\n\t\t(primitives \n\t\t\t(gr_poly \n\t\t\t\t(pts ${path}\n\t\t\t\t) \n\t\t\t\t(width 0.1) \n\t\t\t)\n\t\t)\n\t`;
}

function buildSolidRegion(region, bboxXPx, bboxYPx) {
  if (!SOLID_REGION_LAYERS.has(region.layerId)) {
    return null;
  }
  if (region.regionType !== "solid" && region.regionType !== "npth") {
    return null;
  }

  const layer = LAYERS[region.layerId] || "F.SilkS";
  const points = parseSolidRegionPath(region.path, bboxXPx, bboxYPx);
  if (points.length < 3) {
    return null;
  }

  return { layer, points };
}

export function buildMinimalFootprint(partId, cadData, libraryName, modelRef) {
  const fpName = chooseFootprintName(partId, cadData);
  const parsed = parseFootprintShapes(cadData);
  const bboxX = parsed.bboxX;
  const bboxY = parsed.bboxY;
  const fpType = getFootprintType(cadData);

  const cPara = cadData?.packageDetail?.dataStr?.head?.c_para || {};
  const manufacturer = String(cPara.Manufacturer || cPara.BOM_Manufacturer || "");
  const mpn = String(cPara["Manufacturer Part"] || cPara["BOM_Manufacturer Part"] || "");
  const description = String(cadData?.description || "").replace(/"/g, "'");

  const lines = [];
  lines.push(`(module ${libraryName}:${fpName} (layer F.Cu) (tedit 5DC5F6A4)\n`);
  if (description) {
    lines.push(`\t(descr "${description}")\n`);
  }
  lines.push(`\t(attr ${fpType === "smd" ? "smd" : "through_hole"})\n`);

  let yLow = 0;
  let yHigh = 0;
  for (const pad of parsed.pads) {
    const py = pad.centerY - bboxY;
    yLow = Math.min(yLow, py);
    yHigh = Math.max(yHigh, py);
  }

  lines.push(`\t(fp_text reference REF** (at 0 ${toFixed(yLow - 4, 3)}) (layer F.SilkS)\n\t\t(effects (font (size 1 1) (thickness 0.15)))\n\t)\n`);
  lines.push(`\t(fp_text value ${fpName} (at 0 ${toFixed(yHigh + 4, 3)}) (layer F.Fab)\n\t\t(effects (font (size 1 1) (thickness 0.15)))\n\t)\n`);
  lines.push(`\t(fp_text user %R (at 0 0) (layer F.Fab)\n\t\t(effects (font (size 1 1) (thickness 0.15)))\n\t)\n`);

  lines.push(`\t(property "LCSC Part" "${partId}")\n`);
  if (manufacturer) {
    lines.push(`\t(property "Manufacturer" "${manufacturer.replace(/"/g, "'")}")\n`);
  }
  if (mpn) {
    lines.push(`\t(property "MPN" "${mpn.replace(/"/g, "'")}")\n`);
  }

  for (const track of parsed.tracks) {
    const layer = LAYERS[track.layerId] || "F.Fab";
    const pointList = track.points.split(/\s+/).map((point) => fpToKi(point));
    for (let i = 0; i + 3 < pointList.length; i += 2) {
      const startX = pointList[i] - bboxX;
      const startY = pointList[i + 1] - bboxY;
      const endX = pointList[i + 2] - bboxX;
      const endY = pointList[i + 3] - bboxY;
      lines.push(toTrackLine(startX, startY, endX, endY, layer, track.strokeWidth));
    }
  }

  for (const rect of parsed.rectangles) {
    const layer = LAYERS[rect.layerId] || "F.Fab";
    const startX = rect.x - bboxX;
    const startY = rect.y - bboxY;
    const endX = startX + rect.width;
    const endY = startY + rect.height;

    lines.push(toTrackLine(startX, startY, endX, startY, layer, rect.strokeWidth));
    lines.push(toTrackLine(endX, startY, endX, endY, layer, rect.strokeWidth));
    lines.push(toTrackLine(endX, endY, startX, endY, layer, rect.strokeWidth));
    lines.push(toTrackLine(startX, endY, startX, startY, layer, rect.strokeWidth));
  }

  for (const pad of parsed.pads) {
    const posX = pad.centerX - bboxX;
    const posY = pad.centerY - bboxY;
    const baseShape = PAD_SHAPE[pad.shape] || "custom";
    const padType = pad.holeRadius > 0 ? "thru_hole" : "smd";
    const padLayers = (pad.holeRadius > 0 ? PAD_LAYER_THT : PAD_LAYER)[pad.layerId] || "";

    let width = Math.max(pad.width, 0.01);
    let height = Math.max(pad.height, 0.01);
    let orientation = angleToKi(pad.rotation);
    let polygon = "";
    const drill = drillToKi(pad.holeRadius, pad.holeLength, height, width);

    let padNumber = String(pad.number || "");
    if (padNumber.includes("(") && padNumber.includes(")")) {
      padNumber = padNumber.split("(")[1].split(")")[0];
    }

    if (baseShape === "custom") {
      polygon = buildPadPolygon(pad.points, bboxX, bboxY, posX, posY);
      if (polygon) {
        width = 0.005;
        height = 0.005;
        orientation = 0;
      }
    }

    lines.push(
      `\t(pad ${padNumber || "\"\""} ${padType} ${baseShape} (at ${toFixed(posX, 2)} ${toFixed(posY, 2)} ${toFixed(
        orientation,
        2
      )}) (size ${toFixed(width, 3)} ${toFixed(height, 3)}) (layers ${padLayers})${drill ? ` ${drill}` : ""}${polygon})\n`
    );
  }

  for (const hole of parsed.holes) {
    const posX = hole.centerX - bboxX;
    const posY = hole.centerY - bboxY;
    const size = hole.radius * 2;
    lines.push(
      `\t(pad "" thru_hole circle (at ${toFixed(posX, 2)} ${toFixed(posY, 2)}) (size ${toFixed(size, 2)} ${toFixed(
        size,
        2
      )}) (drill ${toFixed(size, 2)}) (layers *.Cu *.Mask))\n`
    );
  }

  for (const via of parsed.vias) {
    const posX = via.centerX - bboxX;
    const posY = via.centerY - bboxY;
    lines.push(
      `\t(pad "" thru_hole circle (at ${toFixed(posX, 2)} ${toFixed(posY, 2)}) (size ${toFixed(
        via.diameter,
        2
      )} ${toFixed(via.diameter, 2)}) (drill ${toFixed(via.radius * 2, 2)}) (layers *.Cu *.Paste *.Mask))\n`
    );
  }

  for (const circle of parsed.circles) {
    const cx = circle.cx - bboxX;
    const cy = circle.cy - bboxY;
    const endX = cx + circle.radius;
    const endY = cy;
    const layer = LAYERS[circle.layerId] || "F.Fab";
    lines.push(
      `\t(fp_circle (center ${toFixed(cx, 2)} ${toFixed(cy, 2)}) (end ${toFixed(endX, 2)} ${toFixed(
        endY,
        2
      )}) (layer ${layer}) (width ${toFixed(circle.strokeWidth, 2)}))\n`
    );
  }

  for (const arc of parsed.arcs) {
    const parsedArc = parseArcPath(arc.path);
    if (!parsedArc) {
      continue;
    }

    const startX = fpToKi(parsedArc.startX) - bboxX;
    const startY = fpToKi(parsedArc.startY) - bboxY;
    const [rx, ry] = rotate(fpToKi(parsedArc.rx), fpToKi(parsedArc.ry), 0);
    const endX = fpToKi(parsedArc.endX) - bboxX;
    const endY = fpToKi(parsedArc.endY) - bboxY;

    let cx = 0;
    let cy = 0;
    let extent = 0;
    if (ry !== 0) {
      [cx, cy, extent] = computeArc(
        startX,
        startY,
        rx,
        ry,
        safeFloat(parsedArc.xAxisRotation),
        parsedArc.largeArc === "1",
        parsedArc.sweep === "1",
        endX,
        endY
      );
    }

    const layer = LAYERS[arc.layerId] || "F.Fab";
    lines.push(
      `\t(fp_arc (start ${toFixed(cx, 2)} ${toFixed(cy, 2)}) (end ${toFixed(endX, 2)} ${toFixed(endY, 2)}) (angle ${toFixed(
        extent,
        2
      )}) (layer ${layer}) (width ${toFixed(arc.strokeWidth, 2)}))\n`
    );
  }

  for (const text of parsed.texts) {
    const posX = text.centerX - bboxX;
    const posY = text.centerY - bboxY;
    let layer = LAYERS[text.layerId] || "F.Fab";
    if (text.type === "N") {
      layer = layer.replace(".SilkS", ".Fab");
    }
    const mirror = layer.startsWith("B") ? " mirror" : "";
    const display = text.isDisplayed ? "" : " hide";
    const safeText = String(text.text || "").replace(/"/g, "'");

    lines.push(
      `\t(fp_text user "${safeText}" (at ${toFixed(posX, 2)} ${toFixed(posY, 2)} ${toFixed(angleToKi(text.rotation), 2)}) (layer ${layer})${display}\n\t\t(effects (font (size ${toFixed(
        text.fontSize,
        2
      )} ${toFixed(text.fontSize, 2)}) (thickness ${toFixed(text.strokeWidth, 2)})) (justify left${mirror}))\n\t)\n`
    );
  }

  for (const region of parsed.solidRegions) {
    const kiRegion = buildSolidRegion(region, parsed.bboxXPx, parsed.bboxYPx);
    if (!kiRegion) {
      continue;
    }

    if (kiRegion.layer === "F.CrtYd") {
      for (let i = 0; i + 1 < kiRegion.points.length; i += 1) {
        const [sx, sy] = kiRegion.points[i];
        const [ex, ey] = kiRegion.points[i + 1];
        lines.push(toTrackLine(sx, sy, ex, ey, "F.CrtYd", 0.05));
      }
    } else {
      const pts = kiRegion.points.map(([x, y]) => `(xy ${toFixed(x, 6)} ${toFixed(y, 6)})`).join(" ");
      lines.push(`\t(fp_poly (pts ${pts}) (stroke (width 0) (type solid)) (fill solid) (layer "${kiRegion.layer}"))\n`);
    }
  }

  if (modelRef) {
    const modelFile = typeof modelRef === "string" ? modelRef : modelRef.file;
    const translation =
      typeof modelRef === "string"
        ? { x: 0, y: 0, z: 0 }
        : modelRef.translation || { x: 0, y: 0, z: 0 };
    const rotation =
      typeof modelRef === "string"
        ? { x: 0, y: 0, z: 0 }
        : modelRef.rotation || { x: 0, y: 0, z: 0 };

    lines.push(
      `\t(model "${modelFile}"\n\t\t(offset (xyz ${toFixed(translation.x, 3)} ${toFixed(translation.y, 3)} ${toFixed(
        translation.z,
        3
      )}))\n\t\t(scale (xyz 1 1 1))\n\t\t(rotate (xyz ${toFixed(rotation.x, 0)} ${toFixed(rotation.y, 0)} ${toFixed(
        rotation.z,
        0
      )}))\n\t)\n`
    );
  }

  lines.push(")");

  return {
    fpName,
    text: lines.join(""),
  };
}
