/* ═══════════════════════════════════════════════════════
   Mystery Grid Reveal — Game Engine v7.5
   Added: subscripts (_2) and superscripts (^+, ^{2+}) for chemistry
   ═══════════════════════════════════════════════════════ */

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const STATE = {
    worksheet: null, questions: [], currentIndex: 0,
    score: 0, total: 0, tiles: [],
    gridCols: 6, gridRows: 4,
    timers: [], gambleActive: false, locked: false,
    baseResolved: null, currentFilePath: ''
};

/* ══════════════════════════════════════════════
   MATH PIPELINE
   ══════════════════════════════════════════════ */

function convertFractions(t) {
    if (!t || !t.includes('/')) return t;
    let result = '', i = 0;

    while (i < t.length) {
        if (t[i] === '/' && i > 0 && i < t.length - 1) {
            let num = '', numStart = result.length;

            if (result.endsWith(')')) {
                let depth = 1, j = result.length - 2;
                while (j >= 0 && depth > 0) {
                    if (result[j] === ')') depth++;
                    if (result[j] === '(') depth--;
                    j--;
                }
                numStart = j + 1;
                num = result.substring(numStart);
            } else {
                let j = result.length - 1;
                while (j >= 0 && /[a-z0-9]/i.test(result[j])) j--;
                numStart = j + 1;
                num = result.substring(numStart);
            }

            let den = '', denEnd = i + 1;
            if (t[i + 1] === '(') {
                let depth = 1, j = i + 2;
                while (j < t.length && depth > 0) {
                    if (t[j] === '(') depth++;
                    if (t[j] === ')') depth--;
                    j++;
                }
                denEnd = j;
                den = t.substring(i + 1, denEnd);
                if (denEnd < t.length && t[denEnd] === '^') {
                    let k = denEnd + 1;
                    if (k < t.length && t[k] === '{') {
                        let end = t.indexOf('}', k);
                        if (end !== -1) { den += t.substring(denEnd, end + 1); denEnd = end + 1; }
                    } else if (k < t.length && /\d/.test(t[k])) {
                        while (k < t.length && /\d/.test(t[k])) k++;
                        den += t.substring(denEnd, k); denEnd = k;
                    }
                }
            } else {
                let j = i + 1;
                while (j < t.length && /[a-z0-9]/i.test(t[j])) j++;
                denEnd = j;
                den = t.substring(i + 1, denEnd);
            }

            if (num && den) {
                const strip = s => {
                    if (!s.startsWith('(') || !s.endsWith(')')) return s;
                    let d = 0;
                    for (let k = 0; k < s.length - 1; k++) {
                        if (s[k] === '(') d++;
                        if (s[k] === ')') d--;
                        if (d === 0) return s;
                    }
                    return s.slice(1, -1);
                };
                result = result.substring(0, numStart) +
                         '\\frac{' + strip(num) + '}{' + strip(den) + '}';
                i = denEnd;
                continue;
            }
        }
        result += t[i];
        i++;
    }
    return result;
}

/* ── Powers: ^3, ^-3, ^(1/3), ^{2+}, ^+, ^- ── */
function convertPowers(t) {
    if (!t) return t;
    // Already-braced ^{...} — leave alone
    // ^-digits → ^{-digits}
    t = t.replace(/\^-(\d+)/g, '^{-$1}');
    // ^(expr) → ^{expr}
    t = t.replace(/\^\(([^)]+)\)/g, '^{$1}');
    // Lone ^+ or ^- (ion charges)
    t = t.replace(/\^([+\-])(?![{\d])/g, '^{$1}');
    // ^digits → ^{digits}
    t = t.replace(/\^(\d+)/g, '^{$1}');
    return t;
}

/* ── Subscripts: _2 → _{2}, _12 → _{12} ── */
function convertSubscripts(t) {
    if (!t) return t;
    return t.replace(/_(\d+)/g, '_{$1}');
}

function convertNotation(t) {
    if (!t) return t;
    return convertPowers(convertSubscripts(convertFractions(t)));
}

