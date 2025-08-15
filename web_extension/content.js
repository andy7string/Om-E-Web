const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const visible = (element) => {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    
    return rect.width > 0 && 
           rect.height > 0 && 
           style.visibility !== "hidden" && 
           style.display !== "none";
};

async function waitForSelector(selector, timeoutMs = 5000) {
    const startTime = performance.now();
    
    while (performance.now() - startTime < timeoutMs) {
        const element = document.querySelector(selector);
        if (element && visible(element)) {
            return element;
        }
        await sleep(60);
    }
    
    const error = { 
        code: "SELECTOR_NOT_FOUND", 
        msg: `Timeout waiting for ${selector}` 
    };
    throw error;
}

async function cmd_waitFor({ selector, timeoutMs }) { 
    await waitForSelector(selector, timeoutMs || 5000); 
    return { ok: true }; 
}

async function cmd_getText({ selector }) { 
    const element = await waitForSelector(selector, 2000); 
    return { text: element.innerText || element.value || "" }; 
}
async function cmd_click({ selector }) { 
    const el = await waitForSelector(selector, 5000); 
    el.scrollIntoView({ block: "center", inline: "center" }); 
    el.click(); 
    return { clicked: true }; 
}

// Handle messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            const { command, params } = message;
            
            if (command === "waitFor") {
                return sendResponse(await cmd_waitFor(params));
            }
            if (command === "getText") {
                return sendResponse(await cmd_getText(params));
            }
            if (command === "click") {
                return sendResponse(await cmd_click(params));
            }
            
            return sendResponse({ 
                error: { code: "UNKNOWN_COMMAND", msg: command } 
            });
        } catch (error) {
            return sendResponse({ 
                error: error.code ? error : { code: "DOM_ERROR", msg: String(error) } 
            });
        }
    })();
    
    return true; // Keep message channel open for async response
});
