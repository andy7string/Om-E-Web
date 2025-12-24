/**
 * Chat Test Helper - Runs in MAIN world for console testing
 * Bridges postMessage to content script for chat functionality
 *
 * PURPOSE: Allows Claude Code (or console) to invoke Om-E capabilities
 * via JavaScript execution. The content script runs in an isolated world,
 * so we use postMessage to bridge between MAIN world and content script.
 *
 * USAGE:
 *   omeSendChat("scroll down") - Sends message to LLM and returns response
 *   omeSendChat("hello", true) - Clears history first, then sends
 *
 * ADDED: 2025-12-23 for Claude Code integration testing
 */

/**
 * Send message to LLM orchestrator and get response
 * This is the single entry point for chat - triggers full LLM pipeline
 * Uses LLMChat capability - goes through RAG, prompt assembly, LLM call
 *
 * @param {string} message - The user's message text
 * @param {boolean} clearHistory - Reset agent conversation history (default: false)
 * @returns {Promise<Object>} - LLM response with chat_id, response, etc.
 */
window.omeSendChat = function(message, clearHistory = false) {
    console.log('[OME Test] Sending message:', message);
    window.postMessage({
        type: 'ome_llm_chat_test',
        message,
        clearHistory
    }, '*');

    return new Promise((resolve) => {
        const handler = (e) => {
            if (e.data?.type === 'ome_llm_chat_result') {
                window.removeEventListener('message', handler);
                console.log('[OME Test] Result:', e.data);
                resolve(e.data.result || e.data.error);
            }
        };
        window.addEventListener('message', handler);

        // Timeout after 30s for LLM calls
        setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve({ error: 'Timeout waiting for LLM response' });
        }, 30000);
    });
};

console.log('[OME] window.omeSendChat ready for testing');