/* ── Format a single answer option ── */
function formatOption(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let t = raw.trim();

    const unitRe = /\s+(cm\^?2?|cm²|m\^?2?|m²|km\/?h?|km|kg|g|years?|marks?|minutes?|items?)$/i;
    const um = t.match(unitRe);
    let unit = '';
    if (um) {
        unit = um[0].replace(/\^2/g, '²').replace(/\^3/g, '³');
        t = t.slice(0, -um[0].length);
    }

    t = convertNotation(t);

    // Wrap in MathJax only if it contains actual math notation
    const hasLatex    = /\\frac|\\sqrt|\^\{|_\{/.test(t);
    const hasEquation = /=/.test(t);

    if (hasLatex || hasEquation) {
        // Split: wrap only the math part, keep plain text outside
        // Simple strategy: wrap whole thing — MathJax \text{} not needed for short options
        t = '\\(' + t.trim() + '\\)';
    }

    return t + unit;
}

/* ── Format full question text (mixed English + math) ── */
function formatQuestionText(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let t = raw;
    const vault = [];
    const save = m => { vault.push(m); return '§V' + (vault.length - 1) + '§'; };

    /* Phase 1: Stash non-math tokens */
    t = t.replace(/\$\d+(?:\.\d+)?/g, save);
    t = t.replace(
        /\d+\s*(?:km\/h|cm\^2|cm²|m\^2|m²|cm|mm|m|km|kg|g|minutes?|mins?|hours?|hrs?|seconds?|secs?|years?|yrs?|marks?|questions?|items?|pens?|notebooks?)/gi,
        save
    );
    t = t.replace(/\d+-(?:question|mark|item|year|minute|hour)/gi, save);
    t = t.replace(/(\))\s+(cm|mm|m|km|kg|g)\b/gi, (_, p, u) => p + save(' ' + u));

    /* Phase 2: Convert notation (Fractions, Powers, Subscripts) */
    t = convertNotation(t);

    /* Phase 3: Wrap math zones after a colon (e.g., "Solve: x + 2 = 5") */
    const colonIdx = t.lastIndexOf(':');
    if (colonIdx > 5 && colonIdx < t.length - 3) {
        const prefix   = t.substring(0, colonIdx + 1);
        let   mathPart = t.substring(colonIdx + 1).trim();
        if (mathPart && /[a-z\\]/i.test(mathPart)) {
            t = prefix + ' \\(' + mathPart + '\\)';
        }
    }

    /* Phase 4: Wrap chemistry formulas and inline math safely */
    // Targets any contiguous string containing subscripts (_{), superscripts (^{), or fractions (\frac{)
    t = t.replace(/([a-zA-Z0-9()[\]{}+-\\]*(?:_\{|\^\{|\\frac\{)[a-zA-Z0-9()[\]{}+-\\]*)/g, (m, _, offset, str) => {
        const before = str.substring(0, offset);
        const opens  = (before.match(/\\\(/g) || []).length;
        const closes = (before.match(/\\\)/g) || []).length;
        if (opens > closes) return m; // Skipped if already inside \( \)
        return '\\(' + m + '\\)';
    });

    /* Phase 5: Standalone variables outside \(...\) */
    t = t.replace(/(?<![a-zA-Z\\])([xyz])(?![a-zA-Z{}])/gi, (m, v, offset, str) => {
        const before = str.substring(0, offset);
        const opens  = (before.match(/\\\(/g) || []).length;
        const closes = (before.match(/\\\)/g) || []).length;
        if (opens > closes) return m;
        return '\\(' + v + '\\)';
    });

    /* Phase 6: Restore vault */
    t = t.replace(/§V(\d+)§/g, (_, i) => vault[parseInt(i)]);

    return t;
}

async function typesetMath(el) {
    if (!el) return;
    try {
        if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
            await MathJax.startup.promise;
            if (MathJax.typesetClear)   MathJax.typesetClear([el]);
            if (MathJax.typesetPromise) await MathJax.typesetPromise([el]);
        }
    } catch (e) {
        if (CONFIG.DEBUG) console.warn('MathJax:', e);
    }
}

/* ══════════════════════════════════════════════
   SCHEMA-DRIVEN LOADER
   ══════════════════════════════════════════════ */

function pick(obj, keys, fb) {
    if (fb === undefined) fb = '';
    if (!obj || typeof obj !== 'object') return fb;
    for (const k of keys)
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    return fb;
}

function mergeSchema(us) {
    const b = JSON.parse(JSON.stringify(CONFIG.DEFAULT_SCHEMA));
    if (!us) return b;
    for (const lv of ['worksheet', 'question'])
        if (us[lv]) for (const f of Object.keys(us[lv]))
            if (b[lv][f]) b[lv][f] = [...us[lv][f], ...b[lv][f]];
    return b;
}

function normaliseQuestion(raw, idx, schema) {
    if (!raw || typeof raw !== 'object') return null;
    const text = pick(raw, schema.question.text, '').toString().trim();
    if (!text) { if (CONFIG.DEBUG) console.warn('Q'+idx+': no text'); return null; }

    let rawOpts = pick(raw, schema.question.options, null), options = [];
    if (Array.isArray(rawOpts)) options = rawOpts.map(o => String(o).trim());
    else if (rawOpts && typeof rawOpts === 'object')
        options = Object.keys(rawOpts).sort().map(k => String(rawOpts[k]).trim());
    if (options.length < 2) return null;

    let ci = -1;
    const ra = pick(raw, schema.question.answer, null);
    if (typeof ra === 'number')
        ci = (ra >= 0 && ra < options.length) ? ra : (ra >= 1 && ra <= options.length) ? ra-1 : -1;
    else if (typeof ra === 'string') {
        const n = parseInt(ra, 10);
        if (!isNaN(n)) ci = (n >= 0 && n < options.length) ? n : (n >= 1 && n <= options.length) ? n-1 : -1;
        else if (/^[A-Da-d]$/.test(ra)) ci = ra.toUpperCase().charCodeAt(0) - 65;
        else ci = options.findIndex(o => o.toLowerCase() === ra.toLowerCase());
    }
    if (ci < 0 || ci >= options.length) return null;
    return { text, options, correctIndex: ci };
}

function normaliseWorksheet(raw) {
    if (!raw) return null;
    const schema = mergeSchema(raw.schema);
    const title  = pick(raw, schema.worksheet.title, 'Untitled');
    const image  = pick(raw, schema.worksheet.image, '');
    const rawQs  = pick(raw, schema.worksheet.questions, []);
    if (!Array.isArray(rawQs) || !rawQs.length) return null;
    const questions = [];
    rawQs.forEach((q, i) => { const nq = normaliseQuestion(q, i, schema); if (nq) questions.push(nq); });
    if (!questions.length) return null;
    const randomise = raw.randomise !== false;
    return { title, image, questions, randomise };
}

async function resolveBase() {
    if (STATE.baseResolved) return STATE.baseResolved;
    const local = './' + CONFIG.QUESTIONS_PATH + '/';
    try { const r = await fetch(local + CONFIG.INDEX_FILE, {method:'HEAD'}); if (r.ok) return STATE.baseResolved = local; } catch(_){}
    return STATE.baseResolved = 'https://raw.githubusercontent.com/' +
        CONFIG.GITHUB_USER + '/' + CONFIG.GITHUB_REPO + '/' + CONFIG.GITHUB_BRANCH + '/' + CONFIG.QUESTIONS_PATH + '/';
}

async function fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

async function loadWorksheetFile(fp) {
    const base = await resolveBase();
    try { return await fetchJSON(base + fp); } catch(_){}
    const fn = fp.split('/').pop();
    for (const f of CONFIG.FALLBACK_FOLDERS)
        try { return await fetchJSON(base + f + '/' + fn); } catch(_){}
    throw new Error('Cannot find ' + fn);
}

/* ══════════════════════════════════════════════
   UI HELPERS
   ══════════════════════════════════════════════ */

function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = $('#' + id); if (el) el.classList.add('active');
}

function showToast(msg, ms) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), ms || 2200);
}

