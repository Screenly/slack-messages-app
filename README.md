# Slack Messages App

Displays recent messages from one or more Slack channels on your Screenly digital signage screens using the Slack Web API.

![Slack Messages App Preview](screenshots/feed-3840x2160.webp)

## Prerequisites

- [Bun](https://bun.sh/) 1.2.2+
- [Screenly CLI](https://developer.screenly.io/edge-apps/#getting-started)
- A Slack app with a bot token installed to your workspace (see below)

## Getting Started

Install dependencies:

```bash
bun install
```

## Development

```bash
bun run dev
```

This generates a `mock-data.yml` file (gitignored), starts the dev server, and starts a local CORS proxy on `http://127.0.0.1:8080`.

After `mock-data.yml` is generated, fill in your values under `settings`:

```yaml
settings:
  access_token: 'xoxb-your-bot-token'
  channel_ids: 'C0123ABCDEF,C0456GHIJKL'
  display_errors: 'false'
  message_limit: '10'
  refresh_interval: '60'
  show_sender_names: 'true'
```

## Building

```bash
bun run build
```

## Type Checking

```bash
bun run type-check
```

## Linting & Formatting

```bash
bun run lint
bun run format
```

## Testing

```bash
bun test
```

## Screenshots

```bash
bun run screenshots
```

This generates screenshots for all supported resolutions into the `screenshots/` directory using mocked Slack API data.

## Deployment

```bash
screenly edge-app create --name slack-messages-app --in-place
bun run deploy
screenly edge-app instance create
```

## Configuration

| Setting             | Type   | Required | Description                                                                                           |
| ------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------- |
| `access_token`      | secret | No       | For testing only. In production, the token is fetched dynamically via the API.                        |
| `channel_ids`       | string | Yes      | Comma-separated list of Slack channel IDs to display messages from                                    |
| `message_limit`     | string | No       | Max number of recent messages shown per channel. Default: `10`                                        |
| `refresh_interval`  | string | No       | How often (in seconds) to refresh Slack messages. Default: `60`                                       |
| `display_errors`    | string | No       | Display errors on screen for debugging (`true`/`false`). Default: `false`                             |
| `show_sender_names` | string | No       | Resolve and display each message's sender name (`true`/`false`). Default: `true`                      |
| `sentry_dsn`        | secret | No       | Sentry DSN for reporting credential and content-load errors. Global setting — leave empty to disable. |

## Authentication

This app reads a Slack bot token at runtime via `getCredentials()` (see `src/credentials.ts`). In production, Screenly's OAuth service is expected to supply this token for the `oauth:slack:access_token` setting.

**Note:** as of this writing, `Screenly/Screenly` does not yet have an OAuth handler wired up for `oauth:slack:access_token`, and the existing Slack integration scope only covers listing channels and posting messages (used for internal notifications) — not reading channel history. Widening the Slack OAuth scope and adding the missing handler is tracked separately as a backend task.

### Getting a bot token for local development

Unlike Salesforce or Google, Slack lets you obtain a bot token directly from the app dashboard without running a local OAuth server:

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app (from scratch) in your workspace.
2. Under **OAuth & Permissions**, add these Bot Token Scopes:
   - `channels:history` — read messages in public channels
   - `channels:read` — resolve channel names
   - `groups:history` — read messages in private channels (if needed)
   - `groups:read` — resolve private channel names (if needed)
   - `users:read` — resolve sender display names
3. Click **Install to Workspace** and authorize the app.
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`).
5. Invite the bot to each channel you want to display: `/invite @your-app-name` in Slack.
6. Set it as `access_token` in `mock-data.yml` (see above), or via:
   ```bash
   screenly edge-app setting set access_token=xoxb-your-bot-token
   ```

## Error Reporting

If `sentry_dsn` is set, the app reports credential and content-load failures to Sentry via `@screenly/edge-apps/utils`. Repeated credential-refresh failures (e.g. during the background token-refresh loop) are deduped so only the first consecutive failure is reported, not every retry. Leave `sentry_dsn` empty to disable reporting entirely.

## Finding Channel IDs

Open a channel in Slack, click its name, and scroll to the bottom of the "About" tab — the Channel ID is shown there (e.g. `C0123ABCDEF`). You can also right-click a channel and choose **Copy link**; the ID is the last path segment of the URL.

## Multiple Channels

Set `channel_ids` to a comma-separated list (e.g. `C0123ABCDEF,C0456GHIJKL`) to display messages from several channels side by side. Each channel renders as its own card; if a channel fails to load (e.g. the bot isn't a member), the remaining channels still render.
