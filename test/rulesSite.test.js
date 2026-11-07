const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'rules.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('official documents contain complete, non-empty source sections', () => {
  for (const [label, sections] of [
    ['Constitution', data.constitution],
    ['Codex', data.codex]
  ]) {
    assert.ok(Array.isArray(sections) && sections.length > 0, label + ' has no sections');

    for (const section of sections) {
      assert.ok(section.title);
      assert.ok(Array.isArray(section.articles) && section.articles.length > 0);

      for (const article of section.articles) {
        assert.ok(article.id);
        assert.ok(article.title);
        assert.ok(article.text);
      }
    }
  }

  assert.ok(data.prohibitions.general.length > 0);
  assert.ok(data.prohibitions.items.length > 0);
  assert.match(data.meta.sourceRevision, /^[a-f0-9]{16}$/);
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
    'dialogSearchInput', 'searchDocumentFilter', 'searchSectionFilter',
    'searchSeverityFilter', 'searchArticleFilter', 'dialogSearchSummary',
    'clearSearchFilters', 'printDocument', 'menuToggle', 'sidebar',
    'mobileBackdrop', 'toast', 'bookmarksToggle', 'bookmarksCount',
    'bookmarksSidebarToggle', 'bookmarkDialog', 'bookmarkDialogClose',
    'bookmarkSummary', 'bookmarkList'
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
  assert.match(script, /function getAdvancedSearchFilters\(/);
  assert.match(script, /function renderSearchSectionFilter\(/);
  assert.match(script, /sectionKey/);
  assert.match(script, /window\.print\(\)/);
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



test('Rules archive syncs source changes and delegates Pages deployment once', () => {
  const syncScript = fs.readFileSync(path.join(root, 'scripts', 'sync-rules.js'), 'utf8');
  const syncWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'sync.yml'), 'utf8');
  const pagesWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  const checksWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'checks.yml'), 'utf8');

  assert.match(syncScript, /publicationData/);
  const historyScript = fs.readFileSync(path.join(root, 'scripts', 'rules-history.js'), 'utf8');
  assert.match(historyScript, /getSuiteRevisionId/);
  assert.match(historyScript, /publicationRevisions/);
  assert.match(historyScript, /edition: currentPublication\.edition/);
  assert.match(syncScript, /sourceRevision/);
  assert.match(syncScript, /getRulesPublicationDate/);
  assert.match(syncScript, /delete sharedDocument\.version/);
  assert.match(syncWorkflow, /fetch-depth: 0/);
  assert.match(syncWorkflow, /schedule:/);
  assert.match(syncWorkflow, /workflow_dispatch/);
  assert.ok(!syncWorkflow.includes('actions/deploy-pages@v4'));
  assert.match(pagesWorkflow, /push:[\s\S]*?branches:\s*\[main\]/);
  assert.match(pagesWorkflow, /actions\/deploy-pages@v4/);
  assert.match(checksWorkflow, /anireilst\/Anireil-Bot/);
  assert.match(checksWorkflow, /sync:check/);
});

test('article structure and A4 print styles stay in the graphite theme', () => {
  assert.match(script, /chapter-article-count/);
  assert.match(css, /GRAPHITE DOCUMENT STRUCTURE \/ ADVANCED SEARCH \/ PRINT/);
  assert.match(css, /\.chapter-heading\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) auto;/s);
  assert.match(css, /@page\s*\{[\s\S]*?size:\s*A4;/s);
  assert.match(css, /@media print\s*\{[\s\S]*?\.article-card[\s\S]*?break-inside:\s*avoid;/s);
  assert.match(css, /--bg:\s*#23272b/);
});


test('document hero title stays inside its column without covering the summary', () => {
  assert.match(css, /DOCUMENT HERO TITLE FIT/);

  const heroLayout = css.slice(css.indexOf('DOCUMENT HERO TITLE FIT'));
  assert.match(heroLayout, /\.document-hero\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.12fr\) minmax\(280px, 0\.88fr\);/s);
  assert.match(heroLayout, /\.document-hero-copy\s*\{[\s\S]*?min-width:\s*0;/s);
  assert.match(heroLayout, /\.document-hero h1\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?font-size:\s*clamp\(2\.8rem, 5\.2vw, 4\.7rem\);/s);
  assert.match(heroLayout, /\.document-summary\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/s);
  assert.match(heroLayout, /@media \(max-width: 820px\)\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/s);
});


test('print layout hides the site header, document tabs and search control', () => {
  const printStart = css.indexOf('@media print');
  const printRules = css.slice(printStart);

  assert.match(printRules, /\.topbar\s*,/);
  assert.match(printRules, /\.skip-link\s*,/);
  assert.match(printRules, /\.sidebar\s*,/);
  assert.match(printRules, /\.document-switcher\s*,/);
  assert.match(printRules, /\.search-dialog\s*,/);
});


test('article bookmarks are persisted locally and exposed through the archive UI', () => {
  assert.match(html, /src="\.\/bookmark-store\.js" defer/);
  assert.match(html, /id="bookmarksToggle"/);
  assert.match(html, /id="bookmarksSidebarToggle"/);
  assert.match(html, /id="bookmarkDialog"/);
  assert.match(html, /id="bookmarkList"/);

  assert.match(script, /function toggleBookmark\(/);
  assert.match(script, /function renderBookmarkDialog\(/);
  assert.match(script, /function createBookmarkEntry\(/);
  assert.match(script, /bookmarkStore\.read\(window\.localStorage\)/);
  assert.match(script, /bookmarkStore\.write\(window\.localStorage, bookmarks\)/);
  assert.match(script, /window\.addEventListener\('storage'/);

  assert.match(css, /LOCAL ARTICLE BOOKMARKS/);
  assert.match(css, /\.article-bookmark\.is-saved/);
  assert.match(css, /\.bookmark-entry-remove/);
  assert.match(css, /@media print[\s\S]*?\.article-bookmark\s*\{[\s\S]*?display:\s*none/s);
});
