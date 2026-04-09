function detectLcscPartId() {
  const urlMatch = window.location.href.match(/C\d{2,}/i);
  if (urlMatch) {
    return urlMatch[0].toUpperCase();
  }

  const bodyMatch = document.body?.innerText?.match(/\bC\d{3,}\b/i);
  if (bodyMatch) {
    return bodyMatch[0].toUpperCase();
  }

  return null;
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.right = "18px";
  toast.style.bottom = "18px";
  toast.style.zIndex = "2147483647";
  toast.style.padding = "10px 12px";
  toast.style.borderRadius = "10px";
  toast.style.fontFamily = "Segoe UI, Tahoma, sans-serif";
  toast.style.fontSize = "13px";
  toast.style.color = "#fff";
  toast.style.background = isError ? "#ad2a2a" : "#0b6f35";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function injectButton() {
  if (document.getElementById("lcsc-kicad-import-btn")) {
    return;
  }

  const btn = document.createElement("button");
  btn.id = "lcsc-kicad-import-btn";
  btn.textContent = "Download KiCad Assets";
  btn.style.position = "fixed";
  btn.style.right = "18px";
  btn.style.bottom = "58px";
  btn.style.zIndex = "2147483646";
  btn.style.padding = "11px 14px";
  btn.style.border = "none";
  btn.style.borderRadius = "999px";
  btn.style.background = "linear-gradient(135deg, #115eb3 0%, #0c4698 100%)";
  btn.style.color = "#fff";
  btn.style.font = "600 13px Segoe UI, Tahoma, sans-serif";
  btn.style.cursor = "pointer";

  btn.addEventListener("click", async () => {
    const partId = detectLcscPartId();
    if (!partId) {
      showToast("No LCSC part ID found on this page.", true);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "CONTENT_IMPORT_PART",
      payload: { partId },
    });

    if (!response?.ok) {
      showToast(response?.error || "Import failed", true);
      return;
    }

    showToast(`Imported ${partId}`);
  });

  document.body.appendChild(btn);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_DETECTED_PART") {
    sendResponse({ partId: detectLcscPartId() });
  }
});

if (window.location.hostname.includes("lcsc.com")) {
  injectButton();
}
