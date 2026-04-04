// src/content.ts

// 1. Create the overlay element (but don't show it yet)
const createOverlay = () => {
  const overlay = document.createElement("div");
  overlay.id = "cognitive-load-overlay";
  
  // Premium styling: Glassmorphism blur effect
  Object.assign(overlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    backdropFilter: "blur(8px)", // The magic blur effect
    zIndex: "999999", // Make sure it's on top of EVERYTHING
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
    fontFamily: "system-ui, sans-serif",
    opacity: "0",
    transition: "opacity 0.5s ease-in-out",
    pointerEvents: "none" // Start hidden
  });

  const message = document.createElement("h1");
  message.innerText = "Cognitive Load High.";
  message.style.fontSize = "3rem";
  message.style.marginBottom = "10px";

  const subText = document.createElement("p");
  subText.innerText = "You've been moving fast. Take a 30-second breath.";
  subText.style.fontSize = "1.5rem";
  subText.style.opacity = "0.8";

  const closeButton = document.createElement("button");
  closeButton.innerText = "I'm focused. Let me work.";
  Object.assign(closeButton.style, {
    marginTop: "30px",
    padding: "12px 24px",
    fontSize: "1.2rem",
    border: "none",
    borderRadius: "8px",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    color: "white",
    cursor: "pointer",
    transition: "background 0.2s"
  });

  // Hover effect for button
  closeButton.onmouseover = () => closeButton.style.backgroundColor = "rgba(255, 255, 255, 0.4)";
  closeButton.onmouseout = () => closeButton.style.backgroundColor = "rgba(255, 255, 255, 0.2)";

  // Dismiss logic
  closeButton.onclick = () => {
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.style.pointerEvents = "none";
      // Tell Chrome we took a break, reset the score so it doesn't immediately pop up again
      chrome.storage.local.set({ currentLoadScore: 0 }); 
    }, 500);
  };

  overlay.appendChild(message);
  overlay.appendChild(subText);
  overlay.appendChild(closeButton);
  document.body.appendChild(overlay);

  return overlay;
};

// Initialize the overlay on the page
const overlayElement = createOverlay();

// 2. The Listener: Watch for the stress score to spike
let isOverlayActive = false;

// Check the score every 2 seconds
setInterval(() => {
  chrome.storage.local.get(["currentLoadScore"], (result) => {
    const score = result.currentLoadScore || 0;
    console.log("Current Load Score:", score); // For your debugging

    // If score is over 85 and the overlay isn't already showing
    if (score > 85 && !isOverlayActive) {
      isOverlayActive = true;
      overlayElement.style.pointerEvents = "all";
      overlayElement.style.opacity = "1"; // Fade it in!
    } 
    
    // Reset flag if score drops naturally
    if (score < 50 && isOverlayActive) {
        isOverlayActive = false;
    }
  });
}, 2000);