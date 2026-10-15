# 切り花店 EC + 在庫管理（Stage 2.1 / 写真・花束実例デモ）

前回のHTMLデモを、**Cloudflare Workers + D1 (SQLite)** に対応させた版。既存UIを再利用し、React等への書き直しは行っていない。プレビューを早く確認するための構成。

## いま動くこと

- 切り花単品と、花材・本数・包装を選ぶ花束のカート
- 商品・価格・在庫の閲覧
- デモ注文をサーバーに保存（決済なし、体験用キー必須）
- 商品登録、価格変更、商品公開切替、仕入れ、店頭販売、廃棄・調整
- スマホ・タブレット・PCの複数ブラウザから同じ商品・在庫・注文を参照
- 注文取消時の在庫復元、重複取消防止
- 仕入れや商品登録時の撮影・写真の保存（R2）
- 完成した花束の写真・花材・本数・包装を実例として登録
- EC注文の制作完了時に花束の完成写真を登録すると、注文内の花束ごとに構成データと一緒に最近の花束へ自動登録（単品注文は写真不要）
- 顧客が実例から花束を呼び出してカスタマイズ
- 注文時の価格再計算、在庫不足時の全処理ロールバック

> **本番環境ではない**：決済、正規スタッフアカウント、注文通知、個人情報保護の運用は未対応。実在の顧客情報を入力しないこと。一般顧客向けの注文受付には使用しないこと。

## 事前準備

- PCにNode.js 22以上とnpm
- Cloudflareの無料アカウント（リモート公開時）
- ターミナル（macOS / Windows PowerShell / Linux）

## 1. PC内で動かす

```bash
cd flower_shop_stage2_images
npm install
cp .dev.vars.example .dev.vars
# .dev.vars をエディタで開き、DEMO_KEY の値を任意の長いキーに変更
npm run db:local
npm run dev
```

Windows PowerShellの場合は `cp` を `Copy-Item` に置き換えられる。

ブラウザでターミナルに表示されたローカルURL（通常 `http://localhost:8787`）を開く。

店舗管理 → 体験用キー入力 → 管理画面を開く。テスト注文をする際にもキー入力済みのブラウザを使う。

## 2. CloudflareでURLを発行する

```bash
npx wrangler login
npx wrangler d1 create flower-shop-demo
npx wrangler r2 bucket create flower-shop-photos
```

データベースをCloudflareの画面から作成済みなら再作成は不要です。R2を初めて利用するときはサブスクリプションの有効化（課金情報登録）が必要になる場合があります。

表示される `database_id` を **wrangler.jsonc** 内の `database_id`（最初は `00000000-0000-4000-8000-000000000000`）へ貼り付ける。

```bash
npm run db:remote
npm run deploy
npx wrangler secret put DEMO_KEY
```

最後のコマンドには、体験用の長いキーを入力する。公開用のキーは `.dev.vars` と同じでもよいが、絶対にGitHubやHTMLへ記載しない。

表示された `https://...workers.dev` が共有用URL。**URLの発行自体はCloudflareへのログイン・デプロイ操作が必要で、このZIPにURLは含まれていない。**

画面は公開されるが、管理APIとテスト注文APIは体験用キーで保護される。知人には公開URLと体験用キーを**別々に**伝える。利用開始前にテスト用の仮情報だけを使うことを徹底する。

## 3. 試してほしい動作

1. ブラウザAで店舗管理 → 赤バラを10本仕入れ登録
2. ブラウザBで花束を作成 → 赤バラ3本と包装を選択 → 値段が変わる
3. ブラウザBの店舗管理で同じ体験用キーを入力し、カートからテスト注文
4. ブラウザAで「データを再取得」→ 商品在庫と注文が更新
5. 店舗管理でテスト注文を取消 → 在庫が復元
6. 店頭販売・廃棄を入力 → 在庫数が変化

異なるブラウザに新しい在庫が反映されるのは **画面を再読み込み、または「データを再取得」したとき**。リアルタイムのプッシュ同期は未実装。

## 4. 開発上の仕様

- `public/index.html`：既存HTML UIをAPI接続に変更したもの。単独で開いてもAPIがないため動作しない。
- `src/worker.js`：Cloudflare Workers API（追加依存なし）
- `migrations/0001_init.sql`：D1テーブルと仮商品、取消時の在庫復元トリガー
- `migrations/0002_images_bouquets.sql`：写真と花束実例のテーブル
- `wrangler.jsonc`：Workers + D1 + R2の接続設定
- `tests/`：Node.jsの動作テスト

### 在庫ロジック

- 在庫は商品SKUごとの**合計本数**。
- 仕入れ履歴と原価を別の入出庫履歴に保存。入荷ロットの割当、先入れ先出しはしない。
- 花束の価格（仮）：**花材小売価格合計 + 包装代 + 制作料500円**。
- 注文処理はD1のトランザクション `batch()` を使う。在庫不足ではSQL `CHECK (stock >= 0)` が失敗し、処理全体を取り消す。
- 注文取消はSQLトリガーが在庫を復元するので、二重取消による二重加算を防止する。
- 今は決済と無関係な**テスト注文**でのみ在庫を減らす。本番はオンライン決済成功時の処理と在庫確保を別途設計する。

