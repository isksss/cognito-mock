export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  nitro: {
    preset: 'node-server',
    experimental: { database: false }
  },
  runtimeConfig: {
    databasePath: process.env.DATABASE_PATH || './data/cognito-mock.sqlite',
    publicUrl: process.env.PUBLIC_URL || '',
    mockMode: process.env.COGNITO_MOCK_MODE || 'permissive',
    allowedOrigins: process.env.ALLOWED_ORIGINS || '',
    allowedCallbackHosts: process.env.ALLOWED_CALLBACK_HOSTS || '',
    adminToken: process.env.ADMIN_TOKEN || '',
    logCodes: process.env.LOG_CODES !== 'false'
  },
  typescript: { strict: true }
})
