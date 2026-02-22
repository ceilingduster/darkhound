from __future__ import annotations

import logging
import os

from app.config import settings

logger = logging.getLogger(__name__)

_vault_client = None


def _get_vault_client():
    global _vault_client
    if _vault_client is not None:
        return _vault_client
    try:
        import hvac
        client = hvac.Client(url=settings.vault_addr)
        client.auth.approle.login(
            role_id=settings.vault_role_id,
            secret_id=settings.vault_secret_id,
        )
        if not client.is_authenticated():
            raise RuntimeError("Vault AppRole authentication failed")
        _vault_client = client
        return client
    except Exception as exc:
        logger.error("Vault client init failed: %s", exc)
        raise


def get_asset_credentials(asset_id: str, vault_path: str | None, asset=None) -> dict:
    """
    Retrieve SSH credentials for an asset.

    Returns dict with keys: 'ssh_key' and/or 'ssh_password', 'username'.
    Priority: Vault (production) → DB credentials (dev) → env vars (dev fallback).
    """
    if settings.is_production and not settings.vault_enabled:
        raise RuntimeError("VAULT_ENABLED must be true in production")

    if settings.vault_enabled:
        if not vault_path:
            raise ValueError(f"No vault path configured for asset {asset_id}")
        client = _get_vault_client()
        secret = client.secrets.kv.v2.read_secret_version(path=vault_path.lstrip("secret/"))
        data = secret["data"]["data"]
        return {k: v for k, v in data.items() if k in ("ssh_key", "ssh_password", "username")}

    # Dev mode: try DB credentials first, then fall back to env vars
    if asset is not None and (asset.ssh_password or asset.ssh_key):
        return _get_db_credentials(asset)

    logger.warning("Vault disabled — reading credentials from environment (dev mode only)")
    return _get_env_credentials(asset_id)


def _get_db_credentials(asset) -> dict:
    """Decrypt and return credentials stored on the Asset ORM object."""
    from app.core.security.crypto import decrypt

    creds: dict = {}
    creds["username"] = asset.ssh_username or "root"
    if asset.ssh_key:
        creds["ssh_key"] = decrypt(asset.ssh_key)
    if asset.ssh_password:
        creds["ssh_password"] = decrypt(asset.ssh_password)

    # Sudo configuration
    creds["sudo_method"] = getattr(asset, "sudo_method", None)
    sudo_method = creds["sudo_method"]
    if sudo_method == "ssh_password" and creds.get("ssh_password"):
        creds["sudo_password"] = creds["ssh_password"]
    elif sudo_method == "custom_password" and getattr(asset, "sudo_password", None):
        creds["sudo_password"] = decrypt(asset.sudo_password)
    # "nopasswd" and null: no sudo_password needed

    return creds


def _get_env_credentials(asset_id: str) -> dict:
    safe_id = asset_id.upper().replace("-", "_")
    creds: dict = {}
    key = os.environ.get(f"ASSET_{safe_id}_SSH_KEY")
    password = os.environ.get(f"ASSET_{safe_id}_SSH_PASSWORD")
    username = os.environ.get(f"ASSET_{safe_id}_SSH_USERNAME", "root")
    if key:
        creds["ssh_key"] = key
    if password:
        creds["ssh_password"] = password
    creds["username"] = username
    return creds


def store_asset_credentials(asset_id: str, credentials: dict) -> str:
    """Store credentials in Vault and return the path."""
    if not settings.vault_enabled:
        raise RuntimeError("Cannot store credentials — Vault is disabled")

    client = _get_vault_client()
    path = f"assets/{asset_id}/credentials"
    client.secrets.kv.v2.create_or_update_secret(path=path, secret=credentials)
    return f"secret/{path}"
