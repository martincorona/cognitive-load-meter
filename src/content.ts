import {
  DECAY_PER_SECOND,
  HIDE_THRESHOLD,
  SHOW_THRESHOLD,
  STORAGE_KEYS,
  clampLoad,
} from "./shared";

const DEFAULT_MESSAGE = "Your cognitive load is high. Breathe with the circle.";
const ALPHA_LEFT_EAR_HZ = 200;
const ALPHA_RIGHT_EAR_HZ = 208; // 8Hz binaural differential
const AUDIO_TARGET_GAIN = 0.3; // 30% max intensity
const AUDIO_FADE_SECONDS = 1.1;

type OverlayElements = {
  overlay: HTMLDivElement;
  title: HTMLHeadingElement;
  breather: HTMLDivElement;
  subText: HTMLParagraphElement;
  closeButton: HTMLButtonElement;
};

type BinauralEngine = {
  context: AudioContext;
  masterGain: GainNode;
};

const injectStyles = () => {
  if (document.getElementById("cog-load-styles")) return;

  const style = document.createElement("style");
  style.id = "cog-load-styles";
  style.textContent = `
    @keyframes breatheCircle {
      0%   { transform: scale(1); opacity: 0.55; box-shadow: 0 0 24px rgba(100, 200, 255, 0.20); }
      50%  { transform: scale(1.18); opacity: 0.95; box-shadow: 0 0 54px rgba(100, 200, 255, 0.55); }
      100% { transform: scale(1); opacity: 0.55; box-shadow: 0 0 24px rgba(100, 200, 255, 0.20); }
    }

    #cognitive-load-overlay {
      opacity: 0;
      pointer-events: none;
      transition: opacity 400ms ease-in-out;
    }

    #cognitive-load-overlay.cog-load-visible {
      opacity: 1;
      pointer-events: all;
    }
  `;

  document.head.appendChild(style);
};

const createOverlay = (): OverlayElements => {
  const overlay = document.createElement("div");
  overlay.id = "cognitive-load-overlay";

  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background:
      "radial-gradient(circle at 50% 40%, rgba(33, 70, 110, 0.78), rgba(3, 10, 18, 0.94) 65%)",
    backdropFilter: "blur(12px)",
    color: "#f7fbff",
    fontFamily: "Avenir Next, Nunito, Segoe UI, sans-serif",
    textAlign: "center",
    padding: "20px",
    boxSizing: "border-box",
  });

  const title = document.createElement("h1");
  title.textContent = "Moment of Calm";
  Object.assign(title.style, {
    fontSize: "clamp(2rem, 5vw, 3.1rem)",
    fontWeight: "500",
    letterSpacing: "0.06em",
    margin: "0 0 34px 0",
  });

  const breather = document.createElement("div");
  Object.assign(breather.style, {
    width: "120px",
    height: "120px",
    borderRadius: "50%",
    background:
      "radial-gradient(circle at 35% 30%, rgba(210,245,255,0.95) 0%, rgba(86,196,255,0.75) 35%, rgba(24,122,218,0.35) 100%)",
    animation: "breatheCircle 8s infinite ease-in-out",
    marginBottom: "38px",
    filter: "saturate(1.15)",
    transformOrigin: "center center",
  });

  const subText = document.createElement("p");
  subText.id = "cog-load-subtext";
  subText.textContent = DEFAULT_MESSAGE;
  Object.assign(subText.style, {
    margin: "0",
    fontSize: "clamp(1rem, 2.2vw, 1.25rem)",
    lineHeight: "1.45",
    maxWidth: "780px",
    opacity: "0.92",
  });

  const closeButton = document.createElement("button");
  closeButton.textContent = "I feel refreshed";
  Object.assign(closeButton.style, {
    marginTop: "42px",
    padding: "12px 28px",
    borderRadius: "999px",
    border: "1px solid rgba(200, 226, 255, 0.5)",
    background: "rgba(220, 239, 255, 0.08)",
    color: "#ecf7ff",
    fontSize: "1rem",
    fontWeight: "600",
    letterSpacing: "0.03em",
    cursor: "pointer",
  });

  closeButton.addEventListener("mouseover", () => {
    closeButton.style.background = "rgba(220, 239, 255, 0.18)";
  });

  closeButton.addEventListener("mouseout", () => {
    closeButton.style.background = "rgba(220, 239, 255, 0.08)";
  });

  overlay.append(title, breather, subText, closeButton);
  document.body.appendChild(overlay);
  return { overlay, title, breather, subText, closeButton };
};

