'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildHistory } = require('./rules-history');

const projectRoot = path.resolve(__dirname, '..');
const dataDirectory = path.join(projectRoot, 'data');
const dataPath = path.join(dataDirectory, 'rules.json');
const historyPath = path.join(dataDirectory, 'history.json');
const sourceRoot = path.resolve(process.argv[2] || path.join(projectRoot, 'source-bot'));
const checkOnly = process.argv.includes('--check');


function getRulesPublicationDate() {
  try {
    const committedAt = execFileSync(
      'git',
      ['-C', sourceRoot, 'log', '-1', '--format=%cI', '--', 'rules'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();

    const parsed = new Date(committedAt);
    if (committedAt && !Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  } catch (error) {
    // A source checkout without Git history is supported for local development.
  }

  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashSnapshot(value) {
  let hash = 14695981039346656037n;
  const bytes = new TextEncoder().encode(value);

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }

  return hash.toString(16).padStart(16, '0');
}

function validateArticles(articles, label) {
  if (!Array.isArray(articles) || articles.length === 0) {
    throw new Error(label + ' must contain at least one article.');
  }

  const ids = new Set();

  for (const article of articles) {
    if (!article || typeof article !== 'object') {
      throw new Error(label + ' contains an invalid article.');
    }

    for (const field of ['id', 'title', 'text']) {
      if (typeof article[field] !== 'string' || !article[field].trim()) {
        throw new Error(label + ' contains an article without a valid ' + field + '.');
      }
    }

    if (ids.has(article.id)) {
      throw new Error(label + ' contains duplicate article ID: ' + article.id);
    }

    ids.add(article.id);
  }
}

function flattenSections(sections, label) {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error(label + ' must contain at least one section.');
  }

  const articles = [];
  const allIds = new Set();

  for (const section of sections) {
    if (!section || !Array.isArray(section.articles)) {
      throw new Error(label + ' contains a section without an article list.');
    }

    validateArticles(section.articles, label + ' / ' + section.title);

    for (const article of section.articles) {
      if (allIds.has(article.id)) {
        throw new Error(label + ' contains duplicate article ID across sections: ' + article.id);
      }

      allIds.add(article.id);
      articles.push(article);
    }
  }

  return articles;
}

function buildSnapshot(existingData) {
  const rulesDirectory = path.join(sourceRoot, 'rules');

  if (!fs.existsSync(path.join(rulesDirectory, 'constitution.js'))) {
    throw new Error('Anireil-Bot rules source was not found at: ' + rulesDirectory);
  }

  const constitution = clone(require(path.join(rulesDirectory, 'constitution.js')));
  const codex = clone(require(path.join(rulesDirectory, 'index.js')));
  const sourceProhibitions = require(path.join(rulesDirectory, 'prohibitions.js'));
  const publication = sourceProhibitions.publicationData;

  if (!publication || !publication.preamble || !Array.isArray(publication.general)) {
    throw new Error(
      'The Bot rules source does not expose publicationData. ' +
      'Merge the rules-publication-data change in Anireil-Bot first.'
    );
  }

  const prohibitionItems = clone(Array.from(sourceProhibitions));
  const general = clone(publication.general);
  const preamble = clone(publication.preamble);

  validateArticles(flattenSections(constitution, 'Constitution'), 'Constitution');
  validateArticles(flattenSections(codex, 'Codex'), 'Codex');
  validateArticles(general, 'Prohibition Index / General provisions');
  validateArticles(prohibitionItems, 'Prohibition Index');

  for (const item of prohibitionItems) {
    if (!Number.isInteger(item.category) || !publication.categoryTitles[String(item.category)]) {
      throw new Error('Prohibition ' + item.id + ' has an unknown category.');
    }

    if (!Number.isInteger(item.severity) || !publication.severityLabels[String(item.severity)]) {
      throw new Error('Prohibition ' + item.id + ' has an unknown severity level.');
    }
  }

  const documents = {
    constitution,
    codex,
    prohibitions: {
      preamble,
      general,
      items: prohibitionItems
    }
  };

  const revision = hashSnapshot(JSON.stringify(documents));

  const meta = clone(existingData.meta);
  meta.sourceRepository = 'anireilst/Anireil-Bot';
  meta.sourceRef = 'main';
  meta.sourceRevision = revision;
  meta.prohibitionCategories = clone(publication.categoryTitles);
  meta.prohibitionSeverity = clone(publication.severityLabels);

  return {
    meta,
    ...documents
  };
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(label + ' is not valid JSON: ' + error.message);
  }
}

function main() {
  const existingData = readJson(dataPath, 'data/rules.json');
  if (!existingData) throw new Error('data/rules.json is missing.');

  const existingHistory = readJson(historyPath, 'data/history.json');
  const generatedData = buildSnapshot(existingData);
  const historyResult = buildHistory(
    existingHistory,
    existingData,
    generatedData,
    getRulesPublicationDate()
  );

  generatedData.meta.publication = historyResult.publication;

  const outputs = new Map([
    [dataPath, JSON.stringify(generatedData, null, 2) + '\n'],
    [historyPath, JSON.stringify(historyResult.history, null, 2) + '\n']
  ]);

  for (const [relativePath, content] of Object.entries(historyResult.snapshots)) {
    outputs.set(path.join(projectRoot, relativePath), content);
  }

  const missingSnapshots = [];
  for (const document of Object.values(historyResult.history.documents)) {
    for (const revision of document.revisions) {
      const snapshotPath = path.join(projectRoot, revision.snapshot);
      if (!outputs.has(snapshotPath) && !fs.existsSync(snapshotPath)) {
        missingSnapshots.push(revision.snapshot);
      }
    }
  }

  if (missingSnapshots.length) {
    throw new Error(
      'Historical snapshot files are missing: ' + missingSnapshots.join(', ') +
      '. Restore the archived files before synchronizing.'
    );
  }

  const mismatches = [];
  for (const [filePath, content] of outputs) {
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    if (current !== content) mismatches.push(path.relative(projectRoot, filePath));
  }

  if (checkOnly) {
    if (mismatches.length) {
      console.error(
        'Rules archive or revision history is out of sync: ' + mismatches.join(', ') +
        '. Run npm run sync to refresh it.'
      );
      process.exitCode = 1;
      return;
    }

    console.log('Rules archive and revision history match Anireil-Bot.');
    return;
  }

  for (const [filePath, content] of outputs) {
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    if (current === content) continue;

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }

  console.log('Updated rules archive and revision history from anireilst/Anireil-Bot.');
}

try {
  main();
} catch (error) {
  console.error('Rules synchronization failed:', error.message);
  process.exitCode = 1;
}
