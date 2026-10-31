/* ═══════════════════════════════════════════════════════
   Mystery Grid Reveal — Game Engine v7.1
   Schema-driven loader · Robust math pipeline
   ═══════════════════════════════════════════════════════ */

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

/* ── Global State ── */
const STATE = {
    worksheet: null,
    questions: [],
    currentIndex: 0,
    score: 0,
    total: 0,
    tiles: [],
    gridCols: 6,
    gridRows: 4,
    timers: [],
    gambleActive: false,
    locked: false,
    baseResolved: null,
    currentFilePath: ''
};

/* ══════════════════════════════════════════════
   MATH PROCESSING PIPELINE
   Stash → Convert → Wrap → Restore
   ══════════════════════════════════════════════ */

/**
 * Convert plain-text math notation to LaTeX.
 * Handles fractions (including nested parens) and powers.
 */
function convertNotation(t) {
    if (!t) return t;

    // Nested-paren fractions: 5/(2(x - 3)) → \frac{5}{2(x - 3)}
    t = t.replace(/(\d+)\s*\/\s*\((\d+\([^()]+\))\)/g, '\\frac{$1}{$2}');

    // (expr)/(expr)
    t = t.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, '\\frac{$1}{$2}');

    // (expr)/n  e.g. (3x - 2)/4
    t = t.replace(/\(([^()]+)\)\s*\/\s*(\d+[a-z]?)/g, '\\frac{$1}{$2}');

    // n/(expr)  e.g. 4/(p + 3)
    t = t.replace(/(\d+)\s*\/\s*\(([^()]+)\)/g, '\\frac{$1}{$2}');

    // var/n  e.g. x/3
    t = t.replace(/([a-z])\s*\/\s*(\d+)/gi, '\\frac{$1}{$2}');

    // n/n  e.g. 7/12
    t = t.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');

    // Powers: ^2 → ^{2}
    t = t.replace(/\^(\d+)/g, '^{$1}');

    return t;
}

/**
 * Format a single answer option.
 * Options are short and almost always pure math.
 * Trailing units (cm², km, years) are extracted and kept as plain text.
 */
function formatOption(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let t = raw.trim();

    // Extract trailing unit
    const unitRe = /\s+(cm\^?2?|cm²|m\^?2?|m²|km\/?h?|km|kg|g|years?|marks?|minutes?|items?)$/i;
    const um = t.match(unitRe);
    let unit = '';
    if (um) {
        unit = um[0];
        t = t.slice(0, -unit.length);
        // Pretty-print unit superscripts
        unit = unit.replace(/\^2/g, '²').replace(/\^3/g, '³');
    }

    t = convertNotation(t);

    // Wrap in math delimiters only if it contains variables or operators
    if (t.trim() && /[a-z+\-*/=^\\]/i.test(t)) {
        t = '\\(' + t.trim() + '\\)';
    }

    return t + unit;
}

/**
 * Format a full question text (mixed English + math).
 * Uses the stash-convert-wrap-restore pipeline.
 */