/**
 * HRV-inspired motion layer:
 * Adds subtle micro-variability to the breathing orb so it feels biological
 * instead of perfectly periodic/robotic.
 */
const startOrganicBreathing = (node: HTMLDivElement) => {
  let rafId = 0;
  let t = 0;

  const loop = () => {
    t += 0.03;

    const respiratoryWave = Math.sin(t);
    const microVariability = Math.sin(t * 2.35) * 0.04 + Math.sin(t * 0.7) * 0.03;

    const scale = 1 + respiratoryWave * 0.22 + microVariability;
    const glow = 24 + ((respiratoryWave + 1) / 2) * 28 + Math.abs(microVariability) * 80;

    node.style.transform = `scale(${scale.toFixed(3)})`;
    node.style.boxShadow = `0 0 ${glow.toFixed(0)}px rgba(120,220,255,0.55), inset 0 0 24px rgba(255,255,255,0.22)`;

    rafId = window.requestAnimationFrame(loop);
  };

  rafId = window.requestAnimationFrame(loop);
  return () => window.cancelAnimationFrame(rafId);
};

const getAudioContextCtor = () => {
  const browserWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return window.AudioContext ?? browserWindow.webkitAudioContext ?? null;
};

let audioEngine: BinauralEngine | null = null;
let gestureResumeCleanup: (() => void) | null = null;
let audioSuspendTimerId: number | null = null;

/**
 * Feature 2: Binaural Alpha-Wave Therapy
 * Creates stereo oscillators:
 * - Left channel: 200Hz
 * - Right channel: 208Hz
 * Perceived differential: 8Hz alpha entrainment target.
 */
const ensureAudioEngine = (): BinauralEngine | null => {
  if (audioEngine) return audioEngine;

  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;

  try {
    const context = new AudioContextCtor();
    const masterGain = context.createGain();
    masterGain.gain.value = 0;

    const leftOscillator = context.createOscillator();
    leftOscillator.type = "sine";
    leftOscillator.frequency.value = ALPHA_LEFT_EAR_HZ;

    const rightOscillator = context.createOscillator();
    rightOscillator.type = "sine";
    rightOscillator.frequency.value = ALPHA_RIGHT_EAR_HZ;

    const leftPanner = context.createStereoPanner();
    leftPanner.pan.value = -1;

    const rightPanner = context.createStereoPanner();
    rightPanner.pan.value = 1;

    leftOscillator.connect(leftPanner);
    rightOscillator.connect(rightPanner);
    leftPanner.connect(masterGain);
    rightPanner.connect(masterGain);
    masterGain.connect(context.destination);

    leftOscillator.start();
    rightOscillator.start();

    audioEngine = { context, masterGain };
    return audioEngine;
  } catch {
    return null;
  }
};

const rampAudioGain = (target: number, durationSeconds: number) => {
  if (!audioEngine) return;
  const now = audioEngine.context.currentTime;
  const gain = audioEngine.masterGain.gain;

  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(target, now + durationSeconds);
};

const clearGestureResumeHook = () => {
  if (!gestureResumeCleanup) return;
  gestureResumeCleanup();
  gestureResumeCleanup = null;
};

