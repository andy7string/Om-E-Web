/**
 * at_scanner.js - Accessibility Tree Scanner
 *
 * Uses Chrome DevTools Protocol (CDP) via chrome.debugger API to get
 * the browser's native accessibility tree. This provides:
 * - Hierarchical structure with parent-child relationships
 * - Computed accessible names (handles aria-labelledby, etc.)
 * - Framework-agnostic element discovery
 * - Stable ref_id pointers for element resolution
 *
 * Config-driven filtering via at_site_configs.json:
 * - Exclude Om_E HUD elements by name
 * - Site-specific role filtering
 * - Depth and node count limits
 *
 * The debugger attaches briefly (~100-200ms), grabs the tree, detaches.
 * User sees a brief yellow flash - that's the "Om_E is scanning" indicator.
 */

// ============================================================================
// CONFIG LOADING
// ============================================================================

/** @type {Object|null} Cached AT site config mapping */
let atConfigMapping = null;

/** @type {Map<string, Object>} Cached individual site configs */
const atConfigCache = new Map();

/**
 * Load AT site config mapping (at_site_configs.json)
 * @returns {Promise<Object>}
 */
async function loadATConfigMapping() {
  if (atConfigMapping) return atConfigMapping;

  try {
    const url = chrome.runtime.getURL('at_site_configs.json');
    const response = await fetch(url);
    atConfigMapping = await response.json();
    console.log('[AT] Loaded config mapping:', Object.keys(atConfigMapping).length, 'entries');
    return atConfigMapping;
  } catch (e) {
    console.warn('[AT] Failed to load at_site_configs.json:', e.message);
    return { default: 'at_site_configs/default.json' };
  }
}

/**
 * Get AT config for a URL
 * @param {string} url - Page URL
 * @returns {Promise<Object>} - Config object
 */
async function getATConfig(url) {
  const mapping = await loadATConfigMapping();

  // Extract hostname from URL
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    hostname = '';
  }

  // Find matching config (check exact, then wildcard, then default)
  let configPath = mapping.default || 'at_site_configs/default.json';

  for (const [pattern, path] of Object.entries(mapping)) {
    if (pattern === 'default') continue;

    if (pattern.startsWith('*.')) {
      // Wildcard match: *.youtube.com matches www.youtube.com
      const suffix = pattern.slice(2);
      if (hostname === suffix || hostname.endsWith('.' + suffix)) {
        configPath = path;
        break;
      }
    } else if (hostname === pattern || hostname.endsWith('.' + pattern)) {
      configPath = path;
      break;
    }
  }

  // Check cache
  if (atConfigCache.has(configPath)) {
    return atConfigCache.get(configPath);
  }

  // Load config
  try {
    const configUrl = chrome.runtime.getURL(configPath);
    const response = await fetch(configUrl);
    const config = await response.json();

    // Handle extends
    if (config.extends === 'default' && configPath !== 'at_site_configs/default.json') {
      const defaultConfig = await getATConfig('about:blank'); // Get default
      const merged = { ...defaultConfig, ...config };
      // Merge arrays instead of replace
      merged.exclude_names = [...(defaultConfig.exclude_names || []), ...(config.exclude_names || [])];
      merged.exclude_name_patterns = [...(defaultConfig.exclude_name_patterns || []), ...(config.exclude_name_patterns || [])];
      atConfigCache.set(configPath, merged);
      return merged;
    }

    atConfigCache.set(configPath, config);
    console.log('[AT] Loaded config for', hostname, ':', configPath);
    return config;
  } catch (e) {
    console.warn('[AT] Failed to load config:', configPath, e.message);
    return getDefaultConfig();
  }
}

/**
 * Get hardcoded default config (fallback)
 */
