/**
 * Chat Test Helper - Runs in MAIN world for console testing
 * Bridges postMessage to content script for chat functionality
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

console.log('[OME] window.omeSendChat ready for testing');
