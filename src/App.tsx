import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { DECAY_PER_SECOND, STORAGE_KEYS, clampLoad } from "./shared";
const INITIAL_NOW = Date.now();

type LoadSnapshot = {
  currentLoadScore?: number;
  lastUpdatedAt?: number;
  customAiMessage?: string;
};

function App() {
  const [baseScore, setBaseScore] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);
  const [aiMessage, setAiMessage] = useState("");
  const [now, setNow] = useState(INITIAL_NOW);

  useEffect(() => {
    const applySnapshot = (snapshot: LoadSnapshot) => {
      if (typeof snapshot.currentLoadScore === "number") {
        setBaseScore(clampLoad(snapshot.currentLoadScore));
      }

      if (typeof snapshot.lastUpdatedAt === "number") {
        setLastUpdatedAt(snapshot.lastUpdatedAt);
      }

      if (typeof snapshot.customAiMessage === "string") {
        setAiMessage(snapshot.customAiMessage);
      }
    };

    void chrome.storage.local
      .get([STORAGE_KEYS.score, STORAGE_KEYS.updatedAt, STORAGE_KEYS.message])
      .then((result) => {
        applySnapshot(result);
      });

    const storageListener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== "local") return;

      const update: LoadSnapshot = {};
      if (changes[STORAGE_KEYS.score]) {
        update.currentLoadScore = changes[STORAGE_KEYS.score].newValue as number;
      }

      if (changes[STORAGE_KEYS.updatedAt]) {
        update.lastUpdatedAt = changes[STORAGE_KEYS.updatedAt].newValue as number;
      }

      if (changes[STORAGE_KEYS.message]) {
        update.customAiMessage = changes[STORAGE_KEYS.message].newValue as string;
      }

      applySnapshot(update);
    };

    chrome.storage.onChanged.addListener(storageListener);

    const ticker = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      chrome.storage.onChanged.removeListener(storageListener);
      window.clearInterval(ticker);
    };
  }, []);

  const load = useMemo(() => {
    if (!lastUpdatedAt || !now) {
      return Math.round(clampLoad(baseScore));
    }

    const elapsedSeconds = Math.max(0, (now - lastUpdatedAt) / 1000);
    return Math.round(clampLoad(baseScore - elapsedSeconds * DECAY_PER_SECOND));
  }, [baseScore, lastUpdatedAt, now]);

  const status =
    load >= 85
      ? { label: "Critical", mood: "Intervention advised", className: "is-critical" }
      : load >= 60
        ? { label: "Elevated", mood: "Take a short pause soon", className: "is-elevated" }
        : load >= 35
          ? { label: "Focused", mood: "Steady flow, keep pacing", className: "is-focused" }
          : { label: "Optimal", mood: "Calm and clear", className: "is-optimal" };

  return (
    <div className={`extension-container ${status.className}`}>
      <header className="header">
        <div>
          <p className="eyebrow">Cognitive Load Meter</p>
          <h1>Live State</h1>
        </div>
        <span className="status-pill">{status.label}</span>
      </header>

      <section className="score-card">
        <div className="score-row">
          <p className="score-number">{load}</p>
          <p className="score-unit">/100</p>
        </div>
        <p className="status-copy">{status.mood}</p>
        <div className="meter-track">
          <div className="meter-fill" style={{ width: `${load}%` }} />
        </div>
      </section>

      <section className="coach-note">
        <p className="coach-label">Coach Note</p>
        <p>{aiMessage.trim() || "When load spikes, do one slow breath before switching context."}</p>
      </section>

      <button
        className="reset-btn"
        onClick={() => {
          chrome.runtime.sendMessage({ type: "RESET_LOAD" });
        }}
      >
        Reset System
      </button>
    </div>
  );
}

export default App;
