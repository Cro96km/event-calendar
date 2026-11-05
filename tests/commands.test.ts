import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMANDS, formatCommands } from '../src/commands';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };

describe('npm run help(コマンドの一覧と説明)', () => {
  it('package.json の scripts と COMMANDS が一致する(新しいコマンドは説明を書かないとテストが落ちる)', () => {
    expect(COMMANDS.map((c) => c.name).sort()).toEqual(Object.keys(pkg.scripts).sort());
  });

  it('すべてのコマンドに1行の説明がある。一覧に全コマンドが載る', () => {
    const out = formatCommands();
    for (const c of COMMANDS) {
      expect(c.summary.length, c.name).toBeGreaterThan(5);
      expect(out, c.name).toContain(c.name);
    }
    expect(out).toContain('-- --help');
  });

  it('CLI(scripts/*.ts)を持つコマンドは --help の説明を持つ(目的・使う場面・入力・出力・副作用)', () => {
    for (const c of COMMANDS.filter((x) => x.cli)) {
      const src = readFileSync(new URL(`../${c.cli}`, import.meta.url), 'utf8');
      expect(src, `${c.name}: ${c.cli}`).toMatch(/showHelpIfRequested\(|--help/);
      for (const word of ['目的', '入力', '出力', '副作用']) expect(src, `${c.cli} の説明に「${word}」`).toContain(word);
    }
  });

  it('package.json のコマンド実体(scripts/*.ts)が COMMANDS の cli と対応する', () => {
    for (const c of COMMANDS.filter((x) => x.cli)) expect(pkg.scripts[c.name], c.name).toContain(c.cli as string);
  });
});
