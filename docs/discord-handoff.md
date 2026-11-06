# 引き継ぎメモ: Discord への画像転送(段階3)

別日・別セッションで作業を続けるためのメモ。**最終更新: 2026-11-06**。秘密情報(Webhook の URL・トークン)は書かない。
作業前に **CLAUDE.md(ローカル専用)** と、運用の正本 **docs/operations.md §18**(画像)・**docs/spec.md §4.12**(撮影モード)を読むこと。

## 0. 現状(2026-11-07 更新)
- **実装済み(`develop`。PR #47)**: `npm run discord:post`・`.github/workflows/discord.yml`・`update.yml` からの起動(健全な定例のみ)。運用は docs/operations.md §18。
- **決定済み**: 投稿は**毎回新規**(方式A)/ 5メッセージ(概要・キャラクター・クエスト・キャンペーン・ガチャ。見出し `**概要** 11/7〜11/13` + 画像)/ 通知は**あり**(既定。`silent` は臨時の入力で選べる)/ 自動転送は update が健全に終わったあと(要確認の週は送らない)。
- **テスト済み**: テスト用チャンネルへ5件の送信(2026-11-07)。見た目は一旦OK。
- **未了**: 本番の Secret `DISCORD_WEBHOOK_URL` の登録(当面はテスト用の Webhook を使う方針。登録はユーザの許可後)と、`develop` → main のマージ(ユーザの明示承認後。現在は「main へは一切マージしない」指示)。以降の節は経緯の記録。UI の修正が次の作業。

## 1. 目的(確定)
- カレンダーの週表示の画像を、**1つの Discord サーバーのチャンネルへ、Webhook で送る**。サーバー代ゼロ(GitHub Actions のみ)。常駐プロセス・スラッシュコマンド・ボタンは作らない(こちらから Discord へ送るだけ。Discord から呼ばれない)。
- **毎週、自動で転送する**: データの更新(`update.yml`。毎週金曜 0:00 JST = 木曜 15:00 UTC の cron)→ 公開サイト(GitHub Pages)の反映(`deploy.yml`)に合わせて、その週の画像を送る。
- **臨時の転送**も Actions の画面(`workflow_dispatch`)からできるようにする。入力は、基準日(YYYY-MM-DD。既定=今日〈JST〉)・種類(全部/1枚)・**dry-run**(送らず、内容だけ表示)など。
- 旧計画(毎日4:30 JST に同じメッセージを書き換える)は**やめた**。毎週に変えた。

## 2. これまでにできていること(`develop` にマージ済み。main へは未反映)
- 画像5枚: `npm run discord:images [-- --date YYYY-MM-DD] [--only summary|character|quest|campaign|gacha]` → `out/discord/<開始日>_<終了日>_<kind>.png`(`out/` は git 管理外)。入力は `npm run build:public` の `dist/`(ローカルで配信して Playwright で撮る。公式サイトには触れない)。
- 概要(summary)は、大見出しなしで、`config/display/discord.json` の `summary.blocks` の順に並ぶ。現在: モンストの日→特Lの園→イベントクエスト→期間限定ガチャ→絶級・期間限定・超究極(開催日のみ)→新限定→進化→定例クエスト。
- 画像は行数対策済み(撮影モード専用。進化は種別ごと1行、新限定はガチャ名ラベル+名前の下の線)。配色・ライト/ダーク切替・記号ボタンも `develop` に入っている。
- 画像の見た目の宿題(任意): 期間限定ガチャの長い名前(3行折り返し)、特Lの園の小見出し(現在は小見出しなし)。

## 3. これから作るもの(段階3)
1. **送信スクリプト**(`scripts/` に。例 `discord-post.ts`): 画像を Webhook へ POST。**dry-run を必ず用意**。Webhook の URL は環境変数(`DISCORD_WEBHOOK_URL`)から読み、ログに出さない。
2. **ワークフロー**(`.github/workflows/discord.yml`。`workflow_dispatch` + update 後の自動起動)。`tests/workflows.test.ts` の不変条件を守る: **アクションは SHA 固定・`permissions` 明示・入力は env 経由**。既存の `deploy.yml`・`update.yml` を壊さない。
3. **Actions 上の準備**: Playwright の Chromium(`npx playwright install --with-deps chromium`)と日本語フォント(`fonts-noto-cjk`)。ブラウザの時刻は Asia/Tokyo(スクリプトで固定済み)。基準日は **JST で計算**する(UTC の cron は木曜 15:00 のため。`TZ=Asia/Tokyo date +%F`)。
4. **docs 更新**: operations.md(§18 に送信と cron の運用を追記)・spec.md・`npm run help`(`src/commands.ts`)。

## 4. 連携の設計(update → deploy → Discord)
既存の流れ(`update.yml` を確認済み): 収集→検証→更新PRを作る→**健全ならその場で自動マージ→`gh workflow run deploy.yml` で反映を明示的に起動**(GITHUB_TOKEN のマージは push イベントを起こさないため)。健全でなければ PR にラベル「要確認」を付けて待機(main は変わらない)。変更が無ければ PR を作らない(deploy も走らない)。

- **画像は、リポジトリのデータからその場でビルドして撮る**。公開済みの Pages を撮るわけではないので、**deploy の完了を待つ必要は無い**(Pages の URL をメッセージに載せる場合だけ、deploy 後が望ましい)。
- 推奨案: **`update.yml` の最後(更新が成功したあと)に `gh workflow run discord.yml` で起動**する(`update.yml` は `actions: write` を持っている)。変更なし・要確認のときの扱いは下の「決めること」。
- 代替案: `workflow_run`(`deploy.yml` の完了で起動)。ただし deploy は main の `src/`・`config/` などの変更でも走るため、**絞り込まないと更新のたびに投稿される**。使うなら `github.event.workflow_run.event` などで絞る。
- 別案: 自前の cron(金曜 1:30 JST 頃)。update が遅れたり失敗した週に、古いデータで投稿する恐れがある。

## 5. 決めること(未決)
1. **投稿の方式**: **A. 毎回、新しく投稿する**(おすすめ。毎週5メッセージを追加。メッセージ ID の保管が要らない。履歴が残る。臨時の再実行は重複投稿になる)/ **B. 同じ5メッセージを書き換える**(メッセージ ID を設定ファイル等に記録する必要がある。履歴は残らない)。ユーザは A 寄り(「毎週・臨時で転送したい」)。ID の話はまだ十分に理解されていない → 説明(Discord の投稿1件ごとの整理番号。書き換えには要る。Webhook は過去の投稿を一覧できない)から始める。
2. **メッセージの形**: 5つの別メッセージ(概要・キャラクター・クエスト・キャンペーン・ガチャ)に、見出しの文字(例「概要 11/6〜11/12」)+画像1枚。通知を鳴らすか(`flags: 4096` で抑制できる)。
3. **「変更なし」「要確認」の週**: 変更なしでも週は進むので**投稿する**のが自然。要確認(自動マージされず main が古い)の週は、投稿しない/注記つきで投稿する、のどちらか。
4. **投稿のタイミング**: update の完了直後でよいか(金曜 0:00 JST の cron が数十分遅れることがある)。
5. 臨時の転送の入力項目(基準日・種類・dry-run・宛先のテスト/本番)。

## 6. 実装前に確認すること
- **update の定期実行(cron)が実際に動くか**: 2026-11-06 01:2x JST の時点で、木曜 15:00 UTC の定期実行の記録が無かった(履歴は手動実行のみ)。cron 設定・ワークフローは有効で、デフォルトブランチは main。GitHub の schedule の遅延/取りこぼしの可能性。**次の金曜(11/13 0:00 JST 頃)に自動実行されたか確認**してから、連携を作る(Actions → update の履歴)。
- Webhook の挙動(テスト用チャンネルで、**URL はローカルの環境変数だけ**で渡して1回試す): 画像つき POST(`multipart/form-data`: `payload_json` + `files[0]`。`?wait=true` で投稿の ID が返る)・画像1枚のサイズ上限(画像は 40〜200KB 程度)・(B の場合)`PATCH /webhooks/{id}/{token}/messages/{message_id}` での画像の差し替え(`attachments` の扱い)。Discord の仕様は実装時に公式ドキュメントで再確認する。
- ユーザは**テスト用のサーバー・チャンネルを作成済み**。Webhook の URL は、リポジトリの外のファイルに置く案: `~/.config/monst/discord-test-webhook`(`chmod 600`。**まだ作られていない**。作成の手順はユーザに案内する。テスト後は Discord 側でウェブフックを削除して無効化する)。
- 画像の見た目(行の高さ・色)は、実際に Discord に表示して確認する(幅 760px・2倍解像度 = 1520px。Discord 上の縮小表示で文字が読めるか)。

## 7. 守ること(CLAUDE.md の要点)
- **main へ直接 push しない**。ブランチ→PR。今回の運用: **`develop` ブランチへ PR → マージ(ユーザの明示承認後)**、完成品を最後に `develop` → main の PR でマージ(これもユーザの明示承認後)。main は毎週の自動更新で進むので、main へ入れる前に **main を `develop` に取り込む**。
- **Webhook の Secret の登録、リポジトリ設定・Actions の権限の変更は、ユーザの明示許可なしに行わない**(`gh secret set`・`gh repo edit`・設定変更系の `gh api` を勝手に実行しない)。本番サーバーへの初回投稿も、許可を得てから。
- 公式の生HTML・本文を git に含めない。公式素材(画像・ロゴ)を載せない。「非公式・非営利」の表記を保つ(画像には入れない決定。サイトのフッターにある)。公式サイトへのアクセスは必要最小限。
- コミットメッセージは英語 `type: description`、末尾に `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`。PR タイトルは英語、**本文は日本語**で末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。`gh pr create`/`gh pr edit` は Projects classic の廃止で失敗する → `gh api -X POST|PATCH repos/Cro96km/event-calendar/pulls[/N]` を使う。コミット作者は noreply メール。
- PR の前に `npm run lint`・`npm run typecheck`・`npm test`。データ・設定に触れたら `npm run check`。設定・UI・機能を変えたら docs/spec.md・docs/operations.md・`npm run help` を更新。ワークフローは `tests/workflows.test.ts` の不変条件(SHA 固定・permissions 明示・入力は env 経由)。
- 作業の分担: 段階1(撮影モードと画像)・段階2(記事の表示ルール調整)は完了。**段階3(送信と cron)がこのメモの対象**。

## 8. 完了の目安
dry-run で投稿内容を確認 → テスト用チャンネルに1回送信 → 本番サーバーで初回投稿(許可を得て Secret 登録) → 次の金曜の update に合わせて自動で投稿されることを確認 → 臨時の転送(`workflow_dispatch`)を1回試す。