function formatQuestionText(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let t = raw;
    const vault = [];
    const save = m => { vault.push(m); return '\x00V' + (vault.length - 1) + '\x00'; };

    /* ── Phase 1: Stash non-math tokens ── */

    // Currency: $21.80, $1.40, $50
    t = t.replace(/\$\d+(?:\.\d+)?/g, save);

    // Number + unit combos: 58 cm, 60 km/h, 100 cm^2, 40 minutes, 12 years, 4 marks
    t = t.replace(
        /\d+\s*(?:km\/h|cm\^2|cm²|m\^2|m²|cm|mm|m|km|kg|g|minutes?|mins?|hours?|hrs?|seconds?|secs?|years?|yrs?|marks?|questions?|items?|pens?|notebooks?)/gi,
        save
    );

    // Hyphenated: 30-question
    t = t.replace(/\d+-(?:question|mark|item|year|minute|hour)/gi, save);

    // Unit after closing paren: ") cm" in "(3x + 1) cm"
    t = t.replace(/(\))\s+(cm|mm|m|km|kg|g)\b/gi, (_, p, u) => p + save(' ' + u));

    /* ── Phase 2: Convert notation ── */
    t = convertNotation(t);

    /* ── Phase 3: Wrap math zones ── */

    // Pattern A — instruction colon: "Simplify: 7a - 3[2b - ...]"
    const colonIdx = t.lastIndexOf(':');
    if (colonIdx > 5 && colonIdx < t.length - 3) {
        const prefix   = t.substring(0, colonIdx + 1);
        let   mathPart = t.substring(colonIdx + 1).trim();
        if (mathPart && /[a-z]/i.test(mathPart.replace(/\\frac/g, ''))) {
            t = prefix + ' \\(' + mathPart + '\\)';
        }
    } else {
        // Pattern B — word problem: inline parenthesised expressions with variables
        t = t.replace(/(\([^)]*[a-z][^)]*\))/gi, m => {
            if (m.includes('\\(')) return m;
            return '\\(' + m + '\\)';
        });
        // Pattern B2 — digit+variable sequences: "3x + 1"
        t = t.replace(/((?:\d+[a-z]|[a-z]\d)(?:\s*[+\-*/=]\s*(?:\d+[a-z]?|\d+))*)/gi, m => {
            if (m.includes('\\(')) return m;
            return '\\(' + m + '\\)';
        });
    }

    /* ── Phase 4: Wrap standalone variables ── */
    // Catches lone x, y, a, b, p, k, m not already inside \( \)
    t = t.replace(/(?<![a-zA-Z\\])([xyzabpkm])(?![a-zA-Z{}])/gi, (m, v, offset, str) => {
        // Skip if already inside \( ... \)
        const before  = str.substring(Math.max(0, offset - 200), offset);
        const opens   = (before.match(/\\\(/g) || []).length;
        const closes  = (before.match(/\\\)/g) || []).length;
        if (opens > closes) return m;

        // Don't wrap the article "a" in common English contexts
        if (v.toLowerCase() === 'a') {
            const ctx = str.substring(Math.max(0, offset - 6), offset).trim().toLowerCase();
            if (/^(as|is|in|at|to|of|by|or|an|and|was|has|had|per|that|than)$/.test(ctx)) return m;
        }
        return '\\(' + v + '\\)';
    });

    /* ── Phase 5: Restore vault ── */
    t = t.replace(/\x00V(\d+)\x00/g, (_, i) => vault[parseInt(i)]);

    return t;
}

/**
 * Ask MathJax to re-typeset an element.
 */
async function typesetMath(el) {
    if (!el) return;
    try {
        if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
            await MathJax.startup.promise;
            if (MathJax.typesetClear)  MathJax.typesetClear([el]);
            if (MathJax.typesetPromise) await MathJax.typesetPromise([el]);
        }
    } catch (e) {
        if (CONFIG.DEBUG) console.warn('MathJax typeset error:', e);
    }
}

/* ══════════════════════════════════════════════
   SCHEMA-DRIVEN DATA LOADING
   ══════════════════════════════════════════════ */

function pick(obj, keys, fallback) {
    if (fallback === undefined) fallback = '';
    if (!obj || typeof obj !== 'object') return fallback;
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    }
    return fallback;
}

function mergeSchema(userSchema) {
    const base = JSON.parse(JSON.stringify(CONFIG.DEFAULT_SCHEMA));
    if (!userSchema) return base;
    for (const level of ['worksheet', 'question']) {
        if (userSchema[level]) {
            for (const field of Object.keys(userSchema[level])) {
                if (base[level][field]) {
                    base[level][field] = [...userSchema[level][field], ...base[level][field]];
                }
            }
        }
    }
    return base;
}

