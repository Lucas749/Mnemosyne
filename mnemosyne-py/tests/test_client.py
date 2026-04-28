"""Tests for MnemosyneClient — mocked HTTP, no live server needed."""
from unittest.mock import MagicMock, patch

import pytest
import requests

from mnemosyne.client import MnemosyneClient, QueryMatch, StoreResult


@pytest.fixture
def client():
    return MnemosyneClient(api_url="http://localhost:3000", submitted_by="test-agent")


def _mock_response(json_data: dict, status_code: int = 200) -> MagicMock:
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    if status_code >= 400:
        mock.raise_for_status.side_effect = requests.HTTPError(response=mock)
    else:
        mock.raise_for_status.return_value = None
    return mock


# ─── store ────────────────────────────────────────────────────────────────────

def test_store_returns_result(client):
    payload = {"entryId": "0xabc", "storageRef": "0x111", "embeddingRef": "0x222"}
    with patch.object(client._session, "post", return_value=_mock_response(payload)) as mock_post:
        result = client.store("The sky is blue", tags=["science"])
        assert isinstance(result, StoreResult)
        assert result.entry_id == "0xabc"
        mock_post.assert_called_once()
        body = mock_post.call_args.kwargs["json"]
        assert body["content"] == "The sky is blue"
        assert body["tags"] == ["science"]
        assert body["submittedBy"] == "test-agent"


def test_store_with_ens_name_includes_manifest_ref():
    payload = {
        "entryId": "0xabc",
        "storageRef": "0x111",
        "embeddingRef": "0x222",
        "manifestRef": "0xmanifest",
    }
    ens_client = MnemosyneClient(api_url="http://localhost:3000", submitted_by="myagent.eth")
    with patch.object(ens_client._session, "post", return_value=_mock_response(payload)):
        result = ens_client.store("ENS fact")
        assert result.entry_id == "0xabc"


# ─── query ────────────────────────────────────────────────────────────────────

def test_query_returns_matches(client):
    payload = {
        "matches": [
            {"entryId": "0x1", "content": "fact A", "similarity": 0.9,
             "storageRef": "0xref", "tags": ["a"], "domain": "factual"},
        ]
    }
    with patch.object(client._session, "post", return_value=_mock_response(payload)):
        matches = client.query("what is A?")
        assert len(matches) == 1
        assert isinstance(matches[0], QueryMatch)
        assert matches[0].similarity == 0.9

def test_query_empty_returns_empty_list(client):
    with patch.object(client._session, "post", return_value=_mock_response({"matches": []})):
        assert client.query("anything") == []


# ─── load_from_ens ────────────────────────────────────────────────────────────

def test_load_from_ens_calls_correct_url(client):
    payload = {"loaded": 3, "total": 3, "manifestRef": "0xmanifest", "ensName": "myagent.eth"}
    with patch.object(client._session, "get", return_value=_mock_response(payload)) as mock_get:
        result = client.load_from_ens("myagent.eth")
        assert result["loaded"] == 3
        assert result["manifestRef"] == "0xmanifest"
        mock_get.assert_called_once_with(
            "http://localhost:3000/load-from-ens/myagent.eth",
            timeout=120,
        )

def test_load_from_ens_raises_on_404(client):
    error_resp = _mock_response({"error": "No memory.index found"}, status_code=404)
    with patch.object(client._session, "get", return_value=error_resp):
        with pytest.raises(requests.HTTPError):
            client.load_from_ens("unknown.eth")
