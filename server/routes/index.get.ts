import { defineEventHandler, sendRedirect } from 'h3'
export default defineEventHandler(event => sendRedirect(event, '/__cognito_mock', 302))