function normaliseQuestion(raw, index, schema) {
    if (!raw || typeof raw !== 'object') return null;

    const text = pick(raw, schema.question.text, '').toString().trim();
    if (!text) {
        if (CONFIG.DEBUG) console.warn('Q' + index + ': no text. Keys:', Object.keys(raw));
        return null;
    }

    let rawOpts = pick(raw, schema.question.options, null);
    let options = [];

    if (Array.isArray(rawOpts)) {
        options = rawOpts.map(o => String(o).trim());
    } else if (rawOpts && typeof rawOpts === 'object') {
        options = Object.keys(rawOpts).sort().map(k => String(rawOpts[k]).trim());
    }

    if (options.length < 2) {
        if (CONFIG.DEBUG) console.warn('Q' + index + ': insufficient options');
        return null;
    }

    let correctIndex = -1;
    const rawAns = pick(raw, schema.question.answer, null);

    if (typeof rawAns === 'number') {
        correctIndex = (rawAns >= 0 && rawAns < options.length) ? rawAns :
                       (rawAns >= 1 && rawAns <= options.length) ? rawAns - 1 : -1;
    } else if (typeof rawAns === 'string') {
        const num = parseInt(rawAns, 10);
        if (!isNaN(num)) {
            correctIndex = (num >= 0 && num < options.length) ? num :
                           (num >= 1 && num <= options.length) ? num - 1 : -1;
        } else if (/^[A-Da-d]$/.test(rawAns)) {
            correctIndex = rawAns.toUpperCase().charCodeAt(0) - 65;
        } else {
            correctIndex = options.findIndex(o => o.toLowerCase() === rawAns.toLowerCase());
        }
    }

    if (correctIndex < 0 || correctIndex >= options.length) {
        if (CONFIG.DEBUG) console.warn('Q' + index + ': bad answer', rawAns);
        return null;
    }

    return { text, options, correctIndex };
}

function normaliseWorksheet(raw) {
    if (!raw) return null;
    const schema  = mergeSchema(raw.schema);
    const title   = pick(raw, schema.worksheet.title, 'Untitled Worksheet');
    const image   = pick(raw, schema.worksheet.image, '');
    const rawQs   = pick(raw, schema.worksheet.questions, []);

    if (!Array.isArray(rawQs) || rawQs.length === 0) {
        if (CONFIG.DEBUG) console.warn('No questions found. Keys:', Object.keys(raw));
        return null;
    }

    const questions = [];
    rawQs.forEach((q, i) => {
        const nq = normaliseQuestion(q, i, schema);
        if (nq) questions.push(nq);
    });

    if (questions.length === 0) return null;
    return { title, image, questions };
}

/* ── Fetching ── */

async function resolveBase() {
    if (STATE.baseResolved) return STATE.baseResolved;

    const localBase = './' + CONFIG.QUESTIONS_PATH + '/';
    try {
        const r = await fetch(localBase + CONFIG.INDEX_FILE, { method: 'HEAD' });
        if (r.ok) { STATE.baseResolved = localBase; return localBase; }
    } catch (_) {}

    const ghBase = 'https://raw.githubusercontent.com/' +
        CONFIG.GITHUB_USER + '/' + CONFIG.GITHUB_REPO + '/' +
        CONFIG.GITHUB_BRANCH + '/' + CONFIG.QUESTIONS_PATH + '/';
    STATE.baseResolved = ghBase;
    return ghBase;
}

async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

async function loadWorksheetFile(filePath) {
    const base = await resolveBase();
    try { return await fetchJSON(base + filePath); } catch (_) {}

    const filename = filePath.split('/').pop();
    for (const folder of CONFIG.FALLBACK_FOLDERS) {
        try {
            const data = await fetchJSON(base + folder + '/' + filename);
            if (CONFIG.DEBUG) console.log('Found via fallback:', folder + '/' + filename);
            return data;
        } catch (_) {}
    }
    throw new Error('Cannot find ' + filename);
}

