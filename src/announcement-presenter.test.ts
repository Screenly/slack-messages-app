import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { AnnouncementLoadResult } from './announcement-loader'
import type { AppSettings } from './settings'

const getChannelLink = mock(async () => null as string | null)
const toRenderableAnnouncement = mock(async () => ({
  ts: '1',
  textSegments: [],
  senderName: 'Someone',
  channelName: 'general',
  permalink: null,
}))
mock.module('./messages', () => ({ getChannelLink, toRenderableAnnouncement }))

const renderAnnouncement = mock(() => {})
const showMessageScreen = mock(() => {})
mock.module('./render', () => ({ renderAnnouncement, showMessageScreen }))

const { createAnnouncementPresenter } = await import('./announcement-presenter')

const settings: AppSettings = {
  channelId: 'C123',
  displayErrors: false,
  refreshInterval: 60,
  showSenderNames: true,
  showQrCode: true,
}

beforeEach(() => {
  getChannelLink.mockClear()
  toRenderableAnnouncement.mockClear()
  renderAnnouncement.mockClear()
  showMessageScreen.mockClear()
})

describe('createAnnouncementPresenter', () => {
  test('leaves the current screen untouched when the load is skipped', async () => {
    const present = createAnnouncementPresenter(
      settings,
      mock(async () => '')
    )

    await present({ skipped: true } as AnnouncementLoadResult)

    expect(renderAnnouncement).not.toHaveBeenCalled()
    expect(showMessageScreen).not.toHaveBeenCalled()
  })

  test('throws when the load failed', async () => {
    const present = createAnnouncementPresenter(
      settings,
      mock(async () => '')
    )

    await expect(present({ error: new Error('boom') })).rejects.toThrow('boom')
  })
})
