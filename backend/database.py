import os
import asyncpg
from dotenv import load_dotenv

# 1. Load Environment Variables
# Load from parent directory .env (root of potential deployment or project)
# Adjust path if .env is inside backend/
load_dotenv() 

# 2. Get Database URL
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Fallback to direct string if env not set (for development continuity only - not best practice)
    DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres"
    print("Warning: DATABASE_URL not found in .env, using fallback.")

db_pool = None

async def init_db():
    global db_pool
    print("=== DB INIT START ===")
    print("DATABASE_URL =", DATABASE_URL)

    try:
        db_pool = await asyncpg.create_pool(
            DATABASE_URL,
            timeout=10,
            min_size=1,
            max_size=5,
        )
        print("✅ Database connection pool initialized.")
    except Exception as e:
        print("❌ REAL DB ERROR TYPE:", type(e))
        print("❌ REAL DB ERROR MSG:", e)
        db_pool = None

    print("=== DB INIT END ===")


async def close_db():
    global db_pool
    if db_pool:
        await db_pool.close()
        print("✅ Database connection pool closed.")
    db_pool = None

async def get_db_pool():
    if db_pool is None:
        print("❌ Critical: Database pool accessed before initialization")
        raise RuntimeError("Database pool not initialized")
    return db_pool
