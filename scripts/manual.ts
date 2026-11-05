// npm run manual — 手動の調整(config/schedule/manual.json)を、書式を守って編集する。詳細は --help と docs/operations.md §14。
import { readFile, writeFile } from 'node:fs/promises';
import { addEntry, hideEntry, manualProblems, removeEntry, unhideEntry, type ManualAdd, type ManualCategory, type ManualConfig } from '../src/manual';
import { showHelpIfRequested } from './_help';

const FILE = 'config/schedule/manual.json';

showHelpIfRequested(`npm run manual -- <add|remove|hide|unhide|list> [オプション]
  目的: 手動の調整(config/schedule/manual.json)を、書式の誤りを防ぎながら編集する。
        add=公式ニュースに無い項目を足す / hide=項目(または記事ごと)を表示から外す(データは消さない)。
  使う場面: 公式に無い常設・臨時の項目を足すとき、中止になった項目などを外すとき。Actions の manual からも同じ処理が動く。
  コマンド:
    add --name 名前 --category event|campaign --start "YYYY-MM-DD HH:MM" --end "YYYY-MM-DD HH:MM" [--group 小見出し] [--hide-start] [--hide-end] [--note メモ]
          項目を足す(同じ name と start があれば置き換え)。event=クエスト、campaign=キャンペーン。時刻は JST。
    remove --name 名前          add の項目を取り除く
    hide --id ID [--note 理由]  項目ID(例 20261030_3#0)または記事ID(例 20261030_3)を表示から外す
    unhide --id ID              hide を取り消す
    list                        現在の設定を表示する
    --help                      この説明
  入力: config/schedule/manual.json
  出力: config/schedule/manual.json(list 以外は更新)。反映は main への変更後の deploy(収集は不要)。
  副作用: なし(ネットワークには触れない)。`);

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const need = (name: string): string => {
  const v = arg(name);
  if (v === undefined || v.trim() === '') throw new Error(`${name} が必要です(--help)`);
  return v.trim();
};

const raw = JSON.parse(await readFile(FILE, 'utf8')) as ManualConfig & { _doc?: string };
const cfg: ManualConfig = { add: raw.add, hide: raw.hide };
const { problems } = manualProblems(cfg);
if (problems.length > 0) throw new Error(`${FILE} が不正です:\n${problems.join('\n')}`);

let next: ManualConfig;
switch (cmd) {
  case 'add': {
    const note = arg('--note');
    const group = arg('--group');
    const a: ManualAdd = {
      name: need('--name'),
      category: need('--category') as ManualCategory,
      start: need('--start'),
      end: need('--end'),
      ...(group !== undefined && group.trim() !== '' ? { group: group.trim() } : {}),
      ...(process.argv.includes('--hide-start') ? { hide_start: true } : {}),
      ...(process.argv.includes('--hide-end') ? { hide_end: true } : {}),
      ...(note !== undefined && note.trim() !== '' ? { note: note.trim() } : {}),
    };
    next = addEntry(cfg, a);
    break;
  }
  case 'remove':
    next = removeEntry(cfg, need('--name'));
    break;
  case 'hide': {
    const note = arg('--note');
    next = hideEntry(cfg, { id: need('--id'), ...(note !== undefined && note.trim() !== '' ? { note: note.trim() } : {}) });
    break;
  }
  case 'unhide':
    next = unhideEntry(cfg, need('--id'));
    break;
  case 'list':
    console.log(JSON.stringify(cfg, null, 2));
    process.exit(0);
  // eslint-disable-next-line no-fallthrough
  default:
    throw new Error('コマンドは add / remove / hide / unhide / list のいずれかです(--help)');
}
await writeFile(FILE, `${JSON.stringify({ _doc: raw._doc, ...next }, null, 2)}\n`);
console.log(`更新: ${FILE}(add ${next.add.length} 件 / hide ${next.hide.length} 件)`);
