import { defineEventHandler } from 'h3'
import { noContent } from '../utils/response'
export default defineEventHandler(event => noContent(event))