### Stage 3に残してあること

1. 現行決済事業者名を確認 → 公式のオンライン決済APIに接続
2. 店舗管理ログインを正式な認証へ変更（2〜3名のスタッフ）
3. 写真の削除・整理、包装画像等の拡張
4. 注文メール等、通知方法の決定
5. 価格ルールの差替え、配送・受取の最低限の制約設定
6. 実商品データの登録、運用テスト、本番公開準備

## 5. スマホでGitHub → Cloudflare公開

1. GitHubにはZIPではなく、フォルダ構成のままソースを登録する。
2. `wrangler.jsonc` の `database_id` を実際のD1 UUIDに置換する。
3. Cloudflare D1の Console で `migrations/0001_init.sql` → `migrations/0002_images_bouquets.sql` の内容を順番に実行する。
4. R2 Object Storageで `flower-shop-photos` バケットを作る。
5. Cloudflare Workers & Pages → Create application → Import a repository からGitHubに接続し、Deploy commandは `npx wrangler deploy` とする。
6. Workerの Variables and Secrets に `DEMO_KEY` をSecretとして追加する。

Stage 1の公開サイトは残し、新しいWorkerとしてデプロイする。現時点では決済・正式な認証がないため、実在の顧客情報を取り扱わない。

## 6. テスト

Node.js 22以上では外部ライブラリ不要で以下を実行できる。

```bash
node tests/test-api.mjs
node tests/test-frontend.mjs
```

`test-api.mjs` はNodeの実験的な `node:sqlite` を使用。SQLite上でAPI主要ロジックを検証するもので、Cloudflare実環境でのデプロイ確認とは別。

## セキュリティと運用上の注意

- Stage 2の `DEMO_KEY` は**一時的な共有デモ用**。本番のスタッフ認証の代替にはしない。
- デモキーを知る人は同じテストデータを編集できる。
- 体験用キーはGit管理しない（`.dev.vars` は `.gitignore` 対象）。
- 実際のカード情報は入力・保存しない。決済は決済事業者の安全な画面/APIへ移譲する。
- 本番では決済済み注文と在庫を整合させるトランザクション、Webhook署名検証、再試行・二重処理防止、バックアップ、実データの取扱いが必要。
- 無料枠はCloudflareの利用条件と使用量に依存する。
## Stage 2.2：完成写真の自動登録

- EC注文 → 制作中 → 完成写真を選択 → 完了。花束が複数ある場合は各花束の写真を登録します。
- 写真はR2へ、花材・本数・包装と注文との紐付けはD1へ保存します。
- 完成例の登録では在庫数を変更しません。注文確定時の在庫減算のみが適用されます。
- 店頭・電話注文で作った花束は、従来どおり「完成花束の登録」で手動追加します。
- 追加マイグレーションは `migrations/0003_completed_bouquets.sql`。既存DBにも適用済みです。
- 撮影前に画面を離れる場合、注文は制作中のままなので、あとから写真を登録できます。


## Stage 3A（別Workerの開発デモ）
新しいWorker名: `flower-shop-stage3a-demo`。既存のStage 2.2 Workerを残し、同じD1・R2を参照します。

- 招待キーを入力してテスト用の会員・スタッフアカウントを登録。各人が別のパスワードでログインします。
- セッションはSecure / HttpOnly / SameSite=Lax Cookieを使用。DBにはセッショントークンのハッシュを保存します。
- スタッフのみが在庫変更・画像アップロード・注文管理にアクセスできます。
- 会員には自分の模擬注文履歴だけを表示します。ゲストは招待キーを使った模擬注文ができます。
- 現在の受取方法は店頭受取、日時入力に対応。制作完了と完成写真の自動登録に加え引渡し済みの記録があります。
- `migrations/0004_accounts.sql` を既存D1へ適用したうえで利用します。

**本番ではない**: メールアドレス確認、パスワードリセット、登録・ログインの悪用対策、監査、支払の認証、注文通知、法務/個人情報保護の対処は後続作業。実在の個人情報や常用パスワードを登録しないこと。オンライン決済は未接続で、在庫が動く注文も模擬注文に限ります。


## Stage 3B — accepted v0.2 storefront (development preview)

Deployed at: https://flower-shop-stage3b-demo.rgmgmt05.workers.dev/

