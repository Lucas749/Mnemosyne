// TODO Phase 8 — ENS subname registration + text record management
//
// Functions to build:
//   setMemoryIndex(ensName, manifestRef)  — write memory.index text record → 0G manifest rootHash
//   getMemoryIndex(ensName)               — resolve ENS name → read memory.index → return 0G ref
//   setPaymentToken(ensName, token)       — write payment.token text record
//   getPaymentToken(ensName)              — read payment.token → used by RoyaltyVault distribute
//   registerSubname(label)                — register <label>.mnemosyne.eth subname
//
// Dependencies: viem, @ensdomains/ensjs, target network: Sepolia (testnet) / mainnet
//
// Called by: packages/api /store (after blob upload, update caller's memory.index)
//            packages/payments distribute() (read payment.token per contributor)
//            mnemosyne-py MnemosyneClient.load_from_ens()

export {}
