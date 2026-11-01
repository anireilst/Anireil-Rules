'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const dataPath = path.join(projectRoot, 'data', 'rules.json');
const sourceRoot = path.resolve(process.argv[2] || path.join(projectRoot, 'source-bot'));
const checkOnly = process.argv.includes('--check');

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

function main() {
  const existingData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const generatedData = buildSnapshot(existingData);
  const generatedText = JSON.stringify(generatedData, null, 2) + '\n';
  const currentText = fs.readFileSync(dataPath, 'utf8');

  if (currentText === generatedText) {
    console.log('Rules archive is already synchronized.');
    return;
  }

  if (checkOnly) {
    console.error(
      'Rules archive is out of sync with Anireil-Bot. ' +
      'Run node scripts/sync-rules.js ./source-bot to refresh it.'
    );
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(dataPath, generatedText, 'utf8');
  console.log('Updated data/rules.json from anireilst/Anireil-Bot.');
}

try {
  main();
} catch (error) {
  console.error('Rules synchronization failed:', error.message);
  process.exitCode = 1;
}
