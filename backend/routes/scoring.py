from fastapi import APIRouter
from .. import database
from ..common import (
    fetch_match_state, build_match_response, fetch_player, swap_strikers, check_over_completion,
    SimpleMatchRequest, ScoreUpdate, NewBatsmanRequest
)

router = APIRouter()

@router.post("/end_inning")
async def end_inning(payload: SimpleMatchRequest):
    try:
        async with database.db_pool.acquire() as conn:
            async with conn.transaction():
                match_id = payload.match_id
                match = await fetch_match_state(conn, match_id)
                if not match: return {"status": "error", "message": "Match not found"}
                
                # 1. Calculate Target
                first_inn_score = match['team_score']
                target = first_inn_score + 1
                
                # 2. Swap Teams
                old_batting = match['team_name_batting']
                old_bowling = match['team_name_bowling']
                
                new_batting = old_bowling
                new_bowling = old_batting
                
                # 3. Reset for Inning 2
                await conn.execute("""
                    UPDATE matches 
                    SET 
                        current_inning = 2,
                        target_score = $1,
                        team_name_batting = $2,
                        team_name_bowling = $3,
                        team_score = 0,
                        wickets = 0,
                        overs = 0, 
                        balls = 0,
                        current_striker_id = NULL,
                        non_striker_id = NULL,
                        current_bowler_id = NULL
                    WHERE id = $4
                """, target, new_batting, new_bowling, match_id)
                
                return {
                    "status": "inning_break",
                    "target": target,
                    "new_batting_team": new_batting,
                    "message": f"Innings Break! Target set: {target} runs"
                }

    except Exception as e:
        print(f"Error ending inning: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/undo_last_action")
async def undo_last_action(payload: SimpleMatchRequest):
    try:
        async with database.db_pool.acquire() as conn:
            async with conn.transaction():
                match_id = payload.match_id
                # 1. Fetch Last Ball
                ball = await conn.fetchrow("""
                    SELECT * FROM balls WHERE match_id = $1 ORDER BY id DESC LIMIT 1
                """, match_id)
                if not ball:
                    return {"status": "error", "message": "No actions to undo"}
                
                ball_id = ball['id']
                striker_id = ball['striker_id']
                runs_bat = ball['runs_off_bat']
                extras = ball['extras']
                extra_type = ball['extra_type']
                is_wicket = ball['is_wicket']
                is_four = ball['is_four']
                is_six = ball['is_six']
                ball_no = ball['ball_no']
                action_type = ball['action_type']
                
                # 2. Revert Match Score
                total_runs = runs_bat + extras
                if total_runs != 0:
                     await conn.execute("UPDATE matches SET team_score = team_score - $1 WHERE id = $2", total_runs, match_id)

                # 3. Revert Match Balls/Overs
                is_legal_ball = True
                if action_type in ['wide', 'noball', 'penalty']:
                    is_legal_ball = False
                    
                match = await fetch_match_state(conn, match_id)
                current_balls = match['balls']
                current_overs = match['overs']
                
                if is_legal_ball:
                    if current_balls > 0:
                        await conn.execute("UPDATE matches SET balls = balls - 1 WHERE id = $1", match_id)
                    else:
                        if ball_no == 6 and current_overs > 0:
                            await conn.execute("UPDATE matches SET overs = overs - 1, balls = 5 WHERE id = $1", match_id)
                            await swap_strikers(conn, match, match_id) 

                # 4. Revert Player Stats
                if action_type != 'penalty':
                    batter_balls_sub = 1 if is_legal_ball or action_type in ['noball', 'wicket'] or action_type in ['bye', 'leg-bye'] else 0
                    
                    if action_type == 'wide': batter_balls_sub = 0
                    elif action_type == 'noball': batter_balls_sub = 1
                    elif is_legal_ball: batter_balls_sub = 1
                    
                    if runs_bat > 0 or batter_balls_sub > 0:
                         await conn.execute("""
                            UPDATE players 
                            SET runs = runs - $1, balls = balls - $2
                            WHERE id = $3
                        """, runs_bat, batter_balls_sub, striker_id)
                    
                    if is_four:
                         await conn.execute("UPDATE players SET fours = fours - 1 WHERE id = $1", striker_id)
                    if is_six:
                         await conn.execute("UPDATE players SET sixes = sixes - 1 WHERE id = $1", striker_id)

                # 5. Revert Wicket
                if is_wicket:
                    player_out_id = striker_id 
                    wicket_info = await conn.fetchrow("SELECT player_out_id FROM wickets WHERE ball_id = $1", ball_id)
                    if wicket_info:
                         player_out_id = wicket_info['player_out_id']
                    
                    await conn.execute("UPDATE players SET is_out = FALSE WHERE id = $1", player_out_id)
                    await conn.execute("UPDATE matches SET wickets = wickets - 1 WHERE id = $1", match_id)
                    
                    if player_out_id == striker_id:
                         await conn.execute("UPDATE matches SET current_striker_id = $1 WHERE id = $2", player_out_id, match_id)
                    else:
                         await conn.execute("UPDATE matches SET non_striker_id = $1 WHERE id = $2", player_out_id, match_id)

                    await conn.execute("DELETE FROM wickets WHERE ball_id = $1", ball_id)

                # 6. Swap Reversal (If not over change)
                must_swap = False
                if action_type != 'penalty':
                    run_check = runs_bat
                    if action_type in ['bye', 'leg-bye']: run_check = extras
                    if action_type == 'noball': run_check = int(runs_bat)
                    
                    if run_check % 2 != 0:
                        must_swap = True
                
                if must_swap:
                     await swap_strikers(conn, match, match_id) 

                # 7. Delete Ball
                await conn.execute("DELETE FROM balls WHERE id = $1", ball_id)
                
                return {"status": "success", "message": f"Undid ball {ball_id}", "data": await build_match_response(conn, match_id)}
                
    except Exception as e:
        print(f"Undo Error: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/update_score")
