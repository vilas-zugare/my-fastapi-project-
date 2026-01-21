// frontend/static/js/main.js
import { bootstrap } from './ui.js';
import { initButtons } from './events.js';
import { initModals } from './modals.js';

console.log("🚀 App Started");

document.addEventListener('DOMContentLoaded', () => {
    console.log("✅ DOM Loaded. Initializing App...");
    initButtons();
    initModals();
    bootstrap();
});
