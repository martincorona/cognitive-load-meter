// src/content.ts

// 1. Inject custom animation styles into the webpage
const injectStyles = () => {
  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes breatheCircle {
      0%   { transform: scale(1); opacity: 0.4; }
      50%  { transform: scale(1.8); opacity: 1; }
      100% { transform: scale(1); opacity: 0.4; }
    }
  `;
  document.head.appendChild(style);
};
injectStyles();

// 2. Create the upgraded overlay
const createOverlay = () => {
  const overlay = document.createElement("div");
  overlay.id = "cognitive-load-overlay";
  
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(10, 15, 25, 0.85)", // Darker, calmer background
    backdropFilter: "blur(12px)", 
    zIndex: "2147483647", 
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
    fontFamily: "system-ui, sans-serif",
    opacity: "0",
    transition: "opacity 0.8s ease-in-out", // Slower, calmer fade in
    pointerEvents: "none" 
  });

  const message = document.createElement("h1");
  message.innerText = "Cognitive Load High.";
  message.style.fontSize = "2.5rem";
  message.style.fontWeight = "300";
  message.style.marginBottom = "40px";

  // The Breathing Circle
  const breather = document.createElement("div");
  Object.assign(breather.style, {
    width: "100px",
    height: "100px",
    borderRadius: "50%",
    backgroundColor: "rgba(100, 200, 255, 0.6)",
    boxShadow: "0 0 40px rgba(100, 200, 255, 0.4)",
    marginBottom: "50px",
    animation: "breatheCircle 8s infinite ease-in-out" // 4s inhale, 4s exhale
  });

  const subText = document.createElement("p");
  subText.innerText = "Breathe with the circle. Inhale... Exhale...";
  subText.style.fontSize = "1.2rem";
  subText.style.opacity = "0.7";

  const closeButton = document.createElement("button");
  closeButton.innerText = "I'm ready to focus.";
  Object.assign(closeButton.style, {
    marginTop: "40px",
    padding: "12px 30px",
    fontSize: "1.1rem",
    border: "1px solid rgba(255, 255, 255, 0.3)",
    borderRadius: "30px",
    backgroundColor: "transparent",
    color: "white",
    cursor: "pointer",
    transition: "all 0.3s"
  });

  closeButton.onmouseover = () => {
    closeButton.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
    closeButton.style.border = "1px solid rgba(255, 255, 255, 0.6)";
  };
  closeButton.onmouseout = () => {
    closeButton.style.backgroundColor = "transparent";
    closeButton.style.border = "1px solid rgba(255, 255, 255, 0.3)";
  };

  closeButton.onclick = () => {
    overlay.style.opacity = "0";
    setTimeout(() => {
      chrome.storage.local.set({ currentLoadScore: 0 }); 
      isOverlayActive = false;
    }, 800); // Wait for the fade out
     // Reset the flag immediately to allow future triggers
  };

  overlay.appendChild(message);
  overlay.appendChild(breather);
  overlay.appendChild(subText);
  overlay.appendChild(closeButton);
  document.body.appendChild(overlay);

  return overlay;
};

const overlayElement = createOverlay();

// Keep your existing setInterval listener down here exactly as it was!
let isOverlayActive = false;

setInterval(() => {
  chrome.storage.local.get(["currentLoadScore"], (result) => {
    const score = result.currentLoadScore || 0;
    
    if (score > 85 && !isOverlayActive) {
      isOverlayActive = true;
      overlayElement.style.pointerEvents = "all";
      overlayElement.style.opacity = "1"; 
    } 
    
    if (score < 50 && isOverlayActive) {
        isOverlayActive = false;
    }
  });
}, 2000);