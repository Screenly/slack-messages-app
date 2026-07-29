export const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize'
export const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access'
// User token scopes (not bot scopes): read as the authorizing user, so
// channel access follows their existing memberships instead of requiring a
// separate bot install/invite per channel.
export const SLACK_USER_SCOPES =
  'channels:history,channels:read,groups:history,groups:read,users:read'
export const REDIRECT_URI = 'http://localhost:3000/oauth/callback'
