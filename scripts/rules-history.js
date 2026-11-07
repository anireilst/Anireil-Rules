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

function getSuiteRevisionId(data) {
  const suiteContent = DOCUMENT_IDS.map(function (documentId) {
    return {
      id: documentId,
      content: getDocumentContent(data, documentId)
    };
  });

  return hashText(JSON.stringify(suiteContent));
}

function getLatestRevision(documentHistory) {
  return documentHistory.revisions
    .slice()
    .sort(function (a, b) { return b.edition - a.edition; })[0] || null;
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
  const documentStates = {};
  const baselineDate = history.generatedAt || publishedAt;
  const previousSuiteRevisionId = getSuiteRevisionId(previousData);
  const nextSuiteRevisionId = getSuiteRevisionId(nextData);

  let publicationRevisions = Array.isArray(history.publicationRevisions)
    ? history.publicationRevisions.slice()
    : [];

  // Migrate the previous per-document archive into one shared initial edition.
  if (!publicationRevisions.length) {
    publicationRevisions.push({
      edition: 1,
      revisionId: previousSuiteRevisionId,
      publishedAt: baselineDate,
      sourceRevision: previousData.meta.sourceRevision || null,
      changedDocuments: [],
      changes: [],
      summary: 'Сохранена первая общая редакция правил Anireil.'
    });
  }

  publicationRevisions.sort(function (a, b) {
    return a.edition - b.edition;
  });

  let currentPublication = publicationRevisions[publicationRevisions.length - 1];

  if (!currentPublication || !currentPublication.revisionId) {
    throw new Error('Rules publication history is missing its current revision hash.');
  }

  // The suite revision advances once, regardless of how many of the three
  // documents changed. Every document receives the same edition and date.
  const suiteChanged = currentPublication.revisionId !== nextSuiteRevisionId;
  const nextEdition = suiteChanged ? currentPublication.edition + 1 : currentPublication.edition;
  const nextPublishedAt = suiteChanged ? publishedAt : currentPublication.publishedAt;

  const changedDocuments = [];
  const publicationChanges = [];

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

    const latest = getLatestRevision(documentHistory);
    const previousContent = getDocumentContent(previousData, documentId);
    const previousRevisionId = hashText(JSON.stringify(previousContent));
    const documentChanged = previousRevisionId !== revisionId;

    let revision;

    if (suiteChanged) {
      let changes = documentChanged
        ? diffDocuments(documentId, previousContent, content)
        : [];

      if (documentChanged && !changes.length) {
        changes = [{
          type: 'metadata',
          articleId: '',
          title: 'Обновлена структура или справочные сведения документа',
          before: null,
          after: null,
          moved: false
        }];
      }

      revision = {
        edition: nextEdition,
        revisionId,
        publishedAt: nextPublishedAt,
        sourceRevision: nextData.meta.sourceRevision,
        articleCount: getArticleCount(documentId, content),
        changeCount: changes.length,
        summary: documentChanged
          ? summarizeChanges(changes)
          : 'Содержание документа не менялось; он включён в общую редакцию № ' + nextEdition + '.',
        changes,
        snapshot: ''
      };

      documentHistory.revisions.unshift(revision);

      if (documentChanged) {
        changedDocuments.push(documentId);
        publicationChanges.push({
          documentId,
          title: meta.shortTitle || meta.title,
          changeCount: changes.length,
          summary: revision.summary,
          changes
        });
      }
    } else {
      if (!latest) {
        revision = {
          edition: currentPublication.edition,
          revisionId,
          publishedAt: currentPublication.publishedAt,
          sourceRevision: currentPublication.sourceRevision,
          articleCount: getArticleCount(documentId, content),
          changeCount: 0,
          summary: 'Сохранён снимок документа в общей редакции.',
          changes: [],
          snapshot: ''
        };
        documentHistory.revisions.unshift(revision);
      } else {
        revision = latest;

        // Keep the document snapshot aligned with the shared publication.
        if (revision.revisionId !== revisionId) {
          throw new Error(
            'Document ' + documentId + ' does not match the current shared rules edition. ' +
            'Restore the archive before synchronizing.'
          );
        }
      }
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

    documentHistory.revisions.sort(function (a, b) {
      return b.edition - a.edition;
    });

    history.documents[documentId] = documentHistory;
    documentStates[documentId] = {
      revisionId,
      changeCount: revision.changeCount,
      summary: revision.summary
    };
  }

  if (suiteChanged) {
    const summary = publicationChanges.length
      ? 'Обновлены документы: ' + publicationChanges.map(function (item) {
          return item.title;
        }).join(', ') + '.'
      : 'Обновлена общая структура публикации правил Anireil.';

    currentPublication = {
      edition: nextEdition,
      revisionId: nextSuiteRevisionId,
      publishedAt: nextPublishedAt,
      sourceRevision: nextData.meta.sourceRevision,
      changedDocuments,
      changes: publicationChanges,
      summary
    };

    publicationRevisions.push(currentPublication);
  }

  history.publicationRevisions = publicationRevisions;
  history.publication = clone(currentPublication);
  history.schemaVersion = 2;
  history.generatedAt = currentPublication.publishedAt || history.generatedAt || publishedAt;
  history.sourceRevision = nextData.meta.sourceRevision;

  const publicationDocuments = {};

  for (const documentId of DOCUMENT_IDS) {
    publicationDocuments[documentId] = {
      edition: currentPublication.edition,
      revisionId: documentStates[documentId].revisionId,
      updatedAt: currentPublication.publishedAt,
      changeCount: documentStates[documentId].changeCount,
      summary: documentStates[documentId].summary
    };
  }

  return {
    history,
    publication: {
      edition: currentPublication.edition,
      revisionId: currentPublication.revisionId,
      updatedAt: currentPublication.publishedAt,
      generatedAt: currentPublication.publishedAt,
      sourceRevision: nextData.meta.sourceRevision,
      changedDocuments: currentPublication.changedDocuments || [],
      summary: currentPublication.summary,
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
