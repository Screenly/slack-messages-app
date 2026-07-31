export const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize'
export const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access'
export const SLACK_BOT_SCOPES =
  'channels:history,channels:read,groups:history,groups:read,users:read'
// Requested as `user_scope` so the OAuth response includes an `authed_user`
// token that inherits the authorizing person's own channel memberships —
// POC for reading channels without inviting the bot into each one.
export const SLACK_USER_SCOPES =
  'channels:history,channels:read,groups:history,groups:read,users:read'
export const REDIRECT_URI = 'http://localhost:3000/oauth/callback'
