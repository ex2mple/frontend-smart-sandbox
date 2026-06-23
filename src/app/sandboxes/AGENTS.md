# Sandboxes workspace — гайд для агента

Ты работаешь внутри **Frontend Smart Sandbox** — Angular-приложения для быстрой и
**наглядной** проверки фундаментальных JS/Angular-концептов. Каждая песочница под
`/s/<name>` — это маленькая изолированная страница-эксперимент: цель не «сделать продукт»,
а **показать, как что-то работает**, чтобы было видно глазами.

Каждая песочница содержит свой `AGENTS.md` с конкретным учебным интентом — читай его
первым, когда заходишь в папку песочницы. Этот файл — общие правила для всего workspace.

## Твоя посадка

Ты одновременно **тьютор** и **инженер**: объясняй концепт простым языком и **сразу
реализуй** эксперименты прямо в скаффолде песочницы, соблюдая конвенции ниже. Делай
поведение видимым (счётчики, таймлайны, подсветки, лог), а не только описывай словами.

## Жёсткие конвенции (соблюдать всегда)

Angular (v20+):
- **Standalone-компоненты.** НЕ писать `standalone: true` — это и так дефолт.
- `changeDetection: ChangeDetectionStrategy.OnPush` во всех компонентах.
- Состояние — **signals**: `signal()`, `computed()` для производного, `update()`/`set()`
  (никогда `mutate()`).
- Вход/выход — функции `input()` / `output()`, не декораторы `@Input/@Output`.
- Шаблоны — **native control flow**: `@if` / `@for` (с `track`) / `@switch`. Не `*ngIf/*ngFor`.
- Host-биндинги — в объекте `host: {}` декоратора. НЕ `@HostBinding` / `@HostListener`.
- Классы/стили — `[class.x]` / `[style.y]`-биндинги. НЕ `ngClass` / `ngStyle`.
- DI — `inject()`, не constructor injection.
- Ленивые feature-маршруты; `NgOptimizedImage` для статических картинок (не для inline base64).

TypeScript:
- strict; избегать `any` (использовать `unknown`); полагаться на вывод типов где очевидно.

Доступность (a11y):
- Должно проходить **AXE** и **WCAG AA**: фокус-менеджмент, контраст, ARIA.
- Кнопки — `type="button"`; видимый фокус через `box-shadow: var(--sb-ring)` на `:focus-visible`;
  состояние не передавать только цветом (добавляй текст/бейдж).

## Контракт движка (важно — не сломать)

- Структура песочницы: `<name>.ts` / `<name>.html` / `<name>.less` / `<name>.routes.ts`.
  Маршрут — `path: 's/<name>'`; компонент лениво грузится через `loadChildren`.
- **НИКОГДА не редактировать `sandbox.routes.generated.ts`** — он под `git update-index
  --skip-worktree`, переписывается companion-сервером. Ручные правки сломают чистый клон.
- **НИКОГДА не использовать `import.meta.glob`** по папкам песочниц — это вешает Vite
  dep-optimize. Только литеральные динамические импорты (их генерит сервер).
- Генерируемые песочницы живут в `generated/` (git-ignored, расходный материал); «pin»
  переносит в `saved/` (коммитится).

## Стили — дизайн-токены

Используй ТОЛЬКО глобальные CSS-переменные из `src/styles.less` (`:root --sb-*`), чтобы
песочницы выглядели единообразно:

```
--sb-bg --sb-surface --sb-surface-2 --sb-border
--sb-text --sb-text-muted
--sb-accent --sb-accent-hover --sb-accent-contrast --sb-ring
--sb-success --sb-warn --sb-warn-surface --sb-danger --sb-danger-hover --sb-error-surface
--sb-radius --sb-radius-sm --sb-shadow
--sb-font-sans --sb-font-mono
--sb-space-1 --sb-space-2 --sb-space-3 --sb-space-4 --sb-space-6 --sb-space-8
```

Глобальный `withViewTransitions()` включён → кросс-фейд на смене маршрута.

## Логирование и dev-консоль

В dev-режиме поверх приложения висит **оверлей-консоль**, которая автоматически
перехватывает `console.*` с origin/stack. Поэтому для наглядного лога в песочнице просто
используй `console.log` / `console.info` / `console.warn` — он сразу появится в оверлее.
Отдельный логгер импортировать не нужно.

## Шаблоны

Шаблоны песочниц лежат в `tools/sandbox/templates/<id>/`. Добавить новый = создать папку
с файлами `__name__.{ts,html,less,routes.ts}` + `AGENTS.md`; сервер подхватит её сам
(`readdir`), codegen подставит `{{name}}` / `{{className}}` / `{{selector}}` / `{{title}}`.
Никаких правок сервера/codegen для нового шаблона не требуется.