function getDefaultConfig() {
  return {
    exclude_roles: ['none', 'presentation', 'generic', 'paragraph', 'LineBreak', 'InlineTextBox', 'StaticText'],
    exclude_names: ['HIDE PROMPT', 'HUD', 'Scroll to top', 'Drag to scroll', 'Scroll to bottom', 'Send message', 'Ask anything...', 'Copy to clipboard'],
    exclude_name_patterns: ['^\\+$', '^−$', '^ome-', 'Om_E'],
    max_depth: 15,
    max_nodes: 500
  };
}

// ============================================================================
// MAIN EXPORT: getAccessibilityTree
// ============================================================================

/**
 * Get the full accessibility tree for a tab
 * @param {number} tabId - Chrome tab ID to scan
 * @returns {Promise<Object>} - {nodes: [...], title, url, timestamp}
 */
async function getAccessibilityTree(tabId) {
  const debuggee = { tabId };

  try {
    // Attach debugger to tab
    await attachDebugger(debuggee);

    // Get page info
    const pageInfo = await getPageInfo(debuggee);

    // Load config for this URL
    const config = await getATConfig(pageInfo.url);

    // Get viewport info for position-aware filtering
    const viewport = await getViewportInfo(debuggee);

    // Get full accessibility tree via CDP
    const rawTree = await sendCommand(debuggee, 'Accessibility.getFullAXTree');

    // Process nodes into our format (with config-driven filtering)
    const nodes = processATNodes(rawTree.nodes || [], config);

    // Build hierarchical structure
    const tree = buildHierarchy(nodes);

    // Format timestamp to match text.md: YYYY-MM-DD HH:MM:SS
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    return {
      nodes: tree,
      flatNodes: nodes,
      title: pageInfo.title,
      url: pageInfo.url,
      timestamp,
      nodeCount: nodes.length,
      config,
      viewport  // Pass viewport for position-aware filtering
    };

  } finally {
    // Always detach, even on error
    await detachDebugger(debuggee).catch(() => {});
  }
}

/**
 * Get viewport scroll position and dimensions
 * @param {Object} debuggee - {tabId: number}
 * @returns {Object} - {scrollX, scrollY, viewportWidth, viewportHeight, contentHeight}
 */
async function getViewportInfo(debuggee) {
  try {
    const metrics = await sendCommand(debuggee, 'Page.getLayoutMetrics');
    return {
      scrollX: metrics.visualViewport?.pageX || 0,
      scrollY: metrics.visualViewport?.pageY || 0,
      viewportWidth: metrics.visualViewport?.clientWidth || 0,
      viewportHeight: metrics.visualViewport?.clientHeight || 0,
      contentHeight: metrics.contentSize?.height || 0
    };
  } catch (e) {
    console.warn('[AT] Failed to get viewport info:', e.message);
    return { scrollX: 0, scrollY: 0, viewportWidth: 0, viewportHeight: 0, contentHeight: 0 };
  }
}

// ============================================================================
// DEBUGGER HELPERS
// ============================================================================

/**
 * Attach Chrome debugger to tab
 * @param {Object} debuggee - {tabId: number}
 */
async function attachDebugger(debuggee) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(debuggee, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Detach Chrome debugger from tab
 * @param {Object} debuggee - {tabId: number}
 */
async function detachDebugger(debuggee) {
  return new Promise((resolve) => {
    chrome.debugger.detach(debuggee, () => {
      // Ignore errors on detach (tab might be closed)
      resolve();
    });
  });
}

/**
 * Send CDP command to debuggee
 * @param {Object} debuggee - {tabId: number}
 * @param {string} method - CDP method name
 * @param {Object} params - Optional parameters
 * @returns {Promise<Object>} - CDP response
 */
async function sendCommand(debuggee, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result || {});
      }
    });
  });
}

/**
 * Get page title and URL via CDP
 * @param {Object} debuggee - {tabId: number}
 * @returns {Promise<{title: string, url: string}>}
 */
