#
# config.py
# backend
#
# Created by mzq on 2025/5/26
#

import tempfile
from pathlib import Path


class Config:
    DATABASE = "../database/game_league.db"
    ADMIN_UPLOAD_DIR = str(Path(tempfile.gettempdir()) / "nsh-match-admin-imports")
