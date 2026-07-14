import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import type { H3Event } from 'h3'

const credentials = { accessKeyId: 'local', secretAccessKey: 'local' }
let userClient: CognitoIdentityProviderClient | undefined
let adminClient: CognitoIdentityProviderClient | undefined
let clientKey = ''

function createClient(event: H3Event, admin: boolean) {
  const config = useRuntimeConfig(event)
  const client = new CognitoIdentityProviderClient({
    region: config.cognitoRegion,
    endpoint: config.cognitoEndpoint,
    credentials
  })

  if (admin) {
    if (!config.cognitoAdminToken) {
      throw createError({ statusCode: 500, statusMessage: 'NUXT_COGNITO_ADMIN_TOKEN が設定されていません。' })
    }
    client.middlewareStack.addRelativeTo(
      (next: (args: any) => Promise<any>) => async (args: any) => {
        const request = args.request as { headers: Record<string, string> }
        request.headers.authorization = `Bearer ${config.cognitoAdminToken}`
        return next(args)
      },
      {
        name: 'cognitoMockAdminTokenMiddleware',
        relation: 'after',
        toMiddleware: 'httpSigningMiddleware',
        override: true
      }
    )
  }
  return client
}

function clients(event: H3Event) {
  const config = useRuntimeConfig(event)
  const key = `${config.cognitoEndpoint}|${config.cognitoRegion}|${config.cognitoAdminToken}`
  if (key !== clientKey) {
    userClient?.destroy()
    adminClient?.destroy()
    userClient = createClient(event, false)
    adminClient = createClient(event, true)
    clientKey = key
  }
  return { user: userClient!, admin: adminClient! }
}

export function cognitoUserClient(event: H3Event) {
  return clients(event).user
}

export function cognitoAdminClient(event: H3Event) {
  return clients(event).admin
}

export function cognitoMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const value = error as { name?: string, message?: string }
    if (value.name === 'NotAuthorizedException') return 'ユーザー名またはパスワードが正しくありません。'
    if (value.name === 'UsernameExistsException') return '同じユーザー名またはメールアドレスが既に存在します。'
    if (value.name === 'InvalidPasswordException') return 'パスワードは8文字以上で入力してください。'
    if (value.name === 'UserNotFoundException') return 'ユーザーが見つかりません。'
    if (value.message) return value.message
  }
  return 'Cognito API の呼び出しに失敗しました。'
}
