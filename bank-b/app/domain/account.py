from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Account:
    id: str
    owner_name: str
    created_at: datetime
