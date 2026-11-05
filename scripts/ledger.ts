// npm run ledger — カレンダーの台帳(config/judge/calendar/)を、表示用データと現在の判断から作り直す。詳細は --help と docs/operations.md §16。
import { writeLedger } from '../src/data/ledger-store';
import { toJst } from '../src/data/record';
import { currentJudgments } from '../src/data/selection-store';
import { readAllRecords } from '../src/data/store';
import { showHelpIfRequested } from './_help';

showHelpIfRequested(`npm run ledger
  目的: 収集した項目(記事・期間・内容・項目ID)を、判定(表示/非表示/要判断)と理由つきで月別の表(config/judge/calendar/YYYY/MM.md)にする。
  使う場面: 期間や内容の誤り・表示の判断の誤りを探すとき、項目IDを調べるとき。npm run update が毎回作り直すので、通常は単独で実行しない。
  入力: public/data(index.json・events・selection.json。npm run update が作る)、data/articles、config/judge/(decisions・rules)、config/schedule/(manual・overrides・monthly-days)
  出力: config/judge/calendar/(作り直す。生成物なので編集しない)
  副作用: 出力ディレクトリを作り直す。ネットワークには触れない。`);

const judged = await currentJudgments(await readAllRecords('data/articles'), 'config/judge/decisions.json', 'config/judge/rules.json');
const n = await writeLedger('public/data', 'config/judge/calendar', toJst(Date.now()), judged);
console.log(`台帳: ${n}ヶ月 → config/judge/calendar`);
