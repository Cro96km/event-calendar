// npm run report:unparsed: 収集済み記事のうち parse_status=none を分類して標準出力に表示する。ファイルは書かない。
import { readAllRecords } from '../src/data/store';
import { buildUnparsedReport, formatUnparsedReport } from '../src/unparsed-report';
import { showHelpIfRequested } from './_help';

showHelpIfRequested(`npm run report:unparsed
  目的: 収集済み記事のうち期間が取れなかった記事(parse_status=none)を、獣神化の解禁・開催告知・メンテナンスなどに分類して表示する。
  使う場面: 期間の書式が新しい記事が増えていないか、パーサの対応が必要かを調べるとき。
  入力: data/articles
  出力: 標準出力(件数・分類・例・提案)。ファイルは書かない。
  副作用: なし。`);

const records = await readAllRecords('data/articles');
if (records.length === 0) throw new Error('data/articles が空です。先に npm run collect を実行してください。');
console.log(formatUnparsedReport(buildUnparsedReport(records), records.length));
