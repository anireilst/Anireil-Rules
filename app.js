const bookmarkStore = window.AnireilBookmarks;

const state = {
  data: null,
  currentDocument: 'constitution',
  currentArticle: null,
  searchIndex: [],
  bookmarks: [],
  observer: null
};

const elements = {
  documentSwitcher: document.querySelector('#documentSwitcher'),
  toc: document.querySelector('#toc'),
  tocCount: document.querySelector('#tocCount'),
  documentLabel: document.querySelector('#documentLabel'),
  documentVersion: document.querySelector('#documentVersion'),
  documentTitle: document.querySelector('#documentTitle'),
  documentDescription: document.querySelector('#documentDescription'),
  summaryCode: document.querySelector('#summaryCode'),
  articleCount: document.querySelector('#articleCount'),
  sectionCount: document.querySelector('#sectionCount'),
  readingTitle: document.querySelector('#readingTitle'),
  documentContent: document.querySelector('#documentContent'),
  loadingState: document.querySelector('#loadingState'),
  errorState: document.querySelector('#errorState'),
  inlineSearch: document.querySelector('#inlineSearch'),
  searchResults: document.querySelector('#searchResults'),
  searchResultsList: document.querySelector('#searchResultsList'),
  searchSummary: document.querySelector('#searchSummary'),
  clearSearch: document.querySelector('#clearSearch'),
  copyDocumentLink: document.querySelector('#copyDocumentLink'),
  printDocument: document.querySelector('#printDocument'),
  searchDocumentFilter: document.querySelector('#searchDocumentFilter'),
  searchSectionFilter: document.querySelector('#searchSectionFilter'),
  searchSeverityFilter: document.querySelector('#searchSeverityFilter'),
  searchArticleFilter: document.querySelector('#searchArticleFilter'),
  clearSearchFilters: document.querySelector('#clearSearchFilters'),
  dialogSearchSummary: document.querySelector('#dialogSearchSummary'),
  searchToggle: document.querySelector('#searchToggle'),
  searchDialog: document.querySelector('#searchDialog'),
  searchDialogClose: document.querySelector('#searchDialogClose'),
  dialogSearchInput: document.querySelector('#dialogSearchInput'),
  dialogSearchResults: document.querySelector('#dialogSearchResults'),
  bookmarksToggle: document.querySelector('#bookmarksToggle'),
  bookmarksCount: document.querySelector('#bookmarksCount'),
  bookmarksSidebarToggle: document.querySelector('#bookmarksSidebarToggle'),
  bookmarkSidebarCount: document.querySelector('#bookmarkSidebarCount'),
  bookmarkDialog: document.querySelector('#bookmarkDialog'),
  bookmarkDialogClose: document.querySelector('#bookmarkDialogClose'),
  bookmarkSummary: document.querySelector('#bookmarkSummary'),
  bookmarkList: document.querySelector('#bookmarkList'),
  menuToggle: document.querySelector('#menuToggle'),
  sidebar: document.querySelector('#sidebar'),
  sidebarClose: document.querySelector('#sidebarClose'),
  mobileBackdrop: document.querySelector('#mobileBackdrop'),
  toast: document.querySelector('#toast')
};

const documentCodes = {
  constitution: 'AR-CN',
  codex: 'AR-CX',
  prohibitions: 'AR-PI'
};

function getDocumentMeta(id) {
  return state.data.meta.documents.find(function (item) {
    return item.id === id;
  });
}

function getDocumentSections(id) {
  if (id === 'constitution') return state.data.constitution;
  if (id === 'codex') return state.data.codex;

  if (id === 'prohibitions') {
    const groups = new Map();

    for (const item of state.data.prohibitions.items) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    }

    const sections = [
      {
        chapter: 'G',
        title: 'Общие положения',
        articles: state.data.prohibitions.general.map(function (item) {
          return Object.assign({ category: 'G' }, item);
        })
      }
    ];

    for (const category of Array.from(groups.keys()).sort(function (a, b) { return a - b; })) {
      sections.push({
        chapter: category,
        title: state.data.meta.prohibitionCategories[String(category)] || ('Раздел ' + category),
        articles: groups.get(category)
      });
    }

    return sections;
  }

  return [];
}