function clearTimers() { STATE.timers.forEach(clearTimeout); STATE.timers = []; }
function addTimer(fn, ms) { const id = setTimeout(fn, ms); STATE.timers.push(id); return id; }

/* ══════════════════════════════════════════════
   LAUNCHER
   ══════════════════════════════════════════════ */

async function buildLauncher() {
    const list = $('#worksheet-list'), errEl = $('#launcher-error');
    if (!list) return;
    try {
        const base = await resolveBase(), index = await fetchJSON(base + CONFIG.INDEX_FILE);
        if (!Array.isArray(index) || !index.length) { list.innerHTML = '<p class="loading-msg">No worksheets found.</p>'; return; }
        list.innerHTML = '';
        index.forEach(ws => {
            const c = document.createElement('button');
            c.className = 'ws-card';
            c.innerHTML = '<span class="ws-icon">' + (ws.icon||'📄') + '</span>' +
                '<span class="ws-info"><strong>' + (ws.title||'Untitled') + '</strong>' +
                '<small>' + (ws.subject||'') + ' · ' + (ws.topic||'') + ' · ' + (ws.questionCount||'?') + ' Qs</small></span>';
            c.addEventListener('click', () => launchGame(ws.file));
            list.appendChild(c);
        });
    } catch (e) {
        if (errEl) { errEl.textContent = 'Failed: ' + e.message; errEl.classList.remove('hidden'); }
    }
}

