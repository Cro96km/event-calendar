import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ワークフローの静的なガード。YAMLパーサは使わず、テキストで不変条件を確認する。
const DIR = new URL('../.github/workflows/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.yml'));
const text = (f: string): string => readFileSync(new URL(f, DIR), 'utf8');

describe('GitHub Actions ワークフローの不変条件', () => {
  it('ワークフローが存在する(update / deploy / apply / manual / prune / ci)', () => {
    expect(files).toEqual(expect.arrayContaining(['update.yml', 'deploy.yml', 'apply.yml', 'manual.yml', 'prune.yml', 'ci.yml']));
  });

  it.each(files)('%s: 使うアクションはすべてコミットSHAで固定(サプライチェーン対策)', (f) => {
    const uses = [...text(f).matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1] as string);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, `${f}: ${u}`).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it.each(files)('%s: permissions を明示する(既定の広い権限に頼らない)', (f) => {
    expect(text(f)).toMatch(/^permissions:/m);
  });

  it.each(files)('%s: Issue・コメント・PRのタイトル本文などの信頼できない入力を run の中に直接展開しない(環境変数経由にする)', (f) => {
    const untrusted = /\$\{\{\s*github\.event\.(issue\.(title|body)|comment\.body|pull_request\.(title|body|head\.ref)|head_commit\.message)\s*\}\}/;
    // run: ブロックの本文だけを見る(env: に書くのは安全)
    const runs = text(f).split(/\n(?=\s*-?\s*(?:name|run|id|uses|env|if|with):)/).filter((blk) => /^\s*-?\s*run:/.test(blk));
    for (const blk of runs) expect(blk, `${f}`).not.toMatch(untrusted);
  });

  it('apply.yml: `/apply` は所有者・メンバー・共同作業者のコメントだけ、要対応Issueだけ、PRへのコメントは除く', () => {
    const t = text('apply.yml');
    expect(t).toContain("github.event.comment.body == '/apply'");
    expect(t).toMatch(/OWNER.*MEMBER.*COLLABORATOR/);
    expect(t).toContain("startsWith(github.event.issue.title, '要対応')");
    expect(t).toContain('github.event.issue.pull_request == null');
  });

  it('manual.yml: 手動実行だけ(自動では動かない)。入力は環境変数経由で npm run manual に渡し、manual.json だけをコミットして、検証が通れば自動マージ→deploy', () => {
    const t = text('manual.yml');
    expect(t).toMatch(/on:\n\s+workflow_dispatch:/);
    expect(t).not.toMatch(/^\s+(push|pull_request|schedule|issue_comment|issues):/m);
    expect(t).toContain('npm run manual --');
    // build:public は表示用データ(public/data)が要るので、検証の前に作り直す
    expect(t.indexOf('npm run update -- --no-collect')).toBeGreaterThan(t.indexOf('npm run manual --'));
    expect(t.indexOf('npm run update -- --no-collect')).toBeLessThan(t.indexOf('npm run build:public'));
    expect(t).toContain('git add config/schedule/manual.json');
    expect(t).toContain('npm run check');
    expect(t).toContain('gh workflow run deploy.yml');
    // 入力(github.event.inputs.*)は env: にだけ書く。run: に直接展開しない
    const runs = t.split(/\n(?=\s*-?\s*(?:name|run|id|uses|env|if|with):)/).filter((blk) => /^\s*-?\s*run:/.test(blk));
    for (const blk of runs) expect(blk).not.toMatch(/\$\{\{\s*github\.event\.inputs\./);
  });

  it('prune.yml: 手動実行だけ。既定は確認だけ(削除しない)で、apply=true のときだけ削除→検証→自動マージ→deploy。入力は env 経由', () => {
    const t = text('prune.yml');
    expect(t).toMatch(/on:\n\s+workflow_dispatch:/);
    expect(t).not.toMatch(/^\s+(push|pull_request|schedule|issue_comment|issues):/m);
    expect(t).toMatch(/apply:[\s\S]*?default: false/);
    expect(t).toContain('npm run --silent prune --');
    // 削除・検証・PRの各工程は apply=true のときだけ
    for (const step of ['Regenerate data', 'Verify', 'PR and merge']) expect(t, step).toMatch(new RegExp(`name: ${step}\\n\\s+if: github.event.inputs.apply == 'true'`));
    expect(t).toContain('gh workflow run deploy.yml');
    const runs = t.split(/\n(?=\s*-?\s*(?:name|run|id|uses|env|if|with):)/).filter((blk) => /^\s*-?\s*run:/.test(blk));
    for (const blk of runs) expect(blk).not.toMatch(/\$\{\{\s*github\.event\.inputs\./);
  });

  it('update.yml: 毎週金曜0:00 JST(木曜15:00 UTC)と手動実行、手動入力(collect/pages/since)。収集はnpm run update 経由', () => {
    const t = text('update.yml');
    expect(t).toContain("cron: '0 15 * * 4'");
    expect(t).toMatch(/workflow_dispatch:/);
    for (const k of ['collect:', 'pages:', 'since:']) expect(t).toContain(k);
    expect(t).toContain('npm run update --');
    expect(t).toContain('npm run check -- --summary update-report.json');
  });

  it('update.yml / apply.yml: GITHUB_TOKEN のマージは push を起こさないので、deploy.yml を明示的に起動する', () => {
    expect(text('update.yml')).toContain('gh workflow run deploy.yml');
    expect(text('apply.yml')).toContain('gh workflow run deploy.yml');
  });

  it('deploy.yml: main の push(データ・設定・コード)と手動実行。収集せず(--no-collect)ビルドして Pages へ', () => {
    const t = text('deploy.yml');
    expect(t).toMatch(/branches:\s*\[main\]/);
    expect(t).toContain("'data/articles/**'");
    expect(t).toContain("'config/**'");
    expect(t).toContain('npm run update -- --no-collect');
    expect(t).toContain('npm run build:public');
    expect(t).toContain('actions/deploy-pages@');
  });
});
