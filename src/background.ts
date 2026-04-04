import type { FeatureWindow, LoadLevel, ScoreBreakdown, ScoreState } from "./types";

const DEFAULT_WINDOW: FeatureWindow = {
  windowMs: 30_000,
  keyPresses: 0,
  correctionKeys: 0,
  pasteEvents: 0,
  pointerClicks: 0,
  scrollEvents: 0,
  scrollDirectionChanges: 0,
  idleTransitions: 0,
  visibilityChanges: 0,
};

const DEFAULT_BREAKDOWN: ScoreBreakdown = {
  contextSwitching: 0,
  correctionFriction: 0,
  interactionTurbulence: 0,
  attentionFragmentation: 0,
};

const DEFAULT_STATE: ScoreState = {
  score: 0,
  level: "focused",
  summary: "Steady interaction pattern.",
  reasons: ["No elevated friction signals detected."],
  breakdown: DEFAULT_BREAKDOWN,
  latestWindow: DEFAULT_WINDOW,
  updatedAt: Date.now(),
};

let currentState: ScoreState = DEFAULT_STATE;
let pendingTabSwitches = 0;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const computeLevel = (score: number): LoadLevel => {
  if (score >= 70) return "fragmented";
  if (score >= 40) return "strained";
  return "focused";
};

const computeReasons = (
  breakdown: ScoreBreakdown,
  window: FeatureWindow,
  level: LoadLevel,
  tabSwitches: number,
): string[] => {
  const reasons: string[] = [];

  if (breakdown.contextSwitching >= 20) {
    reasons.push(
      `${tabSwitches > 0 || window.visibilityChanges > 0 ? "Frequent context changes" : "Context switching"} elevated the score.`,
    );
  }

  if (breakdown.correctionFriction >= 15) {
    reasons.push("Correction-heavy input suggests higher editing friction.");
  }

  if (breakdown.interactionTurbulence >= 12) {
    reasons.push("Bursty scrolling and clicking indicate interaction turbulence.");
  }

  if (breakdown.attentionFragmentation >= 12) {
    reasons.push("Repeated idle/active changes suggest fragmented attention.");
  }

  if (reasons.length === 0) {
    if (level === "focused") {
      reasons.push("Interaction stayed relatively steady over the last 30 seconds.");
    } else {
      reasons.push("Several mild friction signals are elevated at once.");
    }
  }

  return reasons.slice(0, 3);
};

const computeSummary = (level: LoadLevel): string => {
  if (level === "fragmented") {
    return "High-friction work pattern detected.";
  }

  if (level === "strained") {
    return "Some strain signals are elevated.";
  }

  return "Steady interaction pattern.";
};

const persistState = () => {
  chrome.storage.local.set({
    scoreState: currentState,
    cognitiveLoad: currentState.score,
  });
};

const scoreWindow = (window: FeatureWindow, tabSwitches: number): ScoreState => {
  const contextSwitching = clamp(
    tabSwitches * 18 + window.visibilityChanges * 10,
    0,
    100,
  );

  const correctionFriction = clamp(
    window.correctionKeys * 8 + window.pasteEvents * 6,
    0,
    100,
  );

  const interactionTurbulence = clamp(
    window.pointerClicks * 3 +
      window.scrollDirectionChanges * 10 +
      Math.max(0, window.scrollEvents - 8) * 2,
    0,
    100,
  );

  const attentionFragmentation = clamp(window.idleTransitions * 16, 0, 100);

  const weightedWindowScore =
    contextSwitching * 0.35 +
    correctionFriction * 0.3 +
    interactionTurbulence * 0.2 +
    attentionFragmentation * 0.15;

  const smoothedScore = Math.round(
    clamp(currentState.score * 0.65 + weightedWindowScore * 0.35, 0, 100),
  );

  const breakdown = {
    contextSwitching,
    correctionFriction,
    interactionTurbulence,
    attentionFragmentation,
  };

  const level = computeLevel(smoothedScore);

  return {
    score: smoothedScore,
    level,
    summary: computeSummary(level),
    reasons: computeReasons(breakdown, window, level, tabSwitches),
    breakdown,
    latestWindow: window,
    updatedAt: Date.now(),
  };
};

chrome.storage.local.get(["scoreState"], (result) => {
  if (result.scoreState) {
    currentState = result.scoreState as ScoreState;
  } else {
    persistState();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "FEATURE_WINDOW") {
    const window = message.value as FeatureWindow;
    currentState = scoreWindow(window, pendingTabSwitches);
    pendingTabSwitches = 0;
    persistState();
  }

  if (message.type === "RESET_LOAD") {
    pendingTabSwitches = 0;
    currentState = {
      ...DEFAULT_STATE,
      latestWindow: { ...DEFAULT_WINDOW },
      breakdown: { ...DEFAULT_BREAKDOWN },
      updatedAt: Date.now(),
    };
    persistState();
  }
});

chrome.tabs.onActivated.addListener(() => {
  pendingTabSwitches += 1;
});
