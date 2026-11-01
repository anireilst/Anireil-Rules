'use strict';

const DOCUMENT_IDS = ['constitution', 'codex', 'prohibitions'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashText(value) {
  let hash = 14695981039346656037n;
  const bytes = new TextEncoder().encode(value);

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }

  return hash.toString(16).padStart(16, '0');
}

function getDocumentMeta(data, documentId) {
  return data.meta.documents.find(function (document) {
    return document.id === documentId;
  });
}

function getDocumentContent(data, documentId) {
  const meta = getDocumentMeta(data, documentId);

  if (!meta) {
    throw new Error('Unknown document in rules data: ' + documentId);
  }

  if (documentId === 'constitution') {
    return {
      title: meta.title,
      description: meta.description,
      sections: data.constitution
    };
  }

  if (documentId === 'codex') {
    return {
      title: meta.title,
      description: meta.description,
      sections: data.codex
    };
  }

  return {
    title: meta.title,
    description: meta.description,
    preamble: data.prohibitions.preamble,
    general: data.prohibitions.general,
    items: data.prohibitions.items,
    categories: data.meta.prohibitionCategories,
    severity: data.meta.prohibitionSeverity
  };
}

function getArticleEntries(documentId, content) {
  const entries = [];

  if (documentId === 'constitution' || documentId === 'codex') {
    for (const section of content.sections) {
      for (const article of section.articles) {
        entries.push({
          key: article.id,
          article,
          sectionId: String(section.chapter),
          sectionTitle: section.title
        });
      }
    }

    return entries;
  }

  if (content.preamble) {
    entries.push({
      key: '__preamble__',
      article: content.preamble,
      sectionId: 'preamble',
      sectionTitle: 'Преамбула'
    });
  }

  for (const article of content.general) {
    entries.push({
      key: article.id,
      article,
      sectionId: 'G',
      sectionTitle: 'Общие положения'
    });
  }

  for (const article of content.items) {
    const category = String(article.category);
    entries.push({
      key: article.id,
      article,
      sectionId: category,
      sectionTitle: content.categories[category] || ('Раздел ' + category)
    });
  }

  return entries;
}

function makeChange(type, before, after) {
  const selected = after || before;
  const article = selected.article;

  return {
    type,
    articleId: article.id || 'Преамбула',
    title: article.title || 'Без названия',
    before: before ? {
      article: clone(before.article),
      sectionTitle: before.sectionTitle
    } : null,
    after: after ? {
      article: clone(after.article),
      sectionTitle: after.sectionTitle
    } : null,
    moved: Boolean(before && after && before.sectionId !== after.sectionId)
  };
}

function diffDocuments(documentId, previousContent, nextContent) {
  const previousEntries = new Map(
    getArticleEntries(documentId, previousContent).map(function (entry) {
      return [entry.key, entry];
    })
  );
  const nextEntries = new Map(
    getArticleEntries(documentId, nextContent).map(function (entry) {
      return [entry.key, entry];
    })
  );
  const changes = [];

  for (const [key, next] of nextEntries) {
    const previous = previousEntries.get(key);

    if (!previous) {
      changes.push(makeChange('added', null, next));
      continue;
    }

    const contentChanged = JSON.stringify(previous.article) !== JSON.stringify(next.article);
    const locationChanged = previous.sectionId !== next.sectionId;

    if (contentChanged || locationChanged) {
      changes.push(makeChange(contentChanged ? 'modified' : 'moved', previous, next));
    }

    previousEntries.delete(key);
  }

  for (const previous of previousEntries.values()) {
    changes.push(makeChange('removed', previous, null));
  }

  if (JSON.stringify(previousContent.title) !== JSON.stringify(nextContent.title) ||
      JSON.stringify(previousContent.description) !== JSON.stringify(nextContent.description)) {
    changes.push({
      type: 'metadata',
      articleId: '',
      title: 'Название или описание документа',
      before: null,
      after: null,
      moved: false
    });
  }

  if (documentId === 'prohibitions' &&
      (JSON.stringify(previousContent.categories) !== JSON.stringify(nextContent.categories) ||
       JSON.stringify(previousContent.severity) !== JSON.stringify(nextContent.severity))) {
    changes.push({
      type: 'metadata',
      articleId: '',
      title: 'Названия категорий или уровней тяжести',
      before: null,
      after: null,
      moved: false
    });
  }

  return changes;
}

function getArticleCount(documentId, content) {
  if (documentId === 'prohibitions') {
    return content.general.length + content.items.length;
  }

  return content.sections.reduce(function (total, section) {
    return total + section.articles.length;
  }, 0);
}

