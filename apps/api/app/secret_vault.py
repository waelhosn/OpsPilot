from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


class SecretVaultError(RuntimeError):
    pass


def generate_master_key() -> str:
    return Fernet.generate_key().decode("utf-8")


def _fernet(master_key: str) -> Fernet:
    key = master_key.strip().encode("utf-8")
    try:
        return Fernet(key)
    except Exception as exc:
        raise SecretVaultError("Invalid master key. Expected a Fernet key.") from exc


def load_vault(path: str, master_key: str) -> dict[str, str]:
    vault_path = Path(path)
    if not vault_path.exists():
        return {}

    token = vault_path.read_bytes().strip()
    if not token:
        return {}

    fernet = _fernet(master_key)
    try:
        payload = fernet.decrypt(token)
    except InvalidToken as exc:
        raise SecretVaultError("Failed to decrypt vault. Check VAULT_MASTER_KEY.") from exc

    try:
        raw = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise SecretVaultError("Vault payload is not valid JSON.") from exc

    if not isinstance(raw, dict):
        raise SecretVaultError("Vault payload must be a JSON object.")

    out: dict[str, str] = {}
    for key, value in raw.items():
        if isinstance(key, str) and isinstance(value, str):
            out[key] = value
    return out


def save_vault(path: str, master_key: str, secrets: dict[str, str]) -> None:
    vault_path = Path(path)
    vault_path.parent.mkdir(parents=True, exist_ok=True)

    payload = json.dumps(secrets, ensure_ascii=True, sort_keys=True).encode("utf-8")
    token = _fernet(master_key).encrypt(payload)
    vault_path.write_bytes(token + b"\n")


def read_secret(path: str, master_key: str, key: str) -> str | None:
    secrets = load_vault(path=path, master_key=master_key)
    value: Any = secrets.get(key)
    return value if isinstance(value, str) and value else None
