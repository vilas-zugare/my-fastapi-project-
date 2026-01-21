from fastapi import APIRouter, HTTPException
from .. import database
from ..common import (
    fetch_match_state, build_match_response, fetch_player, 
    SimpleMatchRequest, NewBatsmanRequest, SquadSelectionRequest, EndMatchRequest
)

router = APIRouter()

@router.get("/match_data")
async def get_match_data(match_id: int):
    try:
        async with database.db_pool.acquire() as conn:
            return await build_match_response(conn, match_id)
    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}

@router.get("/available_players")
async def get_available_players(match_id: int):
    try:
        async with database.db_pool.acquire() as conn:
            match = await fetch_match_state(conn, match_id)
            if not match: return {"error": "Match not found"}
            
            striker_id = match['current_striker_id']
            non_striker_id = match['non_striker_id']
            current_ids = []
            if striker_id: current_ids.append(striker_id)
            if non_striker_id: current_ids.append(non_striker_id)
            
            # Filter by Batting Team Name
            team_name = match.get('team_name_batting')
            team_id = None
            if team_name:
                team_row = await conn.fetchrow("SELECT id FROM teams WHERE name = $1", team_name)
                if team_row: team_id = team_row['id']
            
            if team_id:
                if not current_ids:
                    rows = await conn.fetch("""
                        SELECT id, name FROM players 
                        WHERE is_out = FALSE AND team_id = $1
                    """, team_id)
                else:
                    rows = await conn.fetch("""
                        SELECT id, name FROM players 
                        WHERE is_out = FALSE AND team_id = $1 AND id != ALL($2)
                    """, team_id, current_ids)
            else:
                if not current_ids:
                    rows = await conn.fetch("SELECT id, name FROM players WHERE is_out = FALSE")
                else:
                    rows = await conn.fetch("""
                        SELECT id, name FROM players 
                        WHERE is_out = FALSE AND id != ALL($1)
                    """, current_ids)
            
            players = [{"id": r['id'], "name": r['name']} for r in rows]
            return {"players": players}
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

@router.get("/bowling_squad")
async def get_bowling_squad(match_id: int):
    try:
        async with database.db_pool.acquire() as conn:
            match = await fetch_match_state(conn, match_id)
            if not match: return {"players": []}
            
            # Robust Logic: Use Bowling Team Name
            bowling_team_name = match.get('team_name_bowling')
            if not bowling_team_name: 
                 return {"players": []}
            
            team_row = await conn.fetchrow("SELECT id FROM teams WHERE name = $1", bowling_team_name)
            if not team_row: return {"players": []}
            
            team_id = team_row['id']
            rows = await conn.fetch("""
                SELECT id, name FROM players 
                WHERE team_id = $1
            """, team_id)
            
            players = [{"id": r['id'], "name": r['name']} for r in rows]
            return {"players": players}
    except Exception as e:
        print(f"Error getting bowling squad: {e}")
        return {"error": str(e)}

@router.post("/matches/{match_id}/select_squad")
async def select_squad(match_id: int, payload: SquadSelectionRequest):
    try:
        async with database.db_pool.acquire() as conn:
            async with conn.transaction():
                values = [(match_id, pid, True) for pid in payload.player_ids]
                await conn.executemany("""
                    INSERT INTO match_squads (match_id, player_id, is_playing_11)
                    VALUES ($1, $2, $3)
                """, values)
                return {"status": "success", "message": f"Squad of {len(values)} selected"}
    except Exception as e:
        print(f"Error selecting squad: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/end_match")
async def end_match(payload: EndMatchRequest):
    try:
        async with database.db_pool.acquire() as conn:
            # Update match status to 'completed'
            await conn.execute("""
                UPDATE matches 
                SET status = 'completed', 
                    winner_id = $1, 
                    result_message = $2 
                WHERE id = $3
            """, payload.winner_id, payload.result, payload.match_id)
            
            return {"status": "success", "message": "Match completed and saved."}
    except Exception as e:
        print(f"Error ending match: {e}")
        raise HTTPException(status_code=500, detail=str(e))
