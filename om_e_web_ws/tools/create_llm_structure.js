#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function createLLMOptimizedStructure(pageJsonlPath, textMdPath) {
  const pageRecords = loadPageRecords(pageJsonlPath);
  const textContent = fs.readFileSync(textMdPath, 'utf8');

  const { metaRecord, sectionsById, textById, actions } = buildPageIndexes(pageRecords);
  const { inlineMeta, markdownLines, usedActionIds } = parseTextStructure(textContent, actions, sectionsById, textById);
  const meta = buildMeta(metaRecord, inlineMeta);
  const actionsMap = buildActionsMap(actions.list, sectionsById, new Set(usedActionIds));

  return {
    meta,
    markdown: markdownLines,
    actions: actionsMap,
    source: {
      pageJsonl: path.resolve(pageJsonlPath),
      textMd: path.resolve(textMdPath)
    },
    generatedAt: new Date().toISOString()
  };
}

function loadPageRecords(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      const err = new Error(`Failed to parse JSONL line ${index + 1}: ${error.message}`);
      err.cause = error;
      throw err;
    }
  });
}

function buildPageIndexes(records) {
  const sectionsById = new Map();
  const textById = new Map();
  const actions = {
    list: [],
    assigned: new Set(),
    used: new Set()
  };
  let metaRecord = null;

  records.forEach((record, index) => {
    if (record.type === 'meta' && !metaRecord) {
      metaRecord = record;
    }
    if (record.type === 'section') {
      sectionsById.set(record.id, {
        ...record,
        order: index,
        labelNormalized: normalizeForMatch(record.label),
        trailNormalized: null
      });
    }
    if (record.type === 'text') {
      textById.set(record.id, {
        ...record,
        order: index,
        textNormalized: normalizeForMatch(record.text)
      });
    }
    if (record.type === 'action') {
      const labels = buildActionLabels(record);
      actions.list.push({
        ...record,
        order: index,
        normalizedLabel: normalizeForMatch(record.label),
        normalizedAliases: labels.aliases,
        relatedTextIds: record.relatedTexts || [],
        cachedRelatedTexts: null,
        sectionLabelNormalized: null
      });
    }
  });

  actions.list.forEach(action => {
    const section = sectionsById.get(action.section);
    if (section) {
      action.sectionLabelNormalized = section.labelNormalized;
    }
  });

  sectionsById.forEach(section => {
    section.trailNormalized = buildSectionTrail(section.id, sectionsById).map(normalizeForMatch).filter(Boolean);
  });

  return { metaRecord, sectionsById, textById, actions };
}

function buildActionLabels(actionRecord) {
  const aliases = [];
  const addAlias = value => {
    const normalized = normalizeForMatch(value);
    if (normalized) aliases.push(normalized);
  };
  if (actionRecord.ariaLabel) addAlias(actionRecord.ariaLabel);
  if (actionRecord.title) addAlias(actionRecord.title);
  if (actionRecord.placeholder) addAlias(actionRecord.placeholder);
  if (actionRecord.alt) addAlias(actionRecord.alt);
  return { aliases };
}

function buildSectionTrail(sectionId, sectionsById) {
  const trail = [];
  let current = sectionsById.get(sectionId);
  while (current && current.parent) {
    const parent = sectionsById.get(current.parent);
    if (!parent) break;
    if (parent.label) trail.unshift(parent.label);
    current = parent;
  }
  return trail;
}

