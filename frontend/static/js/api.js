import { API_URL, MATCH_ID } from './config.js';
import { handleServerResponse, refreshUI } from './ui.js';
import { showSelectBowlerModal } from './modals.js';

export async function updateScore(action, value = null, extraData = {}) {
    if (!MATCH_ID) {
        alert("Error: Match ID is missing");
        return;
    }
    try {
        const payload = { match_id: MATCH_ID, action, value, ...extraData };
        console.log('Sending Payload:', payload);

        const response = await fetch(`${API_URL}/update_score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Server returned ${response.status}: ${errText}`);
        }

        const data = await response.json();
        console.log('Score updated:', data);

        handleServerResponse(data);
    } catch (error) {
        console.error('Error updating score:', error);
    }
}

export async function undoLastAction() {
    if (!confirm("Are you sure you want to Undo the last ball?")) return;
    try {
        console.log("Undoing last action...");
        const response = await fetch(`${API_URL}/undo_last_action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ match_id: MATCH_ID })
        });
        const data = await response.json();
        if (data.status === 'success') {
            console.log("Undo successful", data);
            if (data.data) {
                refreshUI(data.data);
            } else {
                fetch(`${API_URL}/match_data?match_id=${MATCH_ID}`)
                    .then(r => r.json())
                    .then(d => refreshUI(d));
            }
        } else {
            alert("Undo Failed: " + (data.message || "Unknown error"));
        }
    } catch (e) {
        console.error(e);
        alert("Undo Request Failed");
    }
}

export async function endInning() {
    try {
        console.log("Ending Inning...");
        const response = await fetch(`${API_URL}/end_inning`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ match_id: MATCH_ID })
        });
        const data = await response.json();
        handleServerResponse(data);
    } catch (e) {
        console.error(e);
        alert("Failed to end inning");
    }
}

export async function saveSquadToBackend(teamId, playerIds) {
    // renamed from saveSquad to avoid confusion with the window.saveSquad UI handler
    // But user asked to move "saveSquad (API part)" here.
    // The original code had window.saveSquad doing both UI and API.
    // I am splitting it. This function performs the fetch.

    try {
        const mId = MATCH_ID || 1;
        const res = await fetch(`${API_URL}/matches/${mId}/select_squad`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_id: parseInt(teamId), player_ids: playerIds })
        });
        const data = await res.json();
        return data; // Return full data to let UI handle success/error message
    } catch (e) {
        console.error(e);
        throw e;
    }
}
