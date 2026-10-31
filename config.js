/* ═══════════════════════════════════════════════════════
   MYSTERY GRID REVEAL — config.js
   ✏️  THIS IS THE ONLY FILE YOU NEED TO EDIT
   ═══════════════════════════════════════════════════════ */

const CONFIG = {

    // ─── GitHub Settings (REQUIRED) ───
    GITHUB_USER: "WK-Enjie",
    GITHUB_REPO: "brain-training-app",
    GITHUB_BRANCH: "main",

    // ─── Gameplay ───

    // Shuffle answer options every time a question loads.
    SHUFFLE_OPTIONS: true,

    // How many correct answers to reveal the full image.
    //   • Decimal (0–1) = percentage of total questions
    //     Example: 0.75 → 18 out of 24, 9 out of 12
    //   • Whole number (≥1) = exact count
    //     Example: 18 → always 18 regardless of question count
    //   • 1 or 1.0 = must get ALL correct (original behaviour)
    WIN_THRESHOLD: 0.75,

    // ─── Advanced (usually leave as-is) ───
    QUESTIONS_PATH: "Questions",
    INDEX_FILE: "index.json",
    USE_LOCAL: false
};

// Auto-build the base URL — don't touch this.
CONFIG.BASE_URL = CONFIG.USE_LOCAL
    ? `./${CONFIG.QUESTIONS_PATH}`
    : `https://raw.githubusercontent.com/${CONFIG.GITHUB_USER}/${CONFIG.GITHUB_REPO}/${CONFIG.GITHUB_BRANCH}/${CONFIG.QUESTIONS_PATH}`;