function getPreamble(id) {
  if (id !== 'prohibitions') return null;
  return state.data.prohibitions.preamble || null;
}

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeAnchor(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^a-zа-я0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function sectionAnchor(docId, chapter) {
  return 'section-' + docId + '-' + sanitizeAnchor(chapter);
}

function articleAnchor(docId, articleId) {
  return 'article-' + docId + '-' + sanitizeAnchor(articleId);
}

function roman(value) {
  const number = Number(value);
  const map = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];

  if (!Number.isFinite(number) || number <= 0) return String(value);

  let result = '';
  let current = number;

  for (const pair of map) {
    while (current >= pair[0]) {
      result += pair[1];
      current -= pair[0];
    }
  }

  return result;
}

function pluralize(number, one, few, many) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function parseRoute() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  if (!raw) return { document: 'constitution', article: null };

  const parts = raw.split('/');
  const valid = state.data.meta.documents.some(function (item) {
    return item.id === parts[0];
  });

  return {
    document: valid ? parts[0] : 'constitution',
    article: valid && parts[1] ? parts.slice(1).join('/') : null
  };
}

function setRoute(documentId, articleId, replace) {
  const next = '#' + documentId + (articleId ? '/' + encodeURIComponent(articleId) : '');

  if (replace) {
    history.replaceState(null, '', next);
    handleRoute();
    return;
  }

  if (window.location.hash === next) {
    handleRoute();
  } else {
    window.location.hash = next;
  }
}

function closeMobileSidebar() {
  elements.sidebar.classList.remove('open');
  elements.menuToggle.setAttribute('aria-expanded', 'false');
  elements.mobileBackdrop.hidden = true;
  document.body.style.overflow = '';
}

function openMobileSidebar() {
  elements.sidebar.classList.add('open');
  elements.menuToggle.setAttribute('aria-expanded', 'true');
  elements.mobileBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
}

function renderDocumentSwitcher() {
  elements.documentSwitcher.replaceChildren();

  state.data.meta.documents.forEach(function (doc, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = doc.id === state.currentDocument ? 'active' : '';

    const docIndex = document.createElement('span');
    docIndex.className = 'doc-index';
    docIndex.textContent = String(index + 1).padStart(2, '0');

    const copy = document.createElement('span');
    copy.className = 'doc-copy';

    const title = document.createElement('strong');
    title.textContent = doc.shortTitle;

    const subtitle = document.createElement('span');
    subtitle.textContent =
      doc.id === 'constitution'
        ? 'Основной документ'
        : doc.id === 'codex'
          ? 'Правила поведения'
          : 'Перечень нарушений';

    copy.append(title, subtitle);
    button.append(docIndex, copy);

    button.addEventListener('click', function () {
      closeMobileSidebar();
      setRoute(doc.id, null);
    });

    elements.documentSwitcher.append(button);
  });

  document.querySelectorAll('[data-doc-link]').forEach(function (link) {
    link.classList.toggle('active', link.dataset.docLink === state.currentDocument);
  });
}

function renderToc(sections) {
  elements.toc.replaceChildren();
  elements.tocCount.textContent = String(sections.length);

  sections.forEach(function (section) {
    const link = document.createElement('a');
    link.href = '#' + sectionAnchor(state.currentDocument, section.chapter);

    const number = document.createElement('span');
    number.textContent =
      section.chapter === 'G'
        ? 'G'
        : state.currentDocument === 'prohibitions'
          ? roman(section.chapter)
          : String(section.chapter).padStart(2, '0');

    link.append(number, document.createTextNode(section.title));

    link.addEventListener('click', function (event) {
      event.preventDefault();
      const target = document.getElementById(sectionAnchor(state.currentDocument, section.chapter));
      closeMobileSidebar();
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    elements.toc.append(link);
  });
}

function createCopyIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const first = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  first.setAttribute('x', '6.3');
  first.setAttribute('y', '6.3');
  first.setAttribute('width', '8.5');
  first.setAttribute('height', '8.5');
  first.setAttribute('rx', '1.6');
  first.setAttribute('stroke', 'currentColor');
  first.setAttribute('stroke-width', '1.4');

  const second = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  second.setAttribute('d', 'M12.2 5V4.4A1.4 1.4 0 0 0 10.8 3H4.4A1.4 1.4 0 0 0 3 4.4v6.4a1.4 1.4 0 0 0 1.4 1.4H5');
  second.setAttribute('stroke', 'currentColor');
  second.setAttribute('stroke-width', '1.4');
  second.setAttribute('stroke-linecap', 'round');

  svg.append(first, second);
  return svg;
}

function articleLink(docId, articleId) {
  return window.location.origin + window.location.pathname + '#' + docId + '/' + encodeURIComponent(articleId);
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (error) {
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }

  showToast(successMessage);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(function () {
    elements.toast.hidden = true;
  }, 2200);
}

function isBookmarked(documentId, articleId) {
  return state.bookmarks.some(function (item) {
    return item.documentId === documentId && item.articleId === articleId;
  });
}

function createBookmarkIcon(saved) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M7.25 3.75h9.5A1.75 1.75 0 0 1 18.5 5.5v15l-6.5-4-6.5 4v-15a1.75 1.75 0 0 1 1.75-1.75Z'
  );
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', saved ? 'currentColor' : 'none');

  svg.append(path);
  return svg;
}

