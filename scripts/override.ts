// npm run override — 項目ごとの手動の修正(config/schedule/overrides.json)を、書式を守って編集する。詳細は --help と docs/operations.md §17。
import { readFile, writeFile } from 'node:fs/promises';
import { readAllRecords } from '../src/data/store';
import { jstText, overrideProblems, setItem, unsetItem, type OfficialValue, type OverrideItem, type OverrideSet, type OverrideWas, type OverridesConfig } from '../src/overrides';
import { showHelpIfRequested } from './_help';

const FILE = 'config/schedule/overrides.json';

showHelpIfRequested(`npm run override -- <set|unset|list> [オプション]
  目的: 台帳(config/judge/calendar/)で見つけた誤りを、項目IDを指定して直す(期間・名前・セクション・小見出し・詳細の内容)。
  使う場面: 自動収集の期間・内容が公式と違うとき、項目を別のセクションに入れたいとき、詳細に注記を足すとき。
  コマンド:
    set --id 項目ID [--name 名前] [--start "YYYY-MM-DD HH:MM"] [--end "YYYY-MM-DD HH:MM"] [--group 小見出し] [--section セクションid]
        [--notes 注記|注記] [--hide-blocks 見出し,見出し] [--add-block "見出し=行1|行2"] [--note 理由]
        同じ項目IDには上書きではなく追加(指定した項目だけ変わる)。直す前の公式の値(was)は自動で記録する。
    unset --id 項目ID [--field 項目名]   修正を取り消す(--field なら、その項目だけ)
    list                                 現在の修正を表示する
    --help                               この説明
  入力: config/schedule/overrides.json、data/articles(項目の存在確認と was の記録)
  出力: config/schedule/overrides.json(list 以外は更新)。反映は main への変更後の deploy(収集は不要)。台帳は次の npm run update で更新される。
  副作用: なし(ネットワークには触れない)。公式の記事が後から変わって was と食い違うと npm run check が警告する。`);

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const need = (n: string): string => {
  const v = arg(n);
  if (v === undefined || v.trim() === '') throw new Error(`${n} が必要です(--help)`);
  return v.trim();
};
const list = (v: string | undefined, sep: string): string[] => (v ?? '').split(sep).map((x) => x.trim()).filter((x) => x !== '');

const raw = JSON.parse(await readFile(FILE, 'utf8')) as OverridesConfig & { _doc?: string };
const cfg: OverridesConfig = { items: raw.items };
const before = overrideProblems(cfg).problems;
if (before.length > 0) throw new Error(`${FILE} が不正です:\n${before.join('\n')}`);

let next: OverridesConfig;
switch (cmd) {
  case 'set': {
    const id = need('--id');
    const records = await readAllRecords('data/articles');
    const found = records.flatMap((r) => r.events).find((e) => e.id === id);
    if (!found) throw new Error(`項目ID「${id}」が data/articles にありません(台帳の項目ID列を確認してください)`);
    const official: OfficialValue = { name: found.name, start: found.start, end: found.end };
    const prev = cfg.items.find((x) => x.id === id);
    const set: OverrideSet = { ...(prev?.set ?? {}) };
    const was: OverrideWas = { ...(prev?.was ?? {}) };
    const take = (k: 'name' | 'start' | 'end'): void => {
      const v = arg(`--${k}`);
      if (v === undefined) return;
      set[k] = v.trim();
      was[k] ??= k === 'name' ? official.name : k === 'start' ? jstText(official.start) : official.end === null ? undefined : jstText(official.end);
    };
    take('name');
    take('start');
    take('end');
    if (arg('--group') !== undefined) set.group = need('--group');
    if (arg('--section') !== undefined) set.section = need('--section');
    if (arg('--notes') !== undefined) set.notes = list(arg('--notes'), '|');
    if (arg('--hide-blocks') !== undefined) set.hide_blocks = list(arg('--hide-blocks'), ',');
    const block = arg('--add-block');
    const bi = block?.indexOf('=') ?? -1;
    if (block !== undefined && bi > 0) set.add_blocks = [...(set.add_blocks ?? []).filter((b) => b.label !== block.slice(0, bi).trim()), { label: block.slice(0, bi).trim(), lines: list(block.slice(bi + 1), '|') }];
    const note = arg('--note');
    const item: OverrideItem = { id, set, ...(Object.keys(was).length > 0 ? { was } : {}), ...(note !== undefined && note.trim() !== '' ? { note: note.trim() } : prev?.note ? { note: prev.note } : {}) };
    next = setItem(cfg, item);
    break;
  }
  case 'unset': {
    const id = need('--id');
    const field = arg('--field');
    if (field === undefined) {
      next = unsetItem(cfg, id);
      break;
    }
    const prev = cfg.items.find((x) => x.id === id);
    if (!prev) throw new Error(`items に「${id}」はありません`);
    const { [field as keyof OverrideSet]: _gone, ...rest } = prev.set;
    void _gone;
    const { [field as keyof OverrideWas]: _w, ...wasRest } = prev.was ?? {};
    void _w;
    next = Object.keys(rest).length === 0 ? unsetItem(cfg, id) : setItem(cfg, { ...prev, set: rest, ...(Object.keys(wasRest).length > 0 ? { was: wasRest } : { was: undefined }) });
    break;
  }
  case 'list':
    console.log(JSON.stringify(cfg, null, 2));
    process.exit(0);
  // eslint-disable-next-line no-fallthrough
  default:
    throw new Error('コマンドは set / unset / list のいずれかです(--help)');
}
await writeFile(FILE, `${JSON.stringify({ _doc: raw._doc, ...next }, null, 2)}\n`);
console.log(`更新: ${FILE}(${next.items.length} 件)`);
