import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [load, setLoad] = useState<number>(0);

  useEffect(() => {
    // 1. Initial Load: Get the score when popup opens
    chrome.storage.local.get(["cognitiveLoad"], (result) => {
      const score = result.cognitiveLoad;
      if (typeof score === "number") {
        setLoad(score);
      } else {
        setLoad(0);
      }
    });

    // 2. Live Updates: Listen for changes while the popup is open
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.cognitiveLoad) {
        const newValue = changes.cognitiveLoad.newValue;
        if (typeof newValue === "number") {
          setLoad(newValue);
        }
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Determine the UI "Vibe" based on the load score
  const getTheme = () => {
    if (load > 85) return { label: "CRITICAL", color: "#ff3333", msg: "Brain Overload Detected." };
    if (load > 50) return { label: "ELEVATED", color: "#ffcc00", msg: "Focus is fragmenting..." };
    return { label: "OPTIMAL", color: "#00ffcc", msg: "System Calm. Deep Work active." };
  };

  const theme = getTheme();

  return (
    <div className="extension-container">
      <header>
        <span className="system-id">VITALITY.OS // v1.0</span>
        <div className="status-indicator" style={{ backgroundColor: theme.color }}></div>
      </header>

      <main>
        <h2 style={{ color: theme.color }}>{theme.label}</h2>
        
        <div className="score-wrapper">
          <span className="score-number">{load}</span>
          <span className="score-unit">%</span>
        </div>

        <p className="status-msg">{theme.msg}</p>

        {/* --- PLACEHOLDER FOR PERSON 2 (THREE.JS) --- */}
        <div className="visualizer-area">
           {/* Person 2 will replace this div with a <Canvas> component */}
           <div className="pulse-orb" style={{ 
             boxShadow: `0 0 40px ${theme.color}33`,
             border: `2px solid ${theme.color}66`
           }}></div>
        </div>
      </main>

      <footer>
        <button 
          className="reset-btn" 
          onClick={() => chrome.runtime.sendMessage({ type: "RESET_LOAD" })}
        >
          SYSTEM RESET
        </button>
      </footer>
    </div>
  );
}

export default App;