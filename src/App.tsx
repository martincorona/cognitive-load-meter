// src/App.tsx
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { MeshDistortMaterial, Sphere } from "@react-three/drei";
import "./App.css";

// --- THE 3D COMPONENT ---
function StressOrb({ load }: { load: number }) {
  // Map the 0-100 score to 3D distortion (0.2 to 1.0) and speed (1 to 10)
  const distortion = Math.max(0.1, load / 100);
  const speed = Math.max(1, (load / 100) * 10);
  
  // Choose color based on stress level
  const color = load > 80 ? "#ff4d4d" : load > 50 ? "#ffcc00" : "#00ffcc";

  return (
    <Sphere visible args={[1, 64, 64]} scale={1.8}>
      <MeshDistortMaterial
        color={color}
        attach="material"
        distort={distortion} // How spiky it is
        speed={speed}        // How fast it morphs
        roughness={0.2}      // Makes it look shiny/glassy
        metalness={0.8}
      />
    </Sphere>
  );
}

// --- THE DASHBOARD ---
function App() {
  const [load, setLoad] = useState<number>(0);

  useEffect(() => {
    // 1. Get initial load on open
    chrome.storage.local.get(["cognitiveLoad"], (res) => {
      setLoad(typeof res.cognitiveLoad === "number" ? res.cognitiveLoad : 0);
    });

    // 2. Listen for real-time updates from background.ts
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.cognitiveLoad && typeof changes.cognitiveLoad.newValue === "number") {
        setLoad(changes.cognitiveLoad.newValue);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Set text labels
  const theme = load > 80 ? { c: "#ff4d4d", t: "CRITICAL" } : load > 50 ? { c: "#ffcc00", t: "ELEVATED" } : { c: "#00ffcc", t: "OPTIMAL" };

  return (
    <div style={{ width: "300px", padding: "20px", background: "#050505", color: "white", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ color: theme.c, fontSize: "1rem", letterSpacing: "2px" }}>{theme.t} LOAD</h2>
      <div style={{ fontSize: "5rem", fontWeight: "bold", lineHeight: "1" }}>{load}%</div>
      
      {/* --- 3D CANVAS AREA --- */}
      <div style={{ height: "160px", width: "100%", marginTop: "10px", marginBottom: "10px" }}>
        <Canvas>
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 2, 2]} intensity={2} />
          <StressOrb load={load} />
        </Canvas>
      </div>

      <button 
        onClick={() => chrome.runtime.sendMessage({ type: "RESET_LOAD" })} 
        style={{ background: "none", border: `1px solid rgba(255,255,255,0.2)`, color: "white", cursor: "pointer", padding: "8px 16px", borderRadius: "4px", textTransform: "uppercase", fontSize: "0.8rem", transition: "all 0.3s" }}
      >
        Reset System
      </button>
    </div>
  );
}

export default App;