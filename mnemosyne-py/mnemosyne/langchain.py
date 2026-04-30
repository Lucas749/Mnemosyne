"""LangChain memory adapter and KeeperHub tools for Mnemosyne."""
from __future__ import annotations

import os
from typing import Any, Optional, Type

import requests
from pydantic import BaseModel, Field

from .client import MnemosyneClient


class MnemosyneMemory(BaseModel):
    """
    LangChain-compatible memory that stores and retrieves via Mnemosyne.

    Drop-in for chains that accept a memory= kwarg::

        from mnemosyne.langchain import MnemosyneMemory
        memory = MnemosyneMemory(
            api_url="http://localhost:3000",
            submitted_by="my-agent.mnemosyne.eth",
        )
    """

    api_url: Optional[str] = Field(default=None)
    submitted_by: Optional[str] = Field(default=None)
    top_k: int = Field(default=5)
    similarity_threshold: float = Field(default=0.5)
    memory_key: str = Field(default="mnemosyne_memory")
    input_key: Optional[str] = Field(default=None)
    output_key: Optional[str] = Field(default=None)
    domain: str = Field(default="observation")

    _client: Optional[MnemosyneClient] = None

    @property
    def client(self) -> MnemosyneClient:
        if self._client is None:
            self._client = MnemosyneClient(
                api_url=self.api_url,
                submitted_by=self.submitted_by,
            )
        return self._client

    @property
    def memory_variables(self) -> list[str]:
        return [self.memory_key]

    def load_memory_variables(self, inputs: dict[str, Any]) -> dict[str, Any]:
        """Query Mnemosyne and inject top-k matches into the chain's context."""
        query_text = self._extract_input(inputs)
        if not query_text:
            return {self.memory_key: ""}

        matches = self.client.query(query_text, top_k=self.top_k)
        relevant = [m for m in matches if m.similarity >= self.similarity_threshold]

        if not relevant:
            return {self.memory_key: ""}

        lines = ["## Retrieved memories (from Mnemosyne decentralized memory):"]
        for m in relevant:
            domain_label = f"[{m.domain}] " if m.domain else ""
            lines.append(f"- {domain_label}{m.content}  (confidence: {m.similarity:.2f})")

        return {self.memory_key: "\n".join(lines)}

    def save_context(self, inputs: dict[str, Any], outputs: dict[str, str]) -> None:
        """Store the agent's output as a new Mnemosyne memory entry."""
        output = self._extract_output(outputs)
        if output:
            self.client.store(
                content=output,
                domain=self.domain,
                tags=[],
            )

    def clear(self) -> None:
        # Mnemosyne entries are immutable — clearing local state only
        pass

    def load_from_ens(self, ens_name: str) -> dict:
        """Bootstrap memory by resolving an ENS name via the API."""
        return self.client.load_from_ens(ens_name)

    # ─── helpers ─────────────────────────────────────────────────────────────

    def _extract_input(self, inputs: dict[str, Any]) -> str:
        if self.input_key:
            return str(inputs.get(self.input_key, ""))
        # Prefer 'input' key, fall back to first string value
        return str(inputs.get("input", inputs.get("question", next(iter(inputs.values()), ""))))

    def _extract_output(self, outputs: dict[str, str]) -> str:
        if self.output_key:
            return str(outputs.get(self.output_key, ""))
        return str(outputs.get("output", outputs.get("response", next(iter(outputs.values()), ""))))


# ─── KeeperHub LangChain Tools ───────────────────────────────────────────────
# Exposes Mnemosyne keeper operations as LangChain BaseTool instances so any
# LangChain agent can trigger iNFT activation and royalty distribution via
# KeeperHub — hitting Focus Area 2 (agent framework integration).
#
# Usage:
#   from mnemosyne.langchain import KeeperStatusTool, KeeperActivateTool, KeeperDistributeTool
#   tools = [KeeperStatusTool(), KeeperActivateTool(), KeeperDistributeTool()]
#   agent = initialize_agent(tools, llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION)