function parseTextStructure(markdownSource, actions, sectionsById, textById) {
  const rawLines = markdownSource.split(/\r?\n/);
  const inlineMeta = {};
  const headingStack = [];
  const renderedLines = [];

  rawLines.forEach(rawLine => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      renderedLines.push('');
      return;
    }

    const headingMatch = rawLine.match(/^(#+)\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      headingStack[level - 1] = normalizeForMatch(text);
      headingStack.length = level;
      renderedLines.push(`${'#'.repeat(level)} ${text}`);
      return;
    }

    if (/^---+$/.test(trimmed)) {
      renderedLines.push('---');
      return;
    }

    const metaMatch = trimmed.match(/^\*\*(.+?)\*\*\s*:?\s*(.*)$/);
    if (metaMatch) {
      const key = metaMatch[1].replace(/:$/, '').trim();
      const value = metaMatch[2].trim();
      inlineMeta[key.toLowerCase()] = value;
      renderedLines.push(`**${key}** ${value}`.trim());
      return;
    }

    const matches = findActionMatches(trimmed, actions, headingStack, sectionsById, textById);
    if (matches.length) {
      const primary = matches[0].record;
      const isFirstMention = !actions.assigned.has(primary.id);
      renderedLines.push(buildActionMarkup(trimmed, primary, isFirstMention ? 'primary' : 'ref'));
      actions.used.add(primary.id);
      if (isFirstMention) {
        actions.assigned.add(primary.id);
      }
      return;
    }
    renderedLines.push(trimmed);
  });

  return { inlineMeta, markdownLines: renderedLines, usedActionIds: Array.from(actions.used) };
}

function findActionMatches(text, actions, headingStack, sectionsById, textById) {
  const normalizedText = normalizeForMatch(text);
  if (!normalizedText) return [];

  const matches = [];

  actions.list.forEach(action => {
    const score = scoreActionMatch(action, normalizedText, text, headingStack, sectionsById, textById, actions.assigned);
    if (score > 0) {
      matches.push({ id: action.id, score, record: action });
    }
  });

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.record.order - b.record.order;
  });

  const bestScore = matches.length ? matches[0].score : 0;
  if (bestScore < 0.75) return [];
  const threshold = bestScore >= 2 ? Math.max(1.25, bestScore - 1) : bestScore * 0.9;
  const filtered = matches.filter(match => match.score >= threshold);
  const maxMatches = bestScore >= 3 ? 1 : 2;
  return filtered.slice(0, maxMatches);
}

function scoreActionMatch(action, normalizedText, rawText, headingStack, sectionsById, textById, assigned) {
  let score = 0;

  if (action.normalizedLabel === normalizedText) {
    score += 3;
  } else if (action.normalizedLabel) {
    if (action.normalizedLabel.includes(normalizedText)) {
      score += 1.25 * similarityFactor(action.normalizedLabel, normalizedText);
    }
    if (normalizedText.includes(action.normalizedLabel)) {
      score += 1.25 * similarityFactor(normalizedText, action.normalizedLabel);
    }
  }

  action.normalizedAliases.forEach(alias => {
    if (alias === normalizedText) {
      score += 1.5;
      return;
    }
    if (alias.includes(normalizedText)) {
      score += 0.75 * similarityFactor(alias, normalizedText);
    }
    if (normalizedText.includes(alias)) {
      score += 0.75 * similarityFactor(normalizedText, alias);
    }
  });

  const relatedTexts = getActionRelatedTexts(action, textById);
  relatedTexts.forEach(rel => {
    if (rel === normalizedText) {
      score += 1.1;
      return;
    }
    if (rel.includes(normalizedText)) {
      score += 0.4 * similarityFactor(rel, normalizedText);
    }
    if (normalizedText.includes(rel)) {
      score += 0.4 * similarityFactor(normalizedText, rel);
    }
  });

  if (rawText && action.label && normalizeWhitespace(action.label).includes(rawText)) {
    score += 0.5;
  }

  if (headingStack.length) {
    const currentHeading = headingStack[headingStack.length - 1];
    if (currentHeading && action.sectionLabelNormalized === currentHeading) {
      score += 0.75;
    } else if (action.sectionLabelNormalized && currentHeading && action.sectionLabelNormalized.includes(currentHeading)) {
      score += 0.4;
    }
    const sectionTrail = getSectionTrailNormalized(action, sectionsById);
    if (sectionTrail.includes(currentHeading)) {
      score += 0.35;
    }
  }

  if (!assigned.has(action.id)) {
    score += 0.25;
  } else {
    score -= 0.35;
  }

  if (action.visibility === 'visible') {
    score += 0.1;
  }

  const labelLength = action.normalizedLabel ? action.normalizedLabel.length : 0;
  if (labelLength && normalizedText.length > labelLength * 2 && score > 0) {
    const overFactor = Math.min(1.2, (normalizedText.length / labelLength - 2) * 0.4);
    score -= overFactor;
  }

  return score;
}

