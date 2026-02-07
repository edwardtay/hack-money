'use client'

import { useState } from 'react'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { namehash, encodeFunctionData } from 'viem'
import { normalize } from 'viem/ens'
import { Button } from '@/components/ui/button'
import {
  PayConfig,
  CHAINS,
  DEFAULT_VAULTS,
  createDefaultConfig,
  serializePayConfig,
  getConfigSummary,
} from '@/lib/ens/pay-config'

const TOKENS = ['USDC', 'USDT', 'ETH'] as const
const CHAIN_IDS = [8453, 42161, 1, 10] as const

// ENS Public Resolver on mainnet
const ENS_RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63'

interface Props {
  ensName: string
  onSaved?: () => void
}

export function PayPreferences({ ensName, onSaved }: Props) {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: 1 })
  const { writeContractAsync, isPending } = useWriteContract()

  const [config, setConfig] = useState<PayConfig>(createDefaultConfig())
  const [earnYield, setEarnYield] = useState(false)
  const [saved, setSaved] = useState(false)

  // Update config when yield toggle changes
  const handleYieldToggle = (enabled: boolean) => {
    setEarnYield(enabled)
    if (enabled && DEFAULT_VAULTS[config.receive.chain]) {
      setConfig({
        ...config,
        receive: {
          ...config.receive,
          vault: DEFAULT_VAULTS[config.receive.chain].address,
        },
      })
    } else {
      const { vault, ...rest } = config.receive
      setConfig({ ...config, receive: rest })
    }
  }

  const handleSave = async () => {
    if (!address || !publicClient) return

    try {
      const node = namehash(normalize(ensName))
      const configJson = serializePayConfig(config)

      // setText(bytes32 node, string key, string value)
      const data = encodeFunctionData({
        abi: [
          {
            name: 'setText',
            type: 'function',
            inputs: [
              { name: 'node', type: 'bytes32' },
              { name: 'key', type: 'string' },
              { name: 'value', type: 'string' },
            ],
            outputs: [],
          },
        ],
        functionName: 'setText',
        args: [node, 'com.pay.config', configJson],
      })

      await writeContractAsync({
        address: ENS_RESOLVER,
        abi: [
          {
            name: 'setText',
            type: 'function',
            inputs: [
              { name: 'node', type: 'bytes32' },
              { name: 'key', type: 'string' },
              { name: 'value', type: 'string' },
            ],
            outputs: [],
          },
        ],
        functionName: 'setText',
        args: [node, 'com.pay.config', configJson],
      })

      setSaved(true)
      onSaved?.()
    } catch (err) {
      console.error('Failed to save preferences:', err)
    }
  }

  if (saved) {
    return (
      <div className="p-6 bg-[#F0FDF4] rounded-xl border border-[#22C55E]/20 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-[#22C55E] flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p className="font-medium text-[#1C1B18]">Preferences saved to ENS</p>
        <p className="text-sm text-[#6B6960]">{getConfigSummary(config)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Token Selection */}
      <div>
        <label className="text-xs font-medium text-[#6B6960] uppercase tracking-wide">Receive as</label>
        <div className="flex gap-2 mt-2">
          {TOKENS.map((token) => (
            <button
              key={token}
              onClick={() => setConfig({ ...config, receive: { ...config.receive, token } })}
              className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium transition-all ${
                config.receive.token === token
                  ? 'border-[#1C1B18] bg-[#1C1B18] text-white'
                  : 'border-[#E4E2DC] text-[#6B6960] hover:border-[#9C9B93]'
              }`}
            >
              {token}
            </button>
          ))}
        </div>
      </div>

      {/* Chain Selection */}
      <div>
        <label className="text-xs font-medium text-[#6B6960] uppercase tracking-wide">On chain</label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {CHAIN_IDS.map((chainId) => (
            <button
              key={chainId}
              onClick={() => {
                setConfig({ ...config, receive: { ...config.receive, chain: chainId } })
                // Reset vault if chain changes
                if (earnYield && DEFAULT_VAULTS[chainId]) {
                  setConfig(c => ({
                    ...c,
                    receive: { ...c.receive, chain: chainId, vault: DEFAULT_VAULTS[chainId].address },
                  }))
                }
              }}
              className={`py-2.5 px-4 rounded-lg border-2 font-medium transition-all ${
                config.receive.chain === chainId
                  ? 'border-[#1C1B18] bg-[#1C1B18] text-white'
                  : 'border-[#E4E2DC] text-[#6B6960] hover:border-[#9C9B93]'
              }`}
            >
              {CHAINS[chainId]}
            </button>
          ))}
        </div>
      </div>

      {/* Yield Toggle */}
      {config.receive.token === 'USDC' && DEFAULT_VAULTS[config.receive.chain] && (
        <button
          onClick={() => handleYieldToggle(!earnYield)}
          className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
            earnYield
              ? 'border-[#22C55E] bg-[#F0FDF4]'
              : 'border-[#E4E2DC] bg-white hover:border-[#9C9B93]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-[#1C1B18]">Earn yield automatically</p>
              <p className="text-sm text-[#6B6960]">
                Deposits to {DEFAULT_VAULTS[config.receive.chain].name}
              </p>
            </div>
            <span className={`text-sm font-medium ${earnYield ? 'text-[#22C55E]' : 'text-[#9C9B93]'}`}>
              {DEFAULT_VAULTS[config.receive.chain].apy}
            </span>
          </div>
        </button>
      )}

      {/* Preview */}
      <div className="rounded-lg bg-[#F8F7F4] p-4">
        <p className="text-xs text-[#9C9B93] uppercase tracking-wide mb-2">When someone pays you</p>
        <p className="text-sm text-[#1C1B18]">{getConfigSummary(config)}</p>
      </div>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={isPending || !address}
        className="w-full h-12 bg-[#1C1B18] hover:bg-[#2D2C28] text-white font-medium"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            Saving to ENS...
          </span>
        ) : (
          'Save Preferences'
        )}
      </Button>

      <p className="text-xs text-center text-[#9C9B93]">
        One transaction to set your payment config on ENS
      </p>
    </div>
  )
}
