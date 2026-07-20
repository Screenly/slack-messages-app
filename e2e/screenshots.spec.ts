import { test, type Browser } from '@playwright/test'
import {
  createMockScreenlyForScreenshots,
  FIXED_SCREENSHOT_DATE,
  getScreenshotsDir,
  RESOLUTIONS,
  setupClockMock,
  setupScreenlyJsMock,
} from '@screenly/edge-apps/test/screenshots'
import path from 'path'

const MOCK_CHANNEL_IDS = 'C0123ABCDEF,C0456GHIJKL'

const MOCK_CREDENTIALS = {
  token: 'mock-access-token',
  metadata: {},
}

function mockMessage(channelId: string) {
  return {
    ts: '1750000000.000100',
    user: `U${channelId}`,
    text: "Hi everyone! We're running a training session next Tuesday at 4pm if anyone would like to join for a refresher. Please react with a thumbs up if you'd like to attend.",
  }
}

const { screenlyJsContent: messageScreenlyJsContent } =
  createMockScreenlyForScreenshots(
    { coordinates: [37.3861, -122.0839], location: 'Silicon Valley, USA' },
    {
      channel_ids: MOCK_CHANNEL_IDS,
      refresh_interval: '60',
      message_display_duration: '15',
      display_errors: 'false',
      show_qr_code: 'true',
      show_sender_names: 'true',
      screenly_oauth_tokens_url: 'http://localhost:3000/',
      screenly_app_auth_token: 'mock-token',
    }
  )

type BrowserContext = Awaited<ReturnType<Browser['newContext']>>

async function takeScreenshot(
  browser: Browser,
  width: number,
  height: number,
  filename: string,
  screenlyJsContent: string,
  setup: (context: BrowserContext) => Promise<void>
): Promise<void> {
  const screenshotsDir = getScreenshotsDir()
  const context = await browser.newContext({ viewport: { width, height } })
  const page = await context.newPage()

  await setupClockMock(page, FIXED_SCREENSHOT_DATE)
  await setupScreenlyJsMock(page, screenlyJsContent)
  await setup(context)

  await page.goto('/?animations=false')
  await page.waitForLoadState('networkidle')

  await page.screenshot({
    path: path.join(screenshotsDir, filename),
    fullPage: false,
  })

  await context.close()
}

function mockCredentials(context: BrowserContext): Promise<void> {
  return context.route(/access_token\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CREDENTIALS),
    })
  )
}

async function setupMessageRoutes(context: BrowserContext): Promise<void> {
  await mockCredentials(context)

  await context.route(/conversations\.history/, (route) => {
    const url = new URL(route.request().url())
    const channel = url.searchParams.get('channel') ?? ''
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, messages: [mockMessage(channel)] }),
    })
  })

  await context.route(/chat\.getPermalink/, (route) => {
    const url = new URL(route.request().url())
    const channel = url.searchParams.get('channel') ?? ''
    const messageTs = url.searchParams.get('message_ts') ?? ''
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        permalink: `https://screenly.slack.com/archives/${channel}/p${messageTs.replace('.', '')}`,
      }),
    })
  })

  await context.route(/users\.info/, (route) => {
    const url = new URL(route.request().url())
    const user = url.searchParams.get('user') ?? ''
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        user: { name: user, real_name: 'Victoria Hutch', profile: {} },
      }),
    })
  })
}

for (const { width, height } of RESOLUTIONS) {
  test(`screenshot message ${width}x${height}`, async ({ browser }) => {
    await takeScreenshot(
      browser,
      width,
      height,
      `message-${width}x${height}.png`,
      messageScreenlyJsContent,
      (context) => setupMessageRoutes(context)
    )
  })
}

for (const [width, height] of [
  [3840, 2160],
  [2160, 3840],
]) {
  test(`screenshot error ${width}x${height}`, async ({ browser }) => {
    await takeScreenshot(
      browser,
      width,
      height,
      `error-${width}x${height}.png`,
      messageScreenlyJsContent,
      (context) =>
        context.route(/access_token\//, (route) =>
          route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Unauthorized' }),
          })
        )
    )
  })
}
