import { openBatsmanModal, showSelectBowlerModal } from './modals.js';
import { MATCH_ID, API_URL } from './config.js';
import { handleWicketFall } from './modals.js';

export function handleServerResponse(data) {
    if (!data) return;

    if (data.status === 'wicket_fall') {
        handleWicketFall(data);
    } else if (data.status === 'over_complete') {
        console.log("Over Complete!");
        if (data.data) refreshUI(data.data);
        showSelectBowlerModal();
    } else if (data.status === 'inning_break') {
        // HANDLE END INNING
        alert(data.message);
        if (window.switchTab) window.switchTab('squad');
        fetch(`${API_URL}/match_data?match_id=${MATCH_ID}`)
            .then(r => r.json())
            .then(d => refreshUI(d));

    } else if (data.data) {
        refreshUI(data.data);
    } else if (data.innings) {
        refreshUI(data);
    }
}

export function refreshUI(data) {
    if (!data || !data.innings) return;

    // 1. ALWAYS Update Header Stats (Unconditional)
    const teamScoreEl = document.getElementById('header_score');
    if (teamScoreEl) {
        teamScoreEl.textContent = `${data.innings.runs}/${data.innings.wickets}`;
    }

    const oversTextEl = document.getElementById('header_overs');
    // Ensure overs are formatted correctly (e.g., 0.0)
    let oversStr = String(data.innings.overs);
    if (!oversStr.includes('.')) oversStr += ".0";
    if (oversTextEl) {
        oversTextEl.textContent = `(${oversStr} ov)`;
    }

    const teamNameEl = document.getElementById('header_team_name');
    if (teamNameEl) {
        teamNameEl.textContent = data.batting_team || "Batting Team";
    }

    const bowlTeamEl = document.getElementById('header_bowling_name');
    if (bowlTeamEl) {
        bowlTeamEl.textContent = data.bowling_team || "Bowling Team";
    }

    // 2. The Target Logic (Crucial Fix)
    const targetBox = document.getElementById('target-display');
    const currentInning = data.innings.current_inning || 1;
    const targetScore = data.innings.target || 0; // Backend usually sends 'target' inside innings or root

    if (targetBox) {
        if (currentInning === 2 && targetScore > 0) {
            targetBox.style.display = 'block';
            targetBox.innerHTML = `Target: <span style="color:#ffd700; font-weight:bold;">${targetScore}</span>`;
        } else {
            targetBox.style.display = 'none';
        }
    }

    // Logic to show 1st Inning Score on the Right Side (Bowling Team Card)
    const bowlScoreEl = document.getElementById('header_bowling_score');
    if (bowlScoreEl) {
        if (currentInning === 2 && targetScore > 0) {
            // Calculate 1st Inning Score: (Target - 1)
            const firstInningRuns = targetScore - 1;
            // Display it
            bowlScoreEl.innerText = firstInningRuns;
            bowlScoreEl.style.display = 'block';
        } else {
            // In 1st Inning, the bowling team hasn't batted yet
            bowlScoreEl.innerText = "";
        }
    }

    // 3. The "End Inning" Button Logic (Simple Version)
    const endInningBtn = document.getElementById('btn_end_inning');
    if (endInningBtn) {
        if (currentInning === 2) {
            // If match is done or 2nd inning, hide or disable
            endInningBtn.style.display = 'none';
            // Or: endInningBtn.disabled = true; endInningBtn.textContent = "Match Done";
        } else {
            // Inning 1
            endInningBtn.style.display = 'inline-block';
            endInningBtn.disabled = false;
            endInningBtn.textContent = "End Inning";
            // Note: The click listener is already attached in initButtons()
        }
    }

    // 4. The Notification Bar (Priority Logic)
    updateNotificationBar(data);

    // --- Player Cards (Standard Update) ---
    const p1 = data.current_batsmen ? data.current_batsmen[0] : null;
    const p2 = data.current_batsmen ? data.current_batsmen[1] : null;
    updateSpecificPlayerCard('p1', p1);
    updateSpecificPlayerCard('p2', p2);

    if (data.current_bowler) {
        updateBowlerCard(data.current_bowler);
    } else {
        const nameEl = document.getElementById('tv_bowler');
        if (nameEl) nameEl.textContent = "Select Bowler";
    }

    // Save for Modals
    window.currentMatchData = data;
}

