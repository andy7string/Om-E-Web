# System Architecture Document

## Overview
This document outlines the complete end-to-end system architecture for the Om-E-Web application, including detailed message flows.

## Message Flow
1. **Test Client**
   - Description of the client triggers and interactions.
   - Sequence of messages sent to the WebSocket server.

2. **WebSocket Server**
   - Handling incoming messages.
   - Routing messages to the appropriate service worker.

3. **Service Worker**
   - Responsibilities and message handling logic.
   - Integration points with the content script.

4. **Content Script**
   - Interaction with the DOM.
   - How it communicates back to the WebSocket server.

5. **DOM Interaction**
   - Update and rendering logic.

## Scan Triggers
- List all triggers that initiate scans.
- State management based on these triggers.

## Integration Points
- Detailed mapping of integrations between all components.
- Summary of how data flows between components.

## Conclusion
Summarize key insights.

# ---