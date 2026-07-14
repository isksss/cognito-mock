export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  devServer: { port: 3001 },
  nitro: { preset: 'node-server' },
  runtimeConfig: {
    cognitoEndpoint: 'http://localhost:9999',
    cognitoRegion: 'ap-northeast-1',
    cognitoUserPoolId: 'ap-northeast-1_example',
    cognitoClientId: 'exampleclientid',
    cognitoAdminToken: '',
    sessionPassword: 'development-session-password-change-me',
    appUrl: 'http://localhost:3001',
    public: {
      cognitoUrl: 'http://localhost:9999'
    }
  },
  typescript: { strict: true }
})
