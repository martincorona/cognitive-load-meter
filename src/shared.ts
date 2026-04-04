export const MAX_LOAD = 100;
export const DECAY_PER_SECOND = 2;
export const SHOW_THRESHOLD = 85;
export const HIDE_THRESHOLD = 50;

export const STORAGE_KEYS = {
  score: "currentLoadScore",
  message: "customAiMessage",
  updatedAt: "lastUpdatedAt",
  lastInterventionAt: "lastInterventionAt",
} as const;

export const clampLoad = (value: number, min = 0, max = MAX_LOAD) =>
  Math.min(max, Math.max(min, value));
