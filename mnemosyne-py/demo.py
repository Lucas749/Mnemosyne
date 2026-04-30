"""
Mnemosyne Demo — decentralized AI agent memory (Python)

Demonstrates the full loop without requiring an LLM API key:
  1. Store facts to 0G Storage + on-chain stake (MnemosyneRegistry)
  2. Semantic query with cosine ranking
  3. Agent answers a question using only retrieved memory
  4. Cross-agent discovery via ENS (load_from_ens)

Prerequisites:
  cd packages/api && pnpm start   # start the API on :3000
  pip install requests             # (already in requirements.txt)

Run:
  python demo.py
  MNEMOSYNE_API_URL=http://... python demo.py
"""

import os
import sys
import time
import requests

API_URL  = os.environ.get("MNEMOSYNE_API_URL", "http://localhost:3000").rstrip("/")
AGENT_ENS = os.environ.get("MNEMOSYNE_ENS", "demo.mnemosyne.eth")

FACTS = [
    {
        "content": "The Ethereum merge (transition from PoW to PoS) occurred on September 15, 2022 at epoch 144896.",
        "tags": ["ethereum", "consensus", "history"],
    },
    {
        "content": "Bitcoin has a hard-capped maximum supply of 21 million BTC, with the last coin expected around year 2140.",
        "tags": ["bitcoin", "supply", "economics"],
    },
    {
        "content": "The 0G network provides decentralized storage, compute, and a DA layer optimised for AI workloads.",
        "tags": ["0g", "infrastructure", "ai"],
    },
    {
        "content": "Uniswap v3 introduced concentrated liquidity, allowing LPs to provide liquidity within custom price ranges.",
        "tags": ["uniswap", "defi", "amm"],
    },
]

QUESTIONS = [
    "When did Ethereum switch to proof of stake?",
    "What is the maximum supply of Bitcoin?",
    "What does the 0G network offer for AI?",
]


def bar(n=60):
    return "─" * n


def check_health():
    resp = requests.get(f"{API_URL}/health", timeout=5)
    resp.raise_for_status()
    h = resp.json()
    print(f"API  {API_URL}   entries in cache: {h.get('entries', 0)}")


def poll_job(job_id):
    for _ in range(60):
        time.sleep(3)
        r = requests.get(f"{API_URL}/jobs/{job_id}", timeout=10)
        r.raise_for_status()
        job = r.json()
        if job["status"] == "done":
            return job["result"]
        if job["status"] == "error":
            raise RuntimeError(job.get("error", "job failed"))
    raise TimeoutError("job timed out")


def teach_agent():
    print(f"\nSubmitter: {AGENT_ENS}\n")
    for fact in FACTS:
        resp = requests.post(
            f"{API_URL}/store",
            json={
                "content": fact["content"],
                "domain": "factual",
                "tags": fact["tags"],
                "submittedBy": AGENT_ENS,
            },
            timeout=30,
        )
        resp.raise_for_status()
        job_id = resp.json()["jobId"]
        result = poll_job(job_id)
        entry_id = result["entryId"][:20]
        print(f"  stored  {entry_id}...")
        print(f"          \"{fact['content'][:70]}...\"")


def query_memory():
    for q in QUESTIONS:
        print(f"\n  Q: \"{q}\"")
        # Step 1 — discovery (free, returns similarity scores only)
        resp = requests.post(
            f"{API_URL}/query",
            json={"text": q, "topK": 3, "queriedBy": AGENT_ENS},
            timeout=60,
        )
        resp.raise_for_status()
        matches = resp.json().get("matches", [])

        if not matches:
            print("     no matches")
            continue

        for m in matches:
            pct   = round(m["similarity"] * 100)
            label = "HIGH" if pct >= 80 else "HINT" if pct >= 50 else "WEAK"
            print(f"     {pct}% [{label}]  entry:{m['entryId'][:18]}... by {m.get('submittedBy','?')}")

        top = matches[0]
        if top["similarity"] < 0.5:
            print("\n  Agent: No high-confidence memory found.")
            continue

        # Step 2 — unlock (pays royalty, returns decrypted Markdown content)
        unlock = requests.post(
            f"{API_URL}/unlock",
            json={"entryId": top["entryId"], "queriedBy": AGENT_ENS},
            timeout=60,
        )
        unlock.raise_for_status()
        content = unlock.json().get("content", "")
        paid    = unlock.json().get("paymentConfirmed", False)

        if top["similarity"] >= 0.7:
            print(f"\n  Agent (paid={paid}): {content[:120]}")
        else:
            print(f"\n  Agent (paid={paid}): Possibly relevant — \"{content[:80]}...\" (low confidence)")


def ens_discovery():
    source = "agent.mnemosyne.eth"
    print(f"\n  Resolving memory.index for {source} via ENS (Sepolia)...")
    resp = requests.get(f"{API_URL}/load-from-ens/{source}", timeout=60)
    if resp.status_code == 404:
        print(f"  No memory.index set for {source} yet")
        print(f"  Store entries with submittedBy=\"{source}\" to populate it.")
        return
    resp.raise_for_status()
    data = resp.json()
    manifest = (data.get("manifestRef") or "")[:40]
    print(f"  Loaded {data.get('loaded')} entries from {source}")
    print(f"  manifest: {manifest}...")
    print(f"  Total cache size: {data.get('total')}")


def main():
    print(bar())
    print("Mnemosyne Demo — Decentralized AI Agent Memory (Python)")
    print(bar())

    print("\n[1/4] Health check")
    check_health()

    print("\n[2/4] Teaching the agent — storing facts to 0G + staking on-chain")
    print(bar(40))
    teach_agent()

    print("\n[3/4] Querying — agent answers using only retrieved memory")
    print(bar(40))
    query_memory()

    print("\n[4/4] Cross-agent discovery via ENS")
    print(bar(40))
    ens_discovery()

    print(f"\n{bar()}")
    print("Demo complete.")
    print("  Facts stored on 0G Storage (permanent, content-addressed)")
    print("  Each fact staked on MnemosyneRegistry (0G testnet, chain 16602)")
    print("  Every query deposits fee into RoyaltyVault → distributes via Uniswap")
    print("  ENS memory.index points to 0G manifest for cross-agent discovery")
    print(bar())


if __name__ == "__main__":
    try:
        main()
    except requests.exceptions.ConnectionError:
        print("\nAPI not reachable. Start it first:")
        print("  cd packages/api && pnpm start")
        sys.exit(1)
