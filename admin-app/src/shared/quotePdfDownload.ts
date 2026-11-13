import { Platform } from 'react-native'
import { createQuotePdf } from '@/lib/api'

// Downloads the website's own server-rendered quote PDF for a lead.
export async function downloadServerQuotePdf(adminKey: string, leadId: string, fallbackName: string) {
  const { url, filename } = await createQuotePdf(adminKey, leadId)
  const name = filename ?? fallbackName
  if (Platform.OS === 'web') {
    try {
      const blob = await (await fetch(url)).blob()
      const u = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = u; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(u), 2000)
    } catch {
      window.open(url, '_blank')
    }
    return
  }
  const FileSystem = await import('expo-file-system')
  const Sharing = await import('expo-sharing')
  const { uri } = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${name}`)
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: name })
  } else {
    throw new Error(`PDF saved to ${uri} — sharing isn't available on this device.`)
  }
}
