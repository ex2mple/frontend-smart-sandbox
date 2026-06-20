// src/app/sandboxes/shell/sandbox-shell.ts
import { ChangeDetectionStrategy, Component, isDevMode } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SandboxConsole } from '../devtools/sandbox-console';

/**
 * Chrome wrapping every `/s/*` sandbox route. Provides a persistent
 * "back to dashboard" affordance so a sandbox is never a dead end, a
 * full-height content area so a sandbox's `min-height: 100%` fills the
 * viewport below the bar, and (in dev) the in-app log console.
 */
@Component({
  selector: 'app-sandbox-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet, SandboxConsole],
  template: `
    <nav class="sb-shell-bar" aria-label="Sandbox navigation">
      <a class="sb-shell-bar__back" routerLink="/">
        <span class="sb-shell-bar__back-icon" aria-hidden="true">←</span>
        Dashboard
      </a>
    </nav>
    <div class="sb-shell-content">
      <router-outlet />
    </div>
    @if (isDev) {
      <app-sandbox-console />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .sb-shell-bar {
      display: flex;
      align-items: center;
      padding: var(--sb-space-1) var(--sb-space-3);
      border-bottom: 1px solid var(--sb-border);
      background: var(--sb-surface);
    }

    .sb-shell-bar__back {
      display: inline-flex;
      align-items: center;
      gap: var(--sb-space-1);
      padding: var(--sb-space-1) var(--sb-space-2);
      border-radius: var(--sb-radius-sm);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--sb-text);
      text-decoration: none;
    }

    .sb-shell-bar__back:hover {
      background: var(--sb-surface-2);
      color: var(--sb-accent);
    }

    .sb-shell-bar__back:focus-visible {
      outline: none;
      box-shadow: var(--sb-ring);
    }

    .sb-shell-bar__back-icon {
      font-size: 1.05em;
      line-height: 1;
    }

    /* Grows to fill the viewport below the bar so sandboxes can size to 100%. */
    .sb-shell-content {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `,
})
export class SandboxShell {
  protected readonly isDev = isDevMode();
}