/* ══════════════════════════════════════════════
   GAME ENGINE
   ══════════════════════════════════════════════ */

function shuffle(a) {
    const b = [...a];
    for (let i = b.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; }
    return b;
}

async function launchGame(fp) {
    if (!fp) return;
    clearTimers();
    STATE.currentFilePath = fp;
    try {
        const raw = await loadWorksheetFile(fp), ws = normaliseWorksheet(raw);
        if (!ws) { showToast('Failed to parse worksheet'); return; }

        const qs = ws.randomise ? shuffle(ws.questions) : ws.questions;

        Object.assign(STATE, { worksheet:ws, questions:qs, total:qs.length,
            currentIndex:0, score:0, locked:false, gambleActive:false });
        computeGrid(); setupGameScreen(); showScreen('game-screen'); buildGrid(); showQuestion();
    } catch (e) { showToast('Error: ' + e.message); }
}

function computeGrid() {
    const n = STATE.total;
    STATE.gridCols = Math.ceil(Math.sqrt(n * 1.5));
    STATE.gridRows = Math.ceil(n / STATE.gridCols);
}

function placeholderSVG() {
    return 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="533">' +
        '<rect fill="#16213e" width="800" height="533"/>' +
        '<text x="400" y="266" text-anchor="middle" fill="#556" font-size="40" font-family="sans-serif">🔍 Mystery Image</text></svg>');
}

function setupGameScreen() {
    const ws = STATE.worksheet;
    const t = $('#worksheet-title'); if (t) t.textContent = ws.title;
    const img = $('#reveal-image');
    if (img) { img.src = ws.image || placeholderSVG(); img.style.display = 'block'; img.onerror = function(){ this.src = placeholderSVG(); }; }
    const o = $('#end-overlay'); if (o) o.classList.add('hidden');
}

/* ══════════════════════════════════════════════
   GRID
   ══════════════════════════════════════════════ */

function buildGrid() {
    const ov = $('#grid-overlay'); if (!ov) return;
    ov.innerHTML = '';
    ov.style.gridTemplateColumns = 'repeat(' + STATE.gridCols + ',1fr)';
    ov.style.gridTemplateRows    = 'repeat(' + STATE.gridRows + ',1fr)';
    STATE.tiles = [];
    for (let i = 0, n = STATE.gridCols * STATE.gridRows; i < n; i++) {
        const d = document.createElement('div');
        d.className = 'grid-tile'; ov.appendChild(d); STATE.tiles.push(d);
    }
}

const covered  = () => STATE.tiles.filter(t => !t.classList.contains('revealed'));
const revealed = () => STATE.tiles.filter(t =>  t.classList.contains('revealed'));

function removeTile() {
    const c = covered(); if (!c.length) return false;
    c[Math.floor(Math.random()*c.length)].classList.add('revealed'); return true;
}

function restoreTile() {
    const r = revealed(); if (!r.length) return false;
    r[Math.floor(Math.random()*r.length)].classList.remove('revealed'); return true;
}

function cascadeReveal() {
    covered().forEach((t, i) => addTimer(() => t.classList.add('revealed','cascade'), i * 80));
}

/* ══════════════════════════════════════════════
   QUESTIONS
   ══════════════════════════════════════════════ */

