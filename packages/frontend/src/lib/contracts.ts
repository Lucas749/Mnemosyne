export const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}`
export const INFT_ADDRESS = process.env.NEXT_PUBLIC_INFT_ADDRESS as `0x${string}`
export const MARKET_ADDRESS = process.env.NEXT_PUBLIC_MARKET_ADDRESS as `0x${string}`
export const CHALLENGE_ADDRESS = process.env.NEXT_PUBLIC_CHALLENGE_ADDRESS as `0x${string}`
export const ROYALTY_VAULT_ADDRESS = process.env.NEXT_PUBLIC_ROYALTY_VAULT_ADDRESS as `0x${string}`
export const STAKE_VAULT_ADDRESS = process.env.NEXT_PUBLIC_STAKE_VAULT_ADDRESS as `0x${string}`

export const REGISTRY_ABI = [
  {
    name: 'getEntry',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'entryId', type: 'bytes32' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'id', type: 'bytes32' },
        { name: 'storageRef', type: 'string' },
        { name: 'embeddingRef', type: 'string' },
        { name: 'tags', type: 'string[]' },
        { name: 'domain', type: 'uint8' },
        { name: 'submitter', type: 'address' },
        { name: 'stakeAmount', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'submittedAt', type: 'uint256' },
        { name: 'challengeWindowEnd', type: 'uint256' },
        { name: 'queryCount', type: 'uint256' },
        { name: 'royaltiesEarned', type: 'uint256' },
        { name: 'lastQueriedAt', type: 'uint256' },
        { name: 'inftTokenId', type: 'uint256' },
      ],
    }],
  },
  {
    name: 'getProfile',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'paymentToken', type: 'address' },
        { name: 'ensName', type: 'string' },
        { name: 'totalEntries', type: 'uint256' },
        { name: 'totalQueries', type: 'uint256' },
        { name: 'totalRoyalties', type: 'uint256' },
      ],
    }],
  },
  {
    name: 'getSubmitterEntries',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'submitter', type: 'address' }],
    outputs: [{ type: 'bytes32[]' }],
  },
  {
    name: 'getAllEntries',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }],
    outputs: [{ type: 'bytes32[]' }],
  },
  {
    name: 'getTotalEntryCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'challengeWindow',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

export const INFT_ABI = [
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'getEncryptedURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
  },
] as const

export const MARKET_ABI = [
  {
    name: 'listings',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'seller', type: 'address' },
      { name: 'price', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
  },
  {
    name: 'getActiveListings',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'tokenIds', type: 'uint256[]' },
      {
        name: 'lst',
        type: 'tuple[]',
        components: [
          { name: 'seller', type: 'address' },
          { name: 'price', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'listItem',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'price', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'buyItem',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'cancelListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'updatePrice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'newPrice', type: 'uint256' }],
    outputs: [],
  },
] as const

export const ROYALTY_VAULT_ABI = [
  {
    name: 'claimable',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const

export const CHALLENGE_ABI = [
  {
    name: 'getChallenge',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'challengeId', type: 'bytes32' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'id', type: 'bytes32' },
        { name: 'entryId', type: 'bytes32' },
        { name: 'challenger', type: 'address' },
        { name: 'challengerStake', type: 'uint256' },
        { name: 'reason', type: 'string' },
        { name: 'evidenceRef', type: 'string' },
        { name: 'status', type: 'uint8' },
        { name: 'validatorPanel', type: 'address[]' },
        { name: 'openedAt', type: 'uint256' },
        { name: 'quorumDeadline', type: 'uint256' },
        { name: 'resolvedAt', type: 'uint256' },
        { name: 'slashedAddress', type: 'address' },
        { name: 'slashAmount', type: 'uint256' },
        { name: 'upholdVotes', type: 'uint256' },
        { name: 'overturnVotes', type: 'uint256' },
      ],
    }],
  },
  {
    name: 'openChallengeCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'entryId', type: 'bytes32' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'openChallenge',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'entryId', type: 'bytes32' },
      { name: 'reason', type: 'string' },
      { name: 'evidenceRef', type: 'string' },
    ],
    outputs: [{ name: 'challengeId', type: 'bytes32' }],
  },
] as const

export const DOMAIN_LABELS = ['factual', 'labeled_example', 'structured_data', 'observation', 'correction'] as const
export const STATUS_LABELS = ['PENDING', 'VERIFIED', 'CONTESTED', 'STALE', 'BURNED'] as const
export const STATUS_COLORS = ['#E8850A', '#166534', '#991b1b', '#78350f', '#7F8C8D'] as const
export const CHALLENGE_STATUS_LABELS = ['OPEN', 'VOTING', 'AWAITING QUORUM', 'UPHELD', 'OVERTURNED'] as const

export const DOMAIN_COLORS: Record<string, string> = {
  factual: '#b45309',
  observation: '#d97706',
  labeled_example: '#c2410c',
  structured_data: '#92400e',
  correction: '#a16207',
}
