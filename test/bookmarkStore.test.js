'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const bookmarkStore = require('../bookmark-store');

function createStorage(initialValue) {
  const values = new Map();

  if (initialValue !== undefined) {
    values.set(bookmarkStore.STORAGE_KEY, initialValue);
  }

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function descriptor(overrides) {
  return Object.assign({
    documentId: 'constitution',
    articleId: '1.1',
    documentTitle: 'Конституция',
    articleTitle: 'Anireil как сообщество'
  }, overrides || {});
}

test('empty browser storage starts with no bookmarks', () => {
  const result = bookmarkStore.read(createStorage());

  assert.equal(result.ok, true);
  assert.deepEqual(result.bookmarks, []);
});

test('adding and removing a bookmark is deterministic', () => {
  const first = bookmarkStore.toggle(
    [],
    descriptor(),
    '2026-11-01T10:00:00.000Z'
  );

  assert.equal(first.ok, true);
  assert.equal(first.added, true);
  assert.equal(first.bookmarks.length, 1);
  assert.equal(first.bookmarks[0].documentId, 'constitution');
  assert.equal(first.bookmarks[0].articleId, '1.1');

  const second = bookmarkStore.toggle(
    first.bookmarks,
    descriptor(),
    '2026-11-01T11:00:00.000Z'
  );

  assert.equal(second.ok, true);
  assert.equal(second.added, false);
  assert.deepEqual(second.bookmarks, []);
});

test('article IDs are scoped by document, so equal IDs do not collide', () => {
  const first = bookmarkStore.toggle([], descriptor(), '2026-11-01T10:00:00.000Z');
  const second = bookmarkStore.toggle(
    first.bookmarks,
    descriptor({ documentId: 'codex', documentTitle: 'Кодекс' }),
    '2026-11-01T10:01:00.000Z'
  );

  assert.equal(second.bookmarks.length, 2);
  assert.deepEqual(
    second.bookmarks.map(item => item.documentId).sort(),
    ['codex', 'constitution']
  );
});

test('normalization removes invalid and duplicate entries and sorts newest first', () => {
  const result = bookmarkStore.normalizeBookmarks([
    descriptor({ savedAt: '2026-11-01T10:00:00.000Z' }),
    descriptor({ savedAt: '2026-11-01T10:00:00.000Z' }),
    descriptor({
      documentId: 'unknown',
      articleId: '2.1',
      savedAt: '2026-11-01T12:00:00.000Z'
    }),
    descriptor({
      documentId: 'codex',
      articleId: 'C-001',
      savedAt: '2026-11-01T11:00:00.000Z'
    })
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].documentId, 'codex');
  assert.equal(result[1].documentId, 'constitution');
});

test('storage round-trip preserves bookmark references and labels', () => {
  const storage = createStorage();
  const bookmarks = [
    descriptor({
      savedAt: '2026-11-01T10:00:00.000Z',
      articleTitle: 'Свобода участия'
    }),
    descriptor({
      documentId: 'prohibitions',
      articleId: 'I-001',
      documentTitle: 'Индекс запретов',
      articleTitle: 'Пример запрета',
      savedAt: '2026-11-01T10:01:00.000Z'
    })
  ];

  const written = bookmarkStore.write(storage, bookmarks);
  const read = bookmarkStore.read(storage);

  assert.equal(written.ok, true);
  assert.equal(read.ok, true);
  assert.deepEqual(read.bookmarks, bookmarkStore.normalizeBookmarks(bookmarks));
});

test('unavailable browser storage is reported without throwing', () => {
  const blockedStorage = {
    getItem() {
      throw new Error('Storage blocked');
    },
    setItem() {
      throw new Error('Storage blocked');
    }
  };

  const read = bookmarkStore.read(blockedStorage);
  const write = bookmarkStore.write(blockedStorage, [descriptor()]);

  assert.equal(read.ok, false);
  assert.deepEqual(read.bookmarks, []);
  assert.equal(write.ok, false);
  assert.equal(write.bookmarks.length, 1);
});

test('bookmark input is restricted to known documents and safe article IDs', () => {
  const unknownDocument = bookmarkStore.toggle(
    [],
    descriptor({ documentId: 'admin' }),
    '2026-11-01T10:00:00.000Z'
  );
  const invalidArticle = bookmarkStore.toggle(
    [],
    descriptor({ articleId: '../secret' }),
    '2026-11-01T10:00:00.000Z'
  );

  assert.equal(unknownDocument.ok, false);
  assert.equal(invalidArticle.ok, false);
  assert.deepEqual(unknownDocument.bookmarks, []);
  assert.deepEqual(invalidArticle.bookmarks, []);
});
