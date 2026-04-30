"""Low-level HTTP client for the Mnemosyne REST API."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional

import requests


@dataclass
class StoreResult:
    entry_id: str
    storage_ref: str
    embedding_ref: str


@dataclass
class QueryMatch:
    entry_id: str
    content: str
    similarity: float
    storage_ref: str
    tags: list[str]
    domain: Optional[str] = None


class MnemosyneClient:
    """HTTP client wrapping the Mnemosyne REST API (packages/api)."""

    def __init__(
        self,
        api_url: Optional[str] = None,
        submitted_by: Optional[str] = None,
    ) -> None:
        self.api_url = (api_url or os.environ.get("MNEMOSYNE_API_URL", "https://mnemosyne-api-production-7cd6.up.railway.app")).rstrip("/")
        self.submitted_by = submitted_by or os.environ.get("MNEMOSYNE_ENS", "agent")
        self._session = requests.Session()
        self._session.headers.update({"Content-Type": "application/json"})

    def store(
        self,
        content: str,
        domain: str = "factual",
        tags: Optional[list[str]] = None,
    ) -> StoreResult:
        payload = {
            "content": content,
            "domain": domain,
            "tags": tags or [],
            "submittedBy": self.submitted_by,
        }
        resp = self._session.post(f"{self.api_url}/store", json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        return StoreResult(
            entry_id=data["entryId"],
            storage_ref=data["storageRef"],
            embedding_ref=data["embeddingRef"],
        )

    def query(
        self,
        text: str,
        top_k: int = 5,
        domains: Optional[list[str]] = None,
    ) -> list[QueryMatch]:
        payload: dict = {"text": text, "topK": top_k}
        if domains:
            payload["domains"] = domains
        resp = self._session.post(f"{self.api_url}/query", json=payload, timeout=60)
        resp.raise_for_status()
        return [
            QueryMatch(
                entry_id=m["entryId"],
                content=m["content"],
                similarity=m["similarity"],
                storage_ref=m["storageRef"],
                tags=m.get("tags", []),
                domain=m.get("domain"),
            )
            for m in resp.json().get("matches", [])
        ]

    def load_manifest(self, manifest_ref: str) -> int:
        """Seed the API cache from a 0G manifest (e.g. resolved from ENS memory.index)."""
        resp = self._session.post(
            f"{self.api_url}/load-manifest",
            json={"manifestRef": manifest_ref},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json().get("loaded", 0)

    def load_from_ens(self, ens_name: str) -> dict:
        """
        Resolve an ENS name → read memory.index → load that agent's knowledge
        into the API cache. Returns {"loaded": int, "total": int, "manifestRef": str}.
        Raises requests.HTTPError with 404 if the name has no memory.index set.
        """
        resp = self._session.get(
            f"{self.api_url}/load-from-ens/{ens_name}",
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()

    def health(self) -> dict:
        resp = self._session.get(f"{self.api_url}/health", timeout=10)
        resp.raise_for_status()
        return resp.json()
