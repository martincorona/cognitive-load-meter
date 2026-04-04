import type { FeatureWindow, ScoreState } from "./types";

const WINDOW_MS = 30_000;
const IDLE_THRESHOLD_MS = 10_000;

const createEmptyWindow = (): FeatureWindow => ({
  windowMs: WINDOW_MS,
  keyPresses: 0,
  correctionKeys: 0,
  pasteEvents: 0,
  pointerClicks: 0,
  scrollEvents: 0,
  scrollDirectionChanges: 0,
  idleTransitions: 0,
  visibilityChanges: 0,
});

let currentWindow = createEmptyWindow();
let lastActivityAt = Date.now();
let isIdle = false;
let lastScrollDirection = 0;
let lastScrollY = window.scrollY;
let overlayVisible = false;

const markActivity = () => {
  const now = Date.now();

  if (isIdle) {
    currentWindow.idleTransitions += 1;
    isIdle = false;
  }

  lastActivityAt = now;
};

window.addEventListener("keydown", (event) => {
  currentWindow.keyPresses += 1;

  if (event.key === "Backspace" || event.key === "Delete") {
    currentWindow.correctionKeys += 1;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    currentWindow.correctionKeys += 1;
  }

  markActivity();
});

window.addEventListener("paste", () => {
  currentWindow.pasteEvents += 1;
  markActivity();
});

window.addEventListener("click", () => {
  currentWindow.pointerClicks += 1;
  markActivity();
});

window.addEventListener(
  "scroll",
  () => {
    const direction = Math.sign(window.scrollY - lastScrollY);

    currentWindow.scrollEvents += 1;

    if (direction !== 0 && lastScrollDirection !== 0 && direction !== lastScrollDirection) {
      currentWindow.scrollDirectionChanges += 1;
    }

    if (direction !== 0) {
      lastScrollDirection = direction;
    }

    lastScrollY = window.scrollY;
    markActivity();
  },
  { passive: true },
);

document.addEventListener("visibilitychange", () => {
  currentWindow.visibilityChanges += 1;
});

setInterval(() => {
  if (!isIdle && Date.now() - lastActivityAt >= IDLE_THRESHOLD_MS) {
    currentWindow.idleTransitions += 1;
    isIdle = true;
  }
}, 1_000);

setInterval(() => {
  chrome.runtime.sendMessage({ type: "FEATURE_WINDOW", value: currentWindow });
  currentWindow = createEmptyWindow();
  lastScrollDirection = 0;
  lastScrollY = window.scrollY;
}, WINDOW_MS);

const createOverlay = () => {
  const overlay = document.createElement("div");
  overlay.id = "cognitive-load-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(4, 10, 18, 0.56)",
    backdropFilter: "blur(10px)",
    zIndex: "999999",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
    fontFamily: "system-ui, sans-serif",
    opacity: "0",
    transition: "opacity 0.5s ease-in-out",
    pointerEvents: "none",
  });

  overlay.innerHTML = `
    <div style="text-align: center; max-width: 560px; padding: 36px; border-radius: 24px; background: rgba(10, 16, 27, 0.72); border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
      <p style="margin: 0 0 12px; letter-spacing: 0.12em; font-size: 0.8rem; opacity: 0.72; text-transform: uppercase;">Load Proxy Alert</p>
      <h1 style="font-size: 2.5rem; margin: 0 0 12px;">Take a beat.</h1>
      <p id="load-overlay-summary" style="font-size: 1.125rem; line-height: 1.5; opacity: 0.9; margin: 0 0 22px;">Your recent interaction pattern looks fragmented.</p>
      <p id="load-overlay-reason" style="font-size: 0.95rem; line-height: 1.5; opacity: 0.7; margin: 0 0 28px;">High context switching and repeated corrections are both elevated.</p>
      <button id="close-load-overlay" style="padding: 12px 24px; font-size: 1rem; border: none; border-radius: 999px; background: white; color: black; cursor: pointer; font-weight: 700;">
        Dismiss for now
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  return overlay;
};

const overlayElement = createOverlay();
const overlaySummary = overlayElement.querySelector("#load-overlay-summary");
const overlayReason = overlayElement.querySelector("#load-overlay-reason");

const showOverlay = (state: ScoreState) => {
  if (overlaySummary) {
    overlaySummary.textContent = state.summary;
  }

  if (overlayReason) {
    overlayReason.textContent = state.reasons[0] ?? "Several friction signals are elevated.";
  }

  overlayVisible = true;
  overlayElement.style.pointerEvents = "all";
  overlayElement.style.opacity = "1";
};

const hideOverlay = () => {
  overlayVisible = false;
  overlayElement.style.opacity = "0";
  overlayElement.style.pointerEvents = "none";
};

setInterval(() => {
  chrome.storage.local.get(["scoreState"], (result) => {
    const state = result.scoreState as ScoreState | undefined;

    if (!state) {
      hideOverlay();
      return;
    }

    if (state.level === "fragmented" && !overlayVisible) {
      showOverlay(state);
      return;
    }

    if (state.level !== "fragmented" && overlayVisible) {
      hideOverlay();
    }
  });
}, 2_000);

document.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).id === "close-load-overlay") {
    hideOverlay();
    chrome.runtime.sendMessage({ type: "RESET_LOAD" });
  }
});
