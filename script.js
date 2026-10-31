/* ============================================================
   MYSTERY GRID REVEAL — script.js v6.0
   Full rebuild: smart path resolution, static DOM, normalised data
   ============================================================ */

'use strict';

// ═══════════════ STATE ═══════════════
const STATE = {
    baseUrl: null,          // resolved once, reused
    index: [],
    worksheet: null,        // normalised { title, image, questions[] }
    filePath: '',
    title: '',
    qIndex: 0,
    correct: 0,
    revealed: new Set(),
    total: 0,
    answered: false,
    gambling: false,
    timers: []
};

// ═══════════════ HELPERS ═══════════════
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function log(...args)  { if (CONFIG.DEBUG) console.log('[MGR]', ...args); }
function warn(...args) { console.warn('[MGR]', ...args); }

function show(el)  { if (el) el.classList.remove('hidden'); }
function hide(el)  { if (el) el.classList.add('hidden'); }

function showScreen(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
}

function timer(fn, ms) {
    const id = setTimeout(fn, ms);
    STATE.timers.push(id);
    return id;
}

function clearTimers() {
    STATE.timers.forEach(clearTimeout);
    STATE.timers = [];
}

// ═══════════════ PATH RESOLUTION ═══════════════
function candidateBases() {
    const qp = CONFIG.QUESTIONS_PATH || 'Questions';
    const bases = [`./${qp}`];
    if (qp !== qp.toLowerCase()) bases.push(`./${qp.toLowerCase()}`);
    if (CONFIG.GITHUB_USER && CONFIG.GITHUB_REPO) {
        bases.push(
            `https://raw.githubusercontent.com/${CONFIG.GITHUB_USER}` +
            `/${CONFIG.GITHUB_REPO}/${CONFIG.GITHUB_BRANCH}/${qp}`
        );
    }
    return bases;
}

async function tryFetchJSON(url) {
    try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) { log(`  ✗ ${res.status}  ${url}`); return null; }
        const data = await res.json();
        log(`  ✓ 200  ${url}`);
        return data;
    } catch (e) {
        log(`  ✗ ERR  ${url}  (${e.message})`);
        return null;
    }
}

/** Finds the working base URL by probing index.json. */
async function resolveBase() {
    const attempted = [];
    for (const base of candidateBases()) {
        const url = `${base}/${CONFIG.INDEX_FILE}`;
        attempted.push(url);
        const data = await tryFetchJSON(url);
        if (data) {
            STATE.baseUrl = base;
            log('Base URL resolved →', base);
            return { data, attempted };
        }
    }
    return { data: null, attempted };
}

/** Loads a worksheet, auto-searching fallback folders if the path is wrong. */
async function loadWorksheetFile(filePath) {
    const attempted = [];
    const direct = `${STATE.baseUrl}/${filePath}`;
    attempted.push(direct);

    let data = await tryFetchJSON(direct);
    if (data) return { data, attempted, usedPath: filePath };

    // Path mismatch — search every known folder for the filename
    const name = filePath.split('/').pop();
    log(`Direct path failed. Searching folders for "${name}"…`);

    for (const folder of (CONFIG.FALLBACK_FOLDERS || [])) {
        const alt = `${folder}/${name}`;
        if (alt === filePath) continue;
        const url = `${STATE.baseUrl}/${alt}`;
        attempted.push(url);
        data = await tryFetchJSON(url);
        if (data) {
            warn(`index.json says "${filePath}" but file is at "${alt}". Please update index.json.`);
            return { data, attempted, usedPath: alt };
        }
    }
    return { data: null, attempted, usedPath: null };
}

// ═══════════════ DATA NORMALISATION ═══════════════
function normaliseIndex(raw) {
    const list = Array.isArray(raw) ? raw : (raw.worksheets || raw.items || []);
    return list.filter(Boolean).map(ws => ({
        title:    ws.title || ws.name || 'Untitled worksheet',
        icon:     ws.icon || '📄',
        subject:  ws.subject || '',
        topic:    ws.topic || '',
        count:    ws.questionCount || ws.count || null,
        file:     ws.file || ws.path || ''
    })).filter(ws => ws.file);
}

