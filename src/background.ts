import {
  DECAY_PER_SECOND,
  SHOW_THRESHOLD,
  STORAGE_KEYS as storageKeys,
  type SessionMetricPoint,
  type TremorSource,
  clampLoad,
} from "./shared";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  type Database,
  type Unsubscribe,
  getDatabase,
  onValue,
  ref,
} from "firebase/database";

const TAB_SWITCH_BUMP = 15;
const INTERVENTION_COOLDOWN_MS = 90_000;
const CALM_GROUP_TITLE = "🧠 Moment of Calm";
const CALM_GROUP_COLOR = "blue" as const;
const SESSION_TIMELINE_LIMIT = 240;
const DIGITAL_WEIGHT = 0.68;
const TREMOR_WEIGHT = 0.32;
const FIREBASE_TREMOR_PATH = "cognitive-load-meter/live-tremor";
const METRIC_TICK_MS = 1000;
const TREMOR_STALE_MS = 8_000;
const SYNTHETIC_TREMOR_JITTER = 7;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.databaseURL,
  firebaseConfig.projectId,
  firebaseConfig.appId,
].every((value) => typeof value === "string" && value.length > 0);

type StorageSnapshot = {
  currentLoadScore?: number;
  physicalTremorScore?: number;
  tremorSource?: TremorSource;
  compositeBurnoutIndex?: number;
  sessionTimeline?: SessionMetricPoint[];
  customAiMessage?: string;
  lastUpdatedAt?: number;
  lastInterventionAt?: number;
};

type TremorPayload = {
  score?: number;
  timestamp?: number;
  deviceId?: string;
};

let currentLoad = 0;
let currentTremorScore = 0;
let tremorSource: TremorSource = "synthetic";
let compositeBurnoutIndex = 0;
let sessionTimeline: SessionMetricPoint[] = [];
let lastUpdatedAt = Date.now();
let lastInterventionAt = 0;
let lastSampleAt = 0;
let lastTremorUpdateAt = 0;
let isAiGenerating = false;
let metricsTickInFlight = false;
let tremorUnsubscribe: Unsubscribe | null = null;

const applyDecay = (now = Date.now()) => {
  const elapsedSeconds = (now - lastUpdatedAt) / 1000;
  if (elapsedSeconds <= 0) return;

  currentLoad = clampLoad(currentLoad - elapsedSeconds * DECAY_PER_SECOND);
  lastUpdatedAt = now;
};

const computeCompositeBurnoutIndex = () =>
  clampLoad(Math.round(currentLoad * DIGITAL_WEIGHT + currentTremorScore * TREMOR_WEIGHT));

const pushSessionPoint = (timestamp: number) => {
  const point: SessionMetricPoint = {
    timestamp,
    digitalStress: Math.round(currentLoad),
    physicalTremor: Math.round(currentTremorScore),
    compositeBurnoutIndex,
  };

  sessionTimeline.push(point);
  if (sessionTimeline.length > SESSION_TIMELINE_LIMIT) {
    sessionTimeline = sessionTimeline.slice(-SESSION_TIMELINE_LIMIT);
  }
};

const persistMetrics = async (recordSample = true) => {
  compositeBurnoutIndex = computeCompositeBurnoutIndex();
  const now = Date.now();

  if (recordSample && now - lastSampleAt >= 1000) {
    pushSessionPoint(now);
    lastSampleAt = now;
  }

  await chrome.storage.local.set({
    [storageKeys.score]: Math.round(currentLoad),
    [storageKeys.tremorScore]: Math.round(currentTremorScore),
    [storageKeys.tremorSource]: tremorSource,
    [storageKeys.compositeBurnoutIndex]: compositeBurnoutIndex,
    [storageKeys.sessionTimeline]: sessionTimeline,
    [storageKeys.updatedAt]: lastUpdatedAt,
  });
};

const bumpLoad = async (amount: number) => {
  applyDecay();
  currentLoad = clampLoad(currentLoad + amount);
  await persistMetrics(true);
};

const updateTremorScore = async (rawScore: number, source: TremorSource) => {
  const nextTremor = clampLoad(rawScore);
  const changed = nextTremor !== currentTremorScore || source !== tremorSource;
  if (!changed) return;

  currentTremorScore = nextTremor;
  tremorSource = source;
  lastTremorUpdateAt = Date.now();

  await persistMetrics(true);
};

