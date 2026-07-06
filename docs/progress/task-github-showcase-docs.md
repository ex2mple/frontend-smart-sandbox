# Task: GitHub-витрина — README.md и ROADMAP.md (RU)

## Что сделано

- Переписан корневой `README.md` (заменён Angular-CLI boilerplate) на русскоязычную витрину: пиктчейн + CI-бейдж (`ex2mple/frontend-smart-sandbox`) → «Что это» → «Быстрый старт» → «Как это работает» → «Обучающие визуализаторы» (8 шаблонов, по одной строке + двухфразовое объяснение replay-модели) → «Тесты» (`test:codegen` / `test:devtools` / `test:shared`) → «Структура репозитория» → «Лицензия» (MIT).
- Создан корневой `ROADMAP.md`: «Сделано» (движок песочниц: создание/мультистраничность/pin/unpin/delete/wipe; дизайн-система `--sb-*`; dev-консоль; 8 визуализаторов на replay-модели) и «Планы» (новые темы визуализаторов — rendering/анимации переходов; параллельная браузерная QA-инфраструктура; скриншоты/GIF в README). Monaco нигде не упомянут (осознанно выпилен из планов ранее).
- Внутренние детали процесса (агенты, коммиты, QA-логи) в оба файла не включались — только пользовательская/техническая витрина.

## Источники, которые сверялись (только чтение)

- `docs/progress/NEXT-SESSION.md` — статус проекта, список готового/незавершённого, явное указание «Monaco дропнут — не возвращать».
- `package.json` — точные npm-скрипты (`start`, `test:codegen`, `test:devtools`, `test:shared`), зависимости (Angular 21.2), Node/npm пакетный менеджер.
- `proxy.conf.json` — подтверждение проксирования `/sandbox-api` → `:4300`.
- `tools/sandbox/server.mjs` — подтверждение: только Node built-ins, порт 4300, файл маршрутов `sandbox.routes.generated.ts`, эндпойнты `list` / `templates` / `create` / `wipe` / `pin/:name` / `unpin/:name` / `DELETE /sandbox-api/:name`.
- `src/app/sandboxes/AGENTS.md` — конвенции движка (skip-worktree на generated-routes, запрет `import.meta.glob`, токены `--sb-*`, dev-консоль перехватывает `console.*` автоматически).
- `tools/sandbox/templates/*/AGENTS.md` (все 11: blank, example, multipage + 8 визуализаторов) — точные формулировки, что изучается в каждом шаблоне, для однострочных описаний в README.
- `src/app/sandboxes/shared/learning/{run-recorder,stepper,experiment-card}.ts` — подтверждение механики replay-модели (буферизация шагов в обычном массиве + единый flush в микротаске, `sb-stepper` для пошагового/авто воспроизведения, `sb-experiment-card` вычисляет вердикт из `actualIndex`, а не из фиксированного текста).
- Проверено: `LICENSE`-файла в репозитории пока нет — раздел «Лицензия: MIT» в README написан по прямому указанию задачи (публичный репозиторий будет MIT), сам файл лицензии не создавался (вне зоны разрешённых правок).

## Факты, в которых не до конца уверен / стоит перепроверить

- Не проверял, существует ли уже workflow-файл `.github/workflows/ci.yml` — бейдж в README вставлен как есть по прямому указанию задачи; если workflow ещё не создан, бейдж будет визуально «no status» до его появления.
- Названия «мультистраничность» и «pin/delete/wipe» в ROADMAP описаны по данным `server.mjs` и `AGENTS.md`; отдельного эндпойнта «pin» я не тестировал живьём (только прочитал код сервера) — по коду это `POST /sandbox-api/pin/:name` и `POST /sandbox-api/unpin/:name`.
