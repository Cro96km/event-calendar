// CLI共通: --help が指定されたら説明を表示して終了する。各CLIの説明は『目的・使う場面・入力・出力・副作用』を書く。
export function showHelpIfRequested(text: string, argv: string[] = process.argv.slice(2)): void {
  if (argv.includes('--help')) {
    console.log(text);
    process.exit(0);
  }
}
