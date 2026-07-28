import { getSettingWithDefault } from '@screenly/edge-apps'
import { parseChannelId } from './content'

export interface AppSettings {
  channelId: string
  displayErrors: boolean
  refreshInterval: number
  showSenderNames: boolean
  showQrCode: boolean
}

function getBooleanSetting(key: string, defaultValue: boolean): boolean {
  return getSettingWithDefault<string>(key, String(defaultValue)) === 'true'
}

export function getAppSettings(): AppSettings {
  return {
    channelId: parseChannelId(getSettingWithDefault<string>('channel_id', '')),
    displayErrors: getBooleanSetting('display_errors', false),
    refreshInterval: getSettingWithDefault<number>('refresh_interval', 60),
    showSenderNames: getBooleanSetting('show_sender_names', true),
    showQrCode: getBooleanSetting('show_qr_code', true),
  }
}
