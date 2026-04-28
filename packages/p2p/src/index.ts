// TODO Phase 12 — Gensyn AXL P2P messaging
//
// Two AXL nodes:
//   validator-node   — receives PANEL_INVITE, casts votes, receives QUORUM_ESCALATE
//   query-node       — receives QUERY_REQUEST, runs RAG via packages/api, sends QUERY_RESPONSE
//
// AXL binary runs at localhost:9002 (HTTP API)
// Endpoints: POST /send, GET /recv, /mcp/, /a2a/
//
// Message types:
//   CHALLENGE_OPEN      challenger → broadcast   { challengeId, entryId, domain }
//   PANEL_INVITE        registry  → validators   { challengeId, storageRef }
//   VOTE_CAST           validator → ChallengeManager  { challengeId, choice, stake }
//   QUORUM_ESCALATE     keeper    → broadcast    { challengeId, urgency }
//   QUERY_REQUEST       external  → query-node   { queryText, fee, callbackAddress }
//   QUERY_RESPONSE      query-node → external    { matches, relevanceScores }
//   REPUTATION_UPDATE   auditor   → broadcast    { validatorAddress, newTier }
//
// Functions to build:
//   sendMessage(nodeUrl, type, payload)
//   receiveMessages(nodeUrl): AsyncIterable<Message>
//   startValidatorNode(port)
//   startQueryNode(port)

export {}
