/**
 * AI-powered intent parser using Groq LLM
 * Converts natural language into structured payment intents
 */

export interface PaymentIntent {
  action: 'pay' | 'swap' | 'bridge' | 'subscribe' | 'refill'
  recipient?: string // ENS name or address
  amount?: string
  token?: string
  fromChain?: string
  toChain?: string
  frequency?: 'once' | 'weekly' | 'monthly'
  strategy?: 'yield' | 'restaking' | 'liquid'
  confidence: number
  reasoning: string
}

export interface AgentDecision {
  shouldAct: boolean
  action?: PaymentIntent
  reasoning: string
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM_PROMPT = `You are FlowFi's AI payment agent. You analyze user requests and extract structured intents.

CRITICAL RULES:
1. NEVER invent or guess values not explicitly stated by the user
2. If amount is not specified, set amount to null
3. If recipient is not specified, set recipient to null
4. If the request is vague or unclear, set confidence to 0.3 or lower
5. Only set confidence >= 0.7 if ALL required fields are explicitly provided

Available actions:
- pay: Send payment (REQUIRES: recipient AND amount)
- swap: Exchange tokens (REQUIRES: amount, ideally fromToken and toToken)
- bridge: Move across chains (REQUIRES: amount, fromChain, toChain)
- subscribe: Recurring payment (REQUIRES: recipient, amount, frequency)
- refill: Top up gas tank (REQUIRES: amount)

Supported chains: ethereum, base, arbitrum, optimism, polygon
Supported tokens: USDC, USDT, ETH, WETH, DAI

Confidence scoring:
- 0.9: All required fields explicitly stated
- 0.7: Most fields stated, minor inference needed
- 0.5: Some fields missing, reasonable guess possible
- 0.3: Vague request, significant guessing required
- 0.1: Cannot understand request

Respond with JSON:
{
  "action": "pay|swap|bridge|subscribe|refill",
  "recipient": "name.eth or address OR null if not specified",
  "amount": "numeric string OR null if not specified",
  "token": "token symbol or null",
  "fromChain": "chain name or null",
  "toChain": "chain name or null",
  "frequency": "once|weekly|monthly",
  "strategy": "yield|restaking|liquid or null",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of what was extracted and what was missing"
}`

const DECISION_PROMPT = `You are FlowFi's autonomous agent. Analyze the situation and decide whether to act.

Context:
- You manage gas tanks for receivers (so their payers don't pay gas)
- You can execute swaps, bridges, and payments via Uniswap v4 + LI.FI
- You monitor the PayAgentHook on Uniswap v4 for pool activity

When to ACT:
- Gas tanks are low AND funds available to refill
- Scheduled payments are due
- V4 pool shows high activity (many swaps) → good time to batch operations
- V4 pool shows low activity but healthy volume → maintain liquidity

When NOT to ACT:
- Balances are healthy, no pending tasks
- V4 pool fee is elevated (wait for lower fees)
- Action would be wasteful (gas > value)

V4 Pool Insights (use this data):
- swapCount: Total number of swaps through the hook
- totalVolumeUsd: Total USD volume processed
- isActive: Whether the pool has recent activity
- If swapCount > 10 and volumeUsd > 50, the pool is proven and safe to use
- If swapCount is low, mention that we should route through the pool to increase activity

Respond with JSON:
{
  "shouldAct": true/false,
  "action": { ...PaymentIntent if shouldAct },
  "reasoning": "why you decided this, referencing V4 pool data if relevant"
}`

async function callGroq(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured')
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Groq API error: ${error}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || '{}'
}

/**
 * Validate intent and adjust confidence based on missing required fields
 */
function validateIntent(intent: PaymentIntent): PaymentIntent {
  const missingFields: string[] = []
  let adjustedConfidence = intent.confidence

  // Check required fields based on action
  switch (intent.action) {
    case 'pay':
      if (!intent.recipient) missingFields.push('recipient')
      if (!intent.amount) missingFields.push('amount')
      break
    case 'swap':
      if (!intent.amount) missingFields.push('amount')
      break
    case 'bridge':
      if (!intent.amount) missingFields.push('amount')
      if (!intent.fromChain || !intent.toChain) missingFields.push('chains')
      break
    case 'subscribe':
      if (!intent.recipient) missingFields.push('recipient')
      if (!intent.amount) missingFields.push('amount')
      break
    case 'refill':
      if (!intent.amount) missingFields.push('amount')
      break
  }

  // Reduce confidence for each missing required field
  if (missingFields.length > 0) {
    adjustedConfidence = Math.min(adjustedConfidence, 0.4)
    intent.reasoning = `${intent.reasoning}. Missing: ${missingFields.join(', ')}`
  }

  return {
    ...intent,
    confidence: adjustedConfidence,
  }
}

/**
 * Parse natural language into a structured payment intent
 */
export async function parseIntent(userMessage: string): Promise<PaymentIntent> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]

  const response = await callGroq(messages)

  try {
    const parsed = JSON.parse(response)

    // Handle null values from AI (don't replace with defaults if AI said null)
    const intent: PaymentIntent = {
      action: parsed.action || 'pay',
      recipient: parsed.recipient || undefined,
      amount: parsed.amount || undefined,
      token: parsed.token || undefined,
      fromChain: parsed.fromChain || undefined,
      toChain: parsed.toChain || undefined,
      frequency: parsed.frequency || 'once',
      strategy: parsed.strategy || undefined,
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || 'Parsed from user input',
    }

    // Validate and adjust confidence
    return validateIntent(intent)
  } catch {
    return {
      action: 'pay',
      confidence: 0,
      reasoning: 'Failed to parse intent',
    }
  }
}