function showQuestion() {
    if (STATE.currentIndex >= STATE.total) { endGame(); return; }
    STATE.locked = false; STATE.gambleActive = false;

    const q = STATE.questions[STATE.currentIndex];
    const qEl = $('#question-text'), oEl = $('#options-container');
    const pEl = $('#progress-tracker'), gSlot = $('#gamble-slot');

    if (qEl) { qEl.innerHTML = formatQuestionText(q.text); typesetMath(qEl); }
    if (pEl) pEl.textContent = 'Question ' + (STATE.currentIndex+1) + ' of ' + STATE.total + '  ·  Score: ' + STATE.score;

    if (gSlot) {
        gSlot.innerHTML = '';
        if (CONFIG.GAMBLE_ENABLED && STATE.currentIndex > 0 &&
            covered().length > 0 && revealed().length >= CONFIG.GAMBLE_PENALTY) {
            const btn = document.createElement('button');
            btn.className = 'gamble-btn';
            btn.textContent = '🎲 Bet a tile? (+' + CONFIG.GAMBLE_REWARD + ' correct, −' + CONFIG.GAMBLE_PENALTY + ' wrong)';
            btn.onclick = () => { STATE.gambleActive = true; btn.disabled = true; btn.textContent = '🎲 Bet placed!'; btn.classList.add('active'); };
            gSlot.appendChild(btn);
        }
    }

    if (oEl) {
        oEl.innerHTML = '';
        const order = CONFIG.SHUFFLE_OPTIONS ? shuffle(q.options.map((_,i)=>i)) : q.options.map((_,i)=>i);
        order.forEach(oi => {
            const b = document.createElement('button');
            b.className = 'option-btn';
            b.innerHTML = formatOption(q.options[oi]);
            b.dataset.oi = oi;
            b.onclick = () => handleAnswer(oi, b);
            oEl.appendChild(b);
        });
        typesetMath(oEl);
    }
}

function handleAnswer(ci, btn) {
    if (STATE.locked) return;
    STATE.locked = true;
    const q = STATE.questions[STATE.currentIndex], ok = ci === q.correctIndex;

    $$('.option-btn').forEach(b => { b.disabled = true; if (+b.dataset.oi === q.correctIndex) b.classList.add('correct'); });

    if (ok) {
        btn.classList.add('correct'); STATE.score++;
        let gained = removeTile() ? 1 : 0;
        if (STATE.gambleActive) { for (let i=0;i<CONFIG.GAMBLE_REWARD;i++) if(removeTile()) gained++; showToast('🎲 Won! +'+gained+' tiles'); }
        else showToast('✅ Correct!');
        addTimer(() => { STATE.currentIndex++; showQuestion(); }, CONFIG.DELAY_CORRECT);
    } else {
        btn.classList.add('wrong');
        const cv = covered();
        if (cv.length) { const p = cv[Math.floor(Math.random()*cv.length)]; p.classList.add('glitch'); addTimer(()=>p.classList.remove('glitch'),800); }
        if (STATE.gambleActive) {
            let lost = 0; for (let i=0;i<CONFIG.GAMBLE_PENALTY;i++) if(restoreTile()) lost++;
            showToast('🎲 Lost! −'+lost+' tile'+(lost!==1?'s':''));
        } else showToast('❌ Wrong!');
        addTimer(() => { STATE.currentIndex++; showQuestion(); }, CONFIG.DELAY_WRONG);
    }
}

/* ══════════════════════════════════════════════
   END GAME
   ══════════════════════════════════════════════ */

function endGame() {
    clearTimers();
    const needed = Math.ceil(STATE.total * CONFIG.WIN_THRESHOLD), won = STATE.score >= needed;
    const ov = $('#end-overlay'), ti = $('#end-title'), msg = $('#end-message'), rb = $('#retry-btn');
    if (won) {
        cascadeReveal();
        if (ti) ti.textContent = '🎉 Image Revealed!';
        if (msg) msg.textContent = STATE.score+'/'+STATE.total+' ('+Math.round(STATE.score/STATE.total*100)+'%). Amazing!';
        if (rb) rb.classList.add('hidden');
    } else {
        if (ti) ti.textContent = '😔 Not Quite…';
        if (msg) msg.textContent = STATE.score+'/'+STATE.total+'. Needed '+needed+'. Try again!';
        if (rb) rb.classList.remove('hidden');
    }
    if (ov) ov.classList.remove('hidden');
}

function goBack() {
    clearTimers();
    const ov = $('#end-overlay'); if (ov) ov.classList.add('hidden');
    showScreen('launcher-screen');
}

/* ══════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    const bb = $('#back-btn'), eb = $('#end-back-btn'), rb = $('#retry-btn');
    if (bb) bb.onclick = goBack;
    if (eb) eb.onclick = goBack;
    if (rb) rb.onclick = () => { const ov=$('#end-overlay'); if(ov) ov.classList.add('hidden'); if(STATE.currentFilePath) launchGame(STATE.currentFilePath); };

    const rp = sessionStorage.getItem('mgr_retry');
    if (rp) { sessionStorage.removeItem('mgr_retry'); launchGame(rp); }
    else buildLauncher();
});
