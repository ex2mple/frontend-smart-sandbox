# Stage 3 — prototype-chain reworked to replay model

Scope: `tools/sandbox/templates/prototype-chain/` only (`__name__.ts`, `__name__.html`,
`__name__.less`, `AGENTS.md`). `__name__.routes.ts` untouched. No other template/engine/app
files touched. No commit made.

## What changed

- Replaced the old "always-live, hardcoded chain rex→dog→animal" scaffold with the
  **replay model** used by the event-loop pilot: `RunRecorder<ChainState>`,
  `<sb-stepper>`, `<sb-experiment-card>` from `../../shared/learning`.
- Real prototype chain now built from actual ES classes (not `Object.create` chains),
  so `Dog.prototype`/`Animal.prototype`/`Object.prototype` really exist and are linked
  by the JS engine itself:
  ```ts
  class Animal { constructor(readonly name: string) {} speak() { ... } }
  class Dog extends Animal {}
  const dog = new Dog('Рекс');
  ```
- Chain: `dog → Dog.prototype → Animal.prototype → Object.prototype → null`.
- **"Запустить" runs a real walk**: for the chosen property, loops from `dog` via
  `Object.getPrototypeOf`, checking `Object.getOwnPropertyNames(obj).includes(prop)` at
  each level (genuine reflection, never simulated). Each hop is `recorder.record()`ed
  with `kind: 'check' | 'found' | 'miss'` (these three kinds map directly onto the
  Stepper's pre-existing badge classes `sb-step--check/--found/--miss`, no extra CSS
  needed for the step list) and an `Object.freeze`d snapshot of the whole chain
  (`{ levels: LevelSnapshot[], activeIndex }`) taken *after* that hop.
- The walk is fully synchronous; completion is still deferred via `setTimeout` (after
  the recorder's `queueMicrotask` flush) before copying `recorder.steps()` once into
  `replaySteps` — same deferred-completion pattern as the event-loop pilot, applied to
  a sync scenario as the task brief anticipated.
- `runId` guards stale callbacks (defensive, since the walk itself can't be interrupted
  mid-loop, but `reset()`/re-run bump it so a leftover `setTimeout` becomes a no-op).
- Two live computeds drive the diagram: `chainStructure()` (static structure, recomputed
  when `shadowed()` changes, shown before any run / between runs) and `displayLevels()` +
  `activeIndex()` (derived from `replaySteps()`/`stepPosition()`, falling back to
  `chainStructure()` when position is -1 or out of range).

## Scenarios / properties offered

Selectable via buttons (`propertyOptions = ['name', 'speak', 'toString', 'fly']`),
selecting one calls `reopenPrediction()` (resets card, doesn't touch prior replay):

| property | resolves on (before shadow) | after shadow |
|---|---|---|
| `name` | `dog` (own, ctor param property) | same |
| `speak` | `Animal.prototype` (class method) | `dog` (shadowed) |
| `toString` | `Object.prototype` | same |
| `fly` | not found anywhere → `undefined` | same |

**Shadowing control**: "+ добавить dog.speak" adds a *real* own property directly on the
`dog` instance (`dog.speak = function shadowSpeak() {...}`), which genuinely shadows
`Animal.prototype.speak`; "Убрать" does a real `delete dog.speak`. Toggling also reopens
the card. The `shadowed` signal only mirrors UI state — the source of truth for the walk
is always the live `dog` object via real reflection calls.

## Prediction card

- Question (computed): `На каком уровне цепочки найдётся свойство «${selectedProp()}»?`
- Options: `[...LEVEL_LABELS, 'не найдётся (undefined)']` = `['dog', 'Dog.prototype',
  'Animal.prototype', 'Object.prototype', 'не найдётся (undefined)']`.
- `actualIndex` (`resolveCardAnswer`): finds the recorded step with `kind === 'found'`;
  if present, its `label` (one of the 4 real level labels, set from `level.label` during
  the walk) is looked up in `LEVEL_LABELS` via `findIndex`; if no `found` step exists,
  returns `CARD_NOT_FOUND_INDEX` (`= LEVEL_LABELS.length`, i.e. the "не найдётся" option).
  Never hardcoded — always derived from what the real walk actually recorded.

## Verification done

- Re-read all four files end-to-end; checked brace/placeholder balance manually.
- Confirmed `{{selector}}`/`{{name}}`/`{{className}}`/`{{title}}` placeholders intact,
  `__name__.routes.ts` untouched.
- Confirmed no stray literal `{` in template TEXT (the one bracket usage,
  `[[Prototype]]`, is square brackets, not curly — no ICU risk); all `{{ }}` are normal
  Angular interpolations.
- Cross-checked every symbol used in `__name__.html` against `__name__.ts` (signals
  called with `()`, plain arrays without `()`, method names match).
- Verified all `--sb-*` tokens used in the `.less` file exist in `src/styles.less`
  (confirmed via subagent grep — all 25 tokens referenced exist verbatim, including
  `--sb-danger-hover`, `--sb-warn-surface`, `--sb-ring`).
- **Compiled the component TS with `tsc --noEmit`** in isolation: substituted the three
  codegen placeholders with dummy identifiers, pointed the `shared/learning` import at
  the real source, and ran `npx tsc --noEmit --strict --noImplicitOverride
  --noPropertyAccessFromIndexSignature --noImplicitReturns --noFallthroughCasesInSwitch
  --skipLibCheck --isolatedModules --experimentalDecorators --importHelpers --target
  ES2022 --module esnext --moduleResolution bundler --lib ES2022,DOM` against the
  substituted copy (temp file created/removed inside the template directory during the
  check, not left behind) — **zero errors**.

## Risks / things to watch

- No live app/dev-server QA was performed for this task (out of scope per the brief —
  templates contain placeholders and can't run directly); only static `tsc` typecheck
  plus manual re-read. Recommend a regenerate-and-clickthrough pass per the stage-3 QA
  criteria in the spec (`docs/superpowers/specs/2026-07-05-visualizer-pedagogy-redesign.md`)
  before considering this template fully done, same as the other stage-3 templates.
- The `.less` file introduces `.pc-level--active`/`--miss-final` and extends `.sb-btn`
  with `--primary`/`--secondary`/`--danger` variants (previously only base + `--warn`
  existed) — worth a visual check that button contrast/AA still holds, especially
  `--danger` on Reset (reused token, should be fine, but not visually verified here).
- `Object.getOwnPropertyNames(Object.prototype)` order/contents can vary very slightly
  across JS engines (though `toString`/`hasOwnProperty` are guaranteed); the own-props
  list shown for that level is therefore engine-derived, not hardcoded, by design.
