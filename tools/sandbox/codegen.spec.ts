import { describe, it, expect } from 'vitest';
import { isValidName, kebabToClassName, selectorFor, renderTemplate, buildRoutesFile, NAME_RE } from './codegen.mjs';

describe('NAME_RE', () => {
  it('matches valid kebab names', () => {
    expect(NAME_RE.test('my-test')).toBe(true);
    expect(NAME_RE.test('abc')).toBe(true);
    expect(NAME_RE.test('a1')).toBe(true);
    expect(NAME_RE.test('event-loop')).toBe(true);
  });

  it('does not match names starting with digit or uppercase or space', () => {
    expect(NAME_RE.test('3d')).toBe(false);
    expect(NAME_RE.test('My-Test')).toBe(false);
    expect(NAME_RE.test('a b')).toBe(false);
    expect(NAME_RE.test('')).toBe(false);
    expect(NAME_RE.test('-x')).toBe(false);
  });
});

describe('isValidName', () => {
  it('returns true for valid names', () => {
    expect(isValidName('my-test')).toBe(true);
    expect(isValidName('event-loop')).toBe(true);
    expect(isValidName('abc')).toBe(true);
    expect(isValidName('a1')).toBe(true);
  });

  it('returns false for invalid names', () => {
    expect(isValidName('3d')).toBe(false);
    expect(isValidName('My-Test')).toBe(false);
    expect(isValidName('a b')).toBe(false);
    expect(isValidName('')).toBe(false);
    expect(isValidName('-x')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(isValidName(null)).toBe(false);
    expect(isValidName(undefined)).toBe(false);
    expect(isValidName(42)).toBe(false);
    expect(isValidName({})).toBe(false);
  });
});

describe('kebabToClassName', () => {
  it("converts 'my-test' to 'MyTest'", () => {
    expect(kebabToClassName('my-test')).toBe('MyTest');
  });

  it("converts 'event-loop' to 'EventLoop'", () => {
    expect(kebabToClassName('event-loop')).toBe('EventLoop');
  });

  it("converts '3d-demo' to 'Sandbox3dDemo'", () => {
    expect(kebabToClassName('3d-demo')).toBe('Sandbox3dDemo');
  });

  it("converts single segment 'x' to 'X'", () => {
    expect(kebabToClassName('x')).toBe('X');
  });

  it('handles multiple segments', () => {
    expect(kebabToClassName('foo-bar-baz')).toBe('FooBarBaz');
  });
});

describe('selectorFor', () => {
  it("prepends 'sb-' to the name", () => {
    expect(selectorFor('my-test')).toBe('sb-my-test');
    expect(selectorFor('event-loop')).toBe('sb-event-loop');
    expect(selectorFor('x')).toBe('sb-x');
  });
});

describe('renderTemplate', () => {
  it('replaces known keys', () => {
    const result = renderTemplate('class {{className}} {}', { className: 'MyTest' });
    expect(result).toBe('class MyTest {}');
  });

  it('leaves unknown keys as-is', () => {
    const result = renderTemplate('{{ count() }}', { className: 'MyTest' });
    expect(result).toBe('{{ count() }}');
  });

  it('replaces multiple occurrences of the same key', () => {
    const result = renderTemplate('{{name}} and {{name}}', { name: 'foo' });
    expect(result).toBe('foo and foo');
  });

  it('replaces multiple different keys in one pass', () => {
    const result = renderTemplate('{{name}} {{className}} {{selector}}', {
      name: 'my-test',
      className: 'MyTest',
      selector: 'sb-my-test',
    });
    expect(result).toBe('my-test MyTest sb-my-test');
  });

  it('leaves Angular interpolations like {{ count() }} intact', () => {
    const template = '<p>{{ count() }}</p><h1>{{title}}</h1>';
    const result = renderTemplate(template, { title: 'My Title' });
    expect(result).toBe('<p>{{ count() }}</p><h1>My Title</h1>');
  });

  it('leaves {{ doubled() }} intact', () => {
    const template = 'count is {{ count() }}, doubled is {{ doubled() }}, title: {{title}}';
    const result = renderTemplate(template, { title: 'Demo' });
    expect(result).toBe('count is {{ count() }}, doubled is {{ doubled() }}, title: Demo');
  });
});

describe('buildRoutesFile', () => {
  it('produces exact empty routes file for empty array', () => {
    const result = buildRoutesFile([]);
    expect(result).toBe(
      `import { Routes } from '@angular/router';\n\nexport const generatedSandboxRoutes: Routes = [];\n`,
    );
  });

  it('produces correct line for a generated entry', () => {
    const result = buildRoutesFile([{ name: 'my-test', kind: 'generated' }]);
    expect(result).toBe(
      `import { Routes } from '@angular/router';\n\nexport const generatedSandboxRoutes: Routes = [\n` +
        `  { path: 's/my-test', loadChildren: () => import('./generated/my-test/my-test.routes').then((m) => m.routes) },\n` +
        `];\n`,
    );
  });

  it('uses saved directory for kind=saved', () => {
    const result = buildRoutesFile([{ name: 'event-loop', kind: 'saved' }]);
    expect(result).toContain(`import('./saved/event-loop/event-loop.routes')`);
    expect(result).toContain(`m.routes`);
  });

  it('emits loadChildren with <name>.routes for a saved sandbox', () => {
    const result = buildRoutesFile([{ name: 'foo', kind: 'saved' }]);
    expect(result).toBe(
      `import { Routes } from '@angular/router';\n\nexport const generatedSandboxRoutes: Routes = [\n` +
        `  { path: 's/foo', loadChildren: () => import('./saved/foo/foo.routes').then((m) => m.routes) },\n` +
        `];\n`,
    );
  });

  it('uses loadChildren resolving m.routes (not a class name) for any entry', () => {
    const result = buildRoutesFile([{ name: 'foo-bar', kind: 'generated' }]);
    expect(result).toContain(`loadChildren`);
    expect(result).toContain(`foo-bar.routes`);
    expect(result).toContain(`m.routes`);
    expect(result).not.toContain(`loadComponent`);
  });

  it('produces correct output for two entries', () => {
    const result = buildRoutesFile([
      { name: 'my-test', kind: 'generated' },
      { name: 'event-loop', kind: 'saved' },
    ]);
    expect(result).toBe(
      `import { Routes } from '@angular/router';\n\nexport const generatedSandboxRoutes: Routes = [\n` +
        `  { path: 's/my-test', loadChildren: () => import('./generated/my-test/my-test.routes').then((m) => m.routes) },\n` +
        `  { path: 's/event-loop', loadChildren: () => import('./saved/event-loop/event-loop.routes').then((m) => m.routes) },\n` +
        `];\n`,
    );
  });

  it('ends with a trailing newline', () => {
    const result = buildRoutesFile([{ name: 'x', kind: 'generated' }]);
    expect(result.endsWith('\n')).toBe(true);
  });
});
