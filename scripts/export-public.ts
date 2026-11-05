// npm run export-public -- --src public/data --out dist/data
// 公開用export(直近12ヶ月・表示対象のみ)を --out に書く。--out は作り直す。selection.json は出力しない(絞り込み済みのため)。
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IndexFile, MonthFile } from '../src/data/export';
import { buildPublic } from '../src/data/public-export';
import { showHelpIfRequested } from './_help';

showHelpIfRequested(`npm run build:public  (内部: tsx scripts/export-public.ts --src public/data --out dist/data)
  目的: 公開用ビルド。型チェック+ビルドのあと、公開用のデータ(直近12ヶ月・表示対象のみ)を dist/data に作る。
  使う場面: 公開サイトのビルド(ワークフローが実行)、公開前のローカル確認。事前に npm run update が必要(public/data と selection.json を作る)。
  オプション: --src DIR(元の表示用データ。既定の指定は上記)、--out DIR(出力先。作り直す)
  入力: public/data(index.json・events・selection.json)。selection.json が無いと未判断の項目まで公開してしまうためエラーにする。
  出力: dist/(アプリ)、dist/data(公開用データ。selection.json は出さない)
  副作用: --out のディレクトリを作り直す。ネットワークには触れない。`);
import type { SelectionJson } from '../src/selection';

const arg = (name: string): string => {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) throw new Error(`${name} が必要です`);
  return v;
};
const src = arg('--src');
const out = arg('--out');
const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;

const index = await readJson<IndexFile>(join(src, 'index.json'));
const months = await Promise.all(index.months.map((m) => readJson<MonthFile>(join(src, 'events', `${m}.json`))));
const selection = await readJson<SelectionJson>(join(src, 'selection.json')).catch(() => null);
const pub = buildPublic(months, index, selection, Date.now());

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'events'), { recursive: true });
const write = (p: string, v: unknown): Promise<void> => writeFile(p, `${JSON.stringify(v, null, 2)}\n`);
for (const m of pub.months) await write(join(out, 'events', `${m.month}.json`), m);
await write(join(out, 'index.json'), pub.index);
const n = pub.months.reduce((s, m) => s + m.events.length, 0);
console.log(`公開用export: ${pub.months.length}ヶ月 / イベント${n}件(月別の延べ数) → ${out} (元 ${index.months.length}ヶ月)`);
