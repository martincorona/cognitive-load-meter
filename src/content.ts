// src/content.ts

// ==========================================
// 1. SILENT TRACKER LOGIC (Person 1's Job)
// ==========================================
let activityCount = 0;

// Listen for mouse movement
window.addEventListener("mousemove", () => { 
  activityCount += 0.5; 
});

// Listen for keystrokes
window.addEventListener("keydown", () => { 
  activityCount += 2; 
});

// Every 2 seconds, send the batch of activity to the background script
setInterval(() => {
  if (activityCount > 0) {
    chrome.runtime.sendMessage({ type: "ACTIVITY_BATCH", value: activityCount });
    activityCount = 0; 
  }
}, 2000);


// ==========================================
// 2. OVERLAY UI LOGIC (Person 3's Job)
// ==========================================
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
      chrome.storage.local.set({ cognitiveLoad: 0 }); 
      // Tell the background script to reset its internal counter too
      chrome.runtime.sendMessage({ type: "RESET_LOAD" });
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


// ==========================================
// 3. THE LISTENER: Watch for the stress score to spike
// ==========================================
let isOverlayActive = false;

// Check the score every 2 seconds
setInterval(() => {
  // We use "cognitiveLoad" here to match what the background script is saving
  chrome.storage.local.get(["cognitiveLoad"], (result) => {
    const score = (result.cognitiveLoad as number) || 0;
    console.log("Current Load Score:", score); 

    // If score is over 85 and the overlay isn't already showing
    // PRO TIP: Change 85 to 20 when you are testing it so it triggers faster!
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