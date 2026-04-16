from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
import os
import secrets


def _generate_secret_key() -> str:
    return secrets.token_hex(32)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_name: str = "Jambox"
    debug: bool = False
    secret_key: str = _generate_secret_key()
    frontend_url: str = "http://localhost:5173"

    # Database
    data_dir: Path = Path(__file__).parent.parent / "data"

    # Google OAuth (optional)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/callback"

    # JWT
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # Admins (comma-separated emails, or set via ADMIN_EMAILS env var)
    admin_emails: list[str] = []

    @property
    def db_path(self) -> Path:
        return self.data_dir / "jambox.db"

    @property
    def songs_dir(self) -> Path:
        return self.data_dir / "songs"


settings = Settings()
