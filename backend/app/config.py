import sys
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./tac.db"
    SECRET_KEY: str = "dev-secret-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Comma-separated allowed CORS origins, e.g. "https://app.example.com,https://www.example.com"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:4173"

    TERMINAL49_API_KEY: str = ""
    TERMINAL49_WEBHOOK_SECRET: str = ""

    # Email scanner — set these in .env to enable automatic ETA updates
    EMAIL_IMAP_SERVER: str = ""   # e.g. imap.gmail.com or outlook.office365.com
    EMAIL_ADDRESS: str = ""       # your email address
    EMAIL_PASSWORD: str = ""      # app password (Gmail: 16-char app password)
    EMAIL_SCAN_INTERVAL_MINUTES: int = 30

    class Config:
        env_file = ".env"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()

if settings.SECRET_KEY in ("dev-secret-change-in-production", "CHANGE_ME_generate_a_real_secret", "change-this-to-a-random-secret"):
    print(
        "\n⚠️  WARNING: SECRET_KEY is set to the insecure default. "
        "Generate a real key:\n"
        "    python -c \"import secrets; print(secrets.token_hex(32))\"\n"
        "and set it in your .env file.\n",
        file=sys.stderr,
    )
