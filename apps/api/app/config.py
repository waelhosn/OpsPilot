from functools import lru_cache
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict

from .secret_vault import SecretVaultError, read_secret


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./app.db"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    ai_provider: str = "mock"
    ai_api_key: str = ""
    ai_model: str = "gpt-4o-mini"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8501,http://127.0.0.1:8501"
    default_workspace_name: str = "OpsPilot Team"
    vault_enabled: bool = False
    vault_path: str = ".vault/secrets.enc"
    vault_master_key: str = ""

    @staticmethod
    def normalize_database_url(url: str) -> str:
        url = url.strip()
        if not url:
            return url

        # Supabase and many providers expose postgres:// or postgresql:// URLs.
        # SQLAlchemy + psycopg expects postgresql+psycopg:// for explicit driver selection.
        if url.startswith("postgres://"):
            url = f"postgresql+psycopg://{url[len('postgres://'):]}"
        elif url.startswith("postgresql://"):
            url = f"postgresql+psycopg://{url[len('postgresql://'):]}"

        if url.startswith("postgresql+psycopg://"):
            parsed = urlsplit(url)
            query = dict(parse_qsl(parsed.query, keep_blank_values=True))
            query.setdefault("sslmode", "require")
            url = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))

        return url

    def normalized_database_url(self) -> str:
        return self.normalize_database_url(self.database_url)

    def parsed_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def get_secret(self, key: str) -> str:
        if key == "AI_API_KEY" and self.ai_api_key:
            return self.ai_api_key

        if not self.vault_enabled:
            return ""

        if not self.vault_master_key.strip():
            raise SecretVaultError("VAULT_ENABLED=true but VAULT_MASTER_KEY is not set.")

        value = read_secret(path=self.vault_path, master_key=self.vault_master_key, key=key)
        return value or ""

    def get_ai_api_key(self) -> str:
        return self.get_secret("AI_API_KEY")


@lru_cache
def get_settings() -> Settings:
    return Settings()
