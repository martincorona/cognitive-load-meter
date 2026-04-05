export const MAX_LOAD = 100;
export const DECAY_PER_SECOND = 2;
export const SHOW_THRESHOLD = 75;
export const HIDE_THRESHOLD = 45;

export type RecoveryPattern = "switching" | "interaction" | "mixed" | "steady";

export type RecoverySnapshot = {
  peakScore: number;
  tabSwitchCount: number;
  activityBumpTotal: number;
  pattern: RecoveryPattern;
  capturedAt: number;
};

export const STORAGE_KEYS = {
  score: "currentLoadScore",
  message: "customAiMessage",
  updatedAt: "lastUpdatedAt",
  lastInterventionAt: "lastInterventionAt",
  peakScore: "peakLoadScore",
  tabSwitchCount: "tabSwitchCount",
  activityBumpTotal: "activityBumpTotal",
  recoverySnapshot: "latestRecoverySnapshot",
} as const;

export const clampLoad = (value: number, min = 0, max = MAX_LOAD) =>
  Math.min(max, Math.max(min, value));
