# Slack Messages App

Displays the latest message from a Slack channel, full screen, on your Screenly digital signage screens using the Slack Web API. Built for sharing announcements — for example, a private channel dedicated to a set of screens — rather than following high-traffic channels. The channel itself is never shown on screen — only the message text, and optionally its sender's name and a QR code linking back to it on Slack.

![Slack Messages App Preview](screenshots/message-3840x2160.webp)

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

For local development without pasting a bot token by hand, use the [mock-server](mock-server/README.md). It simulates the Screenly OAuth service by running a local OAuth v2 flow against Slack and serving the resulting bot token to the Edge App.

After `mock-data.yml` is generated, fill in your values under `settings`:

```yaml
settings:
  access_token: 'xoxb-your-bot-token'
  channel_id: 'C0123ABCDEF'
  display_errors: 'false'
  override_locale: 'en'
  override_timezone: ''
  refresh_interval: '60'
  show_qr_code: 'true'
  show_sender_names: 'true'
```

Or, if using the `mock-server`, set `screenly_oauth_tokens_url: 'http://localhost:3000/'` instead of `access_token`.

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

| Setting             | Type   | Required | Description                                                                                                                                                                                   |
| ------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `access_token`      | secret | No       | For testing only. In production, the token is fetched dynamically via the API.                                                                                                                |
| `channel_id`        | string | Yes      | Slack channel ID to display messages from                                                                                                                                                     |
| `refresh_interval`  | string | No       | How often (in seconds) to refresh Slack messages. Default: `60`                                                                                                                               |
| `display_errors`    | string | No       | Display errors on screen for debugging (`true`/`false`). Default: `false`. Advanced.                                                                                                          |
| `override_locale`   | string | No       | Override locale with a [BCP 47](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl#locales_argument) tag (e.g. `en`, `fr`, `de`). Default: `en`. Advanced. |
| `override_timezone` | string | No       | Override timezone with an [IANA time zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) (e.g. `Europe/London`). Defaults to the device timezone if blank. Advanced.          |
| `show_qr_code`      | string | No       | Show a QR code linking to the message on Slack (`true`/`false`). Default: `true`                                                                                                              |
| `show_sender_names` | string | No       | Resolve and display each message's sender name (`true`/`false`). Default: `true`                                                                                                              |
| `sentry_dsn`        | secret | No       | Sentry DSN for reporting credential and content-load errors. Global setting — leave empty to disable.                                                                                         |

`override_locale` and `override_timezone` apply to both the header clock/date and the Slack message timestamp, so they stay on the same clock. Leave `override_timezone` blank to use the screen's location. The header shows the current time; the card shows when that message was sent.

## Authentication

This app reads a Slack bot token at runtime via `getCredentials()` (see `src/credentials.ts`). In production, Screenly's OAuth service supplies this token for the `oauth:slack:access_token` setting, using the org's existing Slack integration.

### Getting a bot token for local development

Slack lets you obtain a bot token directly from the app dashboard without running a local OAuth server, which is the quickest option for a one-off test:

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

Alternatively, use the [mock-server](mock-server/README.md) to go through the actual OAuth v2 authorize-and-exchange flow locally — closer to how production works.

## Error Reporting

If `sentry_dsn` is set, the app reports credential and content-load failures to Sentry via `@screenly/edge-apps/utils`. Repeated credential-refresh failures (e.g. during the background token-refresh loop) are deduped so only the first consecutive failure is reported, not every retry. Leave `sentry_dsn` empty to disable reporting entirely.

## Finding a Channel ID

In the Screenly web console, once the Slack integration is connected, `channel_id` renders as a dropdown listing your workspace's channels by name — just pick one, no need to know its raw ID.

For local development (`mock-data.yml` or the CLI), you still set the raw ID directly: open a channel in Slack, click its name, and scroll to the bottom of the "About" tab — the Channel ID is shown there (e.g. `C0123ABCDEF`). You can also right-click a channel and choose **Copy link**; the ID is the last path segment of the URL. Only one channel can be configured at a time.
