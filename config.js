/* ============================================================
   MYSTERY GRID REVEAL — config.js
   ============================================================ */

const CONFIG = {
    GITHUB_USER:   "WK-Enjie",
    GITHUB_REPO:   "brain-training-app",
    GITHUB_BRANCH: "main",

    QUESTIONS_PATH: "Questions",
    INDEX_FILE:     "index.json",

    SHUFFLE_OPTIONS: true,
    WIN_THRESHOLD:   0.75,

    DELAY_CORRECT: 900,
    DELAY_WRONG:   1600,

    GAMBLE_ENABLED: true,
    GAMBLE_REWARD:  2,
    GAMBLE_PENALTY: 1,

    DEBUG: true,

    FALLBACK_FOLDERS: [
        "primary/math",
        "primary/science",
        "secondary/lower/math",
        "secondary/lower/science",
        "secondary/upper/emath",
        "secondary/upper/physics",
        "secondary/upper/chemistry"
    ],

    /* ─────────────────────────────────────────────────────────
       DEFAULT_SCHEMA
       Lists every possible field name the engine should accept.
       Checked in order — first match wins.
       You can override per-worksheet by adding a "schema" block
       to the worksheet JSON itself.
       ───────────────────────────────────────────────────────── */
    DEFAULT_SCHEMA: {
        worksheet: {
            title:    ["title", "name"],
            image:    ["revealImage", "image", "imageUrl", "img", "picture"],
            questions:["questions", "items", "quiz", "qs"]
        },
        question: {
            text:    ["qText", "question", "text", "q", "prompt", "stem", "body"],
            options: ["options", "choices", "answers", "opts", "alternatives"],
            answer:  ["correctIndex", "answerIndex", "answer", "correct",
                      "correctAnswer", "correct_answer", "correctOption",
                      "correct_index", "ans", "solution", "key"]
        }
    }
};
