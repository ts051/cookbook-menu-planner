# Cookbook Menu Planner

料理本の電子書籍から材料・行程を整理し、月間献立の提案と週間買い物リストを作る静的Webアプリです。GitHub Pagesで公開し、データ保存とログインはSupabaseを使います。

## ローカル確認

```powershell
cd C:\Users\masam\r_app\cookbook-menu-planner
node dev-server.mjs
```

Supabase未設定でもローカル保存で動作します。公開版では `supabase-config.js` の `REQUIRE_AUTH: true` を使い、ログイン済みユーザーだけがデータを読み書きできます。

## Supabase設定

1. SQL Editorで `supabase-schema.sql` を実行します。
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