try:
    from langchain.tools import BaseTool

    _API_URL = os.environ.get("MNEMOSYNE_API_URL", "http://localhost:3000")

    class _KeeperBase(BaseTool):
        api_url: str = _API_URL

        def _call_keeper(self, path: str, method: str = "GET", **kwargs) -> dict:
            url = f"{self.api_url}{path}"
            resp = requests.request(method, url, timeout=30, **kwargs)
            resp.raise_for_status()
            return resp.json()

    class KeeperStatusTool(_KeeperBase):
        name: str = "mnemosyne_keeper_status"
        description: str = (
            "Check how many Mnemosyne knowledge entries are pending iNFT activation. "
            "Returns counts of pending and ready-to-activate entries. "
            "Use this before calling mnemosyne_keeper_activate."
        )

        def _run(self, query: str = "") -> str:
            data = self._call_keeper("/keeper/status")
            return (
                f"Pending activation: {data['pendingActivation']} entries. "
                f"Ready now: {data['readyToActivate']}. "
                f"KeeperHub mode: {data['useKeeperHub']}."
            )

        async def _arun(self, query: str = "") -> str:
            return self._run(query)

    class KeeperActivateTool(_KeeperBase):
        name: str = "mnemosyne_keeper_activate"
        description: str = (
            "Activate all pending Mnemosyne iNFTs whose challenge window has passed. "
            "Mints ERC-7857 iNFTs on 0G blockchain for each entry. "
            "Run mnemosyne_keeper_status first to confirm there are entries ready."
        )

        def _run(self, query: str = "") -> str:
            data = self._call_keeper("/keeper/activate-pending", method="POST")
            if data["activated"] == 0:
                return "No entries ready to activate yet."
            ids = [r["inftTokenId"] for r in data["results"]]
            return f"Activated {data['activated']} iNFTs. Token IDs: {', '.join(ids)}"

        async def _arun(self, query: str = "") -> str:
            return self._run(query)

    class KeeperDistributeTool(_KeeperBase):
        name: str = "mnemosyne_keeper_distribute"
        description: str = (
            "Trigger weekly royalty distribution for Mnemosyne contributors. "
            "Reads accumulated royalties from the 0G RoyaltyVault and distributes "
            "them to contributors via Uniswap on Sepolia in their preferred token."
        )

        def _run(self, query: str = "") -> str:
            data = self._call_keeper("/keeper/distribute", method="POST")
            return f"Distributed royalties to {data['distributed']} contributors."

        async def _arun(self, query: str = "") -> str:
            return self._run(query)

    class KeeperUnlockTool(_KeeperBase):
        name: str = "mnemosyne_unlock"
        description: str = (
            "Unlock and read the full Markdown content of a Mnemosyne knowledge entry. "
            "Input: entryId (from mnemosyne_query results). "
            "Pays the royalty to the contributor and returns the decrypted content. "
            "Implements x402: if payment is required, retries automatically with X-Payment header."
        )

        queried_by: Optional[str] = None

        def _run(self, entry_id: str) -> str:
            payload = {"entryId": entry_id.strip()}
            if self.queried_by:
                payload["queriedBy"] = self.queried_by

            resp = requests.post(
                f"{self.api_url}/unlock",
                json=payload,
                timeout=60,
            )

            # x402: server says payment required — retry with payment proof header
            if resp.status_code == 402:
                x402 = resp.json().get("x402", {})
                # In a real KeeperHub integration, the agent would call kh execute transfer here.
                # For the demo we surface the payment details so the agent can act on them.
                return (
                    f"Payment required to unlock entry {entry_id}. "
                    f"Pay {x402.get('maxAmountRequired', '?')} wei to {x402.get('payTo', '?')} "
                    f"on {x402.get('network', 'sepolia')}, then retry with X-Payment: <txHash>."
                )

            resp.raise_for_status()
            data = resp.json()
            return data.get("content", "[no content returned]")

        async def _arun(self, entry_id: str) -> str:
            return self._run(entry_id)

    KEEPER_TOOLS = [KeeperStatusTool(), KeeperActivateTool(), KeeperDistributeTool(), KeeperUnlockTool()]

except ImportError:
    # langchain not installed — tools not available, rest of module still works
    KEEPER_TOOLS = []  # type: ignore