/**
 * Autonomous agent decision-making
 * Given a situation, decide whether and how to act
 */
export async function makeDecision(situation: {
  gasTanks: { receiver: string; balance: string; threshold: string }[]
  pendingPayments: { to: string; amount: string; dueAt: string }[]
  marketConditions?: { gasPrice: string; ethPrice: string }
  v4PoolStats?: {
    swapCount: string
    totalVolumeUsd: string
    isActive: boolean
    poolId: string
  }
}): Promise<AgentDecision> {
  const v4Stats = situation.v4PoolStats
    ? `
- V4 Pool Stats (PayAgentHook):
  - Pool ID: ${situation.v4PoolStats.poolId}
  - Total Swaps: ${situation.v4PoolStats.swapCount}
  - Total Volume: $${situation.v4PoolStats.totalVolumeUsd}
  - Pool Active: ${situation.v4PoolStats.isActive}`
    : ''

  const situationText = `
Current situation:
- Gas tanks: ${JSON.stringify(situation.gasTanks)}
- Pending payments: ${JSON.stringify(situation.pendingPayments)}
- Market: ${JSON.stringify(situation.marketConditions || { gasPrice: 'normal', ethPrice: 'stable' })}${v4Stats}

Should I take any action?`

  const messages = [
    { role: 'system', content: DECISION_PROMPT },
    { role: 'user', content: situationText },
  ]

  const response = await callGroq(messages)

  try {
    const parsed = JSON.parse(response)
    return {
      shouldAct: parsed.shouldAct || false,
      action: parsed.action,
      reasoning: parsed.reasoning || 'No reasoning provided',
    }
  } catch {
    return {
      shouldAct: false,
      reasoning: 'Failed to parse decision',
    }
  }
}

/**
 * Generate a human-readable summary of an action
 */
export async function explainAction(intent: PaymentIntent): Promise<string> {
  const messages = [
    {
      role: 'system',
      content: 'You are a helpful assistant. Explain blockchain actions in simple terms. Keep it under 50 words.'
    },
    {
      role: 'user',
      content: `Explain this action: ${JSON.stringify(intent)}`
    },
  ]

  const response = await callGroq(messages)

  try {
    const parsed = JSON.parse(response)
    return parsed.explanation || response
  } catch {
    return response
  }
}