function normaliseQuestion(raw, i) {
    const text = String(raw.question ?? raw.text ?? raw.q ?? '').trim();

    let options = raw.options ?? raw.choices ?? raw.answers ?? [];
    if (!Array.isArray(options)) options = [];
    options = options.map(o => String(o ?? '').trim()).filter(o => o !== '');

    let answer = raw.answer ?? raw.correct ?? raw.correctAnswer ?? '';

    // answer given as an index (0-based)
    if (typeof answer === 'number' && options[answer] !== undefined) {
        answer = options[answer];
    }
    answer = String(answer).trim();

    // answer given as a letter A/B/C/D
    if (/^[A-D]$/i.test(answer) && options.length >= 4 && !options.includes(answer)) {
        const idx = answer.toUpperCase().charCodeAt(0) - 65;
        if (options[idx] !== undefined) answer = options[idx];
    }

    const valid = text !== '' && options.length >= 2 && options.includes(answer);
    if (!valid) {
        warn(`Question ${i + 1} is malformed:`, { text, options, answer });
    }

    return { text, options, answer, valid };
}

function normaliseWorksheet(raw) {
    const qsRaw = raw.questions || raw.items || [];
    const questions = qsRaw.map(normaliseQuestion).filter(q => q.valid);

    const dropped = qsRaw.length - questions.length;
    if (dropped > 0) warn(`${dropped} malformed question(s) skipped.`);

    return {
        title:    raw.title || raw.name || '',
        image:    raw.revealImage || raw.image || raw.imageUrl || '',
        questions
    };
}

// ═══════════════ INIT ═══════════════
async function init() {
    $('#back-btn').addEventListener('click', backToLauncher);
    $('#end-back-btn').addEventListener('click', backToLauncher);
    $('#retry-btn').addEventListener('click', () => {
        hide($('#end-overlay'));
        startWorksheet(STATE.filePath, STATE.title);
    });

    const { data, attempted } = await resolveBase();

    if (!data) {
        showLauncherError(attempted);
        return;
    }

    STATE.index = normaliseIndex(data);
    log(`Index loaded: ${STATE.index.length} worksheet(s)`);

    if (STATE.index.length === 0) {
        showLauncherError(attempted, 'index.json loaded but contains no valid entries (each needs a "file" field).');
        return;
    }

    buildLauncher();
}

function showLauncherError(attempted, customMsg) {
    const list = $('#worksheet-list');
    const box  = $('#launcher-error');
    if (list) list.innerHTML = '';
    if (!box) return;

    box.innerHTML = `
        <h3>⚠️ Could not load worksheets</h3>
        <p>${customMsg || 'None of these URLs returned valid JSON:'}</p>
        <ul>${attempted.map(u => `<li><code>${u}</code></li>`).join('')}</ul>
        <p class="hint">Check that <code>Questions/index.json</code> exists in your repo
        and that the folder name capitalisation matches.</p>
        <button class="end-btn" onclick="location.reload()">Reload</button>
    `;
    show(box);
}

// ═══════════════ LAUNCHER ═══════════════
function buildLauncher() {
    const container = $('#worksheet-list');
    container.innerHTML = '';

    STATE.index.forEach(ws => {
        const card = document.createElement('button');
        card.className = 'ws-card';
        card.type = 'button';
        card.innerHTML = `
            <span class="ws-icon">${ws.icon}</span>
            <span class="ws-body">
                <span class="ws-title">${ws.title}</span>
                <span class="ws-meta">${[ws.subject, ws.topic].filter(Boolean).join(' · ')}</span>
            </span>
            ${ws.count ? `<span class="ws-count">${ws.count} Qs</span>` : ''}
        `;
        card.addEventListener('click', () => startWorksheet(ws.file, ws.title));
        container.appendChild(card);
    });
}

function backToLauncher() {
    clearTimers();
    hide($('#end-overlay'));
    showScreen('launcher-screen');
}

