/* ============================================================
   MYSTERY GRID REVEAL — config.js v3
   ============================================================ */

const CONFIG = {
    // --- GitHub (used as fallback if relative path fails) ---
    GITHUB_USER:   "WK-Enjie",
    GITHUB_REPO:   "brain-training-app",
    GITHUB_BRANCH: "main",

    // --- Paths ---
    QUESTIONS_PATH: "Questions",
    INDEX_FILE:     "index.json",

    // --- Gameplay ---
    SHUFFLE_OPTIONS: true,
    WIN_THRESHOLD:   0.75,     // 0–1 = percentage, or whole number = exact count

    DELAY_CORRECT: 900,        // ms before next question after a right answer
    DELAY_WRONG:   1600,       // ms before next question after a wrong answer

    // --- Gamble ---
    GAMBLE_ENABLED:  true,
    GAMBLE_REWARD:   2,        // tiles gained on a correct bet
    GAMBLE_PENALTY:  1,        // tiles lost on a wrong bet

    // --- Debug ---
    DEBUG: true,               // set false to silence console logs

    // --- Folders searched if a file path in index.json is wrong ---
    FALLBACK_FOLDERS: [
        "primary/math",
        "primary/science",
        "secondary/lower/math",
        "secondary/lower/science",
        "secondary/upper/emath",
        "secondary/upper/physics",
        "secondary/upper/chemistry"
    ]
};
