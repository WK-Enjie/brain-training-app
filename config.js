/* ═══════════════════════════════════════════════════════
   MYSTERY GRID REVEAL — config.js
   ✏️  THIS IS THE ONLY FILE YOU NEED TO EDIT
   ═══════════════════════════════════════════════════════ */

const CONFIG = {

    // ─── GitHub Settings (REQUIRED) ───
    // Replace with your actual GitHub username and repo name.
    // Example: if your repo URL is
    //   https://github.com/johndoe/mystery-grid-reveal
    // then GITHUB_USER = "johndoe"

    GITHUB_USER: "WK-Enjie",
    GITHUB_REPO: "mystery-grid-reveal",
    GITHUB_BRANCH: "main",

    // ─── Gameplay ───
    // Shuffle answer options every time a question loads.
    // Recommended: true (prevents students from memorising positions).
    SHUFFLE_OPTIONS: true,

    // ─── Advanced (usually leave as-is) ───
    QUESTIONS_PATH: "Questions",
    INDEX_FILE: "index.json",

    // Set to true ONLY when testing locally on your computer.
    // Must be false for GitHub Pages deployment.
    USE_LOCAL: false
};

// Auto-build the base URL — don't touch this.
CONFIG.BASE_URL = CONFIG.USE_LOCAL
    ? `./${CONFIG.QUESTIONS_PATH}`
    : `https://raw.githubusercontent.com/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/${CONFIG.GITHUB_BRANCH}/${CONFIG.QUESTIONS_PATH}`;
