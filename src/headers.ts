/** Content-Security-Policy for every response. Mirrored in public/_headers and vercel.json; a test keeps them in sync. */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
