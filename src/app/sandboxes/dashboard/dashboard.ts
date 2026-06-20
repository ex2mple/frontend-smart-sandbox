import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  SandboxApiService,
  SandboxInfo,
  TemplateInfo,
  CreateResult,
} from '../sandbox-api';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.less',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
})
export class Dashboard implements OnInit {
  protected readonly api = inject(SandboxApiService);
  protected readonly fb = inject(FormBuilder);

  protected readonly sandboxes = signal<SandboxInfo[]>([]);
  protected readonly templates = signal<TemplateInfo[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly lastCreated = signal<CreateResult | null>(null);

  /** Inline confirm state: name of sandbox awaiting delete confirmation. */
  protected readonly pendingDelete = signal<string | null>(null);

  protected readonly generated = computed(() =>
    this.sandboxes().filter((s) => s.kind === 'generated'),
  );
  protected readonly saved = computed(() =>
    this.sandboxes().filter((s) => s.kind === 'saved'),
  );

  protected readonly form = this.fb.group({
    name: [
      '',
      [Validators.required, Validators.pattern(/^[a-z][a-z0-9-]*$/)],
    ],
    title: ['', Validators.required],
    template: ['', Validators.required],
  });

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.error.set(null);

    this.api.list().subscribe({
      next: (list) => this.sandboxes.set(list),
      error: (err: unknown) => this.setError(err),
    });

    this.api.templates().subscribe({
      next: (tpls) => {
        this.templates.set(tpls);
        // Pre-select first template if nothing selected yet
        if (tpls.length > 0 && !this.form.controls.template.value) {
          this.form.controls.template.setValue(tpls[0].id);
        }
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.setError(err);
        this.loading.set(false);
      },
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.error.set(null);

    const { name, title, template } = this.form.value as {
      name: string;
      title: string;
      template: string;
    };

    this.api.create({ name, title, template }).subscribe({
      next: (result) => {
        this.lastCreated.set(result);
        this.form.controls.name.reset('');
        this.refresh();
      },
      error: (err: unknown) => this.setError(err),
    });
  }

  protected requestDelete(name: string): void {
    this.pendingDelete.set(name);
  }

  protected cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  protected confirmDelete(name: string): void {
    this.pendingDelete.set(null);
    this.api.remove(name).subscribe({
      next: () => {
        if (this.lastCreated()?.name === name) {
          this.lastCreated.set(null);
        }
        this.refresh();
      },
      error: (err: unknown) => this.setError(err),
    });
  }

  protected pin(name: string): void {
    this.api.pin(name).subscribe({
      next: () => this.refresh(),
      error: (err: unknown) => this.setError(err),
    });
  }

  protected unpin(name: string): void {
    this.api.unpin(name).subscribe({
      next: () => this.refresh(),
      error: (err: unknown) => this.setError(err),
    });
  }

  protected wipe(): void {
    this.api.wipe().subscribe({
      next: () => {
        if (
          this.lastCreated() &&
          this.generated().some((s) => s.name === this.lastCreated()!.name)
        ) {
          this.lastCreated.set(null);
        }
        this.refresh();
      },
      error: (err: unknown) => this.setError(err),
    });
  }

  private setError(err: unknown): void {
    if (err instanceof HttpErrorResponse) {
      const serverMsg =
        typeof err.error === 'object' && err.error !== null
          ? (err.error as { error?: string }).error
          : undefined;
      this.error.set(serverMsg ?? `HTTP ${err.status}: ${err.statusText}`);
    } else {
      this.error.set('An unexpected error occurred.');
    }
  }
}