function updateBookmarkButton(button) {
  const documentId = button.dataset.documentId;
  const articleId = button.dataset.articleId;
  const saved = isBookmarked(documentId, articleId);

  button.classList.toggle('is-saved', saved);
  button.setAttribute('aria-pressed', String(saved));
  button.setAttribute(
    'aria-label',
    (saved ? 'Удалить из закладок статью ' : 'Сохранить в закладки статью ') + articleId
  );
  button.title = saved ? 'Удалить из закладок' : 'Добавить в закладки';
  button.replaceChildren(createBookmarkIcon(saved));
}

function updateBookmarkControls() {
  const count = state.bookmarks.length;
  const countText = count > 99 ? '99+' : String(count);

  elements.bookmarksCount.textContent = countText;
  elements.bookmarkSidebarCount.textContent =
    count + ' ' + pluralize(count, 'статья сохранена', 'статьи сохранено', 'статей сохранено');
  elements.bookmarksToggle.setAttribute(
    'aria-label',
    'Открыть закладки. Сохранено: ' + count
  );
  elements.bookmarksToggle.title = 'Сохранённые статьи: ' + count;

  document.querySelectorAll('.article-bookmark').forEach(updateBookmarkButton);
}

function persistBookmarks(bookmarks) {
  try {
    const result = bookmarkStore.write(window.localStorage, bookmarks);

    if (!result.ok) {
      showToast('Не удалось сохранить закладку в этом браузере');
      return false;
    }

    state.bookmarks = result.bookmarks;
    updateBookmarkControls();

    if (elements.bookmarkDialog.open) {
      renderBookmarkDialog();
    }

    return true;
  } catch (error) {
    console.error('[Anireil Rules] Bookmark storage is unavailable:', error);
    showToast('Хранилище браузера недоступно. Закладка не сохранена');
    return false;
  }
}

function toggleBookmark(documentId, articleId) {
  const article = state.searchIndex.find(function (item) {
    return item.documentId === documentId && item.id === articleId;
  });
  const meta = getDocumentMeta(documentId);

  const result = bookmarkStore.toggle(
    state.bookmarks,
    {
      documentId,
      articleId,
      documentTitle: meta ? meta.shortTitle : documentId,
      articleTitle: article ? article.title : ''
    },
    new Date().toISOString()
  );

  if (!result.ok) {
    showToast('Не удалось добавить эту статью в закладки');
    return;
  }

  if (!persistBookmarks(result.bookmarks)) return;

  showToast(
    result.added
      ? 'Статья ' + articleId + ' добавлена в закладки'
      : 'Статья ' + articleId + ' удалена из закладок'
  );
}

function loadBookmarkState() {
  try {
    const result = bookmarkStore.read(window.localStorage);
    state.bookmarks = result.bookmarks;

    if (!result.ok) {
      console.warn('[Anireil Rules] Saved bookmarks could not be read:', result.error);
    }
  } catch (error) {
    state.bookmarks = [];
    console.warn('[Anireil Rules] Bookmark storage is unavailable:', error);
  }

  updateBookmarkControls();
}

