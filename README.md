# cognito-mock

開発用のAmazon Cognito User Pools / Managed Loginモックです。Nuxt 4とNitroで、画面、OAuth/OIDC、AWS JSON API、管理画面を単一URLから提供します。

## 起動

```bash
docker run --rm -p 9999:9999 -v cognito-data:/data ghcr.io/isksss/cognito-mock:latest
```

- Managed Login: `http://localhost:9999/oauth2/authorize`
- AWS SDK endpoint: `http://localhost:9999`
- OIDC issuer: `http://localhost:9999/{userPoolId}`
- 管理画面: `http://localhost:9999/__cognito_mock`
- Health check: `http://localhost:9999/health`

既定の`permissive`モードでは、未知のPool IDとClient IDを自動作成します。loopbackのCallback URLとoriginも自動登録されます。

## OAuth / Managed Login

```text
http://localhost:9999/oauth2/authorize?response_type=code&client_id=my-client&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fcallback&scope=openid%20email%20profile&code_challenge=...&code_challenge_method=S256
```

Token交換先は`http://localhost:9999/oauth2/token`です。Code + PKCE、Refresh、Revoke、UserInfo、Logoutに対応しています。

## AWS SDK v3

```ts
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'

const cognito = new CognitoIdentityProviderClient({
  region: 'ap-northeast-1',
  endpoint: 'http://localhost:9999',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
})

await cognito.send(new InitiateAuthCommand({
  ClientId: 'my-client',
  AuthFlow: 'USER_PASSWORD_AUTH',
  AuthParameters: { USERNAME: 'developer@example.com', PASSWORD: 'Password123!' }
}))
```

AWS CLIでは各コマンドへ`--endpoint-url http://localhost:9999`を追加します。

## Amplify

既存の`userPoolId`と`userPoolClientId`を維持し、User Pools APIとOAuth domainをモックへ向けます。

```ts
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'ap-northeast-1_example',
      userPoolClientId: 'my-client',
      userPoolEndpoint: 'http://localhost:9999',
      loginWith: {
        oauth: {
          domain: 'localhost:9999',
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: ['http://localhost:3001/callback'],
          redirectSignOut: ['http://localhost:3001'],
          responseType: 'code'
        }
      }
    }
  }
})
```

## クロスオリジン

`localhost`、`127.0.0.1`、`[::1]`はポートを問わず既定で許可されます。追加originはカンマ区切りで指定します。

```bash
docker run --rm -p 9999:9999 \
  -e ALLOWED_ORIGINS=https://app.example.test \
  -e ALLOWED_CALLBACK_HOSTS=app.example.test \
  ghcr.io/isksss/cognito-mock:latest
```

プリフライトと`Authorization`、`X-Amz-Target`、`X-Amz-Date`、`X-Amz-Security-Token`に対応しています。拒否されたoriginは管理画面のCORSタブで確認できます。

## YAML初期データ

設定ファイルをマウントするDocker Compose例です。

```yaml
services:
  cognito-mock:
    image: ghcr.io/isksss/cognito-mock:latest
    ports:
      - "9999:9999"
    environment:
      PUBLIC_URL: http://localhost:9999
      CONFIG_PATH: /config/cognito-mock.yml
    volumes:
      - ./examples/cognito-mock.yml:/config/cognito-mock.yml:ro
```

```bash
docker compose up --build
```

構成例は[`examples/cognito-mock.yml`](examples/cognito-mock.yml)です。`CONFIG_PATH`で指定したファイルを起動時に冪等upsertします。

## 環境変数

| 変数 | 既定値 | 用途 |
|---|---|---|
| `COGNITO_MOCK_MODE` | `permissive` | `strict`では未知のID・URLを拒否 |
| `PUBLIC_URL` | リクエストorigin | JWT issuerと公開URL |
| `DATABASE_PATH` | `./data/cognito-mock.sqlite` | SQLiteファイル |
| `CONFIG_PATH` | 未設定 | 初期化YAML |
| `ADMIN_TOKEN` | 未設定 | 管理APIのBearer token |
| `ALLOWED_ORIGINS` | loopback | 追加CORS origin |
| `ALLOWED_CALLBACK_HOSTS` | loopback | Callback自動学習対象 |
| `LOG_CODES` | `true` | 確認コードの標準出力 |
| `PORT` | `9999` | 待受ポート |

## 対応範囲

- User Pool / App Client CRUD
- SignUp、確認、再送、Forgot Password
- USER_SRP_AUTH、USER_PASSWORD_AUTH、ADMIN_USER_PASSWORD_AUTH、Refresh、NEW_PASSWORD_REQUIRED
- User/Admin User、属性、Group操作
- Code + PKCE、JWT RS256、JWKS、UserInfo、Revoke、Logout

MFA、Device、WebAuthn、外部IdP、Lambda trigger、Identity Pool、Implicit、Client Credentialsは対象外です。

## 開発

Node.js 24とpnpm 11を使用します。

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

テストはVitestで実行します。

```bash
pnpm test:unit
pnpm test:integration
```

- ユニット: パスワード、SQLite、strict/permissive、CORS判定、JWT/JWKS、失効、SRP証明
- 統合: 実際のNitroサーバーに対するAWS JSON API、CORS、Managed Login、Code + PKCE、Refresh、Revoke、UserInfo

`vX.Y.Z`タグをpushすると、amd64/arm64イメージをGitHub Container Registryへ公開します。初回公開後、GitHub Packages設定で可視性をPublicへ変更してください。
