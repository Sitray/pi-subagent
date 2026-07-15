import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

describe('package boundary', () => {
  it('declares the public Pi extension entry point', () => {
    let manifest: unknown;

    try {
      manifest = JSON.parse(
        readFileSync(resolve(root, 'package.json'), 'utf8'),
      );
    } catch (error) {
      expect.fail(`package.json must be readable valid JSON: ${String(error)}`);
    }
    expect(manifest).toEqual(
      expect.objectContaining({
        main: './src/index.ts',
        pi: { extensions: ['./src/index.ts'] },
      }),
    );
  });

  it('keeps source independent from private upstream and unpublished globals', () => {
    const files = [
      'src/index.ts',
      'src/config.ts',
      'src/adapters/pi-session.ts',
      'src/domain/model.ts',
    ];
    const source = files
      .map((file) => readFileSync(resolve(root, file), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(
      /pi-subagents-j0k3r|\/src\/|globalThis|Symbol\.for/,
    );
  });

  it('exports a registration-only extension without redefining commands', async () => {
    const extension = (await import('../src/index.js')).default;
    const registrations: string[] = [];
    extension({
      registerCommand: (name: string) => registrations.push(name),
    } as never);
    expect(registrations).toEqual([]);
    expect(() => extension({} as never)).not.toThrow();
  });
});
