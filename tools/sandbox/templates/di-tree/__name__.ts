import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  OnInit,
  inject,
} from '@angular/core';

// ─── Service with unique instance counter ─────────────────────────────────────

let seq = 0;

@Injectable({ providedIn: 'root' })
export class TokenService {
  readonly id = ++seq;
}

// ─── Grandchild component (no own provider — inherits branch's instance) ──────

@Component({
  selector: 'di-grandchild',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="di-node di-node--grandchild" role="region" aria-label="Grandchild node">
      <div class="di-node-header">
        <span class="di-badge di-badge--branch">компонент</span>
        <span class="di-node-title">Grandchild</span>
      </div>
      <dl class="di-facts">
        <div class="di-fact">
          <dt>inject(TokenService)</dt>
          <dd>
            <span class="di-id-badge">&#35;{{ inherited.id }}</span>
            <span class="di-note">из ближайшего инжектора Branch (#{{ inherited.id }})</span>
          </dd>
        </div>
        <div class="di-fact">
          <dt>{{ 'inject(…, { skipSelf: true })' }}</dt>
          <dd>
            <span class="di-id-badge di-id-badge--root">&#35;{{ skipped.id }}</span>
            <span class="di-note">перепрыгнул Branch → получил Root</span>
          </dd>
        </div>
      </dl>
    </div>
  `,
})
export class DiGrandchild implements OnInit {
  // Normal inject: resolves to Branch's provider (nearest ancestor)
  readonly inherited = inject(TokenService);
  // skipSelf: skips the Branch injector, climbs to Root
  readonly skipped = inject(TokenService, { skipSelf: true });

  ngOnInit(): void {
    console.info(
      `[DI Grandchild] inherited id=${this.inherited.id} (Branch), skipSelf id=${this.skipped.id} (Root)`,
    );
  }
}

// ─── Branch component — declares its own provider ────────────────────────────

@Component({
  selector: 'di-branch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TokenService],
  imports: [DiGrandchild],
  template: `
    <div class="di-node di-node--branch" role="region" aria-label="Branch node">
      <div class="di-node-header">
        <span class="di-badge di-badge--branch">providers: [TokenService]</span>
        <span class="di-node-title">Branch</span>
      </div>
      <dl class="di-facts">
        <div class="di-fact">
          <dt>inject(TokenService)</dt>
          <dd>
            <span class="di-id-badge">&#35;{{ own.id }}</span>
            <span class="di-note">собственный инжектор — новый экземпляр</span>
          </dd>
        </div>
        <div class="di-fact">
          <dt>{{ 'inject(…, { self: true })' }}</dt>
          <dd>
            <span class="di-id-badge">&#35;{{ self.id }}</span>
            <span class="di-note">@Self — только этот инжектор (то же значение)</span>
          </dd>
        </div>
        <div class="di-fact">
          <dt>{{ 'inject(…, { skipSelf: true })' }}</dt>
          <dd>
            <span class="di-id-badge di-id-badge--root">&#35;{{ parentInst.id }}</span>
            <span class="di-note">@SkipSelf — пропускает свой, берёт Root</span>
          </dd>
        </div>
      </dl>
      <div class="di-children">
        <di-grandchild />
      </div>
    </div>
  `,
})
export class DiBranch implements OnInit {
  // Own provider: fresh instance created for this component subtree
  readonly own = inject(TokenService);
  // Self: same own provider (would throw if no local provider)
  readonly self = inject(TokenService, { self: true });
  // SkipSelf: jumps over local provider → gets Root's singleton
  readonly parentInst = inject(TokenService, { skipSelf: true });

  ngOnInit(): void {
    console.info(
      `[DI Branch] own id=${this.own.id} (new instance), self id=${this.self.id}, skipSelf id=${this.parentInst.id} (Root)`,
    );
  }
}

// ─── Optional node — no provider for a hypothetical "ExtraService" ───────────

@Injectable()
export class ExtraService {
  readonly id = ++seq;
}

@Component({
  selector: 'di-optional-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="di-node di-node--optional" role="region" aria-label="Optional node">
      <div class="di-node-header">
        <span class="di-badge di-badge--optional">нет провайдера</span>
        <span class="di-node-title">Optional Demo</span>
      </div>
      <dl class="di-facts">
        <div class="di-fact">
          <dt>{{ 'inject(ExtraService, { optional: true })' }}</dt>
          <dd>
            @if (extra !== null) {
              <span class="di-id-badge">&#35;{{ extra.id }}</span>
            } @else {
              <span class="di-null-badge" aria-label="значение null">—</span>
              <span class="di-note">@Optional — провайдер не найден → null</span>
            }
          </dd>
        </div>
      </dl>
    </div>
  `,
})
export class DiOptionalNode implements OnInit {
  // No provider registered anywhere → returns null with optional: true
  readonly extra = inject(ExtraService, { optional: true });

  ngOnInit(): void {
    console.info(`[DI Optional] ExtraService = ${this.extra === null ? 'null (not provided)' : `#${this.extra.id}`}`);
  }
}

// ─── Root (parent) component ──────────────────────────────────────────────────

@Component({
  selector: '{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './{{name}}.html',
  styleUrl: './{{name}}.less',
  imports: [DiBranch, DiOptionalNode],
})
export class {{className}} implements OnInit {
  // Root singleton — providedIn: 'root'
  readonly rootInst = inject(TokenService);

  ngOnInit(): void {
    console.info(`[DI Root] TokenService root id=${this.rootInst.id} (singleton)`);
  }
}