async def update_score(payload: ScoreUpdate):
    try:
        async with database.db_pool.acquire() as conn:
            async with conn.transaction():
                match_id = payload.match_id
                match = await fetch_match_state(conn, match_id)
                if not match: return {"status": "error", "message": "Match not found"}
                
                striker_id = match['current_striker_id']
                non_striker_id = match['non_striker_id']
                bowler_id = match['current_bowler_id']
                
                striker_row = await fetch_player(conn, striker_id)
                striker_out_name = striker_row['name'] if striker_row else "Unknown"
                
                action = payload.action
                
                try: value = int(payload.value)
                except: value = 0
                
                wicket_type = str(payload.value) if action == 'wicket' else None
                if payload.type: wicket_type = payload.type
                
                is_legal_ball = True
                runs_batsman = 0
                runs_extras = 0
                is_wicket = (action == 'wicket')
                
                if action in ['run', 'boundary']: runs_batsman = value
                elif action == 'wide': runs_extras = 1 + value; is_legal_ball = False
                elif action == 'noball': runs_batsman = value; runs_extras = 1; is_legal_ball = False
                elif action in ['bye', 'leg-bye']: runs_extras = value; is_legal_ball = True
                elif action == 'penalty': runs_extras = value; is_legal_ball = False
                
                ball_increment = 0
                if is_legal_ball and action != 'penalty': ball_increment = 1
                
                current_over = match['overs']
                current_ball = match['balls'] + ball_increment
                
                extra_type = action if action in ['wide', 'noball', 'bye', 'leg-bye'] else None
                is_boundary_4 = (runs_batsman == 4)
                is_boundary_6 = (runs_batsman == 6)
                if payload.type == 'boundary':
                    if runs_batsman == 4: is_boundary_4 = True
                    if runs_batsman == 6: is_boundary_6 = True
                
                ball_id = await conn.fetchval("""
                    INSERT INTO balls (
                        match_id, inning_no, over_no, ball_no, 
                        striker_id, non_striker_id, bowler_id, 
                        runs_off_bat, extras, is_wicket, action_type,
                        extra_type, is_four, is_six, wicket_type
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    RETURNING id
                """, match_id, match.get('current_inning', 1), current_over, current_ball, 
                   striker_id, non_striker_id, bowler_id,
                   runs_batsman, runs_extras, is_wicket, action,
                   extra_type, is_boundary_4, is_boundary_6, wicket_type
                )
                
                total_runs = runs_batsman + runs_extras
                if total_runs != 0:
                    await conn.execute("UPDATE matches SET team_score = team_score + $1 WHERE id = $2", total_runs, match_id)
                
                if ball_increment > 0:
                    await conn.execute("UPDATE matches SET balls = balls + 1 WHERE id = $1", match_id)

                if action != 'penalty': 
                    batter_balls_add = 0
                    if is_legal_ball or action in ['noball', 'wicket']: batter_balls_add = 1
                    if action in ['bye', 'leg-bye']: batter_balls_add = 1
                    
                    if runs_batsman > 0 or batter_balls_add > 0:
                         await conn.execute("UPDATE players SET runs=runs+$1, balls=balls+$2 WHERE id=$3", runs_batsman, batter_balls_add, striker_id)
                         if is_boundary_4: await conn.execute("UPDATE players SET fours=fours+1 WHERE id=$1", striker_id)
                         if is_boundary_6: await conn.execute("UPDATE players SET sixes=sixes+1 WHERE id=$1", striker_id)

                if is_wicket:
                    current_wickets = match['wickets'] + 1
                    score_str = f"{match['team_score'] + total_runs}/{current_wickets}"
                    await conn.execute("INSERT INTO wickets (ball_id, player_out_id, wicket_type, score_at_dismissal) VALUES ($1, $2, $3, $4)", ball_id, striker_id, wicket_type, score_str)
                    await conn.execute("UPDATE matches SET wickets = wickets + 1 WHERE id = $1", match_id)
                    await conn.execute("UPDATE players SET is_out = TRUE WHERE id = $1", striker_id)
                    
                    if current_wickets >= 10: return {"status": "innings_over", "message": "All Out!", "data": await build_match_response(conn, match_id)}
                    return {"status": "wicket_fall", "out_player": striker_out_name, "data": await build_match_response(conn, match_id)}

                must_swap = False
                if action != 'penalty':
                    run_check = runs_batsman
                    if action in ['bye', 'leg-bye']: run_check = runs_extras
                    if action == 'noball': run_check = int(value)
                    if run_check % 2 != 0: must_swap = True
                
                if must_swap: await swap_strikers(conn, match, match_id)

                fresh_match = await fetch_match_state(conn, match_id)
                await check_over_completion(conn, fresh_match, match_id)
                if fresh_match['balls'] >= 6 or (match['overs'] != fresh_match['overs']):
                     return {"status": "over_complete", "message": "Over Complete", "data": await build_match_response(conn, match_id)}

            return {"status": "success", "data": await build_match_response(conn, match_id)}
    except Exception as e:
        print(f"Error: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/set_new_batsman")
async def set_new_batsman(payload: NewBatsmanRequest):
    try:
        async with database.db_pool.acquire() as conn:
            match_id = payload.match_id
            column = "current_striker_id"
            if payload.role == 'non_striker':
                column = "non_striker_id"
                
            await conn.execute(f"UPDATE matches SET {column} = $1 WHERE id = $2", payload.new_player_id, match_id)
            return await build_match_response(conn, match_id)
    except Exception as e:
        print(f"Error setting batsman: {e}")
        return {"error": str(e)}

@router.post("/set_bowler")
async def set_bowler(payload: NewBatsmanRequest):
    try:
        async with database.db_pool.acquire() as conn:
            match_id = payload.match_id
            await conn.execute("""
                UPDATE matches 
                SET current_bowler_id = $1 
                WHERE id = $2
            """, payload.new_player_id, match_id)
            return await build_match_response(conn, match_id)
    except Exception as e:
        print(f"Error setting bowler: {e}")
        return {"error": str(e)}