function summarizeChanges(changes) {
  if (!changes.length) {
    return 'Сохранён первоначальный снимок документа.';
  }

  const counts = changes.reduce(function (result, change) {
    result[change.type] = (result[change.type] || 0) + 1;
    return result;
  }, {});

  const labels = [
    ['added', 'добавлено'],
    ['modified', 'изменено'],
    ['moved', 'перемещено'],
    ['removed', 'удалено'],
    ['metadata', 'обновлено справочных сведений']
  ];

  return labels
    .filter(function (entry) { return counts[entry[0]]; })
    .map(function (entry) { return entry[1] + ': ' + counts[entry[0]]; })
    .join(' · ') + '.';
}

function buildHistory(existingHistory, previousData, nextData, publishedAt) {
  const history = existingHistory ? clone(existingHistory) : {
    schemaVersion: 1,
    generatedAt: publishedAt,
    sourceRevision: null,
    documents: {}
  };

  if (!history.documents || typeof history.documents !== 'object') {
    history.documents = {};
  }

  const snapshots = {};
  const publicationDocuments = {};

  for (const documentId of DOCUMENT_IDS) {
    const meta = getDocumentMeta(nextData, documentId);
    const content = getDocumentContent(nextData, documentId);
    const revisionId = hashText(JSON.stringify(content));
    const documentHistory = history.documents[documentId] || {
      id: documentId,
      title: meta.shortTitle || meta.title,
      revisions: []
    };

    documentHistory.title = meta.shortTitle || meta.title;
    documentHistory.revisions = Array.isArray(documentHistory.revisions)
      ? documentHistory.revisions.slice()
      : [];

    const latest = documentHistory.revisions
      .slice()
      .sort(function (a, b) { return b.edition - a.edition; })[0];

    let revision = latest;

    if (!latest) {
      revision = {
        edition: 1,
        revisionId,
        publishedAt,
        sourceRevision: nextData.meta.sourceRevision,
        articleCount: getArticleCount(documentId, content),
        changeCount: 0,
        summary: 'Сохранена первая редакция. Предыдущие редакции не архивировались.',
        changes: [],
        snapshot: ''
      };
    } else if (latest.revisionId !== revisionId) {
      const previousContent = getDocumentContent(previousData, documentId);
      const changes = diffDocuments(documentId, previousContent, content);

      if (!changes.length) {
        changes.push({
          type: 'metadata',
          articleId: '',
          title: 'Обновлена структура или справочные сведения документа',
          before: null,
          after: null,
          moved: false
        });
      }

      revision = {
        edition: latest.edition + 1,
        revisionId,
        publishedAt,
        sourceRevision: nextData.meta.sourceRevision,
        articleCount: getArticleCount(documentId, content),
        changeCount: changes.length,
        summary: summarizeChanges(changes),
        changes,
        snapshot: ''
      };
    }

    const snapshotPath = revision.snapshot ||
      ('data/history/snapshots/' + documentId + '/edition-' + revision.edition + '-' + revisionId + '.json');

    revision.snapshot = snapshotPath;

    const snapshot = {
      schemaVersion: 1,
      documentId,
      title: meta.title,
      edition: revision.edition,
      revisionId,
      publishedAt: revision.publishedAt,
      sourceRevision: revision.sourceRevision,
      content
    };

    snapshots[snapshotPath] = JSON.stringify(snapshot, null, 2) + '\n';

    if (!latest || latest.revisionId !== revisionId) {
      documentHistory.revisions.unshift(revision);
    } else {
      const index = documentHistory.revisions.findIndex(function (item) {
        return item.edition === revision.edition;
      });

      if (index >= 0) documentHistory.revisions[index] = revision;
      else documentHistory.revisions.unshift(revision);
    }

    documentHistory.revisions.sort(function (a, b) {
      return b.edition - a.edition;
    });

    history.documents[documentId] = documentHistory;

    publicationDocuments[documentId] = {
      edition: revision.edition,
      revisionId,
      updatedAt: revision.publishedAt,
      changeCount: revision.changeCount
    };
  }

  const dates = Object.values(publicationDocuments).map(function (document) {
    return document.updatedAt;
  }).filter(Boolean).sort();

  history.schemaVersion = 1;
  history.generatedAt = dates[dates.length - 1] || history.generatedAt || publishedAt;
  history.sourceRevision = nextData.meta.sourceRevision;

  return {
    history,
    publication: {
      generatedAt: history.generatedAt,
      sourceRevision: nextData.meta.sourceRevision,
      documents: publicationDocuments
    },
    snapshots
  };
}

module.exports = {
  DOCUMENT_IDS,
  buildHistory,
  diffDocuments,
  getArticleCount,
  getDocumentContent,
  hashText
};
