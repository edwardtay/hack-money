/**
 * Transak Onramp Integration
 *
 * Provides fiat-to-crypto functionality for payers who don't have crypto.
 * Flow: Fiat → USDC (payer wallet) → Recipient's yield vault
 */

export type TransakConfig = {
  apiKey: string
  environment: 'STAGING' | 'PRODUCTION'
  defaultCryptoCurrency: string
  defaultNetwork: string
  walletAddress: string
  disableWalletAddressForm?: boolean
  themeColor?: string
  email?: string
  redirectURL?: string
  hostURL?: string
  fiatAmount?: number
  fiatCurrency?: string
}

export type TransakEventData = {
  eventName: string
  status?: {
    id: string
    status: string
    cryptoCurrency: string
    cryptoAmount: number
    fiatCurrency: string
    fiatAmount: number
    walletAddress: string
    network: string
  }
}

// Transak widget URL builder
export function buildTransakUrl(config: TransakConfig): string {
  const baseUrl = config.environment === 'PRODUCTION'
    ? 'https://global.transak.com'
    : 'https://global-stg.transak.com'

  const params = new URLSearchParams({
    apiKey: config.apiKey,
    defaultCryptoCurrency: config.defaultCryptoCurrency,
    defaultNetwork: config.defaultNetwork,
    walletAddress: config.walletAddress,
    disableWalletAddressForm: config.disableWalletAddressForm ? 'true' : 'false',
    themeColor: config.themeColor || '1C1B18',
    productsAvailed: 'BUY',
    cryptoCurrencyList: 'USDC,USDT',
    networks: 'base,ethereum,arbitrum,polygon,optimism',
  })

  if (config.email) params.set('email', config.email)
  if (config.fiatAmount) params.set('fiatAmount', config.fiatAmount.toString())
  if (config.fiatCurrency) params.set('fiatCurrency', config.fiatCurrency)
  if (config.redirectURL) params.set('redirectURL', config.redirectURL)
  if (config.hostURL) params.set('hostURL', config.hostURL)

  return `${baseUrl}?${params.toString()}`
}

// Default config for ENSIO (USDC on Base)
export function getDefaultOnrampConfig(walletAddress: string, fiatAmount?: number): TransakConfig {
  return {
    apiKey: process.env.NEXT_PUBLIC_TRANSAK_API_KEY || 'your-api-key',
    environment: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'STAGING',
    defaultCryptoCurrency: 'USDC',
    defaultNetwork: 'base',
    walletAddress,
    disableWalletAddressForm: true,
    themeColor: '1C1B18',
    fiatAmount,
    fiatCurrency: 'USD',
  }
}

// Listen for Transak widget events
export function setupTransakEventListener(
  onOrderCreated?: (data: TransakEventData) => void,
  onOrderCompleted?: (data: TransakEventData) => void,
  onOrderFailed?: (data: TransakEventData) => void
) {
  const handler = (event: MessageEvent) => {
    // Only accept messages from Transak
    if (!event.origin.includes('transak.com')) return

    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data

      if (data.event_id === 'TRANSAK_ORDER_CREATED' && onOrderCreated) {
        onOrderCreated(data)
      }
      if (data.event_id === 'TRANSAK_ORDER_SUCCESSFUL' && onOrderCompleted) {
        onOrderCompleted(data)
      }
      if (data.event_id === 'TRANSAK_ORDER_FAILED' && onOrderFailed) {
        onOrderFailed(data)
      }
    } catch {
      // Ignore non-JSON messages
    }
  }

  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}