// ═══════════════ START WORKSHEET ═══════════════
async function startWorksheet(filePath, title) {
    clearTimers();
    hide($('#end-overlay'));

    STATE.filePath = filePath;
    STATE.title    = title || '';
    STATE.qIndex   = 0;
    STATE.correct  = 0;
    STATE.revealed = new Set();
    STATE.answered = false;
    STATE.gambling = false;

    showScreen('game-screen');
    $('#worksheet-title').textContent = STATE.title;
    $('#question-text').textContent   = 'Loading questions…';
    $('#options-container').innerHTML = '';
    $('#gamble-slot').innerHTML       = '';
    $('#progress-tracker').textContent = '';

    const { data, attempted, usedPath } = await loadWorksheetFile(filePath);

    if (!data) {
        $('#question-text').innerHTML =
            `<span class="inline-error">⚠️ Worksheet not found.</span><br>
             <small>Tried:<br>${attempted.map(u => `<code>${u}</code>`).join('<br>')}</small>`;
        return;
    }

    if (usedPath !== filePath) STATE.filePath = usedPath;

    STATE.worksheet = normaliseWorksheet(data);
    STATE.total = STATE.worksheet.questions.length;

    if (STATE.total === 0) {
        $('#question-text').innerHTML =
            '<span class="inline-error">⚠️ No valid questions in this worksheet.</span><br>' +
            '<small>Open the console (F12) to see which entries were rejected.</small>';
        return;
    }

    log(`Worksheet ready: ${STATE.total} questions`);
    setupGrid(STATE.worksheet.image);
    showQuestion(0);
}

// ═══════════════ GRID ═══════════════
const PLACEHOLDER_IMG =
    'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">' +
    '<rect width="600" height="400" fill="#1e293b"/>' +
    '<text x="300" y="205" text-anchor="middle" fill="#64748b" ' +
    'font-family="sans-serif" font-size="22">Hidden Image</text></svg>');

function gridDims(n, targetAspect = 1.5) {
    let best = { cols: n, rows: 1, diff: Infinity };
    for (let cols = 1; cols <= n; cols++) {
        if (n % cols !== 0) continue;
        const rows = n / cols;
        const diff = Math.abs((cols / rows) - targetAspect);
        if (diff < best.diff) best = { cols, rows, diff };
    }
    return best;
}

function setupGrid(imageUrl) {
    const img = $('#reveal-image');
    img.onerror = () => { warn('Image failed to load:', imageUrl); img.src = PLACEHOLDER_IMG; };
    img.src = (imageUrl && imageUrl.length > 5) ? imageUrl : PLACEHOLDER_IMG;

    const grid = $('#grid-overlay');
    grid.innerHTML = '';
    grid.classList.remove('glitch-peek');

    const { cols, rows } = gridDims(STATE.total);
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;

    for (let i = 0; i < STATE.total; i++) {
        const tile = document.createElement('div');
        tile.className = 'grid-tile';
        tile.dataset.index = i;
        grid.appendChild(tile);
    }
}

function hiddenTiles() {
    const out = [];
    for (let i = 0; i < STATE.total; i++) if (!STATE.revealed.has(i)) out.push(i);
    return out;
}

function revealTile() {
    const pool = hiddenTiles();
    if (!pool.length) return;
    const idx = pool[Math.floor(Math.random() * pool.length)];
    STATE.revealed.add(idx);
    const tile = $(`.grid-tile[data-index="${idx}"]`);
    if (tile) { tile.classList.remove('gamble-glow'); tile.classList.add('revealed'); }
}

function hideTile() {
    if (!STATE.revealed.size) return;
    const arr = [...STATE.revealed];
    const idx = arr[Math.floor(Math.random() * arr.length)];
    STATE.revealed.delete(idx);
    const tile = $(`.grid-tile[data-index="${idx}"]`);
    if (tile) tile.classList.remove('revealed');
}

function glitchPeek() {
    const grid = $('#grid-overlay');
    grid.classList.add('glitch-peek');
    timer(() => grid.classList.remove('glitch-peek'), 600);
}

