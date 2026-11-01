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


### One-time access setup for the private Bot repository

Because `Anireil-Bot` is private, GitHub Actions in this repository needs a separate
read-only credential to fetch its source. The normal `GITHUB_TOKEN` cannot read a
different private repository.

1. Create a **fine-grained personal access token** for the same GitHub account.
2. Under repository access, select **Only select repositories** and choose
   `Anireil-Bot`.
3. Grant only **Contents: Read-only**. Leave other repository permissions disabled.
4. In `Anireil-Rules`, open **Settings → Secrets and variables → Actions → New repository secret**.
5. Add a secret named `BOT_REPO_READ_TOKEN` and paste the token value there.

Do not put this token in source files, commits, issues or chat messages. The workflows
pass it only to the Bot checkout step and disable credential persistence afterward.
The regular site checks still run without the secret, but the private-source comparison
is skipped. The scheduled sync workflow reports a clear error until this one-time setup
is complete.

GitHub's official guides:
- [Fine-grained personal access tokens](https://docs.github.com/en/enterprise-cloud@latest/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Repository Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

## Revision history

The archive keeps an immutable snapshot for every published edition of each document.
The history page shows the current edition, publication date, article-level changes and
the full text of previous editions. The first saved snapshot is the starting point of
the archive; changes from before that date are not reconstructed.

The synchronization script creates a new edition only when that document's content
changes. Unchanged documents keep their edition number and publication date. The sync
workflow publishes the rules index, revision log and new snapshots together.