function createBookmarkEntry(bookmark) {
  const article = state.searchIndex.find(function (item) {
    return item.documentId === bookmark.documentId && item.id === bookmark.articleId;
  });
  const entry = document.createElement('article');
  entry.className = 'bookmark-entry';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'bookmark-entry-open';
  openButton.disabled = !article;

  const heading = document.createElement('span');
  heading.className = 'bookmark-entry-heading';

  const id = document.createElement('span');
  id.className = 'bookmark-entry-id';
  id.textContent = bookmark.articleId;

  const context = document.createElement('span');
  context.className = 'bookmark-entry-context';
  context.textContent =
    (article ? article.documentTitle : bookmark.documentTitle || bookmark.documentId) +
    (article ? ' / ' + article.sectionTitle : ' / отсутствует в текущей редакции');

  heading.append(id, context);

  const title = document.createElement('strong');
  title.className = 'bookmark-entry-title';
  title.textContent = article
    ? article.title
    : bookmark.articleTitle || 'Статья больше не найдена';

  openButton.append(heading, title);

  if (article) {
    const excerpt = document.createElement('p');
    excerpt.className = 'bookmark-entry-excerpt';
    excerpt.textContent = article.text.length > 150
      ? article.text.slice(0, 147) + '...'
      : article.text;
    openButton.append(excerpt);

    openButton.addEventListener('click', function () {
      elements.bookmarkDialog.close();
      elements.inlineSearch.value = '';
      renderInlineSearch('');
      setRoute(bookmark.documentId, bookmark.articleId);
    });
  } else {
    const unavailable = document.createElement('p');
    unavailable.className = 'bookmark-entry-unavailable';
    unavailable.textContent = 'Статья удалена или больше не входит в текущую редакцию. Закладку можно удалить.';
    openButton.append(unavailable);
  }

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'bookmark-entry-remove';
  removeButton.textContent = 'Удалить';
  removeButton.setAttribute('aria-label', 'Удалить закладку ' + bookmark.articleId);
  removeButton.addEventListener('click', function () {
    const next = state.bookmarks.filter(function (item) {
      return !(
        item.documentId === bookmark.documentId &&
        item.articleId === bookmark.articleId
      );
    });

    if (persistBookmarks(next)) {
      showToast('Закладка ' + bookmark.articleId + ' удалена');
    }
  });

  entry.append(openButton, removeButton);
  return entry;
}

function renderBookmarkDialog() {
  elements.bookmarkList.replaceChildren();

  const bookmarks = state.bookmarks
    .slice()
    .sort(function (a, b) {
      return Date.parse(b.savedAt) - Date.parse(a.savedAt);
    });

  elements.bookmarkSummary.textContent =
    'Сохранено ' + bookmarks.length.toLocaleString('ru-RU') + ' ' +
    pluralize(bookmarks.length, 'статья', 'статьи', 'статей') +
    '. Список хранится только в этом браузере.';

  if (!bookmarks.length) {
    const empty = document.createElement('div');
    empty.className = 'bookmark-empty';

    const title = document.createElement('strong');
    title.textContent = 'Пока нет сохранённых статей';

    const description = document.createElement('p');
    description.textContent =
      'Нажми на значок закладки рядом с любой статьёй, чтобы добавить её сюда.';

    empty.append(title, description);
    elements.bookmarkList.append(empty);
    return;
  }

  bookmarks.forEach(function (bookmark) {
    elements.bookmarkList.append(createBookmarkEntry(bookmark));
  });
}

function openBookmarkDialog() {
  closeMobileSidebar();
  renderBookmarkDialog();

  if (!elements.bookmarkDialog.open) {
    elements.bookmarkDialog.showModal();
  }
}

function createBookmarkButton(documentId, articleId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'article-bookmark';
  button.dataset.documentId = documentId;
  button.dataset.articleId = articleId;

  button.addEventListener('click', function () {
    toggleBookmark(documentId, articleId);
  });

  updateBookmarkButton(button);
  return button;
}

function createArticleCard(article) {
  const card = document.createElement('article');
  card.className = 'article-card';
  card.id = articleAnchor(state.currentDocument, article.id);
  card.dataset.articleId = article.id;

  const head = document.createElement('div');
  head.className = 'article-head';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'article-title-wrap';

  const id = document.createElement('span');
  id.className = 'article-id';
  id.textContent = article.id;

  const title = document.createElement('h4');
  title.textContent = article.title;

  titleWrap.append(id, title);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'article-copy';
  copy.setAttribute('aria-label', 'Скопировать ссылку на ' + article.id);
  copy.append(createCopyIcon());

  copy.addEventListener('click', function () {
    copyText(
      articleLink(state.currentDocument, article.id),
      'Ссылка на ' + article.id + ' скопирована'
    );
  });

  const actions = document.createElement('div');
  actions.className = 'article-head-actions';
  actions.append(
    createBookmarkButton(state.currentDocument, article.id),
    copy
  );

  head.append(titleWrap, actions);

  const text = document.createElement('p');
  text.textContent = article.text;

  card.append(head, text);

  if (article.sanctions) {
    const sanctions = document.createElement('div');
    sanctions.className = 'sanctions';

    const label = document.createElement('span');
    label.textContent = 'Санкции';

    const value = document.createElement('p');
    value.textContent = article.sanctions;

    sanctions.append(label, value);
    card.append(sanctions);
  }

  if (article.severity) {
    const badge = document.createElement('div');
    badge.className = 'severity-badge severity-' + article.severity;
    badge.textContent =
      'Уровень ' + article.severity + ' — ' +
      (state.data.meta.prohibitionSeverity[String(article.severity)] || 'Без подписи');
    card.append(badge);
  }

  return card;
}

