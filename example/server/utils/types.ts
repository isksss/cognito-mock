export interface SessionData {
  accessToken?: string
  refreshToken?: string
  username?: string
  authenticatedAt?: number
  pendingChallenge?: {
    username: string
    session: string
  }
  oauth?: {
    state: string
    verifier: string
    createdAt: number
  }
}

export interface ExampleUser {
  username: string
  email: string
  name: string
  enabled: boolean
  status: string
  createdAt?: Date
  updatedAt?: Date
  groups: string[]
}
