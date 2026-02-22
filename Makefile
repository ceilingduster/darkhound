.PHONY: dev up down migrate migrate-create shell lint test install

# ── Local dev ────────────────────────────────────────────────────────────────
install:
	pip install -r requirements.txt
	cd frontend && npm install

dev-backend:
	cd backend && uvicorn app.main:asgi_app --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev

# ── Docker ───────────────────────────────────────────────────────────────────
up:
	docker compose -f infra/docker-compose.yml up -d

down:
	docker compose -f infra/docker-compose.yml down

logs:
	docker compose -f infra/docker-compose.yml logs -f

# ── Database migrations ───────────────────────────────────────────────────────
migrate:
	cd backend && alembic upgrade head

migrate-create:
	cd backend && alembic revision --autogenerate -m "$(msg)"

migrate-down:
	cd backend && alembic downgrade -1

# ── Development helpers ───────────────────────────────────────────────────────
shell:
	cd backend && python -c "import asyncio; from app.core.db.engine import get_async_session; print('DB session ready')"

lint:
	cd backend && python -m ruff check app/ && python -m mypy app/ --ignore-missing-imports

test:
	cd backend && python -m pytest tests/ -v

# ── Security ─────────────────────────────────────────────────────────────────
audit:
	cd backend && bandit -r app/ -ll

# ── Vault dev setup ───────────────────────────────────────────────────────────
vault-init:
	bash infra/vault/init.sh
