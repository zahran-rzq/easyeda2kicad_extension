function escapeKiCadText(input) {
  return String(input || "").replace(/"/g, "'");
}

function chooseSymbolName(partId, cadData) {
  const candidates = [
    cadData?.title,
    cadData?.display_title,
    cadData?.name,
    cadData?.dataStr?.head?.c_para?.name,
    partId,
  ];

  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) {
      return String(candidate).trim().replace(/\s+/g, "_");
    }
  }

  return partId;
}

export function buildMinimalSymbolLib(partId, cadData, libraryName) {
  const symbolName = chooseSymbolName(partId, cadData);
  const desc = escapeKiCadText(cadData?.description || "Imported from LCSC");

  return `(kicad_symbol_lib
  (version 20231120)
  (generator "lcsc-kicad-chrome")
  (symbol "${escapeKiCadText(symbolName)}"
    (property "Reference" "U" (at 0 5.08 0)
      (effects (font (size 1.27 1.27)))
    )
    (property "Value" "${escapeKiCadText(symbolName)}" (at 0 -5.08 0)
      (effects (font (size 1.27 1.27)))
    )
    (property "Footprint" "${escapeKiCadText(libraryName)}:${escapeKiCadText(symbolName)}" (at 0 0 0)
      (effects (font (size 1.27 1.27)) hide)
    )
    (property "Datasheet" "" (at 0 0 0)
      (effects (font (size 1.27 1.27)) hide)
    )
    (property "LCSC" "${escapeKiCadText(partId)}" (at 0 0 0)
      (effects (font (size 1.27 1.27)) hide)
    )
    (property "Description" "${desc}" (at 0 0 0)
      (effects (font (size 1.27 1.27)) hide)
    )
    (symbol "${escapeKiCadText(symbolName)}_0_1"
      (rectangle (start -2.54 2.54) (end 2.54 -2.54)
        (stroke (width 0.254) (type default))
        (fill (type none))
      )
    )
  )
)
`;
}
