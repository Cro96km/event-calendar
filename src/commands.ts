// npm のコマンド一覧(説明つき)。`npm run help` が表示する。package.json の scripts と一致することはテストで保証する。
export interface CommandInfo {
  name: string;
  /** 1行の説明 */
  summary: string;
  group: '日常の運用' | '保守・調査' | '開発';
  /** --help を持つCLI(scripts/*.ts)。npm の標準コマンド(dev・build 等)は null */
  cli: string | null;
}

export const COMMANDS: readonly CommandInfo[] = [
  { name: 'update', summary: '収集→判定の再生成→差分レポート(PR本文)。更新の中心。--no-collect で設定だけ反映', group: '日常の運用', cli: 'scripts/update.ts' },
  { name: 'judge', summary: '要判断の判断(Issueのチェック/要判断ファイル)を判断の記憶に取り込む', group: '日常の運用', cli: 'scripts/judge.ts' },
  { name: 'ledger', summary: 'カレンダーに出る項目(記事・期間・内容・項目ID)を月別の台帳(config/judge/calendar/)に書き出す。update が自動で作り直す', group: '保守・調査', cli: 'scripts/ledger.ts' },
  { name: 'override', summary: '台帳の項目IDを指定して、期間・名前・セクション・小見出し・詳細の内容を overrides.json で直す', group: '日常の運用', cli: 'scripts/override.ts' },
  { name: 'manual', summary: '手動の調整(公式に無い項目の追加・項目の非表示)を manual.json に書式を守って反映する', group: '日常の運用', cli: 'scripts/manual.ts' },
  { name: 'check', summary: '設定と収集データの点検。終了コードで自動マージ可否を返す(0=可 / 1=要確認)', group: '日常の運用', cli: 'scripts/check.ts' },
  { name: 'collect', summary: '収集だけ(判定・レポートなし)。通常は update を使う', group: '保守・調査', cli: 'scripts/collect.ts' },
  { name: 'prune', summary: '表示範囲より前に終わった古い記事(data/articles)を削除する。既定は確認だけ、--apply で削除', group: '保守・調査', cli: 'scripts/prune.ts' },
  { name: 'rebuild', summary: 'キャッシュ済みの生HTML(data/raw)から正本を作り直す(再取得なし。パーサを直した後)', group: '保守・調査', cli: 'scripts/collect.ts' },
  { name: 'scrape', summary: '公式ニュースの生HTMLを data/raw に保存するだけ(正本は作らない)', group: '保守・調査', cli: 'scripts/scrape.ts' },
  { name: 'reparse', summary: 'data/raw から期間を抽出し直して結果を表示する(ファイルは書かない)', group: '保守・調査', cli: 'scripts/scrape.ts' },
  { name: 'candidates', summary: '表示候補の分類(定例/自動ON/自動OFF/要判断)と、要判断ファイルのローカルでの取り込み・評価', group: '保守・調査', cli: 'scripts/candidates.ts' },
  { name: 'report:unparsed', summary: '期間が取れなかった記事(none)を分類して表示(ファイルは書かない)', group: '保守・調査', cli: 'scripts/report-unparsed.ts' },
  { name: 'build:public', summary: '公開用ビルド(dist/。表示範囲=過去・未来12か月・表示対象のみ)。update の後に実行', group: '保守・調査', cli: 'scripts/export-public.ts' },
  { name: 'discord:images', summary: 'Discord 用の週表示の画像4枚(概要・クエスト・キャンペーン・キャラクター・ガチャ)を out/discord/ に作る(送信はしない)。概要の絞り込みは config/display/discord.json', group: '保守・調査', cli: 'scripts/discord-images.ts' },
  { name: 'discord:post', summary: 'discord:images の画像(最新の期間)を Discord の Webhook へ1通にまとめて新規に投稿(環境変数 DISCORD_WEBHOOK_URL。--dry-run で送らず内容だけ表示)', group: '保守・調査', cli: 'scripts/discord-post.ts' },
  { name: 'dev', summary: '開発サーバ(http://localhost:5173)。画面の「更新」ボタンで収集できる', group: '開発', cli: null },
  { name: 'build', summary: '型チェックとビルド', group: '開発', cli: null },
  { name: 'preview', summary: 'ビルド結果の確認用サーバ', group: '開発', cli: null },
  { name: 'lint', summary: '静的解析(eslint)', group: '開発', cli: null },
  { name: 'typecheck', summary: '型検査(tsc)', group: '開発', cli: null },
  { name: 'test', summary: 'テスト(vitest)', group: '開発', cli: null },
  { name: 'help', summary: 'このコマンド一覧', group: '開発', cli: 'scripts/help.ts' },
];

export function formatCommands(commands: readonly CommandInfo[] = COMMANDS): string {
  const groups: CommandInfo['group'][] = ['日常の運用', '保守・調査', '開発'];
  const width = Math.max(...commands.map((c) => c.name.length));
  const out = ['npm run <コマンド> [-- オプション]。各コマンドの詳しい説明(目的・使う場面・入力・出力・副作用)は `npm run <コマンド> -- --help`。運用の手順は docs/operations.md。', ''];
  for (const g of groups) {
    out.push(`■ ${g}`);
    for (const c of commands.filter((x) => x.group === g)) out.push(`  ${c.name.padEnd(width)}  ${c.summary}${c.cli ? '' : ''}`);
    out.push('');
  }
  return out.join('\n');
}
