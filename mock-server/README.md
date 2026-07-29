# Mock Server

A local OAuth helper for the Slack Messages Edge App. It handles Slack's OAuth v2 authorization flow, stores the resulting user token in SQLite, and exposes it via an endpoint that mimics the Screenly OAuth service.

## Prerequisites

- [Bun](https://bun.sh/) 1.2+
- A [Slack app](https://api.slack.com/apps) (see below for setup)

## Setting Up a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app (from scratch), in whichever workspace you want to test with.
2. Under **OAuth & Permissions**, add `http://localhost:3000/oauth/callback` under **Redirect URLs** and save.
3. Under **OAuth & Permissions → Scopes → User Token Scopes** (not Bot Token Scopes), add:
   - `channels:history` — read messages in public channels
   - `channels:read` — resolve channel names
   - `groups:history` — read messages in private channels (if needed)
   - `groups:read` — resolve private channel names (if needed)
   - `users:read` — resolve sender display names

   A user token reads channels the authorizing user already belongs to, so there's no need to separately invite the app into each channel.

4. Under **Basic Information → App Credentials**, copy the **Client ID** and **Client Secret**.

## Getting Started

```bash
cp .env.example .env
```

Fill in your Slack app credentials in `.env`:

```
SLACK_CLIENT_ID=your_slack_client_id_here
SLACK_CLIENT_SECRET=your_slack_client_secret_here
```

Then install dependencies and start the server:

```bash
bun install
bun run dev
```

Open `http://localhost:3000` in a browser and click **Connect to Slack**.

## How It Works

1. The server redirects you to Slack's authorization page with the user scopes configured above.
2. You log in with your Slack credentials and authorize the app for a workspace.
3. Slack redirects back to `/oauth/callback` with an authorization code.
4. The server exchanges the code for a user token (`authed_user.access_token`) and stores the `access_token`, `scope`, and workspace name in a local SQLite database (`auth.db`). If your app has [token rotation](https://api.slack.com/authentication/rotation) enabled, the `refresh_token` and expiry are stored too, and the token is refreshed automatically in the background shortly before it expires. Without rotation (the default), Slack tokens don't expire, so no refresh loop runs.
5. The Edge App calls `GET /access_token/` to retrieve the current token at runtime.

## Endpoints

| Endpoint              | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| `GET /`               | UI showing auth status, token, and controls                     |
| `POST /start`         | Redirects to Slack's OAuth authorization page                   |
| `GET /oauth/callback` | Exchanges the authorization code for a user token               |
| `GET /access_token/`  | Returns `{ token, metadata: { scope, team } }` for the Edge App |
| `POST /clear`         | Clears the stored token                                         |

## Connecting to the Edge App

In `mock-data.yml` (at the repository root), set:

```yaml
settings:
  screenly_oauth_tokens_url: 'http://localhost:3000/'
```

The Edge App will call `GET /access_token/` on startup and whenever `getCredentials()` is invoked.

Since this uses a user token (see above), it has access to any channel the authorizing Slack user already belongs to — no separate step to invite the app into a channel is required.
