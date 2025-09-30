#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createLLMOptimizedStructure } = require('./create_llm_structure');

const args = parseArgs(process.argv.slice(2));
const pagePath = path.resolve(args.page || 'om_e_web_ws/@site_structures/page.jsonl');
const textPath = path.resolve(args.text || 'om_e_web_ws/@site_structures/text.md');
const outPath = path.resolve(args.output || 'om_e_web_ws/@site_structures/llm_optimized.json');
const debounceMs = Number(args.debounce || 500);
const quiet = Boolean(args.quiet);

ensureFile(pagePath);
ensureFile(textPath);

let timer = null;
let isRunning = false;
const pendingTriggers = new Set();
const requiredTriggers = new Set(['page', 'text']);

runOptimization('startup', { force: true });

watchFile(pagePath, 'page');
watchFile(textPath, 'text');

function watchFile(file, label) {
  try {
    fs.watch(file, { persistent: true }, (eventType) => {
      if (!quiet) {
        console.log(`[watch] ${path.basename(file)} ${eventType} detected`);
      }
      scheduleRun(label);
    });
    if (!quiet) {
      console.log(`[watch] Watching ${file}`);
    }
  } catch (error) {
    console.error(`[watch] Failed to watch ${file}:`, error.message);
    process.exit(1);
  }
}

function scheduleRun(label) {
  pendingTriggers.add(label);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const reason = Array.from(pendingTriggers).join(', ');
    runOptimization(reason);
  }, debounceMs);
}

function runOptimization(reason, { force = false } = {}) {
  if (isRunning) {
    if (!quiet) {
      console.log('[watch] Optimization already in progress, skipping duplicate trigger.');
    }
    return;
  }

  if (!force && pendingTriggers.size && pendingTriggers.size < requiredTriggers.size) {
    if (!quiet) {
      console.log('[watch] Waiting for both page.jsonl and text.md updates before regenerating.');
    }
    return;
  }

  isRunning = true;
  try {
    const result = createLLMOptimizedStructure(pagePath, textPath);
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    if (!quiet) {
      console.log(`[watch] 🔁 Regenerated ${relative(outPath)} (triggered by ${reason})`);
    }
    pendingTriggers.clear();
  } catch (error) {
    console.error('[watch] ❌ Optimization failed:', error.message);
  } finally {
    isRunning = false;
  }
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[watch] Required file not found: ${filePath}`);
    process.exit(1);
  }
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.replace(/^--/, '');
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function relative(targetPath) {
  return path.relative(process.cwd(), targetPath) || targetPath;
}

process.on('SIGINT', () => {
  if (!quiet) {
    console.log('\n[watch] Stopping LLM optimizer watcher.');
  }
  process.exit(0);
});
