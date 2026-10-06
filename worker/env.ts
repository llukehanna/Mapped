/** The slice of the D1 client API the Worker uses. Declared here so the app keeps a single tsconfig with DOM types. */
export interface D1Result<T> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]>;
}

export interface Env {
  DB: D1Database;
  /** HMAC key for session tokens, claim tokens and IP hashes (secret) */
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  /** secret */
  GOOGLE_CLIENT_SECRET: string;
  /** 'fake' skips Google for local end-to-end tests; refused on any host but localhost */
  AUTH_MODE: 'google' | 'fake';
}
