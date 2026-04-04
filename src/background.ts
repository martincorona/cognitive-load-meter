import {
  DECAY_PER_SECOND,
  SHOW_THRESHOLD,
  STORAGE_KEYS as storageKeys,
  clampLoad,
} from "./shared";

const TAB_SWITCH_BUMP = 15;
const INTERVENTION_COOLDOWN_MS = 90_000;
const CALM_GROUP_TITLE = "🧠 Moment of Calm";
const CALM_GROUP_COLOR = "blue" as const;

type StorageSnapshot = {
  currentLoadScore?: number;
  customAiMessage?: string;
  lastUpdatedAt?: number;
  lastInterventionAt?: number;
};

let currentLoad = 0;
let lastUpdatedAt = Date.now();
let lastInterventionAt = 0;
let isAiGenerating = false;

const applyDecay = (now = Date.now()) => {
  const elapsedSeconds = (now - lastUpdatedAt) / 1000;
  if (elapsedSeconds <= 0) return;

  currentLoad = clampLoad(currentLoad - elapsedSeconds * DECAY_PER_SECOND);
  lastUpdatedAt = now;
};

const persistScore = async () => {
  await chrome.storage.local.set({
    [storageKeys.score]: Math.round(currentLoad),
    [storageKeys.updatedAt]: lastUpdatedAt,
  });
};

const bumpLoad = async (amount: number) => {
  applyDecay();
  currentLoad = clampLoad(currentLoad + amount);
  await persistScore();
};

const resetAll = async () => {
  currentLoad = 0;
  lastUpdatedAt = Date.now();
  lastInterventionAt = 0;
  isAiGenerating = false;

  await chrome.storage.local.set({
    [storageKeys.score]: 0,
    [storageKeys.message]: "",
    [storageKeys.updatedAt]: lastUpdatedAt,
    [storageKeys.lastInterventionAt]: 0,
  });
};

const initializeFromStorage = async () => {
  const data = (await chrome.storage.local.get([
    storageKeys.score,
    storageKeys.updatedAt,
    storageKeys.lastInterventionAt,
  ])) as StorageSnapshot;

  currentLoad =
    typeof data.currentLoadScore === "number" ? clampLoad(data.currentLoadScore) : 0;
  lastUpdatedAt = typeof data.lastUpdatedAt === "number" ? data.lastUpdatedAt : Date.now();
  lastInterventionAt =
    typeof data.lastInterventionAt === "number" ? data.lastInterventionAt : 0;

  applyDecay();
  await persistScore();
};

const maybeTriggerIntervention = async (tabTitle: string) => {
  const now = Date.now();
  if (
    currentLoad < SHOW_THRESHOLD ||
    isAiGenerating ||
    now - lastInterventionAt < INTERVENTION_COOLDOWN_MS
  ) {
    return;
  }

  isAiGenerating = true;
  lastInterventionAt = now;
  await chrome.storage.local.set({ [storageKeys.lastInterventionAt]: now });

  try {
    // Health-track upgrade: hide non-active tabs as "sensory deprivation"
    // to reduce cognitive clutter at the exact intervention moment.
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

chrome.runtime.onInstalled.addListener(() => {
  void initializeFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeFromStorage();
});

void initializeFromStorage();

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "ACTIVITY_BATCH" && typeof message.value === "number") {
    void bumpLoad(message.value).then(async () => {
      if (currentLoad < SHOW_THRESHOLD) return;

      const [activeTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });

      if (!activeTab?.id) return;
      const title = activeTab.title?.trim() || "your task";
      await maybeTriggerIntervention(title);
    });
  }

  if (message.type === "RESET_LOAD") {
    void resetAll();
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await bumpLoad(TAB_SWITCH_BUMP);

  const tab = await chrome.tabs.get(activeInfo.tabId);
  const title = tab.title?.trim() || "your task";
  await maybeTriggerIntervention(title);
});

chrome.storage.onChanged.addListener((changes) => {
  const nextScore = changes[storageKeys.score]?.newValue;
  if (typeof nextScore === "number" && nextScore === 0) {
    currentLoad = 0;
    lastUpdatedAt = Date.now();
    isAiGenerating = false;
  }
});

/**
 * Feature 1: Cognitive Triage (Sensory Deprivation)
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
