import cors from 'cors'
import express from 'express'
import type { RequestHandler } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  clearTokens,
  consumeOAuthState,
  loadTokens,
  saveOAuthState,
  saveTokens,
} from './db'
import {
  createAuthorizationUrl,
  exchangeCodeForTokens,
  toStoredTokens,
} from './oauth'
import { startRefreshLoop } from './refresh'
import { generateState } from './state'

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url))

function configureMiddleware(app: express.Express): void {
  app.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }))
  app.set('view engine', 'ejs')
  app.set('views', path.join(sourceDirectory, 'views'))
  app.use(express.static(path.join(sourceDirectory, '..', 'dist')))
  app.use(
    '/vendor/htmx',
    express.static(
      path.join(sourceDirectory, '..', 'node_modules', 'htmx.org', 'dist')
    )
  )
  app.use(
    '/vendor/alpine',
    express.static(
      path.join(sourceDirectory, '..', 'node_modules', 'alpinejs', 'dist')
    )
  )
  app.use(
    '/vendor/lucide',
    express.static(
      path.join(sourceDirectory, '..', 'node_modules', 'lucide', 'dist', 'umd')
    )
  )
}

function createStartHandler(clientId: string): RequestHandler {
  return (_req, res) => {
    const state = generateState()
    saveOAuthState(state)
    res.setHeader('HX-Redirect', createAuthorizationUrl(clientId, state))
    res.sendStatus(204)
  }
}

function validateCallbackQuery(
  query: Record<string, unknown>
): { code: string; state: string } | { error: string } {
  if (query.error) {
    return { error: `Authorization failed: ${query.error}` }
  }
  if (typeof query.code !== 'string' || typeof query.state !== 'string') {
    return { error: 'Missing code or state in callback.' }
  }
  if (!consumeOAuthState(query.state)) {
    return { error: 'Invalid or expired OAuth state. Please try again.' }
  }
  return { code: query.code, state: query.state }
}

function createCallbackHandler(
  clientId: string,
  clientSecret: string
): RequestHandler {
  return async (req, res) => {
    const callback = validateCallbackQuery(req.query)
    if ('error' in callback) {
      res.render('error', { message: callback.error })
      return
    }

    const response = await exchangeCodeForTokens(
      clientId,
      clientSecret,
      callback.code
    )
    const userAccessToken = response?.authed_user?.access_token
    if (!response || !userAccessToken) {
      res.render('error', {
        message: 'Token exchange failed. Check server logs.',
      })
      return
    }

    saveTokens(
      toStoredTokens({
        ...response,
        authed_user: { ...response.authed_user, access_token: userAccessToken },
      })
    )
    startRefreshLoop()
    res.redirect('/')
  }
}

const serveAccessToken: RequestHandler = (_req, res) => {
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
}

export function createApp(
  clientId: string,
  clientSecret: string
): express.Express {
  const app = express()
  configureMiddleware(app)

  app.get('/', (_req, res) => res.render('index', { tokens: loadTokens() }))
  app.post('/start', createStartHandler(clientId))
  app.get('/oauth/callback', createCallbackHandler(clientId, clientSecret))
  app.get('/access_token/', serveAccessToken)
  app.post('/clear', (_req, res) => {
    clearTokens()
    res.setHeader('HX-Redirect', '/').sendStatus(204)
  })

  return app
}
