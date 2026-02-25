#!/usr/bin/env python3
from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.api.app.secret_vault import (
    SecretVaultError,
    generate_master_key,
    load_vault,
    save_vault,
)


def _master_key(args: argparse.Namespace) -> str:
    key = (args.master_key or os.getenv("VAULT_MASTER_KEY") or "").strip()
    if not key:
        raise SecretVaultError("Missing master key. Use --master-key or set VAULT_MASTER_KEY.")
    return key


def cmd_generate_key(_: argparse.Namespace) -> int:
    print(generate_master_key())
    return 0


def cmd_set(args: argparse.Namespace) -> int:
    key = _master_key(args)
    secrets = load_vault(path=args.path, master_key=key)
    value = args.value
    if value is None:
        value = getpass.getpass(f"Value for {args.name}: ")
    if not value:
        raise SecretVaultError("Secret value cannot be empty.")
    secrets[args.name] = value
    save_vault(path=args.path, master_key=key, secrets=secrets)
    print(f"Stored secret '{args.name}' in {args.path}")
    return 0


def cmd_get(args: argparse.Namespace) -> int:
    key = _master_key(args)
    secrets = load_vault(path=args.path, master_key=key)
    value = secrets.get(args.name)
    if value is None:
        print(f"Secret '{args.name}' not found", file=sys.stderr)
        return 1
    print(value)
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    key = _master_key(args)
    secrets = load_vault(path=args.path, master_key=key)
    for name in sorted(secrets.keys()):
        print(name)
    return 0


def cmd_delete(args: argparse.Namespace) -> int:
    key = _master_key(args)
    secrets = load_vault(path=args.path, master_key=key)
    if args.name not in secrets:
        print(f"Secret '{args.name}' not found", file=sys.stderr)
        return 1
    secrets.pop(args.name, None)
    save_vault(path=args.path, master_key=key, secrets=secrets)
    print(f"Deleted secret '{args.name}' from {args.path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Encrypted local secret vault utility.")
    parser.add_argument("--path", default=".vault/secrets.enc", help="Vault file path.")
    parser.add_argument("--master-key", default=None, help="Fernet master key.")

    sub = parser.add_subparsers(dest="command", required=True)

    g = sub.add_parser("generate-key", help="Generate a new Fernet master key.")
    g.set_defaults(func=cmd_generate_key)

    s = sub.add_parser("set", help="Set a secret.")
    s.add_argument("name", help="Secret name, e.g. AI_API_KEY")
    s.add_argument("value", nargs="?", default=None, help="Secret value (optional; prompt if omitted).")
    s.set_defaults(func=cmd_set)

    get = sub.add_parser("get", help="Get a secret value.")
    get.add_argument("name", help="Secret name")
    get.set_defaults(func=cmd_get)

    ls = sub.add_parser("list", help="List secret keys.")
    ls.set_defaults(func=cmd_list)

    delete = sub.add_parser("delete", help="Delete a secret key.")
    delete.add_argument("name", help="Secret name")
    delete.set_defaults(func=cmd_delete)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except SecretVaultError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
