// src/app/sandboxes/shared/learning/experiment-card.spec.ts
// Запуск: npm run test:shared (ng unit-test builder: AOT-компиляция + jsdom).
import { describe, it, expect, beforeEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ExperimentCard } from './experiment-card';

describe('ExperimentCard', () => {
  let fixture: ComponentFixture<ExperimentCard>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ExperimentCard);
    fixture.componentRef.setInput('question', 'Что выведется первым?');
    fixture.componentRef.setInput('options', ['sync', 'microtask', 'macrotask']);
    fixture.componentRef.setInput('explanation', 'Синхронный код выполняется до очередей.');
    fixture.detectChanges();
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const chips = (): HTMLButtonElement[] => Array.from(el().querySelectorAll('.sbx__chip'));
  const text = (selector: string): string | null =>
    el().querySelector(selector)?.textContent?.trim() ?? null;

  it('renders question and option chips', () => {
    expect(el().textContent).toContain('Что выведется первым?');
    expect(chips().map((c) => c.textContent!.trim())).toEqual(['sync', 'microtask', 'macrotask']);
    expect(text('.sbx__verdict')).toBeNull();
    expect(text('.sbx__actual')).toBeNull();
  });

  it('emits predicted and marks the chip on pick', () => {
    const emitted: number[] = [];
    fixture.componentInstance.predicted.subscribe((i) => emitted.push(i));

    chips()[1].click();
    fixture.detectChanges();

    expect(emitted).toEqual([1]);
    expect(chips()[1].getAttribute('aria-pressed')).toBe('true');
    expect(chips()[1].classList.contains('sbx__chip--chosen')).toBe(true);
  });

  it('allows changing the choice before reveal', () => {
    const emitted: number[] = [];
    fixture.componentInstance.predicted.subscribe((i) => emitted.push(i));

    chips()[0].click();
    fixture.detectChanges();
    chips()[2].click();
    fixture.detectChanges();

    expect(emitted).toEqual([0, 2]);
    expect(chips()[0].getAttribute('aria-pressed')).toBe('false');
    expect(chips()[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('shows «Верно ✓» when prediction matches the actual result', () => {
    chips()[0].click();
    fixture.detectChanges();
    fixture.componentRef.setInput('actualIndex', 0);
    fixture.detectChanges();

    expect(text('.sbx__verdict')).toBe('Верно ✓');
    expect(el().querySelector('.sbx__verdict--ok')).not.toBeNull();
    expect(text('.sbx__actual')).toBe('Правильный ответ: sync');
    expect(text('.sbx__explanation')).toBe('Синхронный код выполняется до очередей.');
  });

  it('shows «Не угадал ✗» when prediction is wrong', () => {
    chips()[2].click();
    fixture.detectChanges();
    fixture.componentRef.setInput('actualIndex', 0);
    fixture.detectChanges();

    expect(text('.sbx__verdict')).toBe('Не угадал ✗');
    expect(el().querySelector('.sbx__verdict--fail')).not.toBeNull();
    expect(text('.sbx__actual')).toBe('Правильный ответ: sync');
  });

  it('shows the actual answer without a verdict when the user did not predict', () => {
    fixture.componentRef.setInput('actualIndex', 1);
    fixture.detectChanges();

    expect(text('.sbx__verdict')).toBeNull();
    expect(text('.sbx__actual')).toBe('Правильный ответ: microtask');
    expect(text('.sbx__explanation')).toBe('Синхронный код выполняется до очередей.');
  });

  it('blocks interaction after reveal', () => {
    const emitted: number[] = [];
    fixture.componentInstance.predicted.subscribe((i) => emitted.push(i));

    chips()[0].click();
    fixture.detectChanges();
    fixture.componentRef.setInput('actualIndex', 1);
    fixture.detectChanges();

    expect(chips().every((c) => c.disabled)).toBe(true);
    chips()[2].click();
    fixture.detectChanges();

    expect(emitted).toEqual([0]);
    expect(chips()[0].getAttribute('aria-pressed')).toBe('true');
    // Реальный вариант подсвечен.
    expect(chips()[1].classList.contains('sbx__chip--actual')).toBe(true);
  });

  it('reset() clears the choice for a re-run', () => {
    chips()[0].click();
    fixture.detectChanges();
    fixture.componentRef.setInput('actualIndex', 0);
    fixture.detectChanges();

    fixture.componentRef.setInput('actualIndex', null);
    fixture.componentInstance.reset();
    fixture.detectChanges();

    expect(chips().every((c) => !c.disabled)).toBe(true);
    expect(chips().every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(text('.sbx__verdict')).toBeNull();
    expect(text('.sbx__actual')).toBeNull();
  });

  it('hides the explanation paragraph when explanation is empty', () => {
    fixture.componentRef.setInput('explanation', '');
    fixture.componentRef.setInput('actualIndex', 0);
    fixture.detectChanges();

    expect(text('.sbx__actual')).toBe('Правильный ответ: sync');
    expect(el().querySelector('.sbx__explanation')).toBeNull();
  });
});
