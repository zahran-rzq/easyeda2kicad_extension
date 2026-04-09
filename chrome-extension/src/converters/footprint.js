function sanitizeName(name) {
  return String(name || "").trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_\-.]/g, "_");
}

function chooseFootprintName(partId, cadData) {
  const candidates = [
    cadData?.packageDetail?.name,
    cadData?.package,
    cadData?.dataStr?.head?.c_para?.package,
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

export function buildMinimalFootprint(partId, cadData, libraryName, modelRef) {
  const fpName = chooseFootprintName(partId, cadData);
  const modelLine = modelRef
    ? `  (model "${modelRef}"\n    (offset (xyz 0 0 0))\n    (scale (xyz 1 1 1))\n    (rotate (xyz 0 0 0))\n  )\n`
    : "";

  const text = `(footprint "${fpName}"
  (version 20240108)
  (generator "lcsc-kicad-chrome")
  (layer "F.Cu")
  (descr "LCSC ${partId} minimal placeholder footprint")
  (property "LCSC" "${partId}" (at 0 0 0) (layer "F.Fab") hide)
  (fp_text reference "REF**" (at 0 1.8 0) (layer "F.SilkS")
    (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_text value "${fpName}" (at 0 -1.8 0) (layer "F.Fab")
    (effects (font (size 1 1) (thickness 0.15)))
  )
  (fp_rect (start -1.5 -1.2) (end 1.5 1.2)
    (stroke (width 0.12) (type solid))
    (fill none)
    (layer "F.SilkS")
  )
${modelLine})
`;

  return { fpName, text };
}