function updateNotificationBar(data) {
    if (!data) return;

    const banner = document.querySelector('.toss-banner');
    if (!banner) return;

    // --- Priority System ---

    // Variables
    const currentRuns = parseInt(data.innings.runs) || 0;
    const target = parseInt(data.innings.target) || 0;
    const isSecondInnings = (data.innings.current_inning === 2);

    // Calculate balls bowled: "14.2" -> 14 overs, 2 balls
    const oversStr = data.innings.overs || "0.0";
    const [overs, balls] = oversStr.split('.').map(Number);
    const ballsBowled = (overs * 6) + (balls || 0);

    const totalOvers = data.total_overs || 20;
    const totalBallsMatch = totalOvers * 6;

    console.log("NotifCalc:", { currentRuns, target, isSecondInnings, ballsBowled, totalBallsMatch });

    // Check 1: Did Batting Team Win? (Score >= Target)
    if (isSecondInnings && target > 0 && currentRuns >= target) {
        banner.textContent = `${data.batting_team} Wins!`;
        banner.style.background = '#ffd700'; // Gold
        banner.style.color = '#000';
        banner.style.fontWeight = 'bold';
        return;
    }

    // Check 2: Did Bowling Team Win? (Overs finished AND runs < target - 1)
    // Note: target-1 is the tie score. So strictly less than target-1 means loss.
    if (isSecondInnings && ballsBowled >= totalBallsMatch && currentRuns < (target - 1)) {
        banner.textContent = `${data.bowling_team} Wins!`;
        banner.style.background = '#ffd700'; // Gold
        banner.style.color = '#000';
        banner.style.fontWeight = 'bold';
        return;
    }

    // Check 3: Is it a Tie? (Overs finished AND runs == target - 1)
    if (isSecondInnings && ballsBowled >= totalBallsMatch && currentRuns === (target - 1)) {
        banner.textContent = "Match Tied!";
        banner.style.background = '#ffa500'; // Orange
        banner.style.color = '#fff';
        banner.style.fontWeight = 'bold';
        return;
    }

    // Check 4: Result Message explicitly from Backend (Backup)
    if (data.result_message) {
        banner.textContent = data.result_message;
        banner.style.background = '#ffd700';
        banner.style.color = '#000';
        banner.style.fontWeight = 'bold';
        return;
    }

    // Check 5 (Default): Toss Message
    if (data.toss_winner_name && data.toss_decision) {
        const decision = data.toss_decision.charAt(0).toUpperCase() + data.toss_decision.slice(1);
        banner.textContent = `${data.toss_winner_name} won the toss and elected to ${decision}`;
        banner.style.background = '';
        banner.style.color = '';
        banner.style.fontWeight = '';
    } else {
        banner.textContent = "";
        banner.style.background = "";
    }
}

export function updateBowlerCard(bowler) {
    if (!bowler) return;
    const nameEl = document.getElementById('tv_bowler');
    if (nameEl) nameEl.textContent = bowler.name;

    const scoreEl = document.getElementById('tv_curBo_score');
    if (scoreEl) {
        if (bowler.figures) {
            scoreEl.textContent = bowler.figures;
        } else {
            const maidens = bowler.maidens || 0;
            const runs = bowler.runs_conceded || 0;
            const wkts = bowler.wickets || 0;
            scoreEl.textContent = `${bowler.overs} - ${maidens} - ${runs} - ${wkts}`;
        }
    }

    const econEl = document.getElementById('tv_curBo_econ');
    if (econEl) econEl.textContent = bowler.econ;
    const dotsEl = document.getElementById('tv_curBo_dots');
    if (dotsEl) dotsEl.textContent = bowler.dots;
    const extrasEl = document.getElementById('tv_curBo_extras');
    if (extrasEl) extrasEl.textContent = bowler.extras;
}

export function updateSpecificPlayerCard(prefix, player) {
    const nameEl = document.getElementById(`${prefix}_name`);
    const scoreEl = document.getElementById(`${prefix}_score`);
    const statsEl = document.getElementById(`${prefix}_stats`);

    if (!player || player.empty || !player.name) {
        if (nameEl) nameEl.textContent = "Select Batsman";
        if (scoreEl) scoreEl.textContent = "";
        if (statsEl) statsEl.textContent = "";
        if (nameEl) nameEl.style.color = 'var(--muted)';
        return;
    }

    if (nameEl) {
        nameEl.textContent = player.name + (player.on_strike ? ' *' : '');
        nameEl.style.color = player.on_strike ? '#fff' : '#ccc';
    }
    if (scoreEl) {
        scoreEl.innerHTML = `${player.runs} <span style="color:var(--muted);font-size:13px">(${player.balls})</span>`;
        scoreEl.style.color = player.on_strike ? '#ffb347' : '#fff';
    }
    if (statsEl) {
        statsEl.innerHTML = `4s : ${player.fours} &nbsp; 6s : ${player.sixes} &nbsp; SR : ${player.strike_rate}`;
    }
}

export function bootstrap() {
    console.log("Bootstrap: Fetching initial data...");
    if (!MATCH_ID) return alert("Missing Match ID in URL params");
    fetch(`${API_URL}/match_data?match_id=${MATCH_ID}`)
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                console.error("Match Data Error:", data.error);
                alert(data.error);
            }
            else {
                console.log("Match Data Loaded:", data);
                refreshUI(data);
            }
        })
        .catch(e => {
            console.error("Bootstrap Error:", e);
            alert("Failed to load match data. See console.");
        });
}
