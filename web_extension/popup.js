// Get DOM elements
const wsUrlInput = document.getElementById("wsUrl");
const saveButton = document.getElementById("saveBtn");
const statusDiv = document.getElementById("status");

// Load saved WebSocket URL from storage
chrome.storage.local.get(["wsUrl"], (result) => {
    if (result.wsUrl) {
        wsUrlInput.value = result.wsUrl;
    }
});

// Handle save button click
saveButton.addEventListener("click", () => {
    const url = wsUrlInput.value.trim();
    
    if (!url) {
        showStatus("Please enter a WebSocket URL", "error");
        return;
    }
    
    // Validate WebSocket URL format
    if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
        showStatus("Invalid WebSocket URL format", "error");
        return;
    }
    
    // Send message to service worker to update URL
    chrome.runtime.sendMessage({ type: "setWsUrl", url }, (response) => {
        if (response && response.ok) {
            showStatus("WebSocket URL saved and reconnecting...", "success");
        } else {
            showStatus("Failed to save WebSocket URL", "error");
        }
    });
});

// Show status message with styling
function showStatus(message, type = "success") {
    statusDiv.textContent = message;
    statusDiv.className = type;
    
    // Clear status after 3 seconds
    setTimeout(() => {
        statusDiv.textContent = "";
        statusDiv.className = "";
    }, 3000);
}

// Add enter key support for input field
wsUrlInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        saveButton.click();
    }
});