async function getPageInfo(debuggee) {
  try {
    // Enable DOM domain first
    await sendCommand(debuggee, 'DOM.enable');
    const doc = await sendCommand(debuggee, 'DOM.getDocument');
    const url = doc.root?.documentURL || '';

    // Get title from document
    const result = await sendCommand(debuggee, 'Runtime.evaluate', {
      expression: 'document.title'
    });
    const title = result.result?.value || 'Unknown';

    return { title, url };
  } catch (e) {
    return { title: 'Unknown', url: '' };
  }
}

// ============================================================================
// NODE PROCESSING
// ============================================================================

/**
 * Process raw CDP accessibility nodes into our format
 * Handles parent-chain walking to maintain hierarchy when nodes are filtered out
 * @param {Array} rawNodes - Raw nodes from Accessibility.getFullAXTree
 * @param {Object} config - AT config with exclude_names, exclude_name_patterns, etc.
 * @returns {Array} - Processed nodes with ref_id, role, name, etc.
 */
function processATNodes(rawNodes, config = {}) {
  // Build exclude patterns from config
  const excludeNames = new Set(config.exclude_names || []);
  const excludePatterns = (config.exclude_name_patterns || []).map(p => new RegExp(p, 'i'));
  const excludeRoles = new Set(config.exclude_roles || ['none', 'presentation', 'generic', 'paragraph', 'LineBreak', 'InlineTextBox', 'StaticText']);

  // Check if a name should be excluded
  function shouldExcludeName(name) {
    if (!name) return false;
    if (excludeNames.has(name)) return true;
    for (const pattern of excludePatterns) {
      if (pattern.test(name)) return true;
    }
    return false;
  }

  // Check if role should be skipped
  function shouldSkipRoleConfig(role) {
    return excludeRoles.has(role);
  }

  // First pass: build lookup map of ALL nodes (including ones we'll skip)
  // so we can walk parent chains
  const rawNodeMap = new Map();
  for (const node of rawNodes) {
    rawNodeMap.set(node.nodeId, node);
  }

  // Track which nodes we keep (by nodeId)
  const keptNodeIds = new Set();

  // First pass: determine which nodes to keep
  for (const node of rawNodes) {
    if (node.ignored) continue;
    const role = node.role?.value || 'generic';
    if (shouldSkipRoleConfig(role)) continue;

    // Check name exclusion
    const name = extractName(node);
    if (shouldExcludeName(name)) continue;

    keptNodeIds.add(node.nodeId);
  }

  // Helper: find nearest kept ancestor
  function findKeptAncestor(nodeId) {
    let current = rawNodeMap.get(nodeId);
    while (current && current.parentId) {
      if (keptNodeIds.has(current.parentId)) {
        return current.parentId;
      }
      current = rawNodeMap.get(current.parentId);
    }
    return null; // No kept ancestor found
  }

  // Second pass: process kept nodes with corrected parent references
  const processed = [];
  const maxNodes = config.max_nodes || 500;

  for (const node of rawNodes) {
    if (processed.length >= maxNodes) break;
    if (node.ignored) continue;

    const role = node.role?.value || 'generic';
    if (shouldSkipRoleConfig(role)) continue;

    // Extract properties
    const name = extractName(node);

    // Skip if name matches exclusion list
    if (shouldExcludeName(name)) continue;

    const value = extractValue(node);
    const states = extractStates(node);
    const interactive = isInteractive(role, states);

    // Find nearest kept ancestor (may skip several levels of 'generic' etc.)
    const keptParentId = findKeptAncestor(node.nodeId);

    processed.push({
      ref_id: node.nodeId,
      backendNodeId: node.backendDOMNodeId,
      role: role,
      name: name,
      value: value,
      states: states,
      interactive: interactive,
      parentId: keptParentId,  // Now points to nearest KEPT ancestor
      childIds: node.childIds || [],
      level: node.properties?.find(p => p.name === 'level')?.value?.value,
      focused: states.focused || false
    });
  }

  console.log(`[AT] Processed ${processed.length} nodes (excluded ${rawNodes.length - processed.length} by config)`);
  return processed;
}

