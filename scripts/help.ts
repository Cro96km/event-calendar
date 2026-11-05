// npm run help — npm のコマンド一覧と説明を表示する。
import { showHelpIfRequested } from './_help';
import { formatCommands } from '../src/commands';

showHelpIfRequested(`npm run help
  目的: 全コマンドの一覧と1行の説明を表示する。
  使う場面: どのコマンドを使うか迷ったとき。
  入力・出力: 標準出力に一覧。副作用なし。`);
console.log(formatCommands());
