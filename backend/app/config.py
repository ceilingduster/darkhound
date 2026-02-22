from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Application
    app_env: str = "development"
    secret_key: str = "change-me-in-production-at-least-32-chars"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # Database
    database_url: str = "postgresql+asyncpg://darkhound:darkhound@localhost:5432/darkhound"

    # Vault
    vault_enabled: bool = False
    vault_addr: str = "http://localhost:8200"
    vault_role_id: str = ""
    vault_secret_id: str = ""

    # AI
    ai_provider: str = "anthropic"       # "anthropic" | "openai" | "ollama"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-6"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_base_url: str = ""            # empty = default OpenAI API
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"

    # MCP
    virustotal_api_key: str = ""
    shodan_api_key: str = ""
    abuseipdb_api_key: str = ""
    virustotal_mcp_url: str = "https://www.virustotal.com/api/v3"
    shodan_mcp_url: str = "https://api.shodan.io"
    abuseipdb_mcp_url: str = "https://api.abuseipdb.com/api/v2"

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Concurrency
    max_sessions: int = 50
    event_queue_max: int = 1000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()