/* ══════════════════════════════════════════════
   SCREEN & UI HELPERS
   ══════════════════════════════════════════════ */

function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = $('#' + id);
    if (el) el.classList.add('active');
}

function showToast(msg, ms) {
    if (ms === undefined) ms = 2200;
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), ms);
}

function clearTimers() {
    STATE.timers.forEach(clearTimeout);
    STATE.timers = [];
}

function addTimer(fn, ms) {
    const id = setTimeout(fn, ms);
    STATE.timers.push(id);
    return id;
}

/* ══════════════════════════════════════════════
   LAUNCHER
   ══════════════════════════════════════════════ */

async function buildLauncher() {
    const list  = $('#worksheet-list');
    const errEl = $('#launcher-error');
    if (!list) return;

    try {
        const base  = await resolveBase();
        const index = await fetchJSON(base + CONFIG.INDEX_FILE);

        if (!Array.isArray(index) || index.length === 0) {
            list.innerHTML = '<p class="loading-msg">No worksheets found.</p>';
            return;
        }

        list.innerHTML = '';
        index.forEach(ws => {
            const card = document.createElement('button');
            card.className = 'ws-card';
            card.innerHTML =
                '<span class="ws-icon">' + (ws.icon || '📄') + '</span>' +
                '<span class="ws-info">' +
                    '<strong>' + (ws.title || 'Untitled') + '</strong>' +
                    '<small>' + (ws.subject || '') + ' · ' + (ws.topic || '') + ' · ' + (ws.questionCount || '?') + ' Qs</small>' +
                '</span>';
            card.addEventListener('click', () => launchGame(ws.file));
            list.appendChild(card);
        });
    } catch (e) {
        if (errEl) {
            errEl.textContent = 'Failed to load worksheets: ' + e.message;
            errEl.classList.remove('hidden');
        }
        if (CONFIG.DEBUG) console.error(e);
    }
}

/* ══════════════════════════════════════════════
   GAME ENGINE
   ══════════════════════════════════════════════ */

async function launchGame(filePath) {
    if (!filePath) return;
    clearTimers();
    STATE.currentFilePath = filePath;

    try {
        const raw = await loadWorksheetFile(filePath);
        const ws  = normaliseWorksheet(raw);
        if (!ws) { showToast('Failed to parse worksheet'); return; }

        STATE.worksheet    = ws;
        STATE.questions    = ws.questions;
        STATE.total        = ws.questions.length;
        STATE.currentIndex = 0;
        STATE.score        = 0;
        STATE.locked       = false;
        STATE.gambleActive = false;

        computeGrid();
        setupGameScreen();
        showScreen('game-screen');
        buildGrid();
        showQuestion();
    } catch (e) {
        showToast('Error: ' + e.message);
        if (CONFIG.DEBUG) console.error(e);
    }
}

function computeGrid() {
    const n    = STATE.total;
    const cols = Math.ceil(Math.sqrt(n * 1.5));
    const rows = Math.ceil(n / cols);
    STATE.gridCols = cols;
    STATE.gridRows = rows;
}

function placeholderSVG() {
    return 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="533">' +
        '<rect fill="#16213e" width="800" height="533"/>' +
        '<text x="400" y="250" text-anchor="middle" fill="#556" font-size="48">🔍</text>' +
        '<text x="400" y="300" text-anchor="middle" fill="#556" font-size="18" font-family="sans-serif">Mystery Image</text>' +
        '</svg>'
    );
}

function setupGameScreen() {
    const ws     = STATE.worksheet;
    const titleEl = $('#worksheet-title');
    const imgEl   = $('#reveal-image');

    if (titleEl) titleEl.textContent = ws.title;

    if (imgEl) {
        imgEl.crossOrigin = 'anonymous';
        imgEl.src = ws.image || placeholderSVG();
        imgEl.style.display = 'block';
        imgEl.onerror = function () { this.src = placeholderSVG(); };
    }

    const overlay = $('#end-overlay');
    if (overlay) overlay.classList.add('hidden');
}