function createDocumentSection(section) {
  const sectionNode = document.createElement('section');
  sectionNode.className = 'document-section section-anchor';
  sectionNode.id = sectionAnchor(state.currentDocument, section.chapter);

  const heading = document.createElement('div');
  heading.className = 'chapter-heading';

  const chapterNumber = document.createElement('span');
  chapterNumber.className = 'chapter-number';

  if (section.chapter === 'G') {
    chapterNumber.textContent = 'GENERAL';
  } else if (state.currentDocument === 'prohibitions') {
    chapterNumber.textContent = 'SECTION ' + roman(section.chapter);
  } else {
    chapterNumber.textContent = 'ГЛАВА ' + String(section.chapter).padStart(2, '0');
  }

  const title = document.createElement('h3');
  title.textContent = section.title;

  const count = document.createElement('span');
  count.className = 'chapter-article-count';
  count.textContent = section.articles.length.toLocaleString('ru-RU') + ' ПУНКТОВ';
  count.setAttribute('aria-label', section.articles.length + ' пунктов в разделе');

  heading.append(chapterNumber, title, count);
  sectionNode.dataset.document = state.currentDocument;
  sectionNode.dataset.section = String(section.chapter);

  const list = document.createElement('div');
  list.className = 'article-list';

  section.articles.forEach(function (article) {
    list.append(createArticleCard(article));
  });

  sectionNode.append(heading, list);
  return sectionNode;
}

function renderPreamble() {
  const preamble = getPreamble(state.currentDocument);
  if (!preamble) return null;

  const card = document.createElement('section');
  card.className = 'preamble-card';
  card.id = articleAnchor(state.currentDocument, 'preamble');

  const kicker = document.createElement('span');
  kicker.className = 'section-kicker';
  kicker.textContent = 'PREAMBLE';

  const title = document.createElement('h3');
  title.textContent = preamble.title;

  const text = document.createElement('p');
  text.textContent = preamble.text;

  card.append(kicker, title, text);
  return card;
}

function renderCurrentDocument() {
  const meta = getDocumentMeta(state.currentDocument);
  const sections = getDocumentSections(state.currentDocument);
  const totalArticles = sections.reduce(function (count, section) {
    return count + section.articles.length;
  }, 0);

  elements.documentLabel.textContent = 'Официальный документ / ' + meta.shortTitle;
  elements.documentTitle.textContent = meta.title;
  elements.documentDescription.textContent = meta.description;
  elements.readingTitle.textContent = meta.title;
  elements.summaryCode.textContent = documentCodes[state.currentDocument] || 'AR-RL';
  elements.articleCount.textContent = totalArticles.toLocaleString('ru-RU');
  elements.sectionCount.textContent = sections.length.toLocaleString('ru-RU');

  const publication = state.data.meta.publication &&
    state.data.meta.publication.documents &&
    state.data.meta.publication.documents[state.currentDocument];

  if (publication) {
    const updatedAt = new Date(publication.updatedAt);
    const dateLabel = Number.isNaN(updatedAt.getTime())
      ? ''
      : updatedAt.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

    elements.documentVersion.textContent =
      'Редакция ' + publication.edition + (dateLabel ? ' · ' + dateLabel : '');
    elements.documentVersion.hidden = false;
  } else if (meta.version) {
    elements.documentVersion.textContent = 'Редакция ' + meta.version;
    elements.documentVersion.hidden = false;
  } else {
    elements.documentVersion.hidden = true;
    elements.documentVersion.textContent = '';
  }

  renderDocumentSwitcher();
  renderToc(sections);

  elements.documentContent.replaceChildren();

  const preamble = renderPreamble();
  if (preamble) elements.documentContent.append(preamble);

  sections.forEach(function (section) {
    elements.documentContent.append(createDocumentSection(section));
  });

  elements.loadingState.hidden = true;
  elements.errorState.hidden = true;
  elements.documentContent.hidden = false;

  setupSectionObserver();
}

