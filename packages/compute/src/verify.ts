import type { ComputeClient } from './client.js'

export interface VerificationResult {
  verdict:    'uphold' | 'overturn'
  confidence: number    // 0–1
  reasoning:  string
  teeVerified: boolean  // whether the TEE signature was confirmed
}

const SYSTEM_PROMPT = `You are a fact-checking agent. You will be given a KNOWLEDGE BASE ENTRY and a CHALLENGE against it.

Decide which action to take:
- A = KEEP the entry (the entry is factually accurate; the challenge is wrong)
- B = REMOVE the entry (the entry is factually wrong; the challenge is correct)

Respond ONLY with valid JSON:
{
  "action": "A" | "B",
  "confidence": <number 0-1>,
  "reasoning": "<one paragraph>"
}

action A = KEEP entry (entry is correct)
action B = REMOVE entry (entry is wrong)
confidence: 0.5 = unsure, 1.0 = certain`

export async function verifyClaim(
  client: ComputeClient,
  entryContent: string,
  challengeReason: string,
  evidence?: string,
): Promise<VerificationResult> {
  const headers = await client.broker.inference.getRequestHeaders(
    client.service.providerAddress,
  )

  const userMessage = [
    `Entry: ${entryContent}`,
    `Challenge reason: ${challengeReason}`,
    evidence ? `Evidence: ${evidence}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const res = await fetch(`${client.service.endpoint}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model:    client.service.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0,
    }),
  })

  if (!res.ok) {
    throw new Error(`0G Compute verification failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { id: string; choices: { message: { content: string } }[] }

  // verify TEE signature — makes the verdict cryptographically attestable
  let teeVerified = false
  const zgResKey = res.headers.get('ZG-Res-Key') ?? data.id
  if (zgResKey) {
    try {
      teeVerified = await client.broker.inference.processResponse(
        client.service.providerAddress,
        zgResKey,
      )
    } catch {
      // TEE verification is best-effort — don't fail the whole call
      teeVerified = false
    }
  }

  const raw = data.choices[0]?.message.content ?? '{}'
  let parsed: { action: 'A' | 'B'; confidence: number; reasoning: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`0G Compute returned non-JSON verdict: ${raw.slice(0, 200)}`)
  }

  return {
    verdict:     parsed.action === 'A' ? 'uphold' : 'overturn',
    confidence:  parsed.confidence,
    reasoning:   parsed.reasoning,
    teeVerified,
  }
}
