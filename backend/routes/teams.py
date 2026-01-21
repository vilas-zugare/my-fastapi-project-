from fastapi import APIRouter
from .. import database

router = APIRouter()

@router.get("/teams/{team_id}/players")
async def get_team_players(team_id: int):
    try:
        pool = await database.get_db_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM players WHERE team_id = $1 ORDER BY id", team_id)
            players = [dict(row) for row in rows]
            return {"players": players}
    except Exception as e:
        print(f"Error getting team players: {e}")
        return {"error": str(e)}

@router.get("/teams")
async def get_teams():
    try:
        pool = await database.get_db_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM teams ORDER BY name")
            return {"teams": [dict(r) for r in rows]}
    except Exception as e:
        print(f"Error getting teams: {e}")
        return {"error": str(e)}