/**
 * Roles to skip (add noise, not useful for LLM)
 */
function shouldSkipRole(role) {
  const skipRoles = [
    'none',
    'presentation',
    'generic',        // Most divs - too noisy
    'paragraph',      // Text containers
    'LineBreak',
    'InlineTextBox',
    'StaticText'      // Raw text nodes
  ];
  return skipRoles.includes(role);
}

/**
 * Extract accessible name from node
 */
function extractName(node) {
  // Check name property
  if (node.name?.value) {
    return node.name.value;
  }

  // Check properties array for name
  const nameProp = node.properties?.find(p => p.name === 'name');
  if (nameProp?.value?.value) {
    return nameProp.value.value;
  }

  return '';
}

/**
 * Extract value from node (for inputs)
 */
function extractValue(node) {
  if (node.value?.value !== undefined) {
    return node.value.value;
  }

  const valueProp = node.properties?.find(p => p.name === 'value');
  if (valueProp?.value?.value !== undefined) {
    return valueProp.value.value;
  }

  return null;
}

/**
 * Extract relevant states from node
 */
function extractStates(node) {
  const states = {};
  const props = node.properties || [];

  for (const prop of props) {
    switch (prop.name) {
      case 'focused':
        states.focused = prop.value?.value === true;
        break;
      case 'expanded':
        states.expanded = prop.value?.value;
        break;
      case 'pressed':
        states.pressed = prop.value?.value;
        break;
      case 'checked':
        states.checked = prop.value?.value;
        break;
      case 'selected':
        states.selected = prop.value?.value;
        break;
      case 'disabled':
        states.disabled = prop.value?.value === true;
        break;
      case 'required':
        states.required = prop.value?.value === true;
        break;
      case 'invalid':
        states.invalid = prop.value?.value;
        break;
    }
  }

  return states;
}

/**
 * Determine if node is interactive
 */
function isInteractive(role, states) {
  const interactiveRoles = [
    'button',
    'link',
    'textbox',
    'combobox',
    'listbox',
    'option',
    'checkbox',
    'radio',
    'switch',
    'slider',
    'spinbutton',
    'searchbox',
    'tab',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'treeitem'
  ];

  // Disabled elements aren't really interactive
  if (states.disabled) return false;

  return interactiveRoles.includes(role);
}

// ============================================================================
// HIERARCHY BUILDING
// ============================================================================

/**
 * Build hierarchical tree from flat node list
 * @param {Array} nodes - Flat list of processed nodes
 * @returns {Array} - Tree structure with children nested
 */
function buildHierarchy(nodes) {
  // Create lookup map
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.ref_id, { ...node, children: [] });
  }

  // Build tree
  const roots = [];

  for (const node of nodes) {
    const current = nodeMap.get(node.ref_id);

    if (node.parentId && nodeMap.has(node.parentId)) {
      // Add as child of parent
      nodeMap.get(node.parentId).children.push(current);
    } else {
      // No parent in our filtered set, treat as root
      roots.push(current);
    }
  }

  return roots;
}

// ============================================================================
// FORMAT FOR OUTPUT
// ============================================================================

/**
 * Format tree as indented text for LLM consumption
 * Matches DOM pipeline format: [N] role: "name" → {"act": N, ...}
 * Applies first_nodes/last_nodes filtering for infinite scroll pages
 * @param {Array} tree - Hierarchical tree
 * @param {Object} pageInfo - {title, url, timestamp}
 * @param {Object} config - AT config with llm_output settings
 * @returns {Object} - {markdown: string, registry: Array}
 */
