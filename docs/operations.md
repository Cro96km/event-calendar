# 運用書

## 1. セットアップ
前提確認: `node -v`(v24系。`.nvmrc`あり、`nvm use`)、`gh auth status`、`ssh -T git@github.com`(SSH未設定ならHTTPS cloneでも可)。`gh`はIssue/PR作成に使う。
```bash
git clone <リポジトリURL> && cd event-calendar   # ローカルの作業ディレクトリ名は任意
npm install
```
main への直接 push は GitHub のルールセットで禁止している(§13)。変更はブランチ→PR で行う。

## 2. 日常運用
| 操作 | コマンド |
|---|---|
| 収集(最新2ページ)+export | `npm run collect -- --pages 2` |
| 初回/過去分 | `npm run collect -- --since 2026-01-01 --pages 10`(`--pages`で1回の巡回量を区切り、数日に分ける。`--since`のみだと上限200ページ) |
| 取得のみ(生HTMLをdata/raw/に保存) | `npm run scrape -- --pages 2` |
| パーサ変更後の再解析(再取得なし) | `npm run reparse` |
| パーサ変更後に正本・exportを再生成(再取得なし) | `npm run rebuild` |
| 表示用JSON生成 | collect が毎回 `public/data/` を再生成(単独の `export` コマンドは無し) |
| 表示候補の更新(記憶・ルールで4区分に分類) | `npm run candidates` |
| ルール一致率の確認 | `npm run candidates -- --report` |
| 要判断のレビュー依頼(ドライラン) | `npm run candidates -- --review-issue`(発行は `--publish` 明示時のみ) |
| 手動の調整(公式に無い項目の追加・項目の非表示) | `npm run manual -- add` / `hide` など(§14。Actions の manual からも) |
| 不要データの削除 | `npm run prune`(確認だけ)/ `-- --apply`(§15。Actions の prune からも) |
| 画面確認 | `npm run dev`(ヘッダの「更新」ボタンで collect+candidates。5分間隔制限) |
- 想定頻度: 週1回。収集後に `data/articles/` の差分を確認する。

### 2.1 表示候補の運用手順(収集→candidates→要判断→反映)
ユーザが日常的に見る/編集するのは **`config/judge/needs-review.md` だけ**(`config/judge/calendar/`〈台帳〉は読む用の自動生成物。編集しない)。
1. `npm run collect -- --pages 2`(収集)。`data/articles/` の差分を確認。
2. `npm run candidates`: 新規候補が記憶・ルールで 定例/自動ON/自動OFF/要判断 に分類される。出力に区分ごとの件数と、要判断の行数が出る。
3. 要判断が0なら終わり(ブラウザ再読み込み)。あれば `config/judge/needs-review.md` を開き、各行(同種を集約済み。件数・例示タイトル付き)を **表示なら `- [x]`、非表示なら `- [-]`** にする(迷うなら `- [ ]` のまま=非表示扱いで次回も残る)。この判断は「この種類は常に表示/非表示」として `config/judge/decisions.json` に記憶され、同種の以後の候補は自動で適用される。
4. `npm run candidates` を再実行(判断を取り込み、`public/data/selection.json` を更新)→ ブラウザを再読み込み。
5. (任意)依頼文が欲しいとき: `npm run candidates -- --review-issue`(ドライラン。要判断の集約行のみ。発行は `--publish` 明示時のみ)。
6. (任意)`npm run candidates -- --report` でルールと記憶の一致率・不一致を見て `config/judge/rules.json` を改善。
- **何が表示・非表示か**は `config/judge/calendar/YYYY/MM.md`(台帳。§16。GitHub 上でも見られる。判定〈表示/非表示/要判断〉・セクション・小見出し・表示名・期間・内容・理由・項目ID・記事リンクの列。**非表示・要判断の項目も載る**)を読む。カレンダーの表示範囲(`config/display/window.json`。過去12か月・未来12か月)の項目だけで、毎回作り直す。更新PRでは、変わった月の表だけに差分が出る。内容に不満があれば、生成物ではなく判断(Issue の `/apply`、`config/judge/decisions.json`、`config/judge/rules.json`)を直す。個別の項目だけ外したいときは §14 の `hide`。
- `config/judge/decisions.json`・`config/judge/rules.json` はgit管理。`calendar/`(台帳。読む用)もgit管理(更新PRに含まれる)。`needs-review.md`は管理外。

