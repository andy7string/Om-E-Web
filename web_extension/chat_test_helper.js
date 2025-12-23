/**
 * Chat Test Helper - Runs in MAIN world for console testing
 * Bridges postMessage to content script for chat functionality
 *
 * PURPOSE: Allows Claude Code (or console) to invoke Om-E capabilities
 * via JavaScript execution. The content script runs in an isolated world,
 * so we use postMessage to bridge between MAIN world and content script.
 *
 * USAGE:
 *   omeSendChat("hello") - Saves message to chat (AppendMessage capability)
 *   omeLLMChat("scroll down") - Triggers LLM orchestrator (updates llm_unified.md)
 *
 * ADDED: 2025-12-23 for Claude Code integration testing
 * Can be removed if no longer needed for automated testing
 */

/**
 * Save a message to chat storage (does NOT trigger LLM)
 * Uses AppendMessage capability - just persists the message
 */
window.omeSendChat = function(prompt, chatId = null, meta = {}) {
    console.log('[OME Test] Sending chat message:', prompt);
    window.postMessage({
        type: 'ome_send_chat_test',
        prompt,
        chatId,
        meta
    }, '*');

    return new Promise((resolve) => {
        const handler = (e) => {
            if (e.data?.type === 'ome_send_chat_result') {
                window.removeEventListener('message', handler);
                console.log('[OME Test] Result:', e.data);
                resolve(e.data.result || e.data.error);
            }
        };
        window.addEventListener('message', handler);

        // Timeout after 10s
        setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve({ error: 'Timeout waiting for response' });
        }, 10000);
    });
};

/**
 * Send message to LLM orchestrator and get response
 * This triggers the full LLM pipeline and updates llm_unified.md
 * Uses LLMChat capability - goes through RAG, prompt assembly, LLM call
 *
 * ADDED: 2025-12-23 for Claude Code integration testing
 */
window.omeLLMChat = function(message, clearHistory = false) {
    console.log('[OME Test] Sending LLM message:', message);
    window.postMessage({
        type: 'ome_llm_chat_test',
        message,
        clearHistory
    }, '*');

    return new Promise((resolve) => {
        const handler = (e) => {
            if (e.data?.type === 'ome_llm_chat_result') {
                window.removeEventListener('message', handler);
                console.log('[OME Test] LLM Result:', e.data);
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

console.log('[OME] window.omeSendChat and window.omeLLMChat ready for testing');