function formatTreeAsMarkdown(tree, pageInfo, config = {}) {
  const headerLines = [];
  const contentLines = [];
  const registry = [];  // Maps actionId → element data (like DOM's ELEMENT_REGISTRY)

  // Header (always included)
  headerLines.push(`# ${pageInfo.title}`);
  headerLines.push('');
  headerLines.push(`**URL:** ${pageInfo.url}`);
  headerLines.push(`**Timestamp:** ${pageInfo.timestamp}`);
  headerLines.push(`**Scan Type:** Accessibility Tree`);
  headerLines.push('');
  headerLines.push('---');
  headerLines.push('');

  // Track action index for interactive elements
  let actionIndex = 0;

  // Recursive formatter
  function formatNode(node, depth = 0) {
    const indent = '  '.repeat(depth);
    const role = node.role;
    const name = node.name ? `"${node.name}"` : '';

    // Build line
    let line = indent;

    if (node.interactive) {
      // Build action hint (matches DOM format)
      const actionHint = { act: actionIndex };

      // Add value capability for inputs
      if (['textbox', 'combobox', 'searchbox', 'spinbutton'].includes(node.role)) {
        actionHint.value = '...';
        actionHint.submit = true;
      }

      // Add states to hint
      if (node.states.expanded !== undefined) actionHint.expanded = node.states.expanded;
      if (node.states.checked !== undefined) actionHint.checked = node.states.checked;

      line += `[${actionIndex}] ${role}`;
      if (name) line += `: ${name}`;
      line += ` → ${JSON.stringify(actionHint)}`;

      // Add to registry (ref stays server-side, not in LLM output)
      registry.push({
        id: actionIndex,
        ref: node.ref_id,           // CDP backendNodeId for interaction
        role: node.role,
        name: node.name || null,
        value: node.value,
        states: node.states
      });

      actionIndex++;
    } else {
      // Non-interactive elements (landmarks, headings, etc.)
      line += role;
      if (name) line += `: ${name}`;
    }

    // Add states if present
    const stateStr = formatStates(node.states);
    if (stateStr) line += ` (${stateStr})`;

    contentLines.push(line);

    // Recurse children
    for (const child of node.children || []) {
      formatNode(child, depth + 1);
    }
  }

  // Format all roots
  for (const root of tree) {
    formatNode(root);
  }

  // Apply viewport-aware filtering for LLM output
  // Uses scroll position to show: first N (nav/search) + viewport content
  const llmOutput = config.llm_output || {};
  const firstN = llmOutput.first_nodes || 50;
  const viewportN = llmOutput.viewport_nodes || 100;
  const totalContent = contentLines.length;
  const viewport = config.viewport || {};

  let filteredContent;

  // If no viewport info or small content, show all
  if (!viewport.contentHeight || totalContent <= firstN + viewportN) {
    filteredContent = contentLines;
  } else {
    // Calculate viewport position as percentage of content
    const scrollPercent = viewport.scrollY / Math.max(1, viewport.contentHeight - viewport.viewportHeight);

    // Map scroll percentage to content line index
    const contentStart = firstN;  // Skip structural elements
    const contentEnd = totalContent;
    const contentRange = contentEnd - contentStart;

    // Center viewport slice around current scroll position
    const viewportCenter = contentStart + Math.floor(scrollPercent * contentRange);
    const halfViewport = Math.floor(viewportN / 2);
    let sliceStart = Math.max(contentStart, viewportCenter - halfViewport);
    let sliceEnd = Math.min(contentEnd, sliceStart + viewportN);

    // Adjust if we hit the end
    if (sliceEnd === contentEnd) {
      sliceStart = Math.max(contentStart, sliceEnd - viewportN);
    }

    // Build output: first N (nav/search) + viewport slice
    const firstPart = contentLines.slice(0, firstN);
    const viewportPart = contentLines.slice(sliceStart, sliceEnd);
    const skippedBefore = sliceStart - firstN;
    const skippedAfter = contentEnd - sliceEnd;

    filteredContent = [...firstPart];

    if (skippedBefore > 0) {
      filteredContent.push('', `... [${skippedBefore} lines above viewport] ...`, '');
    }

    filteredContent.push(...viewportPart);

    if (skippedAfter > 0) {
      filteredContent.push('', `... [${skippedAfter} lines below viewport] ...`);
    }
  }

  return {
    markdown: [...headerLines, ...filteredContent].join('\n'),
    registry: registry  // Full registry - all actions still executable
  };
}

