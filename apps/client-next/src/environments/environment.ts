export const environment = {
  production: false,
  oidc: {
    oidcUrl: 'http://localhost:3000',
    // Empty: `pnpm dev` pre-fills the login with the client of the repository .env through
    // .dev/env.js (scripts/write-dev-env.mjs), so no secret is written here.
    clientId: '',
    clientSecret: '',
  },
  api: {
    baseUrl: 'http://localhost:3000',
  },
};
