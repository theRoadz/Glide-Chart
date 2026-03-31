import { describe, it, expect } from 'vitest';
import WidgetDefault from './widget';
import { GlideChart } from '../api/glide-chart';

describe('widget entry point', () => {
  // Task 4.1: Default export tests
  it('exports GlideChart as default export', () => {
    expect(WidgetDefault).toBeDefined();
  });

  it('default export is the same class as GlideChart from api', () => {
    expect(WidgetDefault).toBe(GlideChart);
  });

  it('default export is a function (constructor)', () => {
    expect(typeof WidgetDefault).toBe('function');
  });

  // Task 4.2: Namespace pollution test
  it('has no side effects — does not add GlideChart to window on import', () => {
    // widget.ts should NOT manually assign to window — esbuild handles that
    // at bundle time via globalName. At module level, window should be untouched.
    expect((window as unknown as Record<string, unknown>)['GlideChart']).toBeUndefined();
  });

  // Task 4.3: Module boundary enforcement test
  it('only imports from api/ module (import DAG discipline)', async () => {
    // Use Vite's ?raw suffix to import widget.ts source as a string
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error -- ?raw import is a Vite/Vitest feature not typed in tsconfig
    const widgetSource: { default: string } = await import('./widget.ts?raw');
    const source = widgetSource.default;

    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) {
      imports.push(match[1]!);
    }

    expect(imports.length).toBeGreaterThan(0);

    for (const importPath of imports) {
      expect(importPath).toMatch(/^\.\.\/api\//);
    }

    // Explicitly verify no forbidden module imports
    const forbidden = ['../core/', '../config/', '../renderer/', '../interaction/', '../streaming/'];
    for (const importPath of imports) {
      for (const prefix of forbidden) {
        expect(importPath.startsWith(prefix)).toBe(false);
      }
    }
  });
});