function getSectionTrailNormalized(action, sectionsById) {
  if (!action.section) return [];
  const section = sectionsById.get(action.section);
  return section && Array.isArray(section.trailNormalized) ? section.trailNormalized : [];
}

function getActionRelatedTexts(action, textById) {
  if (action.cachedRelatedTexts) return action.cachedRelatedTexts;
  const cache = [];
  action.relatedTextIds.forEach(id => {
    const textRecord = textById.get(id);
    if (!textRecord || !textRecord.text) return;
    const normalized = normalizeForMatch(textRecord.text);
    if (normalized) cache.push(normalized);
  });
  action.cachedRelatedTexts = cache;
  return cache;
}

function buildActionMarkup(text, action, mode) {
  const escaped = escapeMarkdownLinkText(text);
  const prefix = mode === 'primary' ? 'action' : 'action-ref';
  return `[${escaped}](${prefix}:${action.id})`;
}

function buildMeta(metaRecord, inlineMeta) {
  const meta = {};
  if (metaRecord) {
    meta.url = metaRecord.url;
    meta.title = metaRecord.title;
    if (metaRecord.timestamp) meta.timestamp = new Date(metaRecord.timestamp).toISOString();
    if (metaRecord.viewport) meta.viewport = metaRecord.viewport;
    if (metaRecord.totals) meta.totals = metaRecord.totals;
  }
  if (inlineMeta.url && !meta.url) meta.url = inlineMeta.url;
  if (inlineMeta.timestamp) {
    meta.timestampText = inlineMeta.timestamp;
  }
  return meta;
}

function buildActionsMap(actionList, sectionsById, usedSet) {
  const packed = {};
  actionList.forEach(action => {
    if (usedSet && usedSet.size && !usedSet.has(action.id)) {
      return;
    }
    const section = sectionsById.get(action.section);
    const parts = [
      action.label || '',
      action.href || '',
      action.selector || '',
      Array.isArray(action.actionTypes) ? action.actionTypes.join(',') : '',
      section && section.label ? section.label : '',
      section && section.selector ? section.selector : ''
    ];
    packed[action.id] = packActionParts(parts);
  });
  return {
    fields: ['label', 'href', 'selector', 'types', 'sectionLabel', 'sectionSelector'],
    data: packed
  };
}

function normalizeForMatch(value) {
  if (!value || typeof value !== 'string') return '';
  const ascii = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[…]/g, '...');
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWhitespace(value) {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function similarityFactor(longer, shorter) {
  if (!longer || !shorter) return 0;
  const lenLong = longer.length;
  const lenShort = shorter.length;
  if (lenShort === 0 || lenLong === 0) return 0;
  const baseRatio = lenShort / lenLong;
  const tokenOverlap = computeTokenOverlap(longer, shorter);
  return Math.min(1, baseRatio * 0.7 + tokenOverlap * 0.3);
}

function computeTokenOverlap(a, b) {
  if (!a || !b) return 0;
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  tokensA.forEach(token => {
    if (tokensB.has(token)) overlap += 1;
  });
  return overlap / Math.min(tokensA.size, tokensB.size);
}

function escapeMarkdownLinkText(value) {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\|/g, '\\|');
}

function packActionParts(parts) {
  return parts
    .map(part => {
      if (!part) return '';
      return String(part)
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .trim();
    })
    .join('|');
}

function printUsage() {
  const script = path.basename(process.argv[1] || 'create_llm_structure.js');
  console.error(`Usage: node ${script} <page.jsonl> <text.md> [output.json]`);
}

if (require.main === module) {
  const [, , pageArg, textArg, outputArg] = process.argv;
  if (!pageArg || !textArg) {
    printUsage();
    process.exit(1);
  }

  try {
    const result = createLLMOptimizedStructure(pageArg, textArg);
    if (outputArg) {
      const outputPath = path.resolve(outputArg);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`LLM optimized structure written to ${outputPath}`);
    } else {
      process.stdout.write(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { createLLMOptimizedStructure };
