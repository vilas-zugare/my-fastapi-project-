import { API_URL, MATCH_ID } from './config.js';
import { refreshUI } from './ui.js';

let targetBatsmanRole = 'striker';

export function initModals() {
    const confirmBtn = document.getElementById('confirmBatsmanBtn');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

        newBtn.addEventListener('click', async () => {
            const select = document.getElementById('newBatsmanSelect');
            const newPlayerId = select.value;

            if (!newPlayerId) return;

            console.log(`Setting ${targetBatsmanRole} to player ${newPlayerId}`);

            try {
                const response = await fetch(`${API_URL}/set_new_batsman`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        match_id: MATCH_ID,
                        new_player_id: parseInt(newPlayerId),
                        role: targetBatsmanRole
                    })
                });
                const data = await response.json();
                const modal = document.getElementById('newBatsmanModal');
                if (modal) modal.close();

                refreshUI(data);
            } catch (error) {
                console.error("Error setting batsman", error);
                alert("Failed to set new batsman.");
            }
        });
    }

    const confirmBowlerBtn = document.getElementById('confirmBowlerBtn');
    if (confirmBowlerBtn) {
        const newBtn = confirmBowlerBtn.cloneNode(true);
        confirmBowlerBtn.parentNode.replaceChild(newBtn, confirmBowlerBtn);

        newBtn.addEventListener('click', async () => {
            const select = document.getElementById('bowlerSelect');
            const newBowlerId = select.value;
            if (!newBowlerId) return;
            try {
                const response = await fetch(`${API_URL}/set_bowler`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ match_id: MATCH_ID, new_player_id: parseInt(newBowlerId) })
                });
                const data = await response.json();
                document.getElementById('selectBowlerModal').close();
                if (data.data) refreshUI(data.data);
                else refreshUI(data);
            } catch (error) {
                console.error("Error setting bowler", error);
                alert("Failed to set bowler.");
            }
        });
    }
}

export async function openBatsmanModal(title, teamId) {
    // If teamId not provided (e.g. called from wicket fall without specific team), try to infer?
    // The original code called it with data.batting_team_id
    // But handleWicketFall calls it without teamId initially? 
    // Wait, original handleWicketFall called: openBatsmanModal("Select New Batsman");
    // And openBatsmanModal logic:
    // "Fetching available players for team:", teamId
    // If no teamId passed, fetch to .../teams/undefined/players -> Error.
    // Actually original handleWicketFall was NOT passing teamId.
    // Does API support getting players without teamId if filtered by match?
    // Let's check original code.
    // Original openBatsmanModal took (title, teamId).
    // Original handleWicketFall did NOT pass teamId.
    // So teamId was undefined.
    // fetch(`${API_URL}/teams/${teamId}/players`) would be `/teams/undefined/players`.
    // That seems like a bug in the code I was given or I missed something.
    // Ah, wait. In `changeBatsman`, it passes `data.batting_team_id`.
    // In `handleWicketFall`, it calls `openBatsmanModal("Select New Batsman")`.
    // Let's look at `available_players` route in backend. It takes `match_id`.
    // But `openBatsmanModal` uses `/teams/{teamId}/players`.
    // If `teamId` is undefined, this fetch fails.

    // HOWEVER, the user said "Match not found" issue was the problem, implying the code MIGHT have worked otherwise?
    // OR maybe handleWicketFall was broken too.
    // I should fix this by using match_id if teamId is missing, OR getting teamId from window.currentMatchData.

    if (!teamId && window.currentMatchData && window.currentMatchData.batting_team_id) {
        teamId = window.currentMatchData.batting_team_id;
    }

    try {
        console.log("Fetching available players for team:", teamId);

        let url = `${API_URL}/available_players?match_id=${MATCH_ID}`;
        if (teamId) {
            // If we have a team ID, we might prefer using the team endpoint if strictly required,
            // BUT `available_players` endpoint is smarter (filters out already playing).
            // The original code used `/teams/${teamId}/players` inside openBatsmanModal?
            // Checking line 616 of scorer.js: `fetch(${API_URL}/teams/${teamId}/players`);`
            // So it WAS using team endpoint.
            // If teamId is undefined, this throws 404 or 500.
            url = `${API_URL}/teams/${teamId}/players`;
        } else {
            // Fallback to match available players if teamId missing
            url = `${API_URL}/available_players?match_id=${MATCH_ID}`;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error("Team players fetch failed");

        const pData = await res.json();

        const select = document.getElementById('newBatsmanSelect');
        if (!select) return;

        select.innerHTML = '';

        if (pData.players && pData.players.length > 0) {
            pData.players.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
            });
        } else {
            const opt = document.createElement('option');
            opt.textContent = "No players available";
            select.appendChild(opt);
        }

        const modalInfo = document.querySelector('#newBatsmanModal h3');
        if (modalInfo && title) modalInfo.textContent = title;

        const modal = document.getElementById('newBatsmanModal');
        if (modal) modal.showModal();

    } catch (e) {
        console.error("Error opening batsman modal:", e);
        alert("Error: " + e.message);
    }
}

export async function handleWicketFall(data) {
    console.warn("Handling Wicket Fall...");

    let p1 = data.current_batsmen ? data.current_batsmen[0] : null;
    let p2 = data.current_batsmen ? data.current_batsmen[1] : null;

    targetBatsmanRole = 'striker';

    if (p1 && p1.empty) {
        targetBatsmanRole = 'striker';
    } else if (p2 && p2.empty) {
        targetBatsmanRole = 'non_striker';
    }

    // Pass batting team ID if available
    const battingTeamId = data.batting_team_id;
    await openBatsmanModal("Select New Batsman", battingTeamId);
}

export async function showSelectBowlerModal() {
    try {
        const data = window.currentMatchData;
        if (!data || !data.bowling_team_id) {
            // alert("Error: No Bowling Team ID found."); // Suppress alert on init if data not loaded
            return;
        }

        console.log("Fetching bowling squad for team:", data.bowling_team_id);
        const res = await fetch(`${API_URL}/teams/${data.bowling_team_id}/players`);
        const pData = await res.json();

        const select = document.getElementById('bowlerSelect');
        if (!select) return;

        select.innerHTML = '<option value="" disabled selected>Select Bowler...</option>';
        if (pData.players && pData.players.length > 0) {
            pData.players.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
            });
        } else {
            const opt = document.createElement('option');
            opt.textContent = "No players found (Check Team Name)";
            select.appendChild(opt);
        }

        const modal = document.getElementById('selectBowlerModal');
        if (modal) modal.showModal();
    } catch (e) {
        console.error("Error fetching bowling squad", e);
        alert("Failed to load bowlers.");
    }
}

// Expose to window
window.changeBatsman = async function (role) {
    console.log("Change Batsman Requested for:", role);
    targetBatsmanRole = role;

    const data = window.currentMatchData;
    if (!data || !data.batting_team_id) {
        alert("Error: No Batting Team ID found. Please refresh.");
        return;
    }

    await openBatsmanModal(`Select New ${role === 'striker' ? 'Striker' : 'Non-Striker'}`, data.batting_team_id);
}

window.showSelectBowlerModal = showSelectBowlerModal;
window.handleWicketFall = handleWicketFall;