function setupSectionObserver() {
  if (state.observer) state.observer.disconnect();

  const tocLinks = Array.from(elements.toc.querySelectorAll('a'));
  const sectionNodes = Array.from(elements.documentContent.querySelectorAll('.document-section'));

  if (!('IntersectionObserver' in window) || !sectionNodes.length) return;

  state.observer = new IntersectionObserver(function (entries) {
    const visible = entries
      .filter(function (entry) { return entry.isIntersecting; })
      .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });

    if (!visible.length) return;

    const activeId = visible[0].target.id;
    tocLinks.forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('href') === '#' + activeId);
    });
  }, {
    rootMargin: '-18% 0px -68% 0px',
    threshold: [0.01, 0.2, 0.5]
  });

  sectionNodes.forEach(function (node) {
    state.observer.observe(node);
  });
}

function buildSearchIndex() {
  const index = [];

  state.data.meta.documents.forEach(function (doc) {
    const previous = state.currentDocument;
    state.currentDocument = doc.id;
    const sections = getDocumentSections(doc.id);

    sections.forEach(function (section) {
      section.articles.forEach(function (article) {
        index.push({
          documentId: doc.id,
          documentTitle: doc.shortTitle,
          sectionTitle: section.title,
          sectionId: String(section.chapter),
          sectionKey: doc.id + ':' + String(section.chapter),
          id: article.id,
          title: article.title,
          text: article.text,
          sanctions: article.sanctions || '',
          severity: article.severity || null,
          haystack: normalize([
            article.id,
            article.title,
            article.text,
            article.sanctions || '',
            section.title,
            doc.shortTitle
          ].join(' '))
        });
      });
    });

    state.currentDocument = previous;
  });

  state.searchIndex = index;
}

function searchRules(query, filters) {
  const normalizedQuery = normalize(query);
  const terms = normalizedQuery.split(' ').filter(Boolean);
  const activeFilters = filters || {};
  const hasFilters = Boolean(
    activeFilters.documentId ||
    activeFilters.sectionKey ||
    activeFilters.severity ||
    activeFilters.articleId
  );

  if (!normalizedQuery && !hasFilters) return [];

  return state.searchIndex
    .map(function (item) {
      let score = 0;
      const id = normalize(item.id);
      const title = normalize(item.title);

      if (normalizedQuery) {
        if (id === normalizedQuery) score += 100;
        if (id.startsWith(normalizedQuery)) score += 50;
        if (title.includes(normalizedQuery)) score += 35;

        for (const term of terms) {
          if (id.includes(term)) score += 15;
          if (title.includes(term)) score += 10;
          if (item.haystack.includes(term)) score += 3;
        }
      }

      const matchesAll = terms.every(function (term) {
        return item.haystack.includes(term);
      });

      return Object.assign({}, item, { score, matchesAll });
    })
    .filter(function (item) {
      if (!item.matchesAll) return false;
      if (activeFilters.documentId && item.documentId !== activeFilters.documentId) return false;
      if (activeFilters.sectionKey && item.sectionKey !== activeFilters.sectionKey) return false;
      if (activeFilters.severity && String(item.severity || '') !== activeFilters.severity) return false;
      if (activeFilters.articleId && !normalize(item.id).includes(normalize(activeFilters.articleId))) return false;
      return true;
    })
    .sort(function (a, b) {
      return b.score - a.score ||
        a.documentTitle.localeCompare(b.documentTitle, 'ru') ||
        a.id.localeCompare(b.id, 'ru');
    })
    .slice(0, 40);
}

function createSearchResult(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'search-result';

  const top = document.createElement('span');
  top.className = 'search-result-top';

  const id = document.createElement('span');
  id.className = 'search-result-id';
  id.textContent = item.id;

  const doc = document.createElement('span');
  doc.className = 'search-result-doc';
  doc.textContent = item.documentTitle + ' / ' + item.sectionTitle;

  top.append(id, doc);

  const title = document.createElement('strong');
  title.textContent = item.title;

  const excerpt = document.createElement('p');
  excerpt.textContent = item.text.length > 180 ? item.text.slice(0, 177) + '...' : item.text;

  button.append(top, title, excerpt);

  button.addEventListener('click', function () {
    if (elements.searchDialog.open) elements.searchDialog.close();
    elements.inlineSearch.value = '';
    elements.searchResults.hidden = true;
    setRoute(item.documentId, item.id);
  });

  return button;
}

