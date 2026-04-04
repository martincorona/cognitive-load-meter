import { useEffect, useState } from "react";
import "./App.css";
import type { ScoreState } from "./types";

const defaultState: ScoreState = {
  score: 0,
  level: "focused",
  summary: "Steady interaction pattern.",
  reasons: ["No elevated friction signals detected."],
  breakdown: {
    contextSwitching: 0,
    correctionFriction: 0,
    interactionTurbulence: 0,
    attentionFragmentation: 0,
  },
  latestWindow: {
    windowMs: 30_000,
    keyPresses: 0,
    correctionKeys: 0,
    pasteEvents: 0,
    pointerClicks: 0,
    scrollEvents: 0,
    scrollDirectionChanges: 0,
    idleTransitions: 0,
    visibilityChanges: 0,
  },
  updatedAt: Date.now(),
};

const levelTheme = {
  focused: { accent: "#66e2c2", label: "Focused" },
  strained: { accent: "#f0bf4c", label: "Strained" },
  fragmented: { accent: "#ff6b6b", label: "Fragmented" },
} as const;

function App() {
  const [state, setState] = useState<ScoreState>(defaultState);

  useEffect(() => {
    chrome.storage.local.get(["scoreState"], (res) => {
      if (res.scoreState) {
        setState(res.scoreState as ScoreState);
      }
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.scoreState?.newValue) {
        setState(changes.scoreState.newValue as ScoreState);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const theme = levelTheme[state.level];
  const breakdownEntries = [
    { label: "Context switching", value: state.breakdown.contextSwitching },
    { label: "Correction friction", value: state.breakdown.correctionFriction },
    { label: "Interaction turbulence", value: state.breakdown.interactionTurbulence },
    { label: "Attention fragmentation", value: state.breakdown.attentionFragmentation },
  ];

  return (
    <div className="extension-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Cognitive Load Meter</p>
          <h1>Load Proxy</h1>
        </div>
        <div className="status-chip" style={{ borderColor: `${theme.accent}66`, color: theme.accent }}>
          {theme.label}
        </div>
      </header>

      <section className="hero">
        <p className="score-label">Current score</p>
        <div className="score-row">
          <span className="score-value" style={{ color: theme.accent }}>
            {state.score}
          </span>
          <span className="score-unit">/100</span>
        </div>
        <p className="summary">{state.summary}</p>
      </section>

      <section className="panel">
        <p className="panel-title">Top reasons</p>
        <ul className="reason-list">
          {state.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <p className="panel-title">Signal breakdown</p>
        <div className="metric-list">
          {breakdownEntries.map((entry) => (
            <div className="metric-row" key={entry.label}>
              <div className="metric-header">
                <span>{entry.label}</span>
                <span>{entry.value}</span>
              </div>
              <div className="metric-bar">
                <div
                  className="metric-fill"
                  style={{ width: `${entry.value}%`, background: theme.accent }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <p className="footnote">Rolling 30 second window. This is a behavioral proxy, not a medical measurement.</p>
        <button
          className="reset-btn"
          onClick={() => chrome.runtime.sendMessage({ type: "RESET_LOAD" })}
        >
          Reset score
        </button>
      </footer>
    </div>
  );
}

export default App;