- Customer home: `/`; shop `/?view=catalog`, examples `/?view=examples`, bouquet builder `/?view=builder`, cart `/?view=cart`, account `/?view=account`.
- Staff: `/staff` (separate HTML, not in the customer navigation; staff API authorization remains mandatory).
- Design starting point: Take You accepted wireframe `take_you_home_wireframe_v02.html`; keep 90px/82px header and fixed full-viewport placeholder background. Video asset is *not* supplied yet.
- Catalog, stock, image assets, finished bouquets, order creation and account history use the Stage 3A Worker + shared D1/R2 API. Staff retains inventory/stock, photos and order processing.
- Unconfirmed copy remains `ここにテキストを入力`; no invented sales slogans are shipped.
- All orders are test orders. Guest checkout requires a demo invitation key, staff/customer creation requires the same private key, and checkout does **not** perform payment. An order does change shared demo inventory.
- Demo inventory, photos and accounts are shared with the previous stage; separate Worker URL does not mean separate data.
- Source: `public/index.html`, `public/storefront.css`, `public/storefront.js`, `public/staff.html`. `src/worker.js` serves `/staff`.
- Automated tests: `node --check public/storefront.js`, `node --experimental-sqlite tests/test-api.mjs`, `node tests/test-stage3b.mjs`. Results in GitHub Actions.
- Browser smoke checks verified 390px mobile header 82px, hero 844px, client page has no staff nav, six catalog products are returned and rendered, `/staff` serves a distinct management HTML.
- Not production ready: full authentication security, email verification, real customer data handling, payment provider integration and notifications are pending. The video background is currently a static placeholder.


## Stage 3C — staff POS, same system with a separate cashier UI

- Customer site: `/`; inventory/order admin: `/staff`; cashier: `/pos`.
- One Cloudflare Worker and one shared D1 database. The cashier and management pages are distinct workflows, not independent inventory systems.
- Cashier supports loose flowers by SKU/quantity, and ad-hoc bouquets by flower SKUs/quantities with an **independent manually entered sale price**. Wrap choice is stored in the bouquet receipt.
- An entire sale (receipt, each SKU stock decrement, and correlated movement records) is committed in a single D1 `batch()` transaction. Invalid/insufficient stock rolls it back. A unique `request_id` makes retries idempotent.
- Cash and externally verified payments are manually marked confirmed by staff. This does not collect or process payment with a provider.
- Stage 3C adds `migrations/0005_pos.sql`; `public/pos.html`, `public/pos.css`, `public/pos.js`. Staff APIs `GET/POST /api/pos/sales` require staff role.
- Test data are shared with the previous stages; demo sale *actually reduces the demo inventory*. Never use the production shop's real amounts or customer details.
- Pre-assembled bouquets that consumed inventory before sale will need their own "prepare finished goods" flow: do not subtract the constituent flowers again at POS. This first POS model covers bouquets assembled at the time of checkout and loose flowers.
- Before real use: cash received/change, receipts and tax configuration, refunds/void, end-of-day closure, accounting exports, offline mode, production-grade staff identity, and optional card-terminal integration remain unimplemented.

## Stage 3C UX: high-quantity POS + polished staff portal

Preview: https://flower-shop-stage3c-ux-demo.rgmgmt05.workers.dev/
- `/pos`: direct quantity fields for multiple cut-flower SKUs; batch add, immediate batch subtotal, editable cart quantities. In the bouquet builder choose materials per bouquet, an editable sale price and an integer number of identical bouquets. Material quantities and receipt totals multiply correctly.
- `/staff`: restrained management UI and cohesive header design, including explicitly styled navigation links instead of blue browser defaults.
- `src/worker.js` computes totals and material consumption on the server, applies them in D1 atomic batches and deduplicates by sale request ID. Previous inventory and API models remain shared.
- Automated tests: `tests/test-pos.mjs` executes bulk cashier interactions, `tests/test-api.mjs` verifies 10 identical bouquets and transactional inventory deduction. GitHub Actions `stage3c-pos-ux.yml`.
- This preview and previous Stage 3C are different Workers pointing to the same development database. It is not live payment processing; cashier staff must independently confirm receiving cash or processing payment outside this system.
- Background video and customer site are unchanged. Do not use actual customer information in the demo.

## Stage 3C POS-native layout — mobile product selection and receipt

Preview: https://flower-shop-stage3c-pos-demo.rgmgmt05.workers.dev/pos

Layout based on official Airレジ, Square POS, Shopify POS, and Loyverse workflow references rather than a custom all-rows quantity table:
- Mobile (<761px): compact 2-column item tiles, `よく使う / 切り花 / 花束をつくる` modes, search and *quantity-before-product* presets (1, 5, 10 or manually entered). Tapping a tile adds that number immediately; each selected tile displays the quantity and SKU subtotal.
- Persistent mobile footer displays **current order** quantities and total. It opens a full-screen receipt sheet with editable line quantity, delete, payment confirmation and staff-only checkout. A draft bouquet is explicitly marked as *not yet added* in the footer.
- Tablet/PC: product selection and receipt are simultaneous adjacent panes.
- Favorite SKUs are saved in localStorage, first four active items initially pinned when there is no saved preference. This is per browser/device, not shared staff data.
- Bespoke bouquet builder remains separate: each material and quantity per bouquet, optional wrapping, independently specified sale price and quantity of identical bouquets.
- POS APIs and inventory transactions remain from Stage 3C and require staff authentication. Sales on this development preview deduct **shared demo** inventory; payment collection itself is still external/manual. Earlier demos have not been modified.
- Tests: Node vm POS interface checks, live inventory API tests including multiplication for 10 bouquets, Stage 3B regression and Cloudflare mobile browser inspections.
- Actual login with a specific staff account, live card payments, receipt printing and fiscal workflows require separate end-to-end/production validation.
