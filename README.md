# Cookbook Menu Planner

GitHub Pages + Supabaseで公開できる、料理本レシピDB、月間献立、週間買い物リストの静的Webアプリです。

## ローカル確認

`index.html` をブラウザで開くと、Supabase未設定のままローカル保存で動きます。

PowerShellで簡易サーバーを使う場合:

```powershell
cd C:\Users\masam\r_app\cookbook-menu-planner
node dev-server.mjs
```

## Supabase設定

1. Supabaseで新規プロジェクトを作成します。
2. SQL Editorで `supabase-schema.sql` を実行します。
3. Authentication > URL Configuration でGitHub PagesのURLを許可します。
4. `supabase-config.js` にProject URLとanon public keyを入れてpushします。

anon public keyはブラウザに公開される前提のキーです。データ保護は `supabase-schema.sql` のRLSで行います。

```js
window.COOKBOOK_APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_ID.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
  REQUIRE_AUTH: true
};
```

anon keyはブラウザに公開されます。公開アプリでは `REQUIRE_AUTH: true` のまま使い、`supabase-schema.sql` のRLSを有効にしてください。

## GitHub Pages

このリポジトリは `main` ブランチのルートをGitHub Pagesで公開します。

GitHub側の設定:

1. Settings > Pages を開きます。
2. Build and deployment の Source を `Deploy from a branch` にします。
3. Branch を `main`、folder を `/ (root)` にします。

このアプリはビルド不要の静的ファイル構成です。
