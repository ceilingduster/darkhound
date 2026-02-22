#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-dev-root-token}"

export VAULT_ADDR VAULT_TOKEN

echo "==> Enabling KV v2 secrets engine..."
vault secrets enable -path=secret kv-v2 2>/dev/null || echo "KV already enabled"

echo "==> Enabling AppRole auth..."
vault auth enable approle 2>/dev/null || echo "AppRole already enabled"

echo "==> Creating ai-hunter policy..."
vault policy write ai-hunter - <<'EOF'
path "secret/data/assets/*" {
  capabilities = ["create", "read", "update", "delete"]
}
path "secret/metadata/assets/*" {
  capabilities = ["list", "delete"]
}
EOF

echo "==> Creating AppRole role..."
vault write auth/approle/role/ai-hunter \
  token_policies="ai-hunter" \
  token_ttl=1h \
  token_max_ttl=4h

echo "==> Reading role-id..."
vault read auth/approle/role/ai-hunter/role-id

echo "==> Generating secret-id..."
vault write -f auth/approle/role/ai-hunter/secret-id

echo "Done! Copy role_id and secret_id into .env as VAULT_ROLE_ID and VAULT_SECRET_ID"
