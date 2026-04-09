# Chrome Extension: LCSC to KiCad

This folder contains a standalone Chrome Manifest V3 extension that starts the browser-only import flow for LCSC/EasyEDA parts.

## Current implementation status

Implemented now:
- LCSC page floating button to trigger import of detected part ID.
- Popup UI for manual multi-ID input.
- Project-folder browse and persistent folder handle storage.
- Background fetch pipeline for EasyEDA component JSON and 3D OBJ/STEP downloads.
- Output writer for project layout:
  - `<library>.kicad_sym`
  - `<library>.pretty/*.kicad_mod`
  - `<library>.3dshapes/*`
  - `_easyeda_raw/*.json`

Important:
- Symbol and footprint generation are currently minimal placeholders in this initial implementation.
- Full parity conversion with the Python pipeline is the next implementation phase.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked and select this `chrome-extension` folder.
4. Open popup, click Browse Folder, choose a project folder.
5. Use manual IDs or open an LCSC part page and click Download KiCad Assets.

## Next tasks

- Port full symbol importer/exporter from Python logic.
- Port full footprint importer/exporter from Python logic.
- Port OBJ to WRL conversion and write `.wrl` alongside `.step`.
- Add overwrite merge behavior for symbol libraries.
- Add conversion parity tests with fixture LCSC parts.
