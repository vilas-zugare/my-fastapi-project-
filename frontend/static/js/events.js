import { MENU_OPTIONS, ACTION_OPTIONS } from './config.js';
import { updateScore, undoLastAction, endInning } from './api.js';

export function showContextMenu(triggerBtn, typeOrRuns) {
    closeContextMenu();

    let options = MENU_OPTIONS[typeOrRuns];
    if (!options) {
        options = ACTION_OPTIONS[typeOrRuns];
    }

    if (!options) {
        console.warn("No options found for:", typeOrRuns);
        return;
    }

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    if (options.length > 8) {
        menu.style.maxHeight = '300px';
        menu.style.overflowY = 'auto';
    }

    menu.innerHTML = `<div class="menu-header">${typeOrRuns} Options</div>`;

    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = 'menu-item';

        let labelHtml = opt.label
            .replace(/Bat runs?/, '<strong>Bat</strong>')
            .replace(/Bye runs?/, '<strong>Bye</strong>')
            .replace(/Leg-Bye runs?/, '<strong>LB</strong>')
            .replace(/(Boundary)/, '<strong>$1</strong>');

        item.innerHTML = labelHtml;

        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const { action, value, ...rest } = opt;
            console.log("Option Clicked:", opt);
            updateScore(action, value, rest);
            closeContextMenu();
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    const rect = triggerBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    let top = rect.top + window.scrollY;
    let left = rect.right + 10 + window.scrollX;

    if (left + menuRect.width > window.innerWidth) {
        left = rect.left - menuRect.width - 10 + window.scrollX;
    }
    if (top + menuRect.height > document.documentElement.scrollHeight) {
        top = document.documentElement.scrollHeight - menuRect.height - 10;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    setTimeout(() => {
        document.addEventListener('click', documentClickListener);
    }, 100);
}

export function closeContextMenu() {
    const existing = document.querySelector('.context-menu');
    if (existing) {
        existing.remove();
    }
    document.removeEventListener('click', documentClickListener);
}

function documentClickListener(e) {
    if (!e.target.closest('.context-menu') && !e.target.closest('.btn-run') && !e.target.closest('.btn-action')) {
        closeContextMenu();
    }
}

export function initButtons() {
    console.log("Initializing Buttons...");
    const runBtns = document.querySelectorAll('.btn-run');
    runBtns.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const runs = parseInt(newBtn.textContent.trim());

            if (runs === 0) {
                closeContextMenu();
                updateScore('run', 0);
            } else {
                showContextMenu(newBtn, runs);
            }
        });
    });

    // --- UNDO CHECK ---
    const undoBtn = document.querySelector('.btn-undo');
    if (undoBtn) {
        console.log("Undo button found! Attaching listener.");
        const newBtn = undoBtn.cloneNode(true);
        undoBtn.parentNode.replaceChild(newBtn, undoBtn);
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("Undo Clicked");
            undoLastAction();
        });
    } else {
        console.warn("Undo button NOT found!");
    }

    const actionButtons = document.querySelectorAll('.btn-action');
    actionButtons.forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        const text = newBtn.textContent.trim();

        if (ACTION_OPTIONS[text]) {
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(newBtn, text);
            });
            return;
        }

        if (text === 'End Inning') {
            newBtn.addEventListener('click', () => {
                if (confirm("Are you sure you want to End the Inning?")) {
                    endInning();
                }
            });
            return;
        }

        let action = '';
        let value = null;

        if (text === 'Bowled') { action = 'wicket'; value = 'bowled'; }
        else if (text === 'Caught') { action = 'wicket'; value = 'caught'; }
        else if (text === 'LBW') { action = 'wicket'; value = 'lbw'; }
        else if (text === 'Retired Out') { action = 'wicket'; value = 'retired'; }


        if (action) {
            newBtn.addEventListener('click', () => {
                closeContextMenu();
                updateScore(action, value);
            });
        }
    });
}
