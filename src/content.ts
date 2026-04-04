// src/content.ts
let activityCount = 0;

// 1. TRACKING LOGIC (Mouse Movements Only)
window.addEventListener("mousemove", () => { 
  // Increased from 0.5 to 1.2 so the meter still moves noticeably 
  // now that typing isn't helping it.
  activityCount += 1.2; 
});

// REMOVED: window.addEventListener("keydown", ...) - Typing no longer tracked.

setInterval(() => {
  if (activityCount > 0) {
    chrome.runtime.sendMessage({ type: "ACTIVITY_BATCH", value: activityCount });
    activityCount = 0; 
  }
}, 2000);

// 2. OVERLAY UI LOGIC
const createOverlay = () => {
  const overlay = document.createElement("div");
  overlay.id = "cognitive-load-overlay";
  Object.assign(overlay.style, {
    position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.4)", backdropFilter: "blur(10px)",
    zIndex: "999999", display: "flex", flexDirection: "column",
    justifyContent: "center", alignItems: "center", color: "white",
    fontFamily: "system-ui, sans-serif", opacity: "0",
    transition: "opacity 0.8s ease-in-out", pointerEvents: "none"
  });

  overlay.innerHTML = `
    <div style="text-align: center; max-width: 600px; padding: 40px; border-radius: 20px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);">
      <h1 style="font-size: 3rem; margin-bottom: 10px;">Deep Breath.</h1>
      <p style="font-size: 1.5rem; opacity: 0.8; margin-bottom: 30px;">High cognitive load detected. Pause for a moment.</p>
      <button id="close-load-overlay" style="padding: 12px 24px; font-size: 1.2rem; border: none; border-radius: 8px; background: white; color: black; cursor: pointer; font-weight: bold;">
        I'm focused. Let me work.
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
};

const overlayElement = createOverlay();

// 3. THE WATCHER
let isOverlayActive = false;
setInterval(() => {
  chrome.storage.local.get(["cognitiveLoad"], (result) => {
    const score = (result.cognitiveLoad as number) || 0;
    if (score > 85 && !isOverlayActive) {
      isOverlayActive = true;
      overlayElement.style.pointerEvents = "all";
      overlayElement.style.opacity = "1";
    }
    if (score < 50 && isOverlayActive) { 
        isOverlayActive = false; 
        // Auto-hide overlay if score drops naturally
        overlayElement.style.opacity = "0";
        overlayElement.style.pointerEvents = "none";
    }
  });
}, 2000);

document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).id === 'close-load-overlay') {
    overlayElement.style.opacity = "0";
    overlayElement.style.pointerEvents = "none";
    chrome.runtime.sendMessage({ type: "RESET_LOAD" });
  }
});