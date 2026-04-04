let currentLoad = 0;

// Listen for data from the content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "ACTIVITY_BATCH") {
    // Increment score based on mouse/key activity
    currentLoad = Math.min(100, currentLoad + message.value);
    chrome.storage.local.set({ cognitiveLoad: Math.round(currentLoad) });
  }

  if (message.type === "RESET_LOAD") {
    currentLoad = 0;
    chrome.storage.local.set({ cognitiveLoad: 0 });
  }
});

// Bonus: Tab switching adds stress!
chrome.tabs.onActivated.addListener(() => {
  currentLoad = Math.min(100, currentLoad + 15);
  chrome.storage.local.set({ cognitiveLoad: Math.round(currentLoad) });
});

// Decay Logic: Stress drops by 2 points every second if you stop moving
setInterval(() => {
  if (currentLoad > 0) {
    currentLoad = Math.max(0, currentLoad - 2);
    chrome.storage.local.set({ cognitiveLoad: Math.round(currentLoad) });
  }
}, 1000);