// ═══════════════ MATH RENDERING ═══════════════
const MATH_VARS   = /^[xyzabcnmkpqrtuvw]$/i;
const MATH_START  = /[+\-×÷=^/([\]√∛<>≤≥≠≈\d]/;
const MATH_CHARS  = /[+\-×÷=^/()[\]√∛<>≤≥≠≈\d\w.]/;
const AFTER_SPACE = /[+\-×÷=^/([\]√∛<>≤≥≠≈\d]/;
const VAR_NEXT    = /[\s,.;:!?)+\-=×÷^/<>≤≥≠≈\]]/;

function hasMathOperator(s) { return /[+\-×÷=^/√∛<>≤≥≠≈]/.test(s); }

function isPureExpression(s) {
    const t = s.trim();
    if (t.length === 1 && MATH_VARS.test(t)) return true;
    if (t.length < 2) return false;
    const stripped = t.replace(/[\s\d().+\-×÷=^/√∛<>≤≥≠≈]/g, '');
    return hasMathOperator(t) && !stripped.match(/[a-zA-Z]{2,}/);
}

function wrapMathRuns(text) {
    if (typeof text !== 'string' || !text) return '';
    let out = '', i = 0;

    while (i < text.length) {
        const ch = text[i];
        let start = false;

        if (MATH_START.test(ch)) {
            start = true;
        } else if (MATH_VARS.test(ch)) {
            const prev = i > 0 ? text[i - 1] : ' ';
            const next = i < text.length - 1 ? text[i + 1] : ' ';
            if (/[\s(]/.test(prev) && VAR_NEXT.test(next)) start = true;
        }

        if (start) {
            let j = i;
            while (j < text.length) {
                if (text[j] === ' ') {
                    const k = j + 1;
                    if (k < text.length && AFTER_SPACE.test(text[k])) { j = k; continue; }
                    break;
                }
                if (MATH_CHARS.test(text[j])) j++; else break;
            }
            const run = text.slice(i, j);
            out += isPureExpression(run) ? `\\(${run}\\)` : run;
            i = j;
        } else {
            out += ch;
            i++;
        }
    }
    return out;
}

function wrapStandaloneVars(text) {
    if (typeof text !== 'string' || !text) return '';
    const parts = text.split(/(\\\([\s\S]*?\\\))/g);
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith('\\(')) continue;
        parts[i] = parts[i].replace(/\b([xyz])\b/g, '\\($1\\)');
    }
    return parts.join('');
}

function processMath(text) { return wrapStandaloneVars(wrapMathRuns(text)); }

function renderMath(el) {
    if (!window.MathJax || !el) return;
    const run = () => {
        try {
            if (MathJax.typesetClear) MathJax.typesetClear([el]);
            MathJax.typesetPromise([el]).catch(e => warn('MathJax:', e.message));
        } catch (e) { warn('MathJax:', e.message); }
    };
    if (MathJax.startup && MathJax.startup.promise) {
        MathJax.startup.promise.then(run).catch(run);
    } else {
        run();
    }
}

// ═══════════════ QUESTIONS ═══════════════
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function showQuestion(index) {
    clearTimers();

    if (index >= STATE.total) { finishGame(); return; }

    STATE.qIndex   = index;
    STATE.answered = false;
    STATE.gambling = false;

    const q = STATE.worksheet.questions[index];

    $('#question-text').innerHTML = processMath(q.text);

    const box = $('#options-container');
    box.innerHTML = '';
    const opts = CONFIG.SHUFFLE_OPTIONS ? shuffle(q.options) : q.options;

    opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.type = 'button';
        btn.dataset.value = opt;
        btn.innerHTML = processMath(opt);
        btn.addEventListener('click', () => checkAnswer(opt, q.answer));
        box.appendChild(btn);
    });

    $('#gamble-slot').innerHTML = '';
    updateProgress();
    renderMath($('.question-panel'));

    if (CONFIG.GAMBLE_ENABLED && STATE.revealed.size > 0 && hiddenTiles().length > 0) {
        offerGamble();
    }
}

function updateProgress() {
    $('#progress-tracker').textContent =
        `Question ${STATE.qIndex + 1} of ${STATE.total}  ·  Score ${STATE.correct}  ·  Target ${winTarget()}`;
}

