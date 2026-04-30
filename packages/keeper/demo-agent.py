"""
Mnemosyne × KeeperHub — Agentic Demo (Python / LangChain)

Shows the full autonomous agent lifecycle using the LangChain tool adapter:
  1. Agent stores a knowledge entry (Markdown)
  2. Polls keeper status until challenge window passes
  3. Agent triggers iNFT activation via KeeperStatusTool / KeeperActivateTool
  4. Agent queries the brain — similarity scores only (no content)
  5. Agent unlocks the best match — x402 payment flow surfaced
  6. Agent triggers royalty distribution via KeeperDistributeTool

Prerequisites:
  cd packages/api && pnpm start   (or point MNEMOSYNE_API_URL at Railway)
  pip install requests langchain pydantic

Run:
  python packages/keeper/demo-agent.py
  MNEMOSYNE_API_URL=https://mnemosyne-api-production-7cd6.up.railway.app python packages/keeper/demo-agent.py
"""

import os
import sys
import time
import json
import requests

# ── Import Mnemosyne LangChain tools ─────────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../mnemosyne-py'))
from mnemosyne.langchain import (
    KeeperStatusTool,
    KeeperActivateTool,
    KeeperDistributeTool,
    KeeperUnlockTool,
)

API       = os.environ.get('MNEMOSYNE_API_URL', 'http://localhost:3000').rstrip('/')
AGENT_ENS = os.environ.get('MNEMOSYNE_ENS', 'demo.mnemosyne.eth')

FACT_MARKDOWN = """\
# ERC-7857 iNFT Standard

The **ERC-7857 iNFT** standard enables AI agents to be tokenized with:
- Encrypted metadata stored on 0G Storage
- Authorized usage without ownership transfer (`authorizeUsage`)
- Royalties flowing to the current owner on every query

## Key properties
| Property | Value |
|---|---|
| Chain | 0G-Galileo-Testnet (16602) |
| Encryption | AES-256-GCM, key = HMAC(ZG_PRIVATE_KEY, entryId) |
| Royalties | Distributed via Uniswap to owner's preferred token |
"""


def bar(n=60):
    return '─' * n


def post(path, body=None):
    r = requests.post(f'{API}{path}', json=body or {}, timeout=120)
    r.raise_for_status()
    return r.json()


def get(path):
    r = requests.get(f'{API}{path}', timeout=30)
    r.raise_for_status()
    return r.json()


def poll_job(job_id, label):
    for _ in range(60):
        time.sleep(3)
        job = get(f'/jobs/{job_id}')
        print(f'\r  {label}: {job["status"]}...', end='', flush=True)
        if job['status'] == 'done':
            print()
            return job['result']
        if job['status'] == 'error':
            raise RuntimeError(job.get('error', 'job failed'))
    raise TimeoutError('job timed out')


def main():
    print(bar())
    print(' Mnemosyne × KeeperHub — Agentic Demo (Python / LangChain)')
    print(bar())

    # Instantiate tools — same ones a LangChain agent would use
    status_tool   = KeeperStatusTool(api_url=API)
    activate_tool = KeeperActivateTool(api_url=API)
    dist_tool     = KeeperDistributeTool(api_url=API)
    unlock_tool   = KeeperUnlockTool(api_url=API, queried_by=AGENT_ENS)

    print(f'\nAgent ENS: {AGENT_ENS}')
    print(f'API:       {API}\n')

    # ── Step 1: Store Markdown knowledge ──────────────────────────────────────
    print('[1] Storing Markdown knowledge entry...')
    store_job = post('/store', {
        'content': FACT_MARKDOWN,
        'domain': 'factual',
        'tags': ['erc-7857', 'inft', '0g', 'standards'],
        'submittedBy': AGENT_ENS,
    })
    stored    = poll_job(store_job['jobId'], 'storing')
    entry_id  = stored['entryId']
    print(f'  entryId: {entry_id}')

    # ── Step 2: Keeper status (LangChain tool) ────────────────────────────────
    print('\n[2] Checking keeper status via KeeperStatusTool...')
    print(f'  {status_tool.run("")}')
    print('  (In production: KeeperHub schedule fires every 5 min automatically)')

    # Poll until ready (max 10 min for demo — challenge window is 5 min)
    ready = False
    for attempt in range(20):
        time.sleep(30)
        status = get('/keeper/status')
        print(f'  [{attempt+1}/20] readyToActivate: {status["readyToActivate"]}')
        if status['readyToActivate'] > 0:
            ready = True
            break

    # ── Step 3: Activate via KeeperActivateTool ───────────────────────────────
    print('\n[3] Activating pending iNFTs via KeeperActivateTool...')
    if ready:
        result = activate_tool.run('')
        print(f'  {result}')
    else:
        print('  Challenge window not passed yet — KeeperHub handles this automatically')
        print('  Continuing demo...')

    # ── Step 4: Query — discovery phase (free, no content) ───────────────────
    print('\n[4] Querying brain — discovery (free, similarity scores only)...')
    query_job = post('/query', {
        'text': 'What is the ERC-7857 iNFT standard?',
        'topK': 3,
        'queriedBy': AGENT_ENS,
    })
    query_result = poll_job(query_job['jobId'], 'querying')
    matches = query_result.get('matches', [])

    print(f'  {len(matches)} match(es):')
    for m in matches:
        locked = 'locked' if m.get('hasContent') else 'n/a'
        print(f'  [{m["similarity"]:.3f}] {m["entryId"][:22]}... by {m.get("submittedBy","?")} (content: {locked})')

    # ── Step 5: Unlock best match — x402 payment ─────────────────────────────
    best = matches[0] if matches and matches[0]['similarity'] > 0.5 else None
    if best:
        print(f'\n[5] Unlocking entry {best["entryId"][:22]}... (sim={best["similarity"]:.3f})')
        print('  Using KeeperUnlockTool (x402 payment protocol)...')
        content = unlock_tool.run(best['entryId'])
        if content.startswith('Payment required'):
            print(f'  → x402: {content}')
            print('  → In production: KeeperHub executes kh execute transfer, then retries with X-Payment header')
        else:
            print(f'  Content preview: {content[:120]}...')
    else:
        print('\n[5] No high-confidence match to unlock')

    # ── Step 6: Royalty distribution via KeeperDistributeTool ─────────────────
    print('\n[6] Triggering royalty distribution via KeeperDistributeTool...')
    result = dist_tool.run('')
    print(f'  {result}')

    print(f'\n{bar()}')
    print(' Demo complete')
    print(bar())
    print("""
LangChain tools demonstrated:
  KeeperStatusTool    — agent checks pending activations
  KeeperActivateTool  — agent triggers iNFT minting (what KeeperHub schedule runs)
  KeeperDistributeTool— agent triggers Uniswap royalty payouts (KeeperHub weekly cron)
  KeeperUnlockTool    — agent unlocks content; surfaces x402 payment details

To use in a LangChain agent:
  from mnemosyne.langchain import KEEPER_TOOLS
  agent = initialize_agent(KEEPER_TOOLS + mnemosyne_tools, llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION)
""")


if __name__ == '__main__':
    try:
        main()
    except requests.exceptions.ConnectionError:
        print('\nAPI not reachable. Start it first:')
        print('  cd packages/api && pnpm start')
        sys.exit(1)
