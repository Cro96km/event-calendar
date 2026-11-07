import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('フォント(画面と Discord の画像で同じ字形にする)', () => {
  it('同梱の Noto Sans JP を読み込み、body の font-family の先頭にする', () => {
    expect(read('../src/main.ts')).toContain("import '@fontsource-variable/noto-sans-jp/wght.css'");
    expect(read('../src/style.css')).toMatch(/body \{ font-family: "Noto Sans JP Variable",/);
  });
  it('フォントのバージョンは固定(^ や ~ を付けない)', () => {
    const pkg = JSON.parse(read('../package.json')) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies['@fontsource-variable/noto-sans-jp']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
