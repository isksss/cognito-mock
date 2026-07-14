# Nuxt ユーザー管理サンプル

cognito-mock を認証基盤として使用する Nuxt 4 + Nuxt UI のサンプルです。

## 起動

リポジトリのルートで実行します。

```bash
mise install
mise run compose
```

ブラウザで `http://localhost:3001` を開きます。

| 項目 | 値 |
|---|---|
| ユーザー名 | `developer@example.com` |
| パスワード | `Password123!` |
| cognito-mock | `http://localhost:9999` |
| サンプルアプリ | `http://localhost:3001` |

ログイン画面では、AWS SDK v3 の `USER_PASSWORD_AUTH` と Managed Login の Authorization Code + PKCE を選択できます。

## 管理機能

- ユーザー一覧・検索・作成・削除
- メールアドレスと表示名の更新
- ユーザーの有効化・無効化
- 恒久パスワード・仮パスワードの設定
- `NEW_PASSWORD_REQUIRED` の処理
- グループ所属の追加・解除

管理APIはログインユーザーが `admins` グループに所属することを毎回確認します。cognito-mock の `ADMIN_TOKEN` はNuxtサーバーだけが保持し、ブラウザには送信しません。

## ローカル開発

ルートの `mise.toml` がサービス本体とサンプルの Node.js 24.18.0、pnpm 11.11.0 を統一します。

```bash
mise install
mise run install
mise run dev
```

必要に応じて環境変数を設定します。

| 環境変数 | 既定値 |
|---|---|
| `NUXT_COGNITO_ENDPOINT` | `http://localhost:9999` |
| `NUXT_PUBLIC_COGNITO_URL` | `http://localhost:9999` |
| `NUXT_APP_URL` | `http://localhost:3001` |
| `NUXT_COGNITO_REGION` | `ap-northeast-1` |
| `NUXT_COGNITO_USER_POOL_ID` | `ap-northeast-1_example` |
| `NUXT_COGNITO_CLIENT_ID` | `exampleclientid` |
| `NUXT_COGNITO_ADMIN_TOKEN` | 必須 |
| `NUXT_SESSION_PASSWORD` | 32文字以上を推奨 |

## テスト

```bash
mise run check
mise run e2e
```

`test:e2e` は Docker Compose で実際の cognito-mock とサンプルアプリを起動し、Chromiumで次を検証します。

- 未認証、非 `admins` ユーザー、不正なOAuth stateの拒否
- ID・パスワード認証と Managed Login + PKCE
- ユーザー作成、属性更新、有効化・無効化
- グループ追加・解除
- 仮パスワードと初回パスワード変更
- ユーザー削除