/* ══════════════════════════════════════════════
   GRID
   ══════════════════════════════════════════════ */

function buildGrid() {
    const overlay = $('#grid-overlay');
    if (!overlay) return;

    overlay.innerHTML = '';
    overlay.style.gridTemplateColumns = 'repeat(' + STATE.gridCols + ', 1fr)';
    overlay.style.gridTemplateRows    = 'repeat(' + STATE.gridRows + ', 1fr)';

    const total = STATE.gridCols * STATE.gridRows;
    STATE.tiles = [];

    for (let i = 0; i < total; i++) {
        const tile = document.createElement('div');
        tile.className = 'grid-tile';
        tile.dataset.index = i;
        overlay.appendChild(tile);
        STATE.tiles.push(tile);
    }
}

function removeRandomTile() {
    const covered = STATE.tiles.filter(t => !t.classList.contains('revealed'));
    if (covered.length === 0) return;
    covered[Math.floor(Math.random() * covered.length)].classList.add('revealed');
}

function cascadeReveal() {
    const covered = STATE.tiles.filter(t => !t.classList.contains('revealed'));
    covered.forEach((tile, i) => {
        addTimer(() => tile.classList.add('revealed', 'cascade'), i * 80);
    });
}

/* ══════════════════════════════════════════════
   QUESTIONS
   ══════════════════════════════════════════════ */

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function showQuestion() {
    if (STATE.currentIndex >= STATE.total) { endGame(); return; }

    STATE.locked       = false;
    STATE.gambleActive = false;

    const q          = STATE.questions[STATE.currentIndex];
    const qTextEl    = $('#question-text');
    const optsEl     = $('#options-container');
    const progEl     = $('#progress-tracker');
    const gambleSlot = $('#gamble-slot');

    /* Question text */
    if (qTextEl) {
        qTextEl.innerHTML = formatQuestionText(q.text);
        typesetMath(qTextEl);
    }

    /* Progress */
    if (progEl) {
        progEl.textContent = 'Question ' + (STATE.currentIndex + 1) + ' of ' + STATE.total +
                             '  ·  Score: ' + STATE.score;
    }

    /* Gamble */
    if (gambleSlot) {
        gambleSlot.innerHTML = '';
        if (CONFIG.GAMBLE_ENABLED && STATE.currentIndex > 0) {
            const btn = document.createElement('button');
            btn.className = 'gamble-btn';
            btn.textContent = '🎲 Bet a tile? (+' + CONFIG.GAMBLE_REWARD +
                              ' if correct, −' + CONFIG.GAMBLE_PENALTY + ' if wrong)';
            btn.addEventListener('click', () => {
                STATE.gambleActive = true;
                btn.disabled = true;
                btn.textContent = '🎲 Bet placed!';
                btn.classList.add('active');
            });
            gambleSlot.appendChild(btn);
        }
    }

    /* Options */
    if (optsEl) {
        optsEl.innerHTML = '';
        const indices  = q.options.map((_, i) => i);
        const shuffled = CONFIG.SHUFFLE_OPTIONS ? shuffleArray(indices) : indices;

        shuffled.forEach(origIdx => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerHTML = formatOption(q.options[origIdx]);
            btn.dataset.origIndex = origIdx;
            btn.addEventListener('click', () => handleAnswer(origIdx, btn));
            optsEl.appendChild(btn);
        });

        typesetMath(optsEl);
    }
}

