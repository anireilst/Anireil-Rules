'use strict';

const state = {
  data: null,
  currentDocument: 'constitution'
};

const elements = {
  documentCount: document.querySelector('#historyDocumentCount'),
  lastSync: document.querySelector('#historyLastSync'),
  documentFilter: document.querySelector('#historyDocumentFilter'),
  stats: document.querySelector('#historyStats'),
  timeline: document.querySelector('#historyTimeline'),
  status: document.querySelector('#historyStatus')
};

const changeLabels = {
  added: 'Добавлено',
  modified: 'Изменено',
  moved: 'Перемещено',
  removed: 'Удалено',
  metadata: 'Справочные данные'
};

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function formatDate(value, includeTime) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата не указана';

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {})
  });
}

function pluralize(number, one, few, many) {
  const mod10 = number % 10;
  const mod100 = number % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function getCurrentDocument() {
  return state.data.documents[state.currentDocument];
}

function renderStats(documentHistory) {
  elements.stats.replaceChildren();

  const latest = documentHistory.revisions[0];
  const stats = [
    ['Текущая редакция', '№ ' + latest.edition],
    ['Последнее обновление', formatDate(latest.publishedAt)],
    ['Сохранено редакций', documentHistory.revisions.length],
    ['Изменений в последней', latest.changeCount || 0]
  ];

  stats.forEach(function (item) {
    const card = createElement('div', 'history-stat');
    card.append(
      createElement('span', 'history-stat-label', item[0]),
      createElement('strong', 'history-stat-value', item[1])
    );
    elements.stats.append(card);
  });
}

function createVersionBlock(sideLabel, version) {
  const block = createElement('section', 'history-change-version');
  block.append(createElement('span', 'history-change-side', sideLabel));

  if (!version || !version.article) {
    block.append(createElement('p', 'history-no-version', 'Сведения этой стороны не сохранены.'));
    return block;
  }

  const article = version.article;
  const heading = createElement('h4');
  const id = article.id || 'Преамбула';
  heading.textContent = id + (article.title ? ' — ' + article.title : '');
  block.append(heading);

  if (version.sectionTitle) {
    block.append(createElement('span', 'history-change-section', 'Раздел: ' + version.sectionTitle));
  }

  if (article.text) {
    block.append(createElement('p', 'history-change-text', article.text));
  }

  if (article.sanctions) {
    const sanctions = createElement('p', 'history-change-extra');
    sanctions.append(createElement('strong', '', 'Санкции: '), document.createTextNode(article.sanctions));
    block.append(sanctions);
  }

  if (article.severity) {
    block.append(createElement('p', 'history-change-extra', 'Уровень тяжести: ' + article.severity));
  }

  return block;
}

function renderChanges(panel, revision) {
  panel.replaceChildren();

  if (!revision.changes || !revision.changes.length) {
    const emptyMessage = revision.edition === 1
      ? 'Это первая общая редакция правил Anireil. Предыдущие архивные редакции не сохранялись.'
      : 'Содержание этого документа не менялось. Он включён в общую редакцию вместе с остальными документами.';

    panel.append(createElement(
      'p',
      'history-empty-changes',
      emptyMessage
    ));
    return;
  }

  const list = createElement('div', 'history-change-list');

  revision.changes.forEach(function (change) {
    const card = createElement('article', 'history-change-card');
    const head = createElement('div', 'history-change-head');
    const type = createElement('span', 'history-change-type type-' + change.type, changeLabels[change.type] || 'Изменение');
    const identifier = createElement('span', 'history-change-id', change.articleId || 'Документ');
    head.append(type, identifier);
    card.append(head, createElement('h3', 'history-change-title', change.title || 'Без названия'));

    if (change.type === 'metadata' && !change.before && !change.after) {
      card.append(createElement(
        'p',
        'history-change-text',
        'Обновились сведения о документе, его структуре или справочных обозначениях.'
      ));
    } else {
      const versions = createElement('div', 'history-diff-grid');
      if (change.before) versions.append(createVersionBlock('Было', change.before));
      if (change.after) versions.append(createVersionBlock('Стало', change.after));
      card.append(versions);
    }

    list.append(card);
  });

  panel.append(list);
}

function createSnapshotArticle(article) {
  const card = createElement('article', 'history-snapshot-article');
  const head = createElement('div', 'history-snapshot-head');
  head.append(
    createElement('span', 'history-snapshot-id', article.id || '—'),
    createElement('h4', '', article.title || 'Без названия')
  );
  card.append(head);

  if (article.text) card.append(createElement('p', 'history-snapshot-text', article.text));
  if (article.sanctions) {
    const sanctions = createElement('p', 'history-snapshot-extra');
    sanctions.append(createElement('strong', '', 'Санкции: '), document.createTextNode(article.sanctions));
    card.append(sanctions);
  }
  if (article.severity) {
    card.append(createElement('span', 'history-snapshot-severity', 'Уровень тяжести: ' + article.severity));
  }

  return card;
}

function createSnapshotSection(title, articles) {
  const section = createElement('section', 'history-snapshot-section');
  const heading = createElement('h3', '', title);
  section.append(heading);

  const list = createElement('div', 'history-snapshot-list');
  (articles || []).forEach(function (article) {
    list.append(createSnapshotArticle(article));
  });
  section.append(list);

  return section;
}

function renderSnapshot(viewer, snapshot) {
  viewer.replaceChildren();

  const content = snapshot.content;
  viewer.append(
    createElement('div', 'history-snapshot-heading',
      'Редакция № ' + snapshot.edition + ' · ' + formatDate(snapshot.publishedAt))
  );

  if (Array.isArray(content.sections)) {
    content.sections.forEach(function (section) {
      viewer.append(createSnapshotSection(section.title, section.articles));
    });
    return;
  }

  if (content.preamble) {
    viewer.append(createSnapshotSection(content.preamble.title || 'Преамбула', [content.preamble]));
  }

  viewer.append(createSnapshotSection('Общие положения', content.general));

  const groups = new Map();
  (content.items || []).forEach(function (article) {
    const category = String(article.category);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(article);
  });

  Array.from(groups.keys()).sort(function (a, b) {
    return Number(a) - Number(b);
  }).forEach(function (category) {
    const title = content.categories && content.categories[category]
      ? content.categories[category]
      : 'Раздел ' + category;
    viewer.append(createSnapshotSection(title, groups.get(category)));
  });
}

async function loadSnapshot(revision, viewer) {
  const response = await fetch('./' + revision.snapshot, { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить архивную редакцию.');

  const snapshot = await response.json();
  renderSnapshot(viewer, snapshot);
}

function renderRevision(documentHistory, revision, index) {
  const card = createElement('article', 'history-revision');
  const top = createElement('div', 'history-revision-top');
  const main = createElement('div', 'history-revision-main');
  const kicker = createElement('div', 'history-revision-kicker');

  kicker.append(createElement('span', 'history-edition-label', 'РЕДАКЦИЯ ' + revision.edition));
  kicker.append(createElement(
    'span',
    index === 0 ? 'history-current-label' : 'history-archived-label',
    index === 0 ? 'Текущая' : 'Архивная'
  ));

  main.append(
    kicker,
    createElement('h3', 'history-revision-date', formatDate(revision.publishedAt)),
    createElement('p', 'history-revision-summary', revision.summary)
  );

  const metadata = createElement('div', 'history-revision-metadata');
  metadata.append(
    createElement('span', '', (revision.changeCount || 0) + ' ' + pluralize(revision.changeCount || 0, 'изменение', 'изменения', 'изменений')),
    createElement('span', '', (revision.articleCount || 0) + ' статей')
  );

  top.append(main, metadata);
  card.append(top);

  const actions = createElement('div', 'history-revision-actions');
  const changesButton = createElement('button', 'history-action-button', 'Показать изменения');
  changesButton.type = 'button';
  changesButton.setAttribute('aria-expanded', 'false');

  const snapshotButton = createElement('button', 'history-action-button secondary', 'Открыть редакцию');
  snapshotButton.type = 'button';
  snapshotButton.setAttribute('aria-expanded', 'false');

  actions.append(changesButton, snapshotButton);
  card.append(actions);

  const changesPanel = createElement('div', 'history-changes-panel');
  changesPanel.hidden = true;
  card.append(changesPanel);

  const snapshotViewer = createElement('div', 'history-version-viewer');
  snapshotViewer.hidden = true;
  card.append(snapshotViewer);

  changesButton.addEventListener('click', function () {
    const shouldOpen = changesPanel.hidden;
    if (shouldOpen && !changesPanel.dataset.rendered) {
      renderChanges(changesPanel, revision);
      changesPanel.dataset.rendered = 'true';
    }
    changesPanel.hidden = !shouldOpen;
    changesButton.setAttribute('aria-expanded', String(shouldOpen));
    changesButton.textContent = shouldOpen ? 'Скрыть изменения' : 'Показать изменения';
  });

  snapshotButton.addEventListener('click', async function () {
    const shouldOpen = snapshotViewer.hidden;
    if (!shouldOpen) {
      snapshotViewer.hidden = true;
      snapshotButton.setAttribute('aria-expanded', 'false');
      snapshotButton.textContent = 'Открыть редакцию';
      return;
    }

    snapshotViewer.hidden = false;
    snapshotButton.disabled = true;
    snapshotButton.textContent = 'Загружаем...';

    try {
      if (!snapshotViewer.dataset.loaded) {
        await loadSnapshot(revision, snapshotViewer);
        snapshotViewer.dataset.loaded = 'true';
      }
      snapshotButton.setAttribute('aria-expanded', 'true');
      snapshotButton.textContent = 'Скрыть редакцию';
    } catch (error) {
      snapshotViewer.replaceChildren(createElement('p', 'history-snapshot-error', error.message));
      snapshotViewer.dataset.loaded = '';
      snapshotViewer.hidden = true;
      snapshotButton.setAttribute('aria-expanded', 'false');
      snapshotButton.textContent = 'Повторить загрузку';
    } finally {
      snapshotButton.disabled = false;
    }
  });

  return card;
}

function renderTimeline(documentHistory) {
  elements.timeline.replaceChildren();

  if (!documentHistory || !documentHistory.revisions || !documentHistory.revisions.length) {
    elements.timeline.append(createElement(
      'div',
      'state-card',
      'Для этого документа пока нет сохранённых редакций.'
    ));
    return;
  }

  documentHistory.revisions
    .slice()
    .sort(function (a, b) { return b.edition - a.edition; })
    .forEach(function (revision, index) {
      elements.timeline.append(renderRevision(documentHistory, revision, index));
    });
}

function renderDocument() {
  const documentHistory = getCurrentDocument();
  if (!documentHistory) {
    elements.status.hidden = false;
    elements.status.textContent = 'История выбранного документа не найдена.';
    return;
  }

  elements.status.hidden = true;
  renderStats(documentHistory);
  renderTimeline(documentHistory);

  const latest = documentHistory.revisions[0];
  elements.documentCount.textContent = String(Object.keys(state.data.documents).length).padStart(2, '0');
  elements.lastSync.textContent =
    'Последняя сохранённая редакция: ' + formatDate(latest.publishedAt);
}

function selectDocument(documentId, updateHash) {
  if (!state.data.documents[documentId]) return;
  state.currentDocument = documentId;
  elements.documentFilter.value = documentId;
  if (updateHash) window.history.replaceState(null, '', '#' + documentId);
  renderDocument();
}

async function loadHistory() {
  try {
    const response = await fetch('./data/history.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Не удалось загрузить архив редакций.');

    state.data = await response.json();

    const requestedDocument = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    const initialDocument = state.data.documents[requestedDocument]
      ? requestedDocument
      : 'constitution';

    elements.documentFilter.addEventListener('change', function () {
      selectDocument(elements.documentFilter.value, true);
    });

    selectDocument(initialDocument, false);
  } catch (error) {
    console.error('[Anireil Rules History]', error);
    elements.documentCount.textContent = '—';
    elements.lastSync.textContent = 'Архив временно недоступен.';
    elements.stats.replaceChildren();
    elements.timeline.replaceChildren();
    elements.status.hidden = false;
    elements.status.textContent = error.message;
  }
}

loadHistory();
