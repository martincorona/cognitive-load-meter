export type LoadLevel = "focused" | "strained" | "fragmented";

export type FeatureWindow = {
  windowMs: number;
  keyPresses: number;
  correctionKeys: number;
  pasteEvents: number;
  pointerClicks: number;
  scrollEvents: number;
  scrollDirectionChanges: number;
  idleTransitions: number;
  visibilityChanges: number;
};

export type ScoreBreakdown = {
  contextSwitching: number;
  correctionFriction: number;
  interactionTurbulence: number;
  attentionFragmentation: number;
};

export type ScoreState = {
  score: number;
  level: LoadLevel;
  summary: string;
  reasons: string[];
  breakdown: ScoreBreakdown;
  latestWindow: FeatureWindow;
  updatedAt: number;
};
