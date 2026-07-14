import { GlobalSignOutCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoUserClient } from '../../utils/cognito'
import { assertSameOrigin, exampleSession } from '../../utils/session'

export default defineEventHandler(async event => {
  assertSameOrigin(event)
  const session = await exampleSession(event)
  if (session.data.accessToken) {
    await cognitoUserClient(event).send(new GlobalSignOutCommand({ AccessToken: session.data.accessToken })).catch(() => undefined)
  }
  await session.clear()
  return { authenticated: false as const }
})
