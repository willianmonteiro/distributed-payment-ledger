import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

load_dotenv()

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"

# Arbitrary key: serializes concurrent runners (e.g. two instances deploying at once).
ADVISORY_LOCK_KEY = 723532


async def migrate() -> None:
    connection = await asyncpg.connect(dsn=os.environ["DATABASE_URL"])
    try:
        await connection.execute("SELECT pg_advisory_lock($1)", ADVISORY_LOCK_KEY)
        await connection.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name       TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)

        applied = {
            row["name"] for row in await connection.fetch("SELECT name FROM schema_migrations")
        }
        files = sorted(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql"))

        for file in files:
            if file in applied:
                continue
            sql = (MIGRATIONS_DIR / file).read_text()
            async with connection.transaction():
                await connection.execute(sql)
                await connection.execute("INSERT INTO schema_migrations (name) VALUES ($1)", file)
            print(f"applied {file}")
    finally:
        await connection.execute("SELECT pg_advisory_unlock($1)", ADVISORY_LOCK_KEY)
        await connection.close()


if __name__ == "__main__":
    try:
        asyncio.run(migrate())
    except Exception as error:
        print(error, file=sys.stderr)
        sys.exit(1)
