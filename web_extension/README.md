# OM_E_WEB Chrome Extension

A Chrome extension (MV3) that provides browser automation capabilities via WebSocket connection to a Python server.

## Features

- **WebSocket Communication**: Connects to local Python server on `ws://127.0.0.1:17892`
- **Browser Control**: Navigate, wait for elements, get text, click elements
- **Real-time Updates**: Auto-reconnects with backoff on connection loss
- **Configurable**: Change WebSocket URL via popup interface

## Installation

### 1. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `web_extension/` folder
5. The extension should appear in your extensions list

### 2. Start Python WebSocket Server

```bash
cd om_e_web_ws
python ws_server.py
```

You should see: `WS listening on ws://127.0.0.1:17892`

### 3. Test Connection

```bash
cd om_e_web_ws
python test_connection.py
```

### 4. Run Demo

```bash
cd om_e_web_ws
python quick_demo.py
```

## Extension Components

- **manifest.json**: Extension configuration and permissions
- **sw.js**: Service worker - handles WebSocket connection and command routing
- **content.js**: Content script - executes DOM operations in web pages
- **popup.html/js**: Extension popup for configuration

## Commands Supported

- `navigate(url)`: Navigate to URL
- `waitFor(selector, timeoutMs)`: Wait for element to appear
- `getText(selector)`: Extract text from element
- `click(selector)`: Click element with scroll-into-view

## Troubleshooting

### Extension Not Connecting
1. Check if Python server is running on port 17892
2. Verify extension is loaded and enabled
3. Check browser console for errors
4. Try changing WebSocket URL in extension popup

### Commands Not Working
1. Ensure you're on a regular web page (not chrome:// pages)
2. Check if page has loaded completely
3. Verify selector syntax is correct
4. Check browser console for JavaScript errors

## Development

The extension is designed to be lightweight and fast:
- No full DOM scans
- Minimal memory footprint
- Fast element detection
- Efficient WebSocket communication

## Next Steps

This is Step 1 of the OM_E_WEB Web Arm implementation. Future enhancements will include:
- ROI screenshots
- Advanced element detection
- RAG playbook integration
- Delta streaming
