import { Database } from 'bun:sqlite'

const db = new Database('auth.db')

db.run(`
  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    scope TEXT NOT NULL,
    team_name TEXT NOT NULL,
    expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`)

// `auth.db` may already exist from before the user-token POC; add the new
// columns to it rather than requiring a fresh database.
for (const column of ['user_access_token', 'user_scope']) {
  try {
    db.run(`ALTER TABLE tokens ADD COLUMN ${column} TEXT`)
  } catch {
    // Column already exists.
  }
}

db.run(`
  CREATE TABLE IF NOT EXISTS oauth_state (
    id INTEGER PRIMARY KEY,
    state TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`)

export interface StoredTokens {
  access_token: string
  refresh_token: string | null
  scope: string
  team_name: string
  expires_at: number | null
  user_access_token: string | null
  user_scope: string | null
}

export function saveTokens(tokens: StoredTokens): void {
  db.run('DELETE FROM tokens')
  db.run(
    `INSERT INTO tokens
      (access_token, refresh_token, scope, team_name, expires_at, user_access_token, user_scope)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tokens.access_token,
      tokens.refresh_token,
      tokens.scope,
      tokens.team_name,
      tokens.expires_at,
      tokens.user_access_token,
      tokens.user_scope,
    ]
  )
}

export function loadTokens(): StoredTokens | null {
  return (
    db
      .query<StoredTokens, []>(
        `SELECT access_token, refresh_token, scope, team_name, expires_at,
          user_access_token, user_scope
          FROM tokens LIMIT 1`
      )
      .get() ?? null
  )
}

export function clearTokens(): void {
  db.run('DELETE FROM tokens')
}

export function saveOAuthState(state: string): void {
  db.run('DELETE FROM oauth_state')
  db.run('INSERT INTO oauth_state (state) VALUES (?)', [state])
}

// Validates the state against the one saved for the in-flight authorization
// request, then clears it so it can't be replayed.
export function consumeOAuthState(state: string): boolean {
  const row = db
    .query<{ state: string }, [string]>(
      'SELECT state FROM oauth_state WHERE state = ?'
    )
    .get(state)
  db.run('DELETE FROM oauth_state')
  return row !== null
}