function handleAnswer(chosenIdx, btnEl) {
    if (STATE.locked) return;
    STATE.locked = true;

    const q       = STATE.questions[STATE.currentIndex];
    const correct = chosenIdx === q.correctIndex;
    const allBtns = $$('.option-btn');

    allBtns.forEach(b => {
        b.disabled = true;
        if (parseInt(b.dataset.origIndex) === q.correctIndex) b.classList.add('correct');
    });

    if (correct) {
        btnEl.classList.add('correct');
        STATE.score++;
        removeRandomTile();
        if (STATE.gambleActive) {
            for (let i = 0; i < CONFIG.GAMBLE_REWARD; i++) removeRandomTile();
            showToast('🎲 Gamble won! +' + (CONFIG.GAMBLE_REWARD + 1) + ' tiles!');
        } else {
            showToast('✅ Correct!');
        }
        addTimer(() => { STATE.currentIndex++; showQuestion(); }, CONFIG.DELAY_CORRECT);
    } else {
        btnEl.classList.add('wrong');

        // Glitch-peek a random tile
        const covered = STATE.tiles.filter(t => !t.classList.contains('revealed'));
        if (covered.length > 0) {
            const peek = covered[Math.floor(Math.random() * covered.length)];
            peek.classList.add('glitch');
            addTimer(() => peek.classList.remove('glitch'), 800);
        }

        if (STATE.gambleActive) {
            for (let i = 0; i < CONFIG.GAMBLE_PENALTY; i++) {
                const rev = STATE.tiles.filter(t => t.classList.contains('revealed'));
                if (rev.length > 0) rev[Math.floor(Math.random() * rev.length)].classList.remove('revealed');
            }
            showToast('🎲 Gamble lost! −' + CONFIG.GAMBLE_PENALTY + ' tile(s)');
        } else {
            showToast('❌ Wrong!');
        }

        addTimer(() => { STATE.currentIndex++; showQuestion(); }, CONFIG.DELAY_WRONG);
    }
}

/* ══════════════════════════════════════════════
   END GAME
   ══════════════════════════════════════════════ */

function endGame() {
    clearTimers();
    const needed = Math.ceil(STATE.total * CONFIG.WIN_THRESHOLD);
    const won    = STATE.score >= needed;

    const overlay  = $('#end-overlay');
    const titleEl  = $('#end-title');
    const msgEl    = $('#end-message');
    const retryBtn = $('#retry-btn');

    if (won) {
        cascadeReveal();
        if (titleEl) titleEl.textContent = '🎉 Image Revealed!';
        if (msgEl)   msgEl.textContent   = 'You scored ' + STATE.score + '/' + STATE.total +
            ' (' + Math.round(STATE.score / STATE.total * 100) + '%). Amazing!';
        if (retryBtn) retryBtn.classList.add('hidden');
    } else {
        if (titleEl) titleEl.textContent = '😔 Not Quite…';
        if (msgEl)   msgEl.textContent   = 'You scored ' + STATE.score + '/' + STATE.total +
            '. You needed ' + needed + ' to reveal the image. Try again!';
        if (retryBtn) retryBtn.classList.remove('hidden');
    }

    if (overlay) overlay.classList.remove('hidden');
}

function goBackToLauncher() {
    clearTimers();
    const overlay = $('#end-overlay');
    if (overlay) overlay.classList.add('hidden');
    showScreen('launcher-screen');
}

/* ══════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const backBtn    = $('#back-btn');
    const endBackBtn = $('#end-back-btn');
    const retryBtn   = $('#retry-btn');

    if (backBtn)    backBtn.addEventListener('click', goBackToLauncher);
    if (endBackBtn) endBackBtn.addEventListener('click', goBackToLauncher);

    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            const overlay = $('#end-overlay');
            if (overlay) overlay.classList.add('hidden');
            if (STATE.currentFilePath) launchGame(STATE.currentFilePath);
        });
    }

    // Auto-retry from previous session
    const retryPath = sessionStorage.getItem('mgr_retry');
    if (retryPath) {
        sessionStorage.removeItem('mgr_retry');
        launchGame(retryPath);
    } else {
        buildLauncher();
    }
});
