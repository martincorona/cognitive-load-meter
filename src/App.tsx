// src/App.tsx
import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [load, setLoad] = useState<number>(0);

  useEffect(() => {
    chrome.storage.local.get(["cognitiveLoad"], (res) => {
      setLoad(typeof res.cognitiveLoad === "number" ? res.cognitiveLoad : 0);
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.cognitiveLoad && typeof changes.cognitiveLoad.newValue === "number") {
        setLoad(changes.cognitiveLoad.newValue);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const theme = load > 80 ? { c: "#ff4d4d", t: "CRITICAL" } : load > 50 ? { c: "#ffcc00", t: "ELEVATED" } : { c: "#00ffcc", t: "OPTIMAL" };

  return (
    <div style={{ width: "300px", padding: "20px", background: "#050505", color: "white", textAlign: "center" }}>
      <h2 style={{ color: theme.c, fontSize: "1rem" }}>{theme.t} LOAD</h2>
      <div style={{ fontSize: "5rem", fontWeight: "bold" }}>{load}%</div>
      <div style={{ height: "100px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: "50px", height: "50px", borderRadius: "50%", border: `2px solid ${theme.c}`, boxShadow: `0 0 20px ${theme.c}aa` }}></div>
      </div>
      <button onClick={() => chrome.runtime.sendMessage({ type: "RESET_LOAD" })} style={{ marginTop: "20px", background: "none", border: "1px solid #333", color: "white", cursor: "pointer", padding: "5px 10px" }}>
        RESET SYSTEM
      </button>
    </div>
  );
}

export default App;