## 3. データ管理
- 正本: `data/articles/<YYYY>/<MM>/<id>.json`(月は記事IDの日付から)（git管理）。生HTML: `data/raw/`（git管理外、消えても再取得可）。
- バックアップ: git履歴が正本のバックアップ。`data/raw/`は再取得可能なため許容(消えた場合はreparse不可→再取得)。誤削除は `git restore data/articles`。
- 全再構築: `data/raw/` が残っていれば `reparse`、無ければ `collect --since` で再取得（間隔2秒のため時間がかかる）。
- 保持: 正本は全件(増えすぎたら §15 の prune で、表示範囲より前に終わった記事を削除する)。公開用exportは表示範囲(過去12か月・未来12か月。`config/display/window.json`)に絞る。

## 4. スクレイピング礼節・権利
（本節が礼節の**正本**。他docは本節を参照する）
- 間隔2秒以上、並列1、UA明記(プロジェクト名+私的利用。個人メール等は入れない)、gzip利用、短時間の連続実行を避ける。
- robots.txt(確認済み: `/news/`は許可、Crawl-delayなし)。Disallowのパスは取得しない。
- 404は記録してスキップ、429は即中断(Retry-After尊重)、5xxは3回リトライ後に中断。
- 初回バックフィルは数日に分ける。利用規約の確認結果はこの節の末尾。
- 公式ニュースの本文・画像は保存/配布しない。保存するのはタイトル・カテゴリ・公開日・期間・URL。
- 公開データはタイトル・カテゴリ・期間・URLのみ。規約の確認結果は下記(公式の規約・ガイドラインの改定や運営からの要請があれば収集を止める。§13)。

**規約の確認結果**(mixi.co.jp の利用規約・二次創作ガイドライン。2026-11-05 に原文を確認)
- サイト利用規約・ガイドラインに、自動取得・スクレイピングを禁じる(許す)条文はない。robots.txt は `/mt/admin/`・`/mt-static/` のみ Disallow で、`/news/` は許可・Crawl-delay なし。
- 二次創作ガイドライン(個別): 対象は個人・法人格のない団体の非営利活動。禁止は、事業性の高い営利目的、ゲーム性が認められるもの、公式素材のコピー・トレース、協賛・公認と誤解させるもの等。クレジット表記の規定はない。ガイドラインは予告なく変わる。
- このアプリは、非営利・広告や寄付なし・公式素材なし・本文なし(タイトル・カテゴリ・公開日・期間・URLのみ)・「非公式」の明記を保つ。公式との関係を示唆する表現はしない。

## 5. 障害対応
| 症状 | 対応 |
|---|---|
| 記事が0件取得 | 一覧HTML構造の変更を疑い、`curl`で実HTMLを確認 → セレクタ修正PR |
| 期間が抽出されない記事が急増 | `data/raw/`で原文確認 → パーサ+フィクスチャ追加PR → `reparse` |
| 429/5xx | 時間を置いて再実行(自動リトライ上限あり) |
| 日付がずれる | JST固定・曜日誤記・年またぎの仕様(spec 4.2)を確認 |

## 6. 開発
新機能・UI変更はブランチ→PR(main へ直接 push しない。自動更新のPRだけ、健全なら自動マージ)。`npm run help` でコマンド一覧、`npm run lint` `npm run typecheck` `npm test` `npm run build` が通ること(CIも同じ)。仕様は docs/spec.md。

## 7. 自動更新の全体像
更新は **ブランチ→PR→(健全なら自動マージ)→反映** で行う。毎週金曜 00:00 JST に自動実行し、Actions → update → Run workflow で手動実行もできる。健全でなければ PR に『要確認』を付けて待機し、公開サイトは前回のまま。要対応(要判断など)があれば Issue ができる。手順・ワークフロー・必要な設定は §13、コマンドは §10〜§12。

## 8. 破界の星墓の更新手順
破界の星墓は新しいクエストが増え続け、6階層以降などニュースから分からない情報がある。設定は **`config/schedule/hakai.json` の1ファイル**(クエストの属性色と、記事に載らない固定の階層)。属性色の色名は `config/display/quest-colors.json` の `palette`(red=火・blue=水・green=木・yellow=光・purple=闇)。

### 新しいクエストが増えたとき
1. `npm run collect` の後に `npm run check` を実行する(週次更新でも同じ点検が走り、要対応があれば Actions のログに警告が出る)。色の対応が無い階層名は「新クエスト: 「○○の星墓」(記事…、開催…)」と出る。
2. `config/schedule/hakai.json` の `quests` の末尾に `{ "name": "○○", "color": "red|blue|green|yellow|purple" }` を足す。`name` は階層クエスト名に含まれる語(「の星墓」は付けない。`・`と`＆`は照合で吸収)。名前が他の語を含む/含まれる場合は上から最初の一致なので並びに注意。

### 6階層以降など、ニュースに載らない階層を変えるとき
1. `schedules` の**末尾に新しい版**を足す: `{ "since": "<新しい開催の開始日 YYYY-MM-DD>", "floors": [{ "floor": 6, "quest": "○○" }, …] }`。`quest` は `quests` の `name`。表示は `○○の星墓`。
2. 過去の開催は古い版のまま表示される(開催の開始日に since が当てはまる最後の版を使う)。`since` は昇順にする。
3. 記事が6階層以降を載せるようになった場合、その階層番号は記事のものが優先され、固定の階層は追加されない。

### 確認とマージ
- `npm run check` が「問題なし」になること。`npm run lint && npm test`(設定の整合性テストが、未定義のクエストの参照・階層番号の重複・since の順序・palette に無い色を検出する)。
- 通常の手順(ブランチ→PR→マージ)で main に入れ、次回の週次更新(または Actions → update → Run workflow)で公開サイトに反映する。表示はブラウザ側の整形なので、データの再収集は不要。

## 9. 設定フォルダの構成
手で直す設定は、役割ごとの3フォルダに分けている(各JSONの先頭の `_doc` に目的・いつ直すか・形式がある)。

| フォルダ | 役割 | ファイル(いつ直すか) |
|---|---|---|
| `config/judge/` | 表示・非表示の判断 | `rules.json`(自動判定のルール。上から最初の一致)、`decisions.json`(判断の記憶。`npm run candidates` が要判断ファイルから取り込む生成物なので、通常は手で編集しない)。`calendar/YYYY/MM.md`(台帳。収集した項目を判定〈表示/非表示/要判断〉・理由・期間・内容・項目IDつきで月別に出力。自動生成・git管理・読む用。§16)。ローカルの生成物 `needs-review.md`(要判断の一覧・編集する)はgit管理外 |
| `config/display/` | 表記・並び・色・表示範囲 | `window.json`(カレンダーの表示範囲。過去・未来それぞれの月数。公開データ・移動の限界・判断の表・`npm run prune` が使う)、`label-overrides.json`(長いラベルを短くする)、`order.json`(**並び順の唯一の設定**。セクション・小見出し・行の並び方。spec §4.3.8。記入例は `order.md`)(分類は `classify`)、`quest-colors.json`(禁忌の獄の属性色と色の定義)、`recurring.json`(定例のラベル) |
| `config/schedule/` | ニュースに載らない日程・事実 | `manual.json`(手動の調整。公式に無い項目の追加・項目の非表示。§14)、`overrides.json`(項目IDごとの修正。期間・名前・セクション・詳細の内容。§17)、`hakai.json`(星墓のクエスト名→色と、固定の階層。§8)、`monthly-days.json`(毎月決まった日に出る項目)、`normal-quest-attributes.json`(ノーマルクエストの曜日別の対象属性) |