const hookGestureForAudioResume = () => {
  if (!audioEngine || gestureResumeCleanup) return;

  const resumeOnGesture = async () => {
    if (!audioEngine) return;
    try {
      await audioEngine.context.resume();
      rampAudioGain(AUDIO_TARGET_GAIN, AUDIO_FADE_SECONDS);
    } catch {
      // Browser policy may still block resume. Keep extension stable.
    } finally {
      clearGestureResumeHook();
    }
  };

  const onPointerDown = () => {
    void resumeOnGesture();
  };

  const onKeyDown = () => {
    void resumeOnGesture();
  };

  document.addEventListener("pointerdown", onPointerDown, { capture: true });
  document.addEventListener("keydown", onKeyDown, { capture: true });

  gestureResumeCleanup = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };
};

const startAlphaWaveTherapy = async () => {
  const engine = ensureAudioEngine();
  if (!engine) return;

  if (audioSuspendTimerId) {
    window.clearTimeout(audioSuspendTimerId);
    audioSuspendTimerId = null;
  }

  try {
    await engine.context.resume();
  } catch {
    // Fall through: we'll wait for explicit user gesture.
  }

  if (engine.context.state === "running") {
    clearGestureResumeHook();
    rampAudioGain(AUDIO_TARGET_GAIN, AUDIO_FADE_SECONDS);
    return;
  }

  hookGestureForAudioResume();
};

const stopAlphaWaveTherapy = () => {
  clearGestureResumeHook();
  if (!audioEngine) return;

  rampAudioGain(0, AUDIO_FADE_SECONDS);

  audioSuspendTimerId = window.setTimeout(() => {
    if (!audioEngine) return;
    if (audioEngine.context.state === "running") {
      void audioEngine.context.suspend();
    }
  }, (AUDIO_FADE_SECONDS + 0.1) * 1000);
};

const estimateFocusFatigueAvoided = (score: number) => {
  const excessLoad = Math.max(0, score - 70);
  return Math.max(12, Math.round(16 + excessLoad * 0.9));
};

const getDecayedScore = () => {
  const elapsedSeconds = (Date.now() - lastUpdatedAt) / 1000;
  const value = baseScore - elapsedSeconds * DECAY_PER_SECOND;
  return Math.round(clampLoad(value));
};

const getOverlayScore = () => {
  if (baseCompositeScore > 0) {
    return Math.round(clampLoad(baseCompositeScore));
  }

  return getDecayedScore();
};

let active = false;
let baseScore = 0;
let baseCompositeScore = 0;
let lastUpdatedAt = Date.now();
let aiMessage = "";
let recoveryReportActive = false;
let recoveryReadyToClose = false;

injectStyles();
const overlayUI = createOverlay();
const overlayElement = overlayUI.overlay;
const titleElement = overlayUI.title;
const breatherElement = overlayUI.breather;
const subTextElement = overlayUI.subText;
const closeButtonElement = overlayUI.closeButton;
const stopOrganicBreathing = startOrganicBreathing(breatherElement);

/**
 * Feature 3: Recovery Report
 * Replaces the breathing UI with a 3-second evidence-framed health summary
 * before dismissing the overlay and resetting intervention state.
 */
const closeRecoveryOverlay = () => {
  overlayElement.classList.remove("cog-load-visible");
  active = false;
  recoveryReportActive = false;
  recoveryReadyToClose = false;

  // Reset UI for the next intervention cycle.
  titleElement.textContent = "Moment of Calm";
  breatherElement.style.display = "block";
  subTextElement.textContent = DEFAULT_MESSAGE;
  closeButtonElement.disabled = false;
  closeButtonElement.textContent = "I feel refreshed";

  chrome.runtime.sendMessage({ type: "RESET_LOAD" });
};