const runSyntheticTremorPulse = async () => {
  const staleFirebase =
    hasFirebaseConfig &&
    tremorSource === "firebase" &&
    Date.now() - lastTremorUpdateAt <= TREMOR_STALE_MS;

  if (staleFirebase) {
    return;
  }

  const baselineFromDigital = currentLoad * 0.52;
  const blended = currentTremorScore * 0.68 + baselineFromDigital * 0.32;
  const wobble = (Math.random() * 2 - 1) * SYNTHETIC_TREMOR_JITTER;
  const nextSyntheticScore = Math.round(blended + wobble);

  await updateTremorScore(nextSyntheticScore, hasFirebaseConfig ? "synthetic" : "demo");
};

const resetAll = async () => {
  currentLoad = 0;
  currentTremorScore = 0;
  tremorSource = "synthetic";
  compositeBurnoutIndex = 0;
  sessionTimeline = [];
  lastUpdatedAt = Date.now();
  lastInterventionAt = 0;
  lastSampleAt = 0;
  lastTremorUpdateAt = Date.now();
  isAiGenerating = false;

  await chrome.storage.local.set({
    [storageKeys.score]: 0,
    [storageKeys.tremorScore]: 0,
    [storageKeys.tremorSource]: "synthetic",
    [storageKeys.compositeBurnoutIndex]: 0,
    [storageKeys.sessionTimeline]: [],
    [storageKeys.message]: "",
    [storageKeys.updatedAt]: lastUpdatedAt,
    [storageKeys.lastInterventionAt]: 0,
  });
};

const initializeFromStorage = async () => {
  const data = (await chrome.storage.local.get([
    storageKeys.score,
    storageKeys.tremorScore,
    storageKeys.tremorSource,
    storageKeys.compositeBurnoutIndex,
    storageKeys.sessionTimeline,
    storageKeys.updatedAt,
    storageKeys.lastInterventionAt,
  ])) as StorageSnapshot;

  currentLoad = typeof data.currentLoadScore === "number" ? clampLoad(data.currentLoadScore) : 0;
  currentTremorScore =
    typeof data.physicalTremorScore === "number" ? clampLoad(data.physicalTremorScore) : 0;
  tremorSource =
    data.tremorSource === "firebase" || data.tremorSource === "demo"
      ? data.tremorSource
      : "synthetic";
  lastTremorUpdateAt = Date.now();

  const storedTimeline = Array.isArray(data.sessionTimeline)
    ? data.sessionTimeline.filter(
        (point): point is SessionMetricPoint =>
          typeof point?.timestamp === "number" &&
          typeof point?.digitalStress === "number" &&
          typeof point?.physicalTremor === "number" &&
          typeof point?.compositeBurnoutIndex === "number",
      )
    : [];

  sessionTimeline = storedTimeline.slice(-SESSION_TIMELINE_LIMIT);
  lastUpdatedAt = typeof data.lastUpdatedAt === "number" ? data.lastUpdatedAt : Date.now();
  lastInterventionAt =
    typeof data.lastInterventionAt === "number" ? data.lastInterventionAt : 0;

  applyDecay();

  if (typeof data.compositeBurnoutIndex === "number") {
    compositeBurnoutIndex = clampLoad(data.compositeBurnoutIndex);
  } else {
    compositeBurnoutIndex = computeCompositeBurnoutIndex();
  }

  await persistMetrics(false);
};

const evaluateInterventionForActiveTab = async () => {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!activeTab?.id) return;

  const title = activeTab.title?.trim() || "your task";
  await maybeTriggerIntervention(title);
};

const maybeTriggerIntervention = async (tabTitle: string) => {
  applyDecay();
  compositeBurnoutIndex = computeCompositeBurnoutIndex();

  const now = Date.now();
  if (
    compositeBurnoutIndex < SHOW_THRESHOLD ||
    isAiGenerating ||
    now - lastInterventionAt < INTERVENTION_COOLDOWN_MS
  ) {
    return;
  }

  isAiGenerating = true;
  lastInterventionAt = now;
  await chrome.storage.local.set({
    [storageKeys.lastInterventionAt]: now,
    [storageKeys.compositeBurnoutIndex]: compositeBurnoutIndex,
  });

  try {
    // Sensory triage: collapse distracting tabs while the intervention runs.
    await collapseDistractingTabs();

    const aiText = await generateAIIntervention(tabTitle);
    await chrome.storage.local.set({ [storageKeys.message]: aiText });
  } catch {
    await chrome.storage.local.set({
      [storageKeys.message]: "You've been moving fast. Take a 30-second breath.",
    });
  } finally {
    isAiGenerating = false;
  }
};

