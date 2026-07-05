// src/app/sandboxes/shared/learning/run-recorder.spec.ts
import { describe, it, expect } from 'vitest';
import { RunRecorder } from './run-recorder';

const flush = () => Promise.resolve();

describe('RunRecorder', () => {
  it('starts empty', () => {
    const r = new RunRecorder();
    expect(r.steps()).toEqual([]);
    expect(r.isEmpty()).toBe(true);
  });

  it('buffers records and flushes once per microtask', async () => {
    const r = new RunRecorder();
    r.record({ kind: 'sync', label: 'sync 1' });
    r.record({ kind: 'sync', label: 'sync 2' });
    r.record({ kind: 'microtask', label: 'then 1' });

    // Синхронно ничего не видно — всё в буфере.
    expect(r.steps()).toEqual([]);
    expect(r.isEmpty()).toBe(true);

    await flush();

    expect(r.steps().length).toBe(3);
    expect(r.isEmpty()).toBe(false);
    expect(r.steps().map((s) => s.label)).toEqual(['sync 1', 'sync 2', 'then 1']);
  });

  it('assigns monotonic indices from 0 across flushes', async () => {
    const r = new RunRecorder();
    r.record({ kind: 'sync', label: 'a' });
    r.record({ kind: 'sync', label: 'b' });
    await flush();
    r.record({ kind: 'macrotask', label: 'c' });
    await flush();

    expect(r.steps().map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('flushes to the signal exactly once per microtask batch', async () => {
    const r = new RunRecorder();
    const seen: number[] = [];
    // Считаем смены identity массива через опрос после каждого микротаска.
    r.record({ kind: 'sync', label: 'a' });
    r.record({ kind: 'sync', label: 'b' });
    const before = r.steps();
    await flush();
    const after = r.steps();
    seen.push(before.length, after.length);

    expect(seen).toEqual([0, 2]);
    // Ещё один микротаск без новых record — identity не меняется.
    await flush();
    expect(r.steps()).toBe(after);
  });

  it('exposes immutable snapshots: previous array is not mutated by later flushes', async () => {
    const r = new RunRecorder<{ queue: string[] }>();
    r.record({ kind: 'sync', label: 'a', state: { queue: ['a'] } });
    await flush();
    const first = r.steps();

    r.record({ kind: 'microtask', label: 'b', detail: 'из then', state: { queue: [] } });
    await flush();
    const second = r.steps();

    expect(second).not.toBe(first);
    expect(first.length).toBe(1);
    expect(second.length).toBe(2);
    expect(second[1]).toMatchObject({ index: 1, kind: 'microtask', detail: 'из then' });
  });

  it('clear() empties steps, buffer and resets numbering', async () => {
    const r = new RunRecorder();
    r.record({ kind: 'sync', label: 'a' });
    await flush();
    r.record({ kind: 'sync', label: 'still buffered' });
    r.clear();
    await flush();

    expect(r.steps()).toEqual([]);
    expect(r.isEmpty()).toBe(true);

    r.record({ kind: 'sync', label: 'new run' });
    await flush();
    expect(r.steps().map((s) => s.index)).toEqual([0]);
  });
});