/**
 * Format states for display
 */
function formatStates(states) {
  const parts = [];

  if (states.focused) parts.push('focused');
  if (states.expanded === true) parts.push('expanded');
  if (states.expanded === false) parts.push('collapsed');
  if (states.checked === true) parts.push('checked');
  if (states.checked === false) parts.push('unchecked');
  if (states.pressed === true) parts.push('pressed');
  if (states.selected) parts.push('selected');
  if (states.disabled) parts.push('disabled');
  if (states.required) parts.push('required');

  return parts.join(', ');
}

// ============================================================================
// ELEMENT RESOLUTION VIA BACKEND NODE ID
// ============================================================================

/**
 * Click an element by its ref_id
 * @param {number} tabId - Tab ID
 * @param {number} refId - ref_id from AT scan
 * @returns {Promise<boolean>} - Success
 */
async function clickByRefId(tabId, refId, flatNodes) {
  const debuggee = { tabId };

  try {
    // Find node to get backendNodeId
    const node = flatNodes.find(n => n.ref_id === refId);
    if (!node || !node.backendNodeId) {
      throw new Error(`Node not found for ref_id: ${refId}`);
    }

    await attachDebugger(debuggee);

    // Enable DOM
    await sendCommand(debuggee, 'DOM.enable');

    // Resolve to DOM node
    const resolved = await sendCommand(debuggee, 'DOM.resolveNode', {
      backendNodeId: node.backendNodeId
    });

    if (!resolved.object?.objectId) {
      throw new Error('Could not resolve node to DOM element');
    }

    // Get box model for click coordinates
    const boxModel = await sendCommand(debuggee, 'DOM.getBoxModel', {
      backendNodeId: node.backendNodeId
    });

    if (!boxModel.model) {
      throw new Error('Could not get element position');
    }

    // Calculate center of element
    const content = boxModel.model.content;
    const x = (content[0] + content[2] + content[4] + content[6]) / 4;
    const y = (content[1] + content[3] + content[5] + content[7]) / 4;

    // Dispatch click
    await sendCommand(debuggee, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x, y,
      button: 'left',
      clickCount: 1
    });

    await sendCommand(debuggee, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x, y,
      button: 'left',
      clickCount: 1
    });

    return true;

  } finally {
    await detachDebugger(debuggee).catch(() => {});
  }
}

/**
 * Set value on an input by its ref_id
 * @param {number} tabId - Tab ID
 * @param {number} refId - ref_id from AT scan
 * @param {string} value - Value to set
 * @returns {Promise<boolean>} - Success
 */
async function setValueByRefId(tabId, refId, value, flatNodes) {
  const debuggee = { tabId };

  try {
    const node = flatNodes.find(n => n.ref_id === refId);
    if (!node || !node.backendNodeId) {
      throw new Error(`Node not found for ref_id: ${refId}`);
    }

    await attachDebugger(debuggee);
    await sendCommand(debuggee, 'DOM.enable');

    // Focus the element first
    await sendCommand(debuggee, 'DOM.focus', {
      backendNodeId: node.backendNodeId
    });

    // Clear existing value and type new value
    // Select all and replace
    await sendCommand(debuggee, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      modifiers: 2, // Ctrl
      key: 'a',
      code: 'KeyA'
    });

    // Type the new value
    await sendCommand(debuggee, 'Input.insertText', {
      text: value
    });

    return true;

  } finally {
    await detachDebugger(debuggee).catch(() => {});
  }
}

// ============================================================================
// EXPORTS (for service worker)
// ============================================================================

// These will be available when this script is imported into sw.js
if (typeof globalThis !== 'undefined') {
  globalThis.ATScanner = {
    getAccessibilityTree,
    formatTreeAsMarkdown,
    clickByRefId,
    setValueByRefId
  };
}
