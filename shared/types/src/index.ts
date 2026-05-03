// ─── Entry ────────────────────────────────────────────────────────────────────

export type EntryDomain =
  | 'factual'
  | 'labeled_example'
  | 'structured_data'
  | 'observation'
  | 'correction'

export type EntryStatus =
  | 'pending'     // submitted, inside challenge window
  | 'active'      // accepted, earning royalties
  | 'contested'   // 3+ open challenges, blocked from query results
  | 'stale'       // not queried for N days, grace period started
  | 'burned'      // destroyed — overturned or expired

export interface Entry {
  id: string                      // keccak256(content + submitter + submittedAt)
  content: string                 // the data payload
  domain: EntryDomain
  submitter: string               // wallet address
  ensName: string                 // ENS name resolved at submission time
  stakeAmount: bigint             // wei
  status: EntryStatus
  storageRef: string              // 0G Storage content hash
  embeddingRef: string            // 0G ref to the embedding vector
  inftTokenId?: string            // 0G iNFT token ID — set after minting
  submittedAt: number             // unix timestamp
  challengeWindowEnd: number      // submittedAt + CHALLENGE_WINDOW_HOURS
  queryCount: number
  royaltiesEarned: bigint         // wei
  lastQueriedAt?: number
  tags: string[]
}

// ─── Challenge ────────────────────────────────────────────────────────────────

export type ChallengeStatus =
  | 'open'                  // submitted, validator panel forming
  | 'voting'                // panel assembled, votes being cast
  | 'awaiting_quorum'       // voting open, quorum not yet reached
  | 'resolved_upheld'       // entry was correct — challenger slashed
  | 'resolved_overturned'   // entry was wrong — contributor slashed

export interface Challenge {
  id: string                      // keccak256(entryId + challenger + openedAt)
  entryId: string
  challenger: string              // wallet address
  challengerEnsName: string
  challengerStake: bigint         // wei
  reason: string
  evidenceRef?: string            // 0G ref to evidence document
  status: ChallengeStatus
  validatorPanel: string[]        // wallet addresses of selected validators
  votes: Vote[]
  openedAt: number
  quorumDeadline: number          // openedAt + QUORUM_DEADLINE_HOURS
  resolvedAt?: number
  slashedAddress?: string
  slashAmount?: bigint
}

// ─── Validator ────────────────────────────────────────────────────────────────

export type ValidatorTier = 'bronze' | 'silver' | 'gold' | 'expert'

// Minimum requirements per tier
export const TIER_THRESHOLDS: Record<ValidatorTier, { minVotes: number; minAccuracy: number; panelWeight: number }> = {
  bronze: { minVotes: 0,   minAccuracy: 0,    panelWeight: 1 },
  silver: { minVotes: 10,  minAccuracy: 0.65, panelWeight: 2 },
  gold:   { minVotes: 50,  minAccuracy: 0.75, panelWeight: 4 },
  expert: { minVotes: 200, minAccuracy: 0.85, panelWeight: 8 },
}

export interface Validator {
  address: string
  ensName: string
  tier: ValidatorTier
  domains: EntryDomain[]
  totalVotes: number
  correctVotes: number
  accuracyRate: number            // 0–1
  activeStake: bigint             // currently locked in open disputes
  totalEarned: bigint
  registeredAt: number
  lastActiveAt: number
}

// ─── Vote ─────────────────────────────────────────────────────────────────────

export type VoteChoice = 'uphold' | 'overturn'

export interface Vote {
  challengeId: string
  validator: string               // wallet address
  validatorEnsName: string
  choice: VoteChoice
  stake: bigint
  castAt: number
}

// ─── Query ────────────────────────────────────────────────────────────────────

export interface QueryMatch {
  entryId: string
  storageRef: string
  relevanceScore: number          // 0–1 cosine similarity
  royaltyShare: bigint            // portion of query fee in wei
}

export interface Query {
  id: string
  queryText: string
  askedBy: string                 // wallet address or agent identifier
  scope?: string                  // ENS name — scope to one agent's memory
  domains?: EntryDomain[]
  feePaid: bigint                 // wei
  matches: QueryMatch[]
  askedAt: number
}

// ─── Storage manifest (0G memory.index) ──────────────────────────────────────

export interface ManifestEntry {
  entryId: string
  /** Matches EntryBlob.id passed to decrypt(); omit when identical to entryId */
  storageDecryptId?: string
  storageRef: string              // 0G blob ref for full entry content
  embeddingRef: string            // 0G blob ref for embedding vector
  domain: EntryDomain
  status: EntryStatus
  tags: string[]
  submittedAt: number
}

export interface MemoryManifest {
  owner: string                   // ENS name
  updatedAt: number
  entries: ManifestEntry[]
}

// ─── 0G blob schemas ─────────────────────────────────────────────────────────

export interface EntryBlob {
  id: string
  content: string
  domain: EntryDomain
  tags: string[]
  sources: string[]
  submittedBy: string             // ENS name
  submittedAt: number
  checksum: string                // keccak256 of content
}

export interface EmbeddingBlob {
  entryId: string
  model: string                   // e.g. "text-embedding-3-small"
  vector: number[]
  dimensions: number
}

// ─── Payment preferences ─────────────────────────────────────────────────────

export type PaymentToken = 'ETH' | 'USDC' | 'DAI' | 'WBTC' | 'USDT'

export interface PaymentPreference {
  token: PaymentToken
  address: string                 // recipient address (defaults to ENS owner)
}

// ─── Keeper jobs ──────────────────────────────────────────────────────────────

export type KeeperJobType =
  | 'challenge_watcher'
  | 'staleness_reaper'
  | 'royalty_distributor'
  | 'quorum_enforcer'
  | 'reputation_auditor'
  | 'entry_health_monitor'

export interface KeeperJob {
  type: KeeperJobType
  intervalSeconds: number
  lastRunAt: number
  nextRunAt: number
  enabled: boolean
}

// ─── System config ────────────────────────────────────────────────────────────

export interface MnemosyneConfig {
  challengeWindowHours: number        // default: 48
  minStakeEth: number                 // default: 0.005
  challengerMinStakeEth: number       // default: 0.005
  validatorPanelSize: number          // default: 3
  quorumThreshold: number             // default: 0.67
  quorumDeadlineHours: number         // default: 12
  staleAfterDays: number              // default: 30
  gracePeriodHours: number            // default: 24
  contestThreshold: number            // default: 3
  validatorMinAccuracy: number        // default: 0.60
  royaltyPoolThresholdEth: number     // default: 0.1
  survivalBonusDays: number           // default: 7
}

export const DEFAULT_CONFIG: MnemosyneConfig = {
  challengeWindowHours: 48,
  minStakeEth: 0.005,
  challengerMinStakeEth: 0.005,
  validatorPanelSize: 3,
  quorumThreshold: 0.67,
  quorumDeadlineHours: 12,
  staleAfterDays: 30,
  gracePeriodHours: 24,
  contestThreshold: 3,
  validatorMinAccuracy: 0.60,
  royaltyPoolThresholdEth: 0.1,
  survivalBonusDays: 7,
}