const getFirebaseDatabaseClient = (): Database | null => {
  if (!hasFirebaseConfig) return null;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return getDatabase(app);
};

const startTremorSync = () => {
  const database = getFirebaseDatabaseClient();
  if (!database) {
    return;
  }

  tremorUnsubscribe?.();

  const tremorRef = ref(database, FIREBASE_TREMOR_PATH);
  tremorUnsubscribe = onValue(tremorRef, (snapshot) => {
    const payload = snapshot.val() as TremorPayload | null;
    if (!payload || typeof payload.score !== "number") {
      return;
    }

    void updateTremorScore(payload.score, "firebase").then(async () => {
      await evaluateInterventionForActiveTab();
    });
  });
};

chrome.runtime.onInstalled.addListener(() => {
  void initializeFromStorage();
  startTremorSync();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeFromStorage();
  startTremorSync();
});

void initializeFromStorage();
startTremorSync();

setInterval(() => {
  if (metricsTickInFlight) return;
  metricsTickInFlight = true;

  void (async () => {
    try {
      applyDecay();
      await persistMetrics(true);
      await runSyntheticTremorPulse();
      await evaluateInterventionForActiveTab();
    } finally {
      metricsTickInFlight = false;
    }
  })();
}, METRIC_TICK_MS);

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "ACTIVITY_BATCH" && typeof message.value === "number") {
    void bumpLoad(message.value).then(async () => {
      await evaluateInterventionForActiveTab();
    });
  }

  if (message.type === "RESET_LOAD") {
    void resetAll();
  }

  if (message.type === "SET_DEMO_TREMOR" && typeof message.value === "number") {
    void updateTremorScore(message.value, "demo").then(async () => {
      await evaluateInterventionForActiveTab();
    });
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await bumpLoad(TAB_SWITCH_BUMP);

  const tab = await chrome.tabs.get(activeInfo.tabId);
  const title = tab.title?.trim() || "your task";
  await maybeTriggerIntervention(title);
});

/**
 * Groups all non-active tabs in the current window into a single
 * collapsed blue tab-group so the user only sees the current task.
 */
async function collapseDistractingTabs(): Promise<void> {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!activeTab?.id || typeof activeTab.windowId !== "number") {
    return;
  }

  const tabsInWindow = await chrome.tabs.query({ windowId: activeTab.windowId });
  const nonActiveTabIds = tabsInWindow
    .filter((tab) => typeof tab.id === "number" && tab.id !== activeTab.id)
    .map((tab) => tab.id as number);

  if (nonActiveTabIds.length === 0) {
    return;
  }

  const groups = await chrome.tabGroups.query({ windowId: activeTab.windowId });
  const existingCalmGroup = groups.find((group) => group.title === CALM_GROUP_TITLE);

  const groupTabIds = nonActiveTabIds as [number, ...number[]];

  let calmGroupId: number;
  if (existingCalmGroup) {
    calmGroupId = existingCalmGroup.id;
    await groupTabs({
      groupId: calmGroupId,
      tabIds: groupTabIds,
    });
  } else {
    calmGroupId = await groupTabs({ tabIds: groupTabIds });
  }

  await updateTabGroup(calmGroupId, {
    title: CALM_GROUP_TITLE,
    color: CALM_GROUP_COLOR,
    collapsed: true,
  });
}

const groupTabs = (options: chrome.tabs.GroupOptions): Promise<number> =>
  new Promise((resolve, reject) => {
    chrome.tabs.group(options, (groupId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(groupId);
    });
  });

const updateTabGroup = (
  groupId: number,
  options: chrome.tabGroups.UpdateProperties,
): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.tabGroups.update(groupId, options, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });

async function generateAIIntervention(tabTitle: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return "Pause for 30 seconds, slow your breath, and restart with one clear next step.";
  }

  const prompt = `You are a calming productivity coach. The user's cognitive stress spiked while switching to a tab titled "${tabTitle}". Write one short empathetic sentence encouraging a 30-second breathing break. Keep it specific, calm, and actionable.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!aiText) {
    throw new Error("AI response missing text");
  }

  return aiText;
}