過去記事を全体から判断し直す仕組み(`npm run review-year`・`config/review/`)は廃止した。更新ごとの差分で判断する(運用の再設計。。

## 10. 更新と差分レポート `npm run update`
更新(収集→判定→差分レポート)を1コマンドにしたもの。Actions でもローカルでも同じ。

| 項目 | 内容 |
|---|---|
| 目的 | 公式ニュースを収集し、表示候補の判定を作り直し、**収集前後の差分**をレポート(PR本文)にする |
| 使う場面 | 毎週の更新、不定期の手動収集、設定だけ直した後の確認(`--no-collect`) |
| 実行 | `npm run update`(最新2ページ)/ `npm run update -- --pages 5` / `npm run update -- --no-collect` / `--since YYYY-MM-DD`(初回・過去分。負荷が大きい) |
| 入力 | `data/articles`(正本)、`config/judge/`(判断の記憶・ルール) |
| 出力 | `data/articles`(更新)、`public/data/`(表示用)、`update-report.md`(レポート)、`update-report.json`(機械可読のサマリ。自動マージ判定が読む)。レポート・サマリはgit管理外 |
| 副作用 | 公式サイトへアクセスする(`--no-collect` 以外)。礼節は §4(間隔2秒以上・直列・429で即中断) |
| 比較元 | 既定は実行前の `data/articles`。`--prev DIR` で別のディレクトリと比べられる(デモ・検証) |

レポートの内容: 新規の記事・項目、変更された項目(変更前→変更後)、**公開サイトに新しく出る/見えなくなる項目**、新規の要判断(前回に無かった候補の種類だけ。判断済みは出ない。前回からの未判断は件数のみ)、要対応(新しい星墓クエスト・1行に収まらないラベル・期間が取れない新規の記事)。公式の本文は含めず、項目名・期間・リンクのみ。

## 11. 要対応のIssueと判断の取り込み `npm run judge`
要対応(新規の要判断・新しい星墓クエスト・1行に収まらないラベル・期間が取れない記事)がある週は、更新のあとに **Issue を自動で作る**(本文は `npm run update` が `update-issue.md` に出す)。AIは要らず、GitHubの画面だけで判断できる。

- **要判断**: Issue の本文にチェックボックスの一覧が出る。**表示するものにチェックを入れる**(チェックを入れない種類は「常に非表示」で確定)。終わったら Issue に `/apply` とコメントする → 判断を `config/judge/decisions.json` に取り込むPRが自動で作られ、検証が通れば自動でマージされる。判断済みの種類は以後、自動で判定される。
- **新しい星墓クエスト・長いラベル**: Issue にコピーして使える設定の書式(JSON)が出る。`config/schedule/hakai.json` の `quests`、`config/display/label-overrides.json` の `rules` に追記する(GitHub の Web エディタでよい。§8)。
- **期間が取れない記事**: 期間の書式が新しい可能性がある。リンクから記事を確認する。

| 項目 | 内容 |
|---|---|
| コマンド | `npm run judge -- --issue FILE`(Issue本文のファイル)/ `npm run judge -- --review FILE`(要判断ファイル)/ `--dry-run` / `--help` |
| 目的 | 要判断の「表示/非表示」を判断の記憶(`config/judge/decisions.json`)に取り込む |
| 使う場面 | `/apply` コメント(Actionsが自動実行)、ローカルで要判断ファイルを直したとき |
| 入力 | `data/articles`、`config/judge/`、Issue本文または要判断ファイル |
| 出力 | `config/judge/decisions.json`(更新。`--dry-run` なら更新しない) |
| 副作用 | なし。取り込み後は `npm run update -- --no-collect` で判定とレポートを作り直せる |

安全のため、取り込むのは**現在の要判断にある種類だけ**。Issue本文を書き換えても、無関係な種類の判断は変えられない(無視して警告する)。

## 12. 点検と自動マージ判定 `npm run check`
| 項目 | 内容 |
|---|---|
| コマンド | `npm run check` / `npm run check -- --summary update-report.json` / `--help` |
| 目的 | 設定と収集データを点検し、更新PRを自動マージしてよいかを**終了コード**で返す(0=自動マージ可 / 1=要確認) |
| 使う場面 | 更新のあと(Actionsが自動実行)、設定を直した後、新しい星墓が出たとき |
| 点検 | ①星墓の設定の矛盾(未定義のクエストの参照・階層番号の重複・since の順序・色)=要確認。色の対応が無い階層名(新クエスト)=警告(要対応。Issueに出る) ②判断の設定(rules.json・decisions.json)が正しい書式か ③ラベルの上書きが全角15.5文字相当以内か ④(`--summary` のとき)健全性 |
| 入力 | `data/articles`、`config/`、`npm run update` が出したサマリ(`update-report.json`) |
| 出力 | 標準出力に結果。終了コード |
| 副作用 | なし(読み取りのみ) |

**健全性(自動マージの条件)**: 収集が最後まで終わっている(429等で中断していない)/記事が減っていない/既存の記事の書き換えが通常の範囲(公式サイトの構造が変わってパーサが崩れた疑いの検出)/期間が取れない新規の記事が多すぎない/設定に矛盾がない。閾値は `config/judge/health.json`(`maxChangedArticles`=10 と `maxChangedRatio`=0.2 の大きい方まで許す、`minNewArticles`=4 以上の新規のとき期間が取れない割合が `maxUnparsedRatio`=0.5 以下)。運用しながら調整する。満たさなければ更新PRは『要確認』で待機し、公開サイトは前回のまま。CI(lint・テスト・ビルド・公開データ生成)の成否はワークフローが別に見る。

なお、新しい星墓クエストや長いラベルなどの**要対応は、自動マージを止めない**(未判断は非表示なので安全。Issueで対応する)。止めるのは、データや設定が壊れている疑いがあるときだけ。

## 13. ワークフローと必要なリポジトリ設定
| ワークフロー | きっかけ | 内容 |
|---|---|---|
| `update.yml` | 毎週金曜 00:00 JST、手動実行 | `npm run update`(収集→判定→差分レポート)→ lint・テスト・公開データ生成 + `npm run check`(健全性) →ブランチ `update/<日時>` と PR(本文=差分レポート)。健全ならラベル『自動マージ』を付けて**マージし、`deploy.yml` を起動**。健全でなければラベル『要確認』+理由で待機。要対応があれば Issue。変更が無ければ何もしない。例外で落ちたら Issue「更新の失敗」 |
| `deploy.yml` | main への push(`data/articles`・`config`・`src`・`public`・設定ファイルの変更)、手動実行、`update.yml`・`apply.yml` の起動 | 正本と設定から表示用データを作り直し(`npm run update -- --no-collect`。収集しない)、公開サイトをビルドして GitHub Pages に公開 |
| `apply.yml` | 要対応Issue(タイトルが「要対応」)に `/apply` とコメント(所有者・メンバー・共同作業者のみ。Issueの作者も更新ワークフローのbotか所有者のものだけ) | Issue本文のチェックを `npm run judge` で判断の記憶に取り込み、検証して PR→自動マージ→`deploy.yml` 起動→Issue を閉じる。検証が通らなければ『要確認』で待機 |
| `manual.yml` | 手動実行のみ(Actions → manual → Run workflow) | 入力(操作・項目名・期間など)で `npm run manual` を実行 → 検証(lint・テスト・ビルド・`npm run check`) → `config/schedule/manual.json` を更新する PR → 健全なら自動マージして `deploy.yml` を起動。検証が通らなければ『要確認』で待機。手順は §14 |
| `prune.yml` | 手動実行のみ(Actions → prune → Run workflow) | 既定は確認だけ(`npm run prune`。対象の件数と月別の内訳を実行結果の概要に出す)。`apply=true` のときだけ、削除 → 表示用データの作り直し → 検証 → `data: prune old articles` の PR → 健全なら自動マージして `deploy.yml` を起動。手順は §15 |
| `ci.yml` | PR、main への push | lint・テスト・ビルド(人が作る PR 用) |

**手動実行の入力(update.yml)**: `collect`(false にすると収集せず、設定の変更だけを反映して判定とレポートを作り直す)、`pages`(既定2)、`since`(初回・過去分用。公式サイトへの負荷が大きい)。

**日常の使い方**
- 金曜の朝: PR が『自動マージ』ならそのまま反映済み(PR の本文で何が増えたかを見られる)。『要確認』なら理由を見て対応する。
- 要対応の Issue が立っていたら: チェックを付けて `/apply`(§11)。星墓・ラベルは設定ファイルを PR で直す(§8)。
- 設定だけ直したとき: PR をマージすれば `deploy.yml` が反映する(収集は不要)。収集もしたければ update.yml を手動実行する。
- 反映だけやり直したいとき: Actions → deploy → Run workflow。

**必要なリポジトリ設定**
1. Settings → Pages → Source: **GitHub Actions**。
2. Settings → Actions → General → Workflow permissions: 既定の **Read repository contents** のままでよい(各ワークフローが `permissions:` で必要な権限を宣言している)。『**Allow GitHub Actions to create and approve pull requests**』にはチェックする。同じ画面の『Fork pull request workflows』は『**Require approval for all outside collaborators**』にする。
3. main の保護(ルールセット): **PR 必須**(承認は0でよい)。ただし**ステータスチェックを必須にしない**: 自動更新の PR は `GITHUB_TOKEN` で作られるため `ci.yml` が走らず、必須にすると自動マージが止まる(代わりに `update.yml` / `apply.yml` が同等の検証をしてからマージする)。人が作る PR は `ci.yml` が走る。
4. Settings → General → Pull Requests: **PR の作成をコラボレーターだけに制限**する(外部の人は fork から PR を作れない。自動更新の PR は `github-actions[bot]` が書き込み権限で作るので影響しない)。Wiki・Projects・Discussions は無効にする。Issue は有効のまま(更新の失敗通知と `/apply` が Issue で動く)。
5. ルールセットは、PR 必須に加えて **force push と削除を禁止**する。外部の人の Issue は、必要なら Close する(「要対応」の題名で作られても、`apply.yml` は作者が bot か所有者の Issue しか対象にしない)。迷惑な書き込みが増えたら、Settings → Moderation → Interaction limits で一時的に外部の書き込みを止められる。

**注意**: 定例の自動実行(schedule)は、リポジトリに60日間活動が無いと自動停止する。自動マージのコミット(週1回)が活動に数えられるので通常は止まらないが、停止の通知が来たらワークフローを手動で再有効化する。公式サイトの規約変更・運営からの要請があれば、`update.yml` の `schedule` を外して収集を止める(§4)。

## 14. 手動の調整 `npm run manual`
公式ニュースだけでは足りないときの手動の調整は、**`config/schedule/manual.json` の1ファイル**に集める(星墓の固定階層は §8 の `hakai.json`、毎月決まった日の項目は `monthly-days.json`)。

| 設定 | 内容 |
|---|---|
| `add` | 公式に無い項目をカレンダーに足す。`name`・`category`(`event`=クエスト / `campaign`=キャンペーン)・`start`・`end`(JST の `"YYYY-MM-DD HH:MM"`)・`group`(小見出し。省略可。クエストは `定例クエスト` など、キャンペーンは `config/display/order.json` の `groups.campaign` の語)・`note`(メモ)。**公式由来の項目と同じ扱い**(色や印の区別なし)。表示の判断(選択)の対象外で、常に表示する |
| `hide` | 項目を表示から外す。`id` は項目ID(例 `20261030_3#0`)か記事ID(例 `20261030_3`。その記事の全項目)。**データ(`data/articles`)は消さない**。メンテナンスにも効く。この行を消せば元に戻る。`note` に理由 |

項目IDは、更新PR・要対応Issueの記事リンク(`…/news/20261030_3.html` の `20261030_3`)から分かる。記事ID(日付_番号)で指定すれば、項目番号(`#0`)は要らない。

**編集の方法**(どれでも同じ結果。書式の誤りは `npm run check` と CI が検知する)
- **Actions の manual**(パソコンの環境が要らない): Actions → manual → Run workflow に入力すると、`manual.json` を更新する PR が作られ、検証が通れば自動でマージされて反映される。
- **コマンド**: `npm run manual -- add --name 名前 --category event --start "2024-01-01 00:00" --end "2026-12-31 23:59" --group 定例クエスト`、`npm run manual -- hide --id 20261030_3 --note 理由`、`remove --name 名前`、`unhide --id ID`、`list`。
- **JSON を直接編集**(GitHub の Web エディタでもよい)。

反映は main への変更後の `deploy.yml`(収集は不要)。常設・期間付きの `add` は、`end` を過ぎると表示されなくなるので、延長するときは `end` を直す。

## 15. 表示範囲と不要データの削除 `npm run prune`
- カレンダーの表示範囲は **`config/display/window.json`**(`past_months`=過去12、`future_months`=未来12。今日を基準)。公開サイトのデータ、画面の移動(< > とドラッグ。範囲の端で < > が無効になる)、`config/judge/selection/` の表が、この値を使う。変えるときはこの2つだけを直す。
- 表示範囲より前に終わった記事は、正本(`data/articles`)に残っていても画面には出ない。増えすぎたら **`npm run prune`**(既定は確認だけ。削除しない)で対象の件数と月別の内訳を見て、`npm run prune -- --apply` で削除する。基準の日を変えるときは `--before YYYY-MM-DD`。削除は PR にして、マージで反映する(git で戻せる)。**Actions の prune** からも同じことができる(パソコンの環境が要らない): Actions → prune → Run workflow。`apply` を付けないと確認だけ(件数と内訳が実行結果の概要に出る)。`apply` を付けると、削除の PR が作られ、検証が通れば自動でマージされて反映される。
- 対象は、最も遅い項目の終了(未定は開始。項目が無い記事は公開日)が基準の日より前の記事だけ。範囲の中まで続く記事は残る。判断の記憶(`decisions.json`)は変えない。
- 削除した古い記事は、`--since` で過去分を取り直すと再び入る。週1回の更新(最新2ページ)では入らない。

## 16. カレンダーの台帳 `config/judge/calendar/`
収集した項目を、**判定(表示 / 非表示 / 要判断)と理由**つきで月ごとの表(`YYYY/MM.md`)に出力している。**期間・内容・表示の判断の誤りを探す入口**で、表示する項目は画面と同じ順(期間・内容は修正後の値)、非表示・要判断の項目は各セクションの末尾に、表示名・期間(年付きJST)・内容・出どころ・修正・理由・**項目ID**・記事リンクが並ぶ。以前の `config/judge/selection/`(表示の判断の月別の表)は、この台帳に統合して廃止した。
- 表示の判断を直すときは、理由の列(判断の記憶 / ルール名)を見て、Issue の `/apply`・`decisions.json`・`rules.json`(§2.1)を直す。
- 期間や内容の誤りは、項目IDを控える(公式の項目は `20261030_3#0` の形)。項目を表示から外すのは `npm run manual -- hide --id ID`(§14)。期間や内容そのものの修正は、`npm run override`(§17)で直す。
- `npm run update`(週次の自動更新・manual・apply の各Actionsを含む)が毎回作り直す。編集しない。単独で作り直すときは `npm run ledger`(事前に `npm run update -- --no-collect` で `public/data` を作る)。
- 表示範囲(`config/display/window.json`)の月だけで、範囲外の月は消える。

## 17. 項目ごとの修正 `npm run override`
自動収集の期間・内容の誤りは、台帳(§16)で項目IDを調べて `config/schedule/overrides.json` で直す(各キーの意味は先頭の `_doc` と spec §4.11、**記入例は同じフォルダの `config/schedule/overrides.md`**)。公式の項目だけが対象。

| やりたいこと | コマンド例 |
|---|---|
| 期間を直す | `npm run override -- set --id 20261030_3#0 --start "2026-10-30 12:00" --end "2026-11-10 11:59" --note 理由` |
| 表示名を直す | `npm run override -- set --id 20261030_3#0 --name 名前` |
| セクション・小見出しを変える | `npm run override -- set --id ID --section campaign` / `--group 英雄の神殿` |
| 詳細に注記・ブロックを足す/隠す | `npm run override -- set --id ID --notes "メモ1\|メモ2" --add-block "補足=行1\|行2" --hide-blocks 見出し` |
| 取り消し・確認 | `unset --id ID`(`--field 項目名` でその項目だけ)/ `list` |

- 同じ項目IDへの `set` は追加(指定した項目だけが変わる)。直す前の公式の値(`was`)は自動で記録される。
- 公式の記事が後から変わって `was` と食い違うと、`npm run check`(週次の更新のログ)が警告する。公式が直ったなら `unset` で外す。
- 台帳に載る値は修正後で、「修正」列に直した項目が出る。台帳は次の `npm run update` で更新される(`npm run update -- --no-collect` で今すぐ反映)。
- セクションを増やすときは `config/display/order.json` の `sections` に足し、項目を `--section` で入れる。
- 反映は main への変更後の `deploy.yml`(収集は不要)。JSON を直接編集してもよい(書式の誤りは `npm run check` と CI が検知する)。
