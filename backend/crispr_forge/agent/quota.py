"""Lightweight persistent daily Free Trial Quota tracker protecting Admin LLM API budget."""

from __future__ import annotations

import json
import threading
from datetime import date
from pathlib import Path
from typing import Optional

from crispr_forge.config import settings
from crispr_forge.models import QuotaStatus


class QuotaManager:
    """Tracks per-client daily free AI trial calls when using the server's admin LLM key."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self._path = db_path or settings.quota_db_path
        self._lock = threading.Lock()

    def _today(self) -> str:
        return date.today().isoformat()

    def _load(self) -> dict[str, dict[str, int]]:
        if not self._path.exists():
            return {}
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _save(self, data: dict[str, dict[str, int]]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # Keep only today's bucket to prevent unbounded file growth
        today = self._today()
        pruned = {today: data.get(today, {})}
        self._path.write_text(json.dumps(pruned, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_status(
        self,
        client_id: str,
        byok_api_key: Optional[str] = None,
        byok_model: Optional[str] = None,
    ) -> QuotaStatus:
        using_byok = bool(byok_api_key and byok_api_key.strip())
        admin_configured = bool(settings.llm_api_key and settings.llm_api_key.strip())
        limit = max(0, settings.free_trial_daily_limit)

        with self._lock:
            data = self._load()
            used = int(data.get(self._today(), {}).get(client_id, 0))

        remaining = max(0, limit - used) if admin_configured else 0

        if using_byok:
            active_model = byok_model or settings.llm_model or "custom-llm"
        elif admin_configured and remaining > 0:
            active_model = settings.llm_model or "deepseek-chat"
        else:
            active_model = "deterministic-zero-trust"

        return QuotaStatus(
            free_trial_enabled=admin_configured and limit > 0,
            daily_limit=limit if admin_configured else 0,
            used_today=used,
            remaining_today=remaining,
            using_byok=using_byok,
            active_model=active_model,
        )

    def try_consume_trial(self, client_id: str) -> tuple[bool, QuotaStatus]:
        """Atomically check and increment today's free trial usage for `client_id`."""
        admin_configured = bool(settings.llm_api_key and settings.llm_api_key.strip())
        limit = max(0, settings.free_trial_daily_limit)
        if not admin_configured or limit <= 0:
            return False, self.get_status(client_id)

        today = self._today()
        with self._lock:
            data = self._load()
            bucket = data.setdefault(today, {})
            used = int(bucket.get(client_id, 0))
            if used >= limit:
                status = QuotaStatus(
                    free_trial_enabled=True,
                    daily_limit=limit,
                    used_today=used,
                    remaining_today=0,
                    using_byok=False,
                    active_model="deterministic-zero-trust",
                )
                return False, status
            bucket[client_id] = used + 1
            self._save(data)
            status = QuotaStatus(
                free_trial_enabled=True,
                daily_limit=limit,
                used_today=used + 1,
                remaining_today=max(0, limit - (used + 1)),
                using_byok=False,
                active_model=settings.llm_model or "deepseek-chat",
            )
            return True, status


quota_manager = QuotaManager()
