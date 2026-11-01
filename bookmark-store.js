'use strict';

(function attachBookmarkStore(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.AnireilBookmarks = api;
  }
})(typeof window !== 'undefined' ? window : null, function createBookmarkStore() {
  const STORAGE_KEY = 'anireil-rules.bookmarks.v1';
  const DOCUMENT_IDS = new Set(['constitution', 'codex', 'prohibitions']);
  const ARTICLE_ID_PATTERN = /^[A-Za-zА-Яа-яЁё0-9._-]{1,80}$/;

  function normalizeBookmark(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const documentId = String(value.documentId || '');
    const articleId = String(value.articleId || '');

    if (!DOCUMENT_IDS.has(documentId) || !ARTICLE_ID_PATTERN.test(articleId)) {
      return null;
    }

    const parsedDate = typeof value.savedAt === 'string' ? Date.parse(value.savedAt) : NaN;
    const savedAt = Number.isFinite(parsedDate)
      ? new Date(parsedDate).toISOString()
      : new Date(0).toISOString();

    return {
      documentId,
      articleId,
      savedAt,
      documentTitle: String(value.documentTitle || '').slice(0, 120),
      articleTitle: String(value.articleTitle || '').slice(0, 180)
    };
  }

  function normalizeBookmarks(value) {
    if (!Array.isArray(value)) return [];

    const unique = new Map();

    for (const item of value) {
      const bookmark = normalizeBookmark(item);
      if (!bookmark) continue;

      const key = bookmark.documentId + ':' + bookmark.articleId;
      if (!unique.has(key)) unique.set(key, bookmark);
    }

    return Array.from(unique.values()).sort(function (a, b) {
      return Date.parse(b.savedAt) - Date.parse(a.savedAt);
    });
  }

  function read(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ok: true, bookmarks: [] };
      }

      return {
        ok: true,
        bookmarks: normalizeBookmarks(JSON.parse(raw))
      };
    } catch (error) {
      return {
        ok: false,
        bookmarks: [],
        error
      };
    }
  }

  function write(storage, bookmarks) {
    try {
      const normalized = normalizeBookmarks(bookmarks);
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));

      return {
        ok: true,
        bookmarks: normalized
      };
    } catch (error) {
      return {
        ok: false,
        bookmarks: normalizeBookmarks(bookmarks),
        error
      };
    }
  }

  function toggle(bookmarks, descriptor, savedAt) {
    const current = normalizeBookmarks(bookmarks);
    const bookmark = normalizeBookmark(Object.assign({}, descriptor, {
      savedAt: savedAt || new Date().toISOString()
    }));

    if (!bookmark) {
      return {
        ok: false,
        added: false,
        bookmarks: current
      };
    }

    const key = bookmark.documentId + ':' + bookmark.articleId;
    const exists = current.some(function (item) {
      return item.documentId + ':' + item.articleId === key;
    });

    return {
      ok: true,
      added: !exists,
      bookmarks: exists
        ? current.filter(function (item) {
          return item.documentId + ':' + item.articleId !== key;
        })
        : normalizeBookmarks(current.concat(bookmark))
    };
  }

  return {
    STORAGE_KEY,
    normalizeBookmark,
    normalizeBookmarks,
    read,
    write,
    toggle
  };
});
