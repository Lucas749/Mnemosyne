"""LlamaIndex BaseMemory adapter for Mnemosyne."""
from __future__ import annotations

from typing import Any, Optional

from .client import MnemosyneClient


class MnemosyneChatStore:
    """
    LlamaIndex-compatible memory store backed by Mnemosyne.

    Usage::

        from mnemosyne.llamaindex import MnemosyneChatStore
        from llama_index.core.memory import ChatMemoryBuffer

        store = MnemosyneChatStore(api_url="http://localhost:3000")
        memory = ChatMemoryBuffer.from_defaults(chat_store=store, token_limit=3000)
    """

    def __init__(
        self,
        api_url: Optional[str] = None,
        submitted_by: Optional[str] = None,
        top_k: int = 5,
        similarity_threshold: float = 0.5,
        domain: str = "observation",
    ) -> None:
        self._client = MnemosyneClient(api_url=api_url, submitted_by=submitted_by)
        self.top_k = top_k
        self.similarity_threshold = similarity_threshold
        self.domain = domain

    def get_messages(self, key: str) -> list[dict]:
        """Retrieve relevant messages by semantic search on the key."""
        matches = self._client.query(key, top_k=self.top_k)
        return [
            {"role": "assistant", "content": m.content}
            for m in matches
            if m.similarity >= self.similarity_threshold
        ]

    def add_message(self, key: str, message: dict) -> None:
        """Persist an assistant message to Mnemosyne."""
        if message.get("role") in ("assistant", "ai"):
            self._client.store(
                content=message.get("content", ""),
                domain=self.domain,
            )

    def delete_messages(self, key: str) -> None:
        # Mnemosyne entries are immutable
        pass

    def delete_message(self, key: str, idx: int) -> None:
        pass

    def get_keys(self) -> list[str]:
        return []