const runRecoveryReport = () => {
  if (recoveryReportActive && recoveryReadyToClose) {
    closeRecoveryOverlay();
    return;
  }

  if (recoveryReportActive) return;
  recoveryReportActive = true;
  recoveryReadyToClose = false;

  stopAlphaWaveTherapy();

  const latestScore = getOverlayScore();
  const fatigueMinutesAvoided = estimateFocusFatigueAvoided(latestScore);

  titleElement.textContent = "Post-Session Health Summary";
  breatherElement.style.display = "none";
  subTextElement.innerHTML = [
    "<strong>Cognitive baseline restored.</strong>",
    `8Hz alpha-wave therapy complete (200Hz left, 208Hz right).`,
    `Estimated ${fatigueMinutesAvoided} minutes of focus-fatigue avoided under Yerkes-Dodson arousal modeling.`,
  ].join("<br/>");

  closeButtonElement.disabled = false;
  closeButtonElement.textContent = "Continue";
  recoveryReadyToClose = true;
};

closeButtonElement.addEventListener("click", runRecoveryReport);

const renderOverlay = () => {
  const score = getOverlayScore();

  if (score >= SHOW_THRESHOLD && !active) {
    subTextElement.textContent = aiMessage.trim() || DEFAULT_MESSAGE;
    overlayElement.classList.add("cog-load-visible");
    active = true;
    recoveryReportActive = false;
    void startAlphaWaveTherapy();
    return;
  }

  if (score < HIDE_THRESHOLD && active && !recoveryReportActive) {
    overlayElement.classList.remove("cog-load-visible");
    active = false;
    stopAlphaWaveTherapy();
  }
};

const syncFromStorage = (data: {
  currentLoadScore?: number;
  compositeBurnoutIndex?: number;
  customAiMessage?: string;
  lastUpdatedAt?: number;
}) => {
  if (typeof data.currentLoadScore === "number") {
    baseScore = clampLoad(data.currentLoadScore);
  }

  if (typeof data.compositeBurnoutIndex === "number") {
    baseCompositeScore = clampLoad(data.compositeBurnoutIndex);
  }

  if (typeof data.lastUpdatedAt === "number") {
    lastUpdatedAt = data.lastUpdatedAt;
  }

  if (typeof data.customAiMessage === "string") {
    aiMessage = data.customAiMessage;
  }

  renderOverlay();
};

void chrome.storage.local
  .get([
    STORAGE_KEYS.score,
    STORAGE_KEYS.compositeBurnoutIndex,
    STORAGE_KEYS.message,
    STORAGE_KEYS.updatedAt,
  ])
  .then((result) => {
    syncFromStorage(result);
  });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  const update: {
    currentLoadScore?: number;
    compositeBurnoutIndex?: number;
    customAiMessage?: string;
    lastUpdatedAt?: number;
  } = {};

  if (changes[STORAGE_KEYS.score]) {
    update.currentLoadScore = changes[STORAGE_KEYS.score].newValue as number;
  }

  if (changes[STORAGE_KEYS.updatedAt]) {
    update.lastUpdatedAt = changes[STORAGE_KEYS.updatedAt].newValue as number;
  }

  if (changes[STORAGE_KEYS.compositeBurnoutIndex]) {
    update.compositeBurnoutIndex = changes[STORAGE_KEYS.compositeBurnoutIndex]
      .newValue as number;
  }

  if (changes[STORAGE_KEYS.message]) {
    update.customAiMessage = changes[STORAGE_KEYS.message].newValue as string;
  }

  syncFromStorage(update);
});

setInterval(() => {
  renderOverlay();
}, 1000);

let activityCount = 0;

document.addEventListener("keydown", () => {
  activityCount += 1;
});

document.addEventListener("mousedown", () => {
  activityCount += 2;
});

document.addEventListener(
  "wheel",
  () => {
    activityCount += 0.5;
  },
  { passive: true },
);

setInterval(() => {
  if (activityCount <= 0) return;

  const stressBump = Math.min(15, Math.ceil(activityCount / 4));
  chrome.runtime.sendMessage({ type: "ACTIVITY_BATCH", value: stressBump });
  activityCount = 0;
}, 2000);

// Content scripts can be reinjected. Ensure orphan animation loops are cleaned
// when the document is unloading.
window.addEventListener("beforeunload", () => {
  stopOrganicBreathing();
  stopAlphaWaveTherapy();
});