// ═══════════════ GAMBLE ═══════════════
function offerGamble() {
    const slot = $('#gamble-slot');
    slot.innerHTML = `
        <div class="gamble-prompt">
            <p>🎰 <strong>Bet a tile?</strong>
               Correct → +${CONFIG.GAMBLE_REWARD} tiles · Wrong → −${CONFIG.GAMBLE_PENALTY} tile</p>
            <div class="gamble-actions">
                <button type="button" class="gamble-yes">Bet</button>
                <button type="button" class="gamble-no">Pass</button>
            </div>
        </div>`;

    slot.querySelector('.gamble-yes').addEventListener('click', () => {
        STATE.gambling = true;
        slot.innerHTML = '<div class="gamble-active">🎰 Bet placed — good luck!</div>';
        const pool = hiddenTiles();
        if (pool.length) {
            const idx = pool[Math.floor(Math.random() * pool.length)];
            const tile = $(`.grid-tile[data-index="${idx}"]`);
            if (tile) tile.classList.add('gamble-glow');
        }
    });

    slot.querySelector('.gamble-no').addEventListener('click', () => {
        STATE.gambling = false;
        slot.innerHTML = '';
    });
}

// ═══════════════ ANSWER ═══════════════
function checkAnswer(selected, correct) {
    if (STATE.answered) return;
    STATE.answered = true;

    const isRight = selected === correct;
    $$('#options-container .opt-btn').forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.value === correct)  btn.classList.add('correct');
        if (btn.dataset.value === selected && !isRight) btn.classList.add('wrong');
    });

    $$('.grid-tile.gamble-glow').forEach(t => t.classList.remove('gamble-glow'));

    if (isRight) {
        STATE.correct++;
        if (STATE.gambling) {
            for (let i = 0; i < CONFIG.GAMBLE_REWARD; i++) revealTile();
            toast(`🎰 Jackpot! +${CONFIG.GAMBLE_REWARD} tiles`);
        } else {
            revealTile();
        }
    } else {
        if (STATE.gambling) {
            for (let i = 0; i < CONFIG.GAMBLE_PENALTY; i++) hideTile();
            toast(`😬 Lost ${CONFIG.GAMBLE_PENALTY} tile`);
        }
        glitchPeek();
    }

    updateProgress();
    timer(() => showQuestion(STATE.qIndex + 1),
          isRight ? CONFIG.DELAY_CORRECT : CONFIG.DELAY_WRONG);
}

// ═══════════════ END GAME ═══════════════
function winTarget() {
    const t = CONFIG.WIN_THRESHOLD;
    if (t >= 1) return Math.min(Math.round(t), STATE.total);
    return Math.ceil(STATE.total * t);
}

function finishGame() {
    const won = STATE.correct >= winTarget();
    if (!won) { endGame(false); return; }

    const pool = hiddenTiles();
    pool.forEach((idx, i) => {
        timer(() => {
            STATE.revealed.add(idx);
            const tile = $(`.grid-tile[data-index="${idx}"]`);
            if (tile) {
                tile.classList.add('cascade-reveal');
                timer(() => tile.classList.add('revealed'), 450);
            }
        }, i * 70);
    });
    timer(() => endGame(true), pool.length * 70 + 700);
}

function endGame(didWin) {
    const total = STATE.total, got = STATE.correct, need = winTarget();
    const pct = Math.round((got / total) * 100);

    let title, msg;
    if (didWin && got === total) {
        title = '🏆 Perfect Score!';
        msg   = `All ${total} correct. The full image is yours.`;
    } else if (didWin) {
        title = '🎉 Image Unlocked!';
        msg   = `${got} / ${total} correct (${pct}%). You needed ${need}. Well done!`;
    } else {
        title = '🔒 Not Quite';
        msg   = `${got} / ${total} correct (${pct}%). You needed ${need} to unlock the image.`;
    }

    $('#end-title').textContent   = title;
    $('#end-message').textContent = msg;
    $('#retry-btn').classList.toggle('hidden', didWin);
    show($('#end-overlay'));
}

// ═══════════════ TOAST ═══════════════
let toastTimer = null;
function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ═══════════════ BOOT ═══════════════
document.addEventListener('DOMContentLoaded', init);
