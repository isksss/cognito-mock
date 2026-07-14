import { createError, type H3Event, setResponseHeader, setResponseStatus } from 'h3'

export class CognitoError extends Error {
  statusCode: number
  statusMessage: string
  constructor(public code: string, message: string, public status = 400) {
    super(message)
    this.statusCode = status
    this.statusMessage = message
  }
}

export function cognitoError(code: string, message: string, status = 400): never {
  throw new CognitoError(code, message, status)
}

export function sendCognitoError(event: H3Event, error: unknown) {
  if (!(error instanceof CognitoError)) throw error
  setResponseStatus(event, error.status)
  setResponseHeader(event, 'content-type', 'application/x-amz-json-1.1')
  setResponseHeader(event, 'x-amzn-errortype', error.code)
  return { __type: error.code, message: error.message }
}

export function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}
