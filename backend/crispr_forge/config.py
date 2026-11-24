"""Application settings loaded from environment variables."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Admin-funded OpenAI-compatible LLM (DeepSeek recommended for low-cost visitor free trial)
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_model: str = "deepseek-chat"

    # Visitor Free Trial Quota (protects admin API budget; BYOK users bypass this limit)
    free_trial_daily_limit: int = 10

    # NCBI Entrez configuration
    ncbi_email: str = "crispr-forge@example.com"
    ncbi_api_key: str = ""

    # Server configuration
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @property
    def data_dir(self) -> Path:
        return Path(__file__).resolve().parent.parent / "data"

    @property
    def presets_dir(self) -> Path:
        return self.data_dir / "presets"

    @property
    def genomes_dir(self) -> Path:
        return self.data_dir / "genomes"

    @property
    def quota_db_path(self) -> Path:
        return self.data_dir / "quota_usage.json"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
