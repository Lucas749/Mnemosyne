"""LangChain BaseMemory adapter for Mnemosyne."""
from __future__ import annotations

from typing import Any, Optional

from langchain_core.memory import BaseMemory
from langchain_core.messages import AIMessage, HumanMessage, get_buffer_string
from pydantic import Field

from .client import MnemosyneClient


class MnemosyneMemory(BaseMemory):
    """
    LangChain memory that stores and retrieves via Mnemosyne's decentralized 0G backend.

    Usage::

        from mnemosyne import MnemosyneMemory
        from langchain.chat_models import ChatOpenAI
        from langchain.chains import ConversationChain

        memory = MnemosyneMemory(
            api_url="http://localhost:3000",
            submitted_by="my-agent.mnemosyne.eth",
            top_k=5,
            similarity_threshold=0.5,
        )
        chain = ConversationChain(llm=ChatOpenAI(), memory=memory)
        chain.predict(input="What do you know about the Ethereum merge?")
    """

    # pydantic fields
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

    def load_from_ens(self, manifest_ref: str) -> int:
        """Bootstrap memory from another agent's 0G manifest (resolved from ENS memory.index)."""
        return self.client.load_manifest(manifest_ref)

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
