'use client'

import { useState, useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { normalize } from 'viem/ens'

interface ENSPreferences {
  vault: string | null
  strategy: string | null
  strategies: string | null
  avatar: string | null
  loading: boolean
}

/**
 * Client-side ENS resolution hook.
 * Reads ENS text records directly from Ethereum mainnet via wagmi's public client.
 * Eliminates server round-trip for ENS preferences.
 */
export function useClientEnsPreferences(ensName: string | null): ENSPreferences {
  const client = usePublicClient({ chainId: 1 })
  const [vault, setVault] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<string | null>(null)
  const [strategies, setStrategies] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ensName || !client) {
      setVault(null)
      setStrategy(null)
      setStrategies(null)
      setAvatar(null)
      return
    }

    let cancelled = false
    setLoading(true)

    async function fetchRecords() {
      try {
        const normalized = normalize(ensName!)

        // Fetch all records in parallel
        const [vaultResult, strategyResult, strategiesResult, avatarResult] = await Promise.all([
          client!.getEnsText({ name: normalized, key: 'yieldroute.vault' }).catch(() => null),
          client!.getEnsText({ name: normalized, key: 'ensio.strategy' }).catch(() => null),
          client!.getEnsText({ name: normalized, key: 'ensio.strategies' }).catch(() => null),
          client!.getEnsText({ name: normalized, key: 'avatar' }).catch(() => null),
        ])

        if (cancelled) return

        setVault(vaultResult || null)
        setStrategy(strategyResult || null)
        setStrategies(strategiesResult || null)

        // Handle IPFS avatar URLs
        if (avatarResult) {
          setAvatar(
            avatarResult.startsWith('ipfs://')
              ? `https://ipfs.io/ipfs/${avatarResult.slice(7)}`
              : avatarResult
          )
        } else {
          setAvatar(null)
        }
      } catch {
        if (!cancelled) {
          setVault(null)
          setStrategy(null)
          setStrategies(null)
          setAvatar(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchRecords()

    return () => {
      cancelled = true
    }
  }, [ensName, client])

  return { vault, strategy, strategies, avatar, loading }
}

/**
 * Client-side ENS address resolution.
 * Resolves ENS name to address directly from chain.
 */
export function useClientEnsAddress(ensName: string | null) {
  const client = usePublicClient({ chainId: 1 })
  const [address, setAddress] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ensName || !client) {
      setAddress(null)
      return
    }

    let cancelled = false
    setLoading(true)

    async function resolve() {
      try {
        const normalized = normalize(ensName!)
        const resolved = await client!.getEnsAddress({ name: normalized })
        if (!cancelled) {
          setAddress(resolved || null)
        }
      } catch {
        if (!cancelled) {
          setAddress(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    resolve()

    return () => {
      cancelled = true
    }
  }, [ensName, client])

  return { address, loading }
}