function renderInlineSearch(query) {
  const results = searchRules(query);
  const hasQuery = Boolean(normalize(query));

  if (!hasQuery) {
    elements.searchResults.hidden = true;
    elements.searchResultsList.replaceChildren();
    elements.searchSummary.textContent = '';
    return;
  }

  elements.searchResults.hidden = false;
  elements.searchResultsList.replaceChildren();

  elements.searchSummary.textContent =
    'Найдено ' + results.length.toLocaleString('ru-RU') + ' ' +
    pluralize(results.length, 'результат', 'результата', 'результатов');

  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'state-card';
    empty.textContent = 'Совпадений нет. Попробуй номер статьи или другое слово.';
    elements.searchResultsList.append(empty);
    return;
  }

  results.forEach(function (item) {
    elements.searchResultsList.append(createSearchResult(item));
  });
}

function getAdvancedSearchFilters() {
  return {
    documentId: elements.searchDocumentFilter.value,
    sectionKey: elements.searchSectionFilter.value,
    severity: elements.searchSeverityFilter.value,
    articleId: elements.searchArticleFilter.value
  };
}

function renderSearchSectionFilter() {
  if (!state.data) return;

  const selectedDocument = elements.searchDocumentFilter.value;
  const previousValue = elements.searchSectionFilter.value;
  const options = [];

  state.data.meta.documents.forEach(function (doc) {
    if (selectedDocument && doc.id !== selectedDocument) return;

    getDocumentSections(doc.id).forEach(function (section) {
      options.push({
        value: doc.id + ':' + String(section.chapter),
        label: selectedDocument ? section.title : doc.shortTitle + ' — ' + section.title
      });
    });
  });

  elements.searchSectionFilter.replaceChildren();

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Все главы и категории';
  elements.searchSectionFilter.append(allOption);

  options.forEach(function (item) {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    elements.searchSectionFilter.append(option);
  });

  elements.searchSectionFilter.value = options.some(function (item) {
    return item.value === previousValue;
  }) ? previousValue : '';
}

function renderDialogSearch(query) {
  const filters = getAdvancedSearchFilters();
  const hasCriteria = Boolean(
    normalize(query) ||
    filters.documentId ||
    filters.sectionKey ||
    filters.severity ||
    normalize(filters.articleId)
  );
  const results = searchRules(query, filters);

  elements.dialogSearchResults.replaceChildren();

  if (!hasCriteria) {
    elements.dialogSearchSummary.textContent =
      'Поиск по документам, главам, категориям, уровням и номерам статей.';
    return;
  }

  elements.dialogSearchSummary.textContent =
    'Найдено ' + results.length.toLocaleString('ru-RU') + ' ' +
    pluralize(results.length, 'результат', 'результата', 'результатов');

  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'state-card';
    empty.textContent = 'Ничего не найдено. Измени запрос или ослабь фильтры.';
    elements.dialogSearchResults.append(empty);
    return;
  }

  results.slice(0, 24).forEach(function (item) {
    elements.dialogSearchResults.append(createSearchResult(item));
  });
}

function highlightCurrentArticle() {
  document.querySelectorAll('.article-card.targeted').forEach(function (node) {
    node.classList.remove('targeted');
  });

  if (!state.currentArticle) return;

  const target = document.getElementById(articleAnchor(state.currentDocument, state.currentArticle));
  if (!target) return;

  requestAnimationFrame(function () {
    target.classList.add('targeted');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(function () {
      target.classList.remove('targeted');
    }, 1800);
  });
}

