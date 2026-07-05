// src/app/sandboxes/shared/learning/stepper.spec.ts
// Запуск: npm run test:shared (ng unit-test builder: AOT-компиляция + jsdom).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Stepper } from './stepper';
import { ReplayStep } from './run-recorder';

function makeSteps(n: number, kind = 'sync'): ReplayStep[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    kind,
    label: `step ${i}`,
    detail: i === 0 ? 'why 0' : undefined,
  }));
}

describe('Stepper', () => {
  let fixture: ComponentFixture<Stepper>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Stepper);
    fixture.componentRef.setInput('steps', makeSteps(3));
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (text: string): HTMLButtonElement => {
    const btn = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(text),
    );
    if (!btn) throw new Error(`button "${text}" not found`);
    return btn;
  };
  const progress = (): string => el().querySelector('.sbs__progress')!.textContent!.trim();

  it('starts before the first step with an empty list', () => {
    expect(fixture.componentInstance.position()).toBe(-1);
    expect(progress()).toBe('0 / 3');
    expect(el().querySelectorAll('.sbs__item').length).toBe(0);
  });

  it('advances one step at a time, revealing the list progressively', () => {
    const emitted: number[] = [];
    fixture.componentInstance.positionChange.subscribe((p) => emitted.push(p));

    button('Шаг').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.position()).toBe(0);
    expect(progress()).toBe('1 / 3');
    expect(el().querySelectorAll('.sbs__item').length).toBe(1);

    button('Шаг').click();
    fixture.detectChanges();
    expect(progress()).toBe('2 / 3');
    expect(emitted).toEqual([0, 1]);

    // Текущий шаг подсвечен и помечен aria-current.
    const current = el().querySelector('.sbs__item--current')!;
    expect(current.getAttribute('aria-current')).toBe('step');
    expect(current.textContent).toContain('step 1');
  });

  it('disables «Шаг →» at the end', () => {
    for (let i = 0; i < 3; i++) button('Шаг').click();
    fixture.detectChanges();
    expect(progress()).toBe('3 / 3');
    expect(button('Шаг').disabled).toBe(true);
  });

  it('renders kind badge and optional detail', () => {
    button('Шаг').click();
    fixture.detectChanges();
    const item = el().querySelector('.sbs__item')!;
    expect(item.querySelector('.sb-step--sync')).not.toBeNull();
    expect(item.querySelector('.sbs__detail')!.textContent).toContain('why 0');
  });

  it('falls back to the base badge class for unknown kinds', () => {
    fixture.componentRef.setInput('steps', makeSteps(1, 'weird-kind'));
    fixture.detectChanges();
    button('Шаг').click();
    fixture.detectChanges();
    const badge = el().querySelector('.sb-step')!;
    expect(badge.className).toBe('sb-step');
  });

  it('«⟲ Сначала» resets position to -1', () => {
    button('Шаг').click();
    button('Шаг').click();
    fixture.detectChanges();
    button('Сначала').click();
    fixture.detectChanges();

    expect(fixture.componentInstance.position()).toBe(-1);
    expect(progress()).toBe('0 / 3');
    expect(el().querySelectorAll('.sbs__item').length).toBe(0);
  });

  it('auto mode advances on the interval and stops at the end', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    fixture.componentRef.setInput('autoDelayMs', 100);
    fixture.detectChanges();

    button('Авто').click();
    fixture.detectChanges();
    expect(button('Пауза')).toBeTruthy();

    vi.advanceTimersByTime(100);
    fixture.detectChanges();
    expect(fixture.componentInstance.position()).toBe(0);

    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    expect(fixture.componentInstance.position()).toBe(2);
    // Дошли до конца — авто остановилось, кнопка снова «▶ Авто».
    expect(button('Авто')).toBeTruthy();

    vi.advanceTimersByTime(500);
    fixture.detectChanges();
    expect(fixture.componentInstance.position()).toBe(2);
  });

  it('«⏸ Пауза» stops auto advancing', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    button('Авто').click();
    fixture.detectChanges();
    vi.advanceTimersByTime(800);
    fixture.detectChanges();
    expect(fixture.componentInstance.position()).toBe(0);

    button('Пауза').click();
    fixture.detectChanges();
    vi.advanceTimersByTime(2400);
    fixture.detectChanges();
    expect(fixture.componentInstance.position()).toBe(0);
  });

  it('resets position when the steps input changes (new run)', () => {
    button('Шаг').click();
    button('Шаг').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.position()).toBe(1);

    fixture.componentRef.setInput('steps', makeSteps(5));
    fixture.detectChanges();

    expect(fixture.componentInstance.position()).toBe(-1);
    expect(progress()).toBe('0 / 5');
    expect(el().querySelectorAll('.sbs__item').length).toBe(0);
  });

  it('clears the interval on destroy', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    button('Авто').click();
    fixture.detectChanges();
    fixture.destroy();
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
