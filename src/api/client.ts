import createClient from 'openapi-fetch'
import type { paths } from './schema.d.ts'

export const DEFAULT_SERVER_URL = 'http://localhost:50051'

export const client = createClient<paths>({ baseUrl: '/bmi' })
