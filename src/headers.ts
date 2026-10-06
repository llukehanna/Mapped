/**
 * Content-Security-Policy for every response. Mirrored in public/_headers and vercel.json; a test keeps them in sync.
 * The cloudflareinsights origins allow the Cloudflare Web Analytics beacon the lukeghanna.com zone injects.
 */
export const CSP =
  "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
