'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildHistory,
  diffDocuments,
  getDocumentContent
} = require('../scripts/rules-history');

function makeRules() {
  return {
    meta: {
      sourceRevision: 'source-one',
      documents: [
        { id: 'constitution', title: 'Конституция Anireil', shortTitle: 'Конституция', description: 'Основы.' },
        { id: 'codex', title: 'Кодекс Anireil', shortTitle: 'Кодекс', description: 'Поведение.' },
        { id: 'prohibitions', title: 'Индекс запретов Anireil', shortTitle: 'Индекс запретов', description: 'Нарушения.' }
      ],
      prohibitionCategories: { '1': 'Порядок' },
      prohibitionSeverity: { '1': 'Незначительное' }
    },
    constitution: [
      {
        chapter: 1,
        title: 'Первая глава',
        articles: [
          { id: '1.1', title: 'Первая статья', text: 'Исходный текст.' },
          { id: '1.2', title: 'Вторая статья', text: 'Текст без изменений.' }
        ]
      },
      {
        chapter: 2,
        title: 'Вторая глава',
        articles: [
          { id: '2.1', title: 'Третья статья', text: 'Эту статью удалят.' }
        ]
      }
    ],
    codex: [
      {
        chapter: 1,
        title: 'Правила',
        articles: [
          { id: 'C-001', title: 'Правило', text: 'Текст кодекса.' }
        ]
      }
    ],
    prohibitions: {
      preamble: { title: 'Преамбула', text: 'Вводный текст.' },
      general: [{ id: 'G-001', title: 'Общее правило', text: 'Общие положения.' }],
      items: [{ id: 'P-001', category: 1, title: 'Запрет', text: 'Не нарушать.', severity: 1 }]
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('initial history creates the first immutable edition for every document', () => {
  const rules = makeRules();
  const publishedAt = '2026-11-01T10:00:00.000Z';
  const result = buildHistory(null, rules, rules, publishedAt);

  assert.equal(result.history.schemaVersion, 1);
  assert.equal(result.history.generatedAt, publishedAt);

  for (const id of ['constitution', 'codex', 'prohibitions']) {
    const revisions = result.history.documents[id].revisions;
    assert.equal(revisions.length, 1);
    assert.equal(revisions[0].edition, 1);
    assert.equal(revisions[0].changeCount, 0);
    assert.match(revisions[0].snapshot, new RegExp('snapshots/' + id + '/edition-1-'));
    assert.ok(result.snapshots[revisions[0].snapshot]);
    assert.equal(result.publication.documents[id].edition, 1);
  }
});

test('running synchronization without document changes preserves edition numbers and dates', () => {
  const rules = makeRules();
  const first = buildHistory(null, rules, rules, '2026-11-01T10:00:00.000Z');
  const unchanged = buildHistory(
    first.history,
    rules,
    rules,
    '2026-11-02T10:00:00.000Z'
  );

  assert.equal(unchanged.history.generatedAt, '2026-11-01T10:00:00.000Z');

  for (const id of ['constitution', 'codex', 'prohibitions']) {
    assert.equal(unchanged.history.documents[id].revisions.length, 1);
    assert.equal(unchanged.history.documents[id].revisions[0].edition, 1);
    assert.equal(
      unchanged.history.documents[id].revisions[0].publishedAt,
      '2026-11-01T10:00:00.000Z'
    );
  }
});

test('document changes create a new edition and preserve the previous snapshot', () => {
  const previous = makeRules();
  const first = buildHistory(null, previous, previous, '2026-11-01T10:00:00.000Z');
  const next = clone(previous);

  next.meta.sourceRevision = 'source-two';
  next.constitution = [
    {
      chapter: 1,
      title: 'Первая глава',
      articles: [
        { id: '1.1', title: 'Первая статья', text: 'Новый текст статьи.' },
        { id: '1.3', title: 'Новая статья', text: 'Добавленное положение.' }
      ]
    },
    {
      chapter: 2,
      title: 'Вторая глава',
      articles: [
        { id: '2.1', title: 'Третья статья', text: 'Эту статью удалят.' },
        { id: '1.2', title: 'Вторая статья', text: 'Текст без изменений.' }
      ]
    }
  ];
  next.constitution[1].articles = [
    { id: '1.2', title: 'Вторая статья', text: 'Текст без изменений.' }
  ];

  const result = buildHistory(
    first.history,
    previous,
    next,
    '2026-11-03T10:00:00.000Z'
  );
  const constitution = result.history.documents.constitution;
  const latest = constitution.revisions[0];
  const previousRevision = constitution.revisions[1];

  assert.equal(constitution.revisions.length, 2);
  assert.equal(latest.edition, 2);
  assert.equal(latest.publishedAt, '2026-11-03T10:00:00.000Z');
  assert.equal(previousRevision.edition, 1);
  assert.notEqual(latest.snapshot, previousRevision.snapshot);

  const types = latest.changes.map(change => change.type);
  assert.deepEqual(types.sort(), ['added', 'modified', 'moved', 'removed']);

  const moved = latest.changes.find(change => change.articleId === '1.2');
  assert.equal(moved.type, 'moved');

  const modified = latest.changes.find(change => change.articleId === '1.1');
  assert.equal(modified.type, 'modified');
  assert.equal(modified.before.article.text, 'Исходный текст.');
  assert.equal(modified.after.article.text, 'Новый текст статьи.');

  assert.equal(result.history.documents.codex.revisions.length, 1);
  assert.equal(result.history.documents.prohibitions.revisions.length, 1);
  assert.equal(result.publication.documents.constitution.edition, 2);
  assert.equal(result.publication.documents.codex.edition, 1);
});

test('article comparison includes the prohibition preamble and classification metadata', () => {
  const previous = makeRules();
  const next = clone(previous);
  const before = getDocumentContent(previous, 'prohibitions');

  next.prohibitions.preamble.text = 'Обновлённая преамбула.';
  next.meta.prohibitionCategories['1'] = 'Обновлённая категория';

  const after = getDocumentContent(next, 'prohibitions');
  const changes = diffDocuments('prohibitions', before, after);

  assert.ok(changes.some(change => change.articleId === 'Преамбула' && change.type === 'modified'));
  assert.ok(changes.some(change => change.type === 'metadata' && /категорий/.test(change.title)));
});

test('published history index and every referenced snapshot are present', () => {
  const root = path.join(__dirname, '..');
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'data', 'rules.json'), 'utf8'));
  const history = JSON.parse(fs.readFileSync(path.join(root, 'data', 'history.json'), 'utf8'));

  assert.equal(rules.meta.publication.sourceRevision, rules.meta.sourceRevision);

  for (const [id, entry] of Object.entries(history.documents)) {
    const current = entry.revisions[0];
    assert.equal(rules.meta.publication.documents[id].edition, current.edition);
    assert.equal(rules.meta.publication.documents[id].revisionId, current.revisionId);

    for (const revision of entry.revisions) {
      const snapshotPath = path.join(root, revision.snapshot);
      assert.ok(fs.existsSync(snapshotPath), 'Missing snapshot: ' + revision.snapshot);

      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
      assert.equal(snapshot.documentId, id);
      assert.equal(snapshot.edition, revision.edition);
      assert.equal(snapshot.revisionId, revision.revisionId);
    }
  }
});

test('history page exposes document selection, changes and full revision views', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'history.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'history.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const syncWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'sync.yml'), 'utf8');

  assert.match(html, /id="historyDocumentFilter"/);
  assert.match(html, /id="historyTimeline"/);
  assert.match(script, /function renderChanges/);
  assert.match(script, /function renderSnapshot/);
  assert.match(script, /fetch\('\.\/data\/history\.json'/);
  assert.match(styles, /DOCUMENT REVISION ARCHIVE/);
  assert.match(syncWorkflow, /git status --porcelain -- data/);
  assert.ok(syncWorkflow.includes('cron: "*/5 * * * *"'));
  assert.ok(syncWorkflow.includes('path: sync-artifact\n          if-no-files-found: error'));
  assert.ok(syncWorkflow.includes('test -f sync-artifact/data/rules.json'));
  assert.ok(syncWorkflow.includes('test -f sync-artifact/data/history.json'));
  assert.ok(!syncWorkflow.includes('actions/deploy-pages@v4'));

  assert.doesNotThrow(() => new Function(script));
});
