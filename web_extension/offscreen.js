(() => {
  const PORT_NAME = "ome_keep_alive";

  function connectPort() {
    try {
      const port = chrome.runtime.connect({ name: PORT_NAME });
      console.log("[Offscreen] Keep-alive port connected");

      port.onDisconnect.addListener(() => {
        console.warn("[Offscreen] Port disconnected, retrying…");
        setTimeout(connectPort, 500);
      });
    } catch (error) {
      console.error("[Offscreen] Failed to connect keep-alive port:", error);
      setTimeout(connectPort, 1000);
    }
  }

  connectPort();
})();
