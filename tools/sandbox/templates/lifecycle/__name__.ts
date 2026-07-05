import {
  AfterContentChecked,
  AfterContentInit,
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  Injectable,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

// ─── Shared bus ───────────────────────────────────────────────────────────────

export type HookCategory = 'init-change' | 'content' | 'view' | 'destroy';

export interface LogEvent {
  seq: number;
  hook: string;
  detail: string;
  category: HookCategory;
}

// Хуки, которые срабатывают на КАЖДОМ проходе change detection.
// Пачка событий, состоящая только из них, — «settle-проход»: проход,
// спровоцированный записью самого тайм-лайна в signal, а не действием юзера.
const CHECK_HOOKS = new Set(['ngDoCheck', 'ngAfterContentChecked', 'ngAfterViewChecked']);
const MAX_SETTLE_PASSES = 2;

@Injectable({ providedIn: 'root' })
export class LifecycleBus {
  private readonly _events = signal<LogEvent[]>([]);
  private _seq = 0;
  private _buffer: Omit<LogEvent, 'seq'>[] = [];
  private _flushScheduled = false;
  private _settlePasses = 0;

  readonly events = this._events.asReadonly();

  /**
   * Хуки зовут add() синхронно ПРЯМО ВО ВРЕМЯ change detection.
   * Приложение zoneless: запись в signal здесь пометила бы родителя грязным
   * и запланировала новый CD-проход, чьи check-хуки снова вызвали бы add() —
   * бесконечный цикл. Поэтому события копятся в обычном массиве и
   * сбрасываются в signal один раз, в микротаске после окончания прохода.
   */
  add(hook: string, detail: string, category: HookCategory): void {
    this._buffer.push({ hook, detail, category });
    if (this._flushScheduled) return;
    this._flushScheduled = true;
    queueMicrotask(() => {
      this._flushScheduled = false;
      this.flush();
    });
  }

  clear(): void {
    this._buffer = [];
    this._events.set([]);
    this._seq = 0;
    // Сама очистка вызовет CD-проход с check-хуками — не показываем их
    // в пустом тайм-лайне (лимит settle-проходов уже исчерпан).
    this._settlePasses = MAX_SETTLE_PASSES;
    console.info('[lifecycle] timeline cleared');
  }

  private flush(): void {
    const batch = this._buffer;
    this._buffer = [];
    if (batch.length === 0) return;

    // Сброс в signal сам вызывает ещё один CD-проход, а значит — ещё одну
    // пачку check-хуков. Пару таких settle-проходов показываем (они настоящие),
    // дальше отбрасываем, чтобы тайм-лайн оставался конечным: без записи в
    // signal нового прохода не будет, и цикл затухает.
    const settleOnly = batch.every((e) => CHECK_HOOKS.has(e.hook));
    if (settleOnly) {
      if (this._settlePasses >= MAX_SETTLE_PASSES) return;
      this._settlePasses++;
    } else {
      this._settlePasses = 0;
    }

    const entries: LogEvent[] = batch.map((e) => ({ ...e, seq: ++this._seq }));
    for (const e of entries) {
      console.log(`[lifecycle #${e.seq}] ${e.hook}${e.detail ? ' — ' + e.detail : ''}`);
    }
    this._events.update((list) => [...list, ...entries]);
  }
}

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<HookCategory, string> = {
  'init-change': 'Init / Change',
  content: 'Content',
  view: 'View',
  destroy: 'Destroy',
};

// ─── Child component ──────────────────────────────────────────────────────────

@Component({
  selector: 'lc-child',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lc-child" role="region" aria-label="Child component">
      <span class="lc-child-label">Child component</span>
      <span class="lc-child-value" aria-live="polite">
        inputValue = <strong>{{ inputValue() }}</strong>
      </span>
    </div>
  `,
})
export class LifecycleChild
  implements
    OnChanges,
    OnInit,
    DoCheck,
    AfterContentInit,
    AfterContentChecked,
    AfterViewInit,
    AfterViewChecked,
    OnDestroy
{
  readonly inputValue = input<number>(0);

  private readonly bus = inject(LifecycleBus);

  ngOnChanges(changes: SimpleChanges): void {
    const changed = Object.keys(changes)
      .map((k) => `${k}: ${changes[k].previousValue} → ${changes[k].currentValue}`)
      .join(', ');
    this.bus.add('ngOnChanges', changed, 'init-change');
  }

  ngOnInit(): void {
    this.bus.add('ngOnInit', '', 'init-change');
  }

  ngDoCheck(): void {
    this.bus.add('ngDoCheck', '', 'init-change');
  }

  ngAfterContentInit(): void {
    this.bus.add('ngAfterContentInit', '', 'content');
  }

  ngAfterContentChecked(): void {
    this.bus.add('ngAfterContentChecked', '', 'content');
  }

  ngAfterViewInit(): void {
    this.bus.add('ngAfterViewInit', '', 'view');
  }

  ngAfterViewChecked(): void {
    this.bus.add('ngAfterViewChecked', '', 'view');
  }

  ngOnDestroy(): void {
    this.bus.add('ngOnDestroy', '', 'destroy');
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [LifecycleChild],
})
export class {{className}} {
  private readonly bus = inject(LifecycleBus);

  protected readonly events = this.bus.events;
  protected readonly childMounted = signal(false);
  protected readonly childInput = signal(0);

  protected readonly groupedCount = computed(() => {
    const cats: Record<HookCategory, number> = {
      'init-change': 0,
      content: 0,
      view: 0,
      destroy: 0,
    };
    for (const e of this.events()) cats[e.category]++;
    return cats;
  });

  protected readonly categoryLabel = CATEGORY_LABEL;

  protected toggleChild(): void {
    this.childMounted.update((v) => !v);
  }

  protected incrementInput(): void {
    this.childInput.update((n) => n + 1);
  }

  protected clearTimeline(): void {
    this.bus.clear();
  }
}
