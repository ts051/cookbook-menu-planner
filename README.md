# Cookbook Menu Planner

「ホットクックレシピ30選」から献立を選び、1週間のメニューと買い物リストを作る静的Webアプリです。GitHub Pagesで公開し、データ保存とログインはSupabaseを使います。

全30メニューをPDFの大項目ごとに写真付きで表示します。選んだ料理は日曜日から土曜日までの主菜・副菜・主食・汁物へ登録でき、週間メニューに必要な食材をチェック式の買い物リストへまとめます。初回起動またはユーザーの初回ログイン時に、30メニューをデフォルトデータとして自動登録します。

## ローカル確認

```powershell
cd C:\Users\masam\r_app\cookbook-menu-planner
node dev-server.mjs
```

Supabase未設定でもローカル保存で動作します。公開版では `supabase-config.js` の `REQUIRE_AUTH: true` を使い、ログイン済みユーザーだけがデータを読み書きできます。

## Supabase設定

1. SQL Editorで `supabase-schema.sql` を実行します。既存環境を更新する場合も、ラベル用テーブルと列を追加するため再実行してください。
2. Authentication > Providers > Emailで公開サインアップを無効にします。
3. Authentication > URL ConfigurationにGitHub PagesのURLを追加します。
4. `supabase-config.js` にProject URLとpublishable keyを設定します。

## ユーザー作成とログインID

公開ページからアカウント新規作成はできません。ユーザーはSupabase DashboardのAuthenticationで管理者が作成します。

ログイン画面ではメールアドレスではなく、ユーザー名とパスワードを入力します。最初のAuthユーザー作成時は、内部用メールとして `ユーザー名@cookbook.local` のようなアドレスを使えます。

ユーザー名を変更してもSupabase Authのメールアドレスは変更しません。アプリは `profiles.username` と `login_ids` テーブルでログインIDを管理するため、`s_cale` と同じように、ログイン用ユーザー名をAuthメールとは別に変更できます。

## GitHub Pages

このリポジトリは `main` ブランチのルートをGitHub Pagesで公開します。

公開URL:

https://ts051.github.io/cookbook-menu-planner/

## アカウント間の共有

ログインできる全アカウントで、レシピの食種登録・週間メニュー・買い物チェックを共有します。登録者は画面に表示しません。プロフィールとログイン設定は各アカウント専用です。表示中は約15秒ごとに共有データを確認し、タブ切り替え・画面復帰時にも更新します（入力・ダイアログ操作中は更新を待ちます）。メニューの「最新データを読み込む」でも更新できます。

既存環境の共有化には `supabase/migrations/20260915000000_share_cookbook.sql` を1回適用します。移行前データはAPIからアクセスできない `cookbook_backup` スキーマに保存します。同名レシピは食種登録のあるものを優先して統合し、献立の参照先を更新します。同じ日付・食種や買い物項目に重複がある場合は移行全体がロールバックされます。新規環境は更新済みの `supabase-schema.sql` を利用します。

検証: `node --test tests/shared-data.test.cjs`。データベース検証は移行SQLと `tests/shared-data.sql` を同一トランザクションで実行し、最後にROLLBACKします。
