import cors from 'cors'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  SLACK_AUTH_URL,
  SLACK_TOKEN_URL,
  SLACK_BOT_SCOPES,
  REDIRECT_URI,
} from './constants'
import {
  saveTokens,
  loadTokens,
  clearTokens,
  saveOAuthState,
  consumeOAuthState,
} from './db'
import { generateState } from './state'
import { startRefreshLoop } from './refresh'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_ID = process.env.SLACK_CLIENT_ID
const CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET
const PORT = 3000

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Error: SLACK_CLIENT_ID and SLACK_CLIENT_SECRET environment variables are required.'
  )
  process.exit(1)
}

const app = express()
app.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }))
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(path.join(__dirname, '..', 'dist')))
app.use(
  '/vendor/htmx',
  express.static(path.join(__dirname, '..', 'node_modules', 'htmx.org', 'dist'))
)
app.use(
  '/vendor/alpine',
  express.static(path.join(__dirname, '..', 'node_modules', 'alpinejs', 'dist'))
)
app.use(
  '/vendor/lucide',
  express.static(
    path.join(__dirname, '..', 'node_modules', 'lucide', 'dist', 'umd')
  )
)

interface SlackTokenResponse {
  ok: boolean
  error?: string
  access_token?: string
  scope?: string
  team?: { id: string; name: string }
  expires_in?: number
  refresh_token?: string
}

async function exchangeCodeForTokens(
  code: string
): Promise<SlackTokenResponse | null> {
  const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')

  const res = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${creds}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  })

  const data = (await res.json()) as SlackTokenResponse
  if (!data.ok) {
    console.error(`Token exchange failed: ${data.error ?? 'unknown error'}`)
    return null
  }
  return data
}

app.get('/', (_req, res) => {
  res.render('index', { tokens: loadTokens() })
})

app.post('/start', (_req, res) => {
  const state = generateState()
  saveOAuthState(state)

  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: REDIRECT_URI,
    scope: SLACK_BOT_SCOPES,
    state,
  })

  res
    .setHeader('HX-Redirect', `${SLACK_AUTH_URL}?${params.toString()}`)
    .sendStatus(204)
})

app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query

  if (error) {
    res.render('error', { message: `Authorization failed: ${error}` })
    return
  }

  if (typeof code !== 'string' || typeof state !== 'string') {
    res.render('error', { message: 'Missing code or state in callback.' })
    return
  }

  if (!consumeOAuthState(state)) {
    res.render('error', {
      message: 'Invalid or expired OAuth state. Please try again.',
    })
    return
  }

  const data = await exchangeCodeForTokens(code)
  if (!data?.access_token) {
    res.render('error', {
      message: 'Token exchange failed. Check server logs.',
    })
    return
  }

  saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    scope: data.scope ?? '',
    team_name: data.team?.name ?? 'Unknown workspace',
    expires_at: data.expires_in
      ? Math.floor(Date.now() / 1000) + data.expires_in
      : null,
  })

  startRefreshLoop()
  res.redirect('/')
})

// Matches the shape expected by getCredentials() in @screenly/edge-apps.
// Set screenly_oauth_tokens_url=http://localhost:3000/ in mock-data.yml.
app.get('/access_token/', (_req, res) => {
  const tokens = loadTokens()
  if (!tokens) {
    res
      .status(401)
      .json({ error: 'No token stored. Please authenticate first.' })
    return
  }
  res.json({
    token: tokens.access_token,
    metadata: { scope: tokens.scope, team: tokens.team_name },
  })
})

app.post('/clear', (_req, res) => {
  clearTokens()
  res.setHeader('HX-Redirect', '/').sendStatus(204)
})

app.listen(PORT, () => {
  console.log(`Mock server running at http://localhost:${PORT}`)
  startRefreshLoop()
})
