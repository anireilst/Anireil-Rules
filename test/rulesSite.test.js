const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'rules.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('official documents keep expected source counts', () => {
  const constitutionCount = data.constitution.reduce(
    (sum, chapter) => sum + chapter.articles.length,
    0
  );
  const codexCount = data.codex.reduce(
    (sum, chapter) => sum + chapter.articles.length,
    0
  );

  assert.equal(constitutionCount, 47);
  assert.equal(codexCount, 55);
  assert.equal(data.prohibitions.general.length, 5);
  assert.equal(data.prohibitions.items.length, 58);
});

test('article identifiers are unique inside every document', () => {
  const check = (ids, label) => {
    assert.equal(new Set(ids).size, ids.length, label + ' contains duplicate IDs');
  };

  check(
    data.constitution.flatMap((chapter) => chapter.articles.map((article) => article.id)),
    'Constitution'
  );
  check(
    data.codex.flatMap((chapter) => chapter.articles.map((article) => article.id)),
    'Codex'
  );
  check(
    data.prohibitions.general
      .map((article) => article.id)
      .concat(data.prohibitions.items.map((article) => article.id)),
    'Prohibition Index'
  );
});

test('Codex article 8.2 keeps its approved meaning and sanction', () => {
  const article = data.codex
    .flatMap((chapter) => chapter.articles)
    .find((item) => item.id === '8.2');

  assert.ok(article);
  assert.equal(article.title, 'Общение с друзьями');
  assert.match(
    article.text,
    /запрещается на постоянной основе общаться в общем чате исключительно со своими знакомыми/
  );
  assert.equal(
    article.sanctions,
    'Первое нарушение — устное предупреждение. Повторное нарушение — 1 варн.'
  );
});

test('Prohibition Index includes preamble, general rules and severity labels', () => {
  assert.equal(data.prohibitions.preamble.title, 'Индекс запретов Anireil');
  assert.equal(data.meta.prohibitionSeverity['1'], 'Незначительное');
  assert.equal(data.meta.prohibitionSeverity['4'], 'Критическое');
  assert.equal(data.meta.prohibitionCategories['10'], 'Администрация Anireil');
  assert.equal(data.meta.prohibitionCategories['11'], 'Чистка и поддержание активности');
});

test('responsive site keeps all runtime hooks', () => {
  for (const id of [
    'documentSwitcher', 'toc', 'documentTitle', 'documentContent',
    'inlineSearch', 'searchResults', 'searchToggle', 'searchDialog',
    'dialogSearchInput', 'menuToggle', 'sidebar', 'mobileBackdrop', 'toast'
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }

  assert.match(css, /@media \(max-width: 1080px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.sidebar\.open/);
});

test('application supports routing, global search and direct links', () => {
  assert.doesNotThrow(() => new Function(script));
  assert.match(script, /fetch\('\.\/data\/rules\.json'/);
  assert.match(script, /window\.addEventListener\('hashchange'/);
  assert.match(script, /navigator\.clipboard/);
  assert.match(script, /function searchRules\(/);
  assert.match(script, /function highlightCurrentArticle\(/);
});

test('Rules keeps its separate deep graphite identity', () => {
  assert.match(css, /DEEP GRAPHITE \/ TRUE DARK GRAY/);
  assert.match(css, /--bg:\s*#23272b/);
  assert.match(css, /linear-gradient\(180deg, #2a2f33 0%, #252a2e 48%, #22262a 100%\)/);
  assert.match(css, /\.reading-section\s*\{[\s\S]*?rgba\(42, 47, 51, 0\.94\)/s);
  assert.match(html, /<meta name="theme-color" content="#252a2e">/);
});

test('Rules typography keeps articles readable and visually hierarchical', () => {
  assert.match(css, /EDITORIAL TYPOGRAPHY \/ RULES READER/);
  assert.match(css, /\.article-card h4\s*\{[\s\S]*?font-size:\s*1\.02rem;[\s\S]*?font-weight:\s*740;/s);
  assert.match(css, /\.article-card p\s*\{[\s\S]*?font-size:\s*0\.93rem;[\s\S]*?line-height:\s*1\.82;/s);
  assert.match(css, /\.article-id\s*\{[\s\S]*?font-weight:\s*760;[\s\S]*?font-variant-numeric:\s*tabular-nums;/s);
  assert.match(css, /\.chapter-heading h3\s*\{[\s\S]*?font-weight:\s*760;/s);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.article-card p\s*\{[\s\S]*?font-size:\s*0\.89rem;/s);
});

