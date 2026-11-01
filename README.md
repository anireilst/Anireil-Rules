# Anireil Rules

Официальный сайт правил сообщества Anireil.

Сайт содержит:

- Конституцию Anireil;
- Кодекс Anireil;
- Индекс запретов Anireil;
- глобальный поиск по статьям;
- прямые ссылки на конкретные статьи;
- адаптивное оглавление для компьютеров и телефонов.

## Источник правил

Данные сайта синхронизированы из актуальных файлов `anireilst/Anireil-Bot/rules`.

Интерфейс сайта не должен изменять смысл, формулировки, санкции или уровни тяжести документов. При обновлении правил сначала меняется официальный источник, после чего обновляется `data/rules.json`.

## Структура

- `index.html` — оболочка приложения;
- `styles.css` — адаптивный интерфейс;
- `app.js` — навигация, поиск, hash-маршруты и копирование ссылок;
- `data/rules.json` — действующие документы;
- `test/` — проверки целостности правил и интерфейса;
- `.github/workflows/checks.yml` — автоматические тесты;
- `.github/workflows/pages.yml` — публикация GitHub Pages.

## Локальный запуск

Из-за загрузки `data/rules.json` через `fetch` страницу нужно открывать через локальный HTTP-сервер, а не двойным кликом по HTML.

Например:

```bash
python -m http.server 8080
```

После этого сайт будет доступен по адресу `http://localhost:8080`.

## GitHub Pages

После объединения изменений в `main` workflow публикации отправляет статический сайт в GitHub Pages.

Если Pages ещё не включён для нового репозитория, в настройках репозитория нужно выбрать:

`Settings → Pages → Build and deployment → Source → GitHub Actions`.


## Source synchronization

The official rule source is the `rules/` directory in
[anireilst/Anireil-Bot](https://github.com/anireilst/Anireil-Bot).

The Rules repository generates `data/rules.json` from these source modules:

- `rules/constitution.js`
- `rules/index.js` and `rules/chapter1.js` through `rules/chapter8.js`
- `rules/prohibitions.js` and its exported `publicationData`

The `Sync official Anireil rules` workflow checks for source changes every 15 minutes
and can also be started manually from the Actions tab. When the snapshot changes, it
commits the refreshed JSON and publishes the updated GitHub Pages site. No MongoDB,
external database, or repository secret is required.

The sync job runs with read-only repository permissions. The separate publishing job
receives write and Pages permissions only after the source snapshot has been generated.

To refresh locally, check out Anireil-Bot into `source-bot/` and run:

```sh
npm run sync
npm run sync:check
npm test
npm run check
```

The source revision recorded in `data/rules.json` is a content hash of the official
documents. Unrelated bot commits do not cause unnecessary website deployments.

## Reader features

- The global search dialog can filter by document, chapter/category, severity and article ID.
- The print action formats the currently selected document for A4 printing or saving as PDF.
- Browser and screen-reader controls remain available in the normal graphite interface.