function handleRoute() {
  if (!state.data) return;

  const route = parseRoute();
  const documentChanged = route.document !== state.currentDocument;

  state.currentDocument = route.document;
  state.currentArticle = route.article;

  if (documentChanged || !elements.documentContent.children.length) {
    renderCurrentDocument();
  } else {
    renderDocumentSwitcher();
  }

  if (state.currentArticle) {
    highlightCurrentArticle();
  } else if (documentChanged) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function openSearchDialog() {
  if (state.data) renderSearchSectionFilter();

  if (!elements.searchDialog.open) {
    elements.searchDialog.showModal();
  }

  setTimeout(function () {
    elements.dialogSearchInput.focus();
  }, 60);
}

elements.inlineSearch.addEventListener('input', function (event) {
  renderInlineSearch(event.target.value);
});

elements.clearSearch.addEventListener('click', function () {
  elements.inlineSearch.value = '';
  renderInlineSearch('');
  elements.inlineSearch.focus();
});

elements.searchToggle.addEventListener('click', openSearchDialog);
elements.bookmarksToggle.addEventListener('click', openBookmarkDialog);
elements.bookmarksSidebarToggle.addEventListener('click', openBookmarkDialog);

elements.bookmarkDialogClose.addEventListener('click', function () {
  elements.bookmarkDialog.close();
});

elements.bookmarkDialog.addEventListener('click', function (event) {
  if (event.target === elements.bookmarkDialog) {
    elements.bookmarkDialog.close();
  }
});

elements.searchDialogClose.addEventListener('click', function () {
  elements.searchDialog.close();
});

elements.searchDialog.addEventListener('click', function (event) {
  if (event.target === elements.searchDialog) {
    elements.searchDialog.close();
  }
});

elements.dialogSearchInput.addEventListener('input', function (event) {
  renderDialogSearch(event.target.value);
});

elements.searchDocumentFilter.addEventListener('change', function () {
  renderSearchSectionFilter();
  renderDialogSearch(elements.dialogSearchInput.value);
});

elements.searchSectionFilter.addEventListener('change', function () {
  renderDialogSearch(elements.dialogSearchInput.value);
});

elements.searchSeverityFilter.addEventListener('change', function () {
  renderDialogSearch(elements.dialogSearchInput.value);
});

elements.searchArticleFilter.addEventListener('input', function () {
  renderDialogSearch(elements.dialogSearchInput.value);
});

elements.clearSearchFilters.addEventListener('click', function () {
  elements.searchDocumentFilter.value = '';
  elements.searchSeverityFilter.value = '';
  elements.searchArticleFilter.value = '';
  renderSearchSectionFilter();
  renderDialogSearch(elements.dialogSearchInput.value);
});

elements.copyDocumentLink.addEventListener('click', function () {
  const value = window.location.origin + window.location.pathname + '#' + state.currentDocument;
  copyText(value, 'Ссылка на документ скопирована');
});

elements.printDocument.addEventListener('click', function () {
  window.print();
});

elements.menuToggle.addEventListener('click', function () {
  if (elements.sidebar.classList.contains('open')) {
    closeMobileSidebar();
  } else {
    openMobileSidebar();
  }
});

elements.sidebarClose.addEventListener('click', closeMobileSidebar);
elements.mobileBackdrop.addEventListener('click', closeMobileSidebar);

document.querySelectorAll('[data-doc-link]').forEach(function (link) {
  link.addEventListener('click', function (event) {
    event.preventDefault();
    setRoute(link.dataset.docLink, null);
  });
});

document.addEventListener('keydown', function (event) {
  const active = document.activeElement;
  const typing =
    active &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);

  if (event.key === '/' && !typing && !elements.searchDialog.open) {
    event.preventDefault();
    openSearchDialog();
  }

  if (event.key === 'Escape' && elements.sidebar.classList.contains('open')) {
    closeMobileSidebar();
  }
});

window.addEventListener('hashchange', handleRoute);

window.addEventListener('storage', function (event) {
  if (event.key !== bookmarkStore.STORAGE_KEY && event.key !== null) return;

  try {
    const incoming = event.newValue ? JSON.parse(event.newValue) : [];
    state.bookmarks = bookmarkStore.normalizeBookmarks(incoming);
    updateBookmarkControls();

    if (elements.bookmarkDialog.open) {
      renderBookmarkDialog();
    }
  } catch (error) {
    console.warn('[Anireil Rules] External bookmark update was ignored:', error);
  }
});

async function loadRules() {
  try {
    const response = await fetch('./data/rules.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Rules data request failed');

    state.data = await response.json();
    loadBookmarkState();
    buildSearchIndex();
    renderSearchSectionFilter();

    const route = parseRoute();
    state.currentDocument = route.document;
    state.currentArticle = route.article;

    renderCurrentDocument();

    if (state.currentArticle) {
      highlightCurrentArticle();
    }
  } catch (error) {
    console.error('[Anireil Rules]', error);
    elements.loadingState.hidden = true;
    elements.documentContent.hidden = true;
    elements.errorState.hidden = false;
  }
}

loadRules();
