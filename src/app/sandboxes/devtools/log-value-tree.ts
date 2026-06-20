// src/app/sandboxes/devtools/log-value-tree.ts
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { LogValue } from './log-entry';

@Component({
  selector: 'app-log-value-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogValueTree],
  template: `
    @let v = value();
    @if (v.kind === 'array' || v.kind === 'object') {
      <button
        type="button"
        class="lvt-toggle"
        (click)="open.set(!open())"
        [attr.aria-expanded]="open()"
      >
        <span class="lvt-caret" aria-hidden="true">{{ open() ? '▾' : '▸' }}</span>
        {{ v.display }}
      </button>
      @if (open()) {
        <ul class="lvt-children" role="group">
          @if (v.kind === 'array') {
            @for (item of v.items; track $index) {
              <li class="lvt-row">
                <span class="lvt-key">{{ $index }}:</span>
                <app-log-value-tree [value]="item" />
              </li>
            }
          } @else {
            @for (entry of v.entries; track entry.key) {
              <li class="lvt-row">
                <span class="lvt-key">{{ entry.key }}:</span>
                <app-log-value-tree [value]="entry.value" />
              </li>
            }
          }
          @if (v.truncated) {
            <li class="lvt-row lvt-more">…(truncated)</li>
          }
        </ul>
      }
    } @else {
      <span class="lvt-leaf" [class]="'lvt-leaf--' + v.kind">{{ v.display }}</span>
    }
  `,
  styles: `
    :host {
      display: inline;
      font-family: var(--sb-font-mono);
      font-size: 0.8125rem;
    }
    .lvt-toggle {
      border: none;
      background: none;
      padding: 0;
      font: inherit;
      color: var(--sb-text);
      cursor: pointer;
    }
    .lvt-toggle:focus-visible {
      outline: none;
      box-shadow: var(--sb-ring);
      border-radius: 2px;
    }
    .lvt-caret {
      display: inline-block;
      width: 1em;
      color: var(--sb-text-muted);
    }
    .lvt-children {
      list-style: none;
      margin: 0;
      padding-left: 1.1em;
    }
    .lvt-key {
      color: var(--sb-text-muted);
      margin-right: 0.4em;
    }
    .lvt-leaf--string {
      color: var(--sb-success);
    }
    .lvt-leaf--error {
      color: var(--sb-danger);
    }
    .lvt-more {
      color: var(--sb-text-muted);
    }
  `,
})
export class LogValueTree {
  readonly value = input.required<LogValue>();
  protected readonly open = signal(false);
}
