/* ═══════════════════════════════════════════════════════
   MYSTERY GRID REVEAL — script.js  (v4.2)
   Math parser · Grid engine · Gamble mechanics · Threshold win
   ═══════════════════════════════════════════════════════ */

const STATE = {
    dataset: null,
    currentIndex: 0,
    correctCount: 0,
    shuffledTiles: [],
    revealedHistory: [],
    gambleMode: false,
    isAnswering: false,
    currentScreen: 'launcher',
    liveOptions: [],
    liveCorrectIndex: -1
};

/* ═══════════════════════════════════════════════════════
   SECTION 1 — MATH RENDERING ENGINE
   ═══════════════════════════════════════════════════════ */

const UNIT_LIST = [
    ['mol/dm^3', '\\text{mol/dm}^{3}'],
    ['g/cm^3',   '\\text{g/cm}^{3}'],
    ['kg/m^3',   '\\text{kg/m}^{3}'],
    ['m/s^2',    '\\text{m/s}^{2}'],
    ['rev/min',  '\\text{rev/min}'],
    ['km/min',   '\\text{km/min}'],
    ['km/hr',    '\\text{km/hr}'],
    ['g/mol',    '\\text{g/mol}'],
    ['m/min',    '\\text{m/min}'],
    ['cm/s',     '\\text{cm/s}'],
    ['J/kg',     '\\text{J/kg}'],
    ['km/h',     '\\text{km/h}'],
    ['N/m',      '\\text{N/m}'],
    ['m/s',      '\\text{m/s}']
];

const UPRIGHT_WORDS = ['HCF','LCM','sin','cos','tan','log','ln'];
const PH_OPEN  = '\u0001';
const PH_CLOSE = '\u0002';

function findMatch(s, start, open, close) {
    let depth = 0;
    for (let i = start; i < s.length; i++) {
        if (s[i] === open) depth++;
        else if (s[i] === close) { depth--; if (depth === 0) return i; }
    }
    return -1;
}

function findMatchBack(s, end, open, close) {
    let depth = 0;
    for (let i = end; i >= 0; i--) {
        if (s[i] === close) depth++;
        else if (s[i] === open) { depth--; if (depth === 0) return i; }
    }
    return -1;
}

function stripOuterParens(s) {
    s = s.trim();
    if (s.startsWith('(') && findMatch(s, 0, '(', ')') === s.length - 1) {
        return s.slice(1, -1).trim();
    }
    return s;
}

function indexOfTopLevelSlash(s) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') depth--;
        else if (s[i] === '/' && depth === 0) return i;
    }
    return -1;
}

function grabLeftOperand(s, slashIdx) {
    let left = s.slice(0, slashIdx).trimEnd();
    if (left.endsWith(')')) {
        const open = findMatchBack(left, left.length - 1, '(', ')');
        if (open >= 0) return { text: left.slice(open), start: open };
    }
    const m = left.match(/([\w.]+)$/);
    if (m) return { text: m[1], start: left.length - m[1].length };
    return { text: left, start: 0 };
}

function grabRightOperand(s, slashIdx) {
    let right = s.slice(slashIdx + 1).trimStart();
    if (right.startsWith('(')) {
        const close = findMatch(right, 0, '(', ')');
        if (close >= 0) return { text: right.slice(0, close + 1), end: slashIdx + 1 + (right.length - right.trimStart().length) + close + 1 };
    }
    const m = right.match(/^([\w.]+)/);
    if (m) return { text: m[1], end: slashIdx + 1 + (right.length - right.trimStart().length) + m[1].length };
    return { text: right, end: s.length };
}

function convertFractions(s) {
    let safety = 0;
    while (safety++ < 20) {
        const idx = indexOfTopLevelSlash(s);
        if (idx < 0) break;
        const L = grabLeftOperand(s, idx);
        const R = grabRightOperand(s, idx);
        const num = stripOuterParens(convertFractions(L.text));
        const den = stripOuterParens(convertFractions(R.text));
        s = s.slice(0, L.start) + '\\frac{' + num + '}{' + den + '}' + s.slice(R.end);
    }
    return s;
}

function convertRoots(s) {
    s = s.replace(/cbrt\(([^)]+)\)/g, '\\sqrt[3]{$1}');
    s = s.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');
    return s;
}

function convertScripts(s) {
    s = s.replace(/\^(\([^)]+\))/g, (_, g) => '^{' + g.slice(1, -1) + '}');
    s = s.replace(/\^(\w)/g, '^{$1}');
    s = s.replace(/_(\([^)]+\))/g, (_, g) => '_{' + g.slice(1, -1) + '}');
    s = s.replace(/_(\w)/g, '_{$1}');
    return s;
}

function convertUprightWords(s) {
    for (const w of UPRIGHT_WORDS) {
        s = s.replace(new RegExp('\\b' + w + '\\b', 'g'), '\\text{' + w + '}');
    }
    return s;
}

function convertSymbols(s) {
    s = s.replace(/×/g, '\\times ').replace(/÷/g, '\\div ');
    s = s.replace(/≤/g, '\\le ').replace(/>=/g, '\\ge ');
    s = s.replace(/≠/g, '\\ne ').replace(/≈/g, '\\approx ');
    s = s.replace(/<=/g, '\\le ').replace(/>=/g, '\\ge ');
    s = s.replace(/!=/g, '\\ne ').replace(/−/g, '-');
    return s;
}

function toLatex(raw) {
    let s = raw.trim();
    if (!s) return '';
    s = convertRoots(s);
    s = convertFractions(s);
    s = convertScripts(s);
    s = convertUprightWords(s);
    s = convertSymbols(s);
    return s;
}

function hasMathOperator(s) {
    return /[+\-×÷=^/√∛<>≤≥≠≈]/.test(s);
}

function isPureExpression(s) {
    const t = s.trim();
    if (!t) return false;
    if (/[.!?;:]/.test(t)) return false;
    if (/\b(the|is|are|was|were|find|solve|given|correct|express|estimate|which|how|what|a |an |of |to |in |and |or |if |that|this|has|have|had|per|each|total|sum|between|after|before|when|rounded|nearest|significant|figure|integer|value|possible|satisfy|conditions|pair|largest|smallest|difference|number|bought|paid|received|change|travels|returns|trip|took|less|scored|answer|correctly|flash|together|packs|identical|left|over|maximum|measures|pave|completely|without|cutting|lap|times|meet|starting|point|positive|such|perfect|square|cube|greater|than|floor|rectangular|side|length|width|perimeter|area|mother|old|son|years|consecutive|odd|even|pens|notebooks|items|motorist|distance|towns|quiz|marks|deducted|wrong|unanswered|baker|needs|flour|loaf|loaves|full|student|estimates|over|under|cannot|determined|exact|vehicle|shopper|buys|estimating)\b/i.test(t)) return false;
    if (!hasMathOperator(t)) return false;
    return true;
}

function wrapMathRuns(text) {
    const MATH_START = /[+\-×÷=^/([\]√∛<>≤≥≠≈\d]/;
    const MATH_CHARS = /[+\-×÷=^/()[\]√∛<>≤≥≠≈\d\w.]/;
    const MATH_OPS   = /[+\-×÷=^/√∛<>≤≥≠≈]/;
    const AFTER_SPACE = /[+\-×÷=^/([\]√∛<>≤≥≠≈\d]/;
    let result = '';
    let i = 0;

    while (i < text.length) {
        if (MATH_START.test(text[i]) && !(i > 0 && /[a-zA-Z]/.test(text[i - 1]))) {
            let end = i;
            let hasOp = false;
            while (end < text.length) {
                if (MATH_CHARS.test(text[end])) {
                    if (MATH_OPS.test(text[end])) hasOp = true;
                    end++;
                } else if (text[end] === ' ' && end + 1 < text.length && AFTER_SPACE.test(text[end + 1])) {
                    end++;
                } else {
                    break;
                }
            }
            const segment = text.slice(i, end).trim();
            if (hasOp && segment.length > 1) {
                result += '\\(' + toLatex(segment) + '\\)';
            } else {
                result += text.slice(i, end);
            }
            i = end;
        } else {
            result += text[i];
            i++;
        }
    }
    return result;
}

function parseMathToLatex(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    try {
        let s = raw;
        const currencySlots = [];
        s = s.replace(/\$(\s?\d[\d,.]*)/g, (_, g) => {
            currencySlots.push('$' + g);
            return PH_OPEN + 'CUR' + (currencySlots.length - 1) + PH_CLOSE;
        });
        const explicitSlots = [];
        s = s.replace(/\$([^$]+)\$/g, (_, g) => {
            explicitSlots.push('\\(' + toLatex(g) + '\\)');
            return PH_OPEN + 'EXP' + (explicitSlots.length - 1) + PH_CLOSE;
        });
        const unitSlots = [];
        for (const [unit] of UNIT_LIST) {
            const esc = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            s = s.replace(new RegExp(esc, 'g'), (match) => {
                unitSlots.push(match);
                return PH_OPEN + 'UNT' + (unitSlots.length - 1) + PH_CLOSE;
            });
        }
        if (isPureExpression(s)) {
            s = '\\(' + toLatex(s) + '\\)';
        } else {
            s = wrapMathRuns(s);
        }
        s = s.replace(new RegExp(PH_OPEN + 'UNT(\\d+)' + PH_CLOSE, 'g'), (_, i) => unitSlots[+i]);
        s = s.replace(new RegExp(PH_OPEN + 'EXP(\\d+)' + PH_CLOSE, 'g'), (_, i) => explicitSlots[+i]);
        s = s.replace(new RegExp(PH_OPEN + 'CUR(\\d+)' + PH_CLOSE, 'g'), (_, i) => currencySlots[+i]);
        return s;
    } catch (e) {
        console.warn('Math parse fallback:', e);
        return raw;
    }
}

async function typesetMath(element) {
    if (!element) return;
    try {
        if (window.MathJax && MathJax.typesetClear) MathJax.typesetClear([element]);
        if (window.MathJax && MathJax.typesetPromise) await MathJax.typesetPromise([element]);
    } catch (e) {
        console.warn('MathJax typeset error:', e);
    }
}

/* ═══════════════════════════════════════════════════════
   SECTION 2 — UTILITIES
   ═══════════════════════════════════════════════════════ */

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getWinTarget() {
    const total = STATE.dataset.questions.length;
    const t = CONFIG.WIN_THRESHOLD;
    if (typeof t === 'number' && t > 0 && t < 1) return Math.ceil(total * t);
    if (typeof t === 'number' && t >= 1) return Math.min(Math.floor(t), total);
    return total;
}

/* ═══════════════════════════════════════════════════════
   SECTION 3 — SCREEN MANAGEMENT
   ═══════════════════════════════════════════════════════ */

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    STATE.currentScreen = screenId;
    window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ═══════════════════════════════════════════════════════
   SECTION 4 — DATA FETCHING
   ═══════════════════════════════════════════════════════ */

async function fetchJSON(relativePath) {
    const url = `${CONFIG.BASE_URL}/${relativePath}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

async function loadWorksheetIndex() {
    const listEl = document.getElementById('worksheet-list');
    try {
        const index = await fetchJSON(CONFIG.INDEX_FILE);
        if (!Array.isArray(index) || index.length === 0) {
            listEl.innerHTML = '<p class="loading-msg">No worksheets found.</p>';
            return;
        }
        listEl.innerHTML = '';
        index.forEach((ws) => {
            const card = document.createElement('button');
            card.className = 'worksheet-card';
            card.setAttribute('aria-label', `Start ${ws.title}`);
            card.innerHTML = `
                <span class="card-icon">${ws.icon || '📄'}</span>
                <span class="card-info">
                    <span class="card-title">${ws.title}</span>
                    <span class="card-meta">${ws.subject || ''} · ${ws.questionCount || '?'} Qs</span>
                </span>
                <span class="card-arrow">›</span>`;
            card.addEventListener('click', () => startWorksheet(ws.file));
            listEl.appendChild(card);
        });
    } catch (e) {
        console.error('Index load failed:', e);
        listEl.innerHTML = `<p class="loading-msg">⚠️ Could not load worksheets.<br><small>${e.message}</small></p>`;
    }
}

async function startWorksheet(filePath) {
    try {
        const data = await fetchJSON(filePath);
        if (!data.questions || !data.revealImageUrl) {
            alert('Invalid worksheet file.');
            return;
        }
        STATE.dataset = data;
        STATE.currentIndex = 0;
        STATE.correctCount = 0;
        STATE.revealedHistory = [];
        STATE.gambleMode = false;
        STATE.isAnswering = false;

        document.getElementById('worksheet-title').textContent = data.worksheetTitle || 'Worksheet';
        document.getElementById('reveal-image').src = data.revealImageUrl;

        setupGrid();
        showScreen('game-screen');
        loadQuestion();
    } catch (e) {
        console.error('Worksheet load failed:', e);
        alert('Could not load worksheet: ' + e.message);
    }
}

/* ═══════════════════════════════════════════════════════
   SECTION 5 — GRID SETUP
   ═══════════════════════════════════════════════════════ */

function setupGrid() {
    const total = STATE.dataset.questions.length;
    const cols = total <= 12 ? 4 : 6;
    const rows = Math.ceil(total / cols);
    const overlay = document.getElementById('grid-overlay');
    overlay.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    overlay.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    overlay.innerHTML = '';

    const tileCount = cols * rows;
    for (let i = 0; i < tileCount; i++) {
        const tile = document.createElement('div');
        tile.className = 'grid-tile';
        tile.id = `tile-${i}`;
        tile.setAttribute('aria-hidden', 'true');
        overlay.appendChild(tile);
    }

    STATE.shuffledTiles = shuffleArray(Array.from({ length: tileCount }, (_, i) => i));
}

/* ═══════════════════════════════════════════════════════
   SECTION 6 — QUESTION LOADING
   ═══════════════════════════════════════════════════════ */

async function loadQuestion() {
    if (STATE.currentIndex >= STATE.dataset.questions.length) {
        finishGame();
        return;
    }

    STATE.isAnswering = false;
    STATE.gambleMode = false;
    document.querySelector('.game-container')?.classList.remove('gamble-active');

    const oldPrompt = document.getElementById('gamble-prompt');
    if (oldPrompt) oldPrompt.remove();

    const q = STATE.dataset.questions[STATE.currentIndex];
    const qTextEl = document.getElementById('question-text');
    const optContainer = document.getElementById('options-container');
    const progressEl = document.getElementById('progress-tracker');

    qTextEl.innerHTML = `<strong>Q${STATE.currentIndex + 1}.</strong> ${parseMathToLatex(q.qText)}`;

    const pairs = q.options.map((text, idx) => ({
        text,
        isCorrect: idx === q.correctIndex
    }));
    const shuffled = shuffleArray(pairs);
    STATE.liveOptions = shuffled;
    STATE.liveCorrectIndex = shuffled.findIndex(p => p.isCorrect);

    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    optContainer.innerHTML = '';
    shuffled.forEach((pair, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span class="option-letter">${letters[i]}</span>
                         <span class="option-text">${parseMathToLatex(pair.text)}</span>`;
        btn.addEventListener('click', () => checkAnswer(i));
        optContainer.appendChild(btn);
    });

    const total = STATE.dataset.questions.length;
    const target = getWinTarget();
    const revealed = STATE.revealedHistory.length;
    const tileTotal = document.querySelectorAll('.grid-tile').length;
    progressEl.textContent = `Q${STATE.currentIndex + 1}/${total} · ✅ ${STATE.correctCount}/${target} to unlock · 🧩 ${revealed}/${tileTotal} tiles`;

    await typesetMath(qTextEl);
    await typesetMath(optContainer);

    if (STATE.revealedHistory.length > 0 && STATE.shuffledTiles.length > 0) {
        offerGamble();
    }
}

/* ═══════════════════════════════════════════════════════
   SECTION 7 — ANSWER CHECKING
   ═══════════════════════════════════════════════════════ */

function checkAnswer(selectedIndex) {
    if (STATE.isAnswering) return;
    STATE.isAnswering = true;

    const prompt = document.getElementById('gamble-prompt');
    if (prompt) prompt.remove();

    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(b => b.disabled = true);

    const isCorrect = selectedIndex === STATE.liveCorrectIndex;

    if (isCorrect) {
        buttons[selectedIndex].classList.add('correct');
        STATE.correctCount++;
        const wasGambling = STATE.gambleMode;
        revealTile(wasGambling ? 2 : 1);
        STATE.gambleMode = false;
        document.querySelector('.game-container')?.classList.remove('gamble-active');

        if (wasGambling) showEncouragement('gamble-win');

        // Early win: threshold hit before all questions done
        if (STATE.correctCount >= getWinTarget()) {
            setTimeout(() => cascadeRevealAndEnd(true), 600);
            return;
        }

        setTimeout(() => {
            STATE.currentIndex++;
            loadQuestion();
        }, 700);
    } else {
        buttons[selectedIndex].classList.add('wrong');
        buttons[STATE.liveCorrectIndex].classList.add('correct');

        if (STATE.gambleMode) {
            resolveGambleLoss();
            showEncouragement('gamble-loss');
        } else {
            showEncouragement('normal');
        }

        triggerGlitchPeek();
        STATE.gambleMode = false;
        document.querySelector('.game-container')?.classList.remove('gamble-active');

        setTimeout(() => {
            STATE.currentIndex++;
            if (STATE.currentIndex >= STATE.dataset.questions.length) {
                finishGame();
            } else {
                loadQuestion();
            }
        }, 1500);
    }
}

/* ═══════════════════════════════════════════════════════
   SECTION 8 — GAMBLE MECHANICS
   ═══════════════════════════════════════════════════════ */

function revealTile(count) {
    for (let i = 0; i < count; i++) {
        if (STATE.shuffledTiles.length === 0) break;
        const tileIdx = STATE.shuffledTiles.pop();
        const tile = document.getElementById(`tile-${tileIdx}`);
        if (tile) {
            tile.classList.add('revealed');
            if (count > 1) tile.classList.add('double-reveal');
        }
        STATE.revealedHistory.push(tileIdx);
    }
    updateProgress();
}

function updateProgress() {
    const total = STATE.dataset.questions.length;
    const target = getWinTarget();
    const revealed = STATE.revealedHistory.length;
    const tileTotal = document.querySelectorAll('.grid-tile').length;
    const el = document.getElementById('progress-tracker');
    if (el) el.textContent = `Q${STATE.currentIndex + 1}/${total} · ✅ ${STATE.correctCount}/${target} to unlock · 🧩 ${revealed}/${tileTotal} tiles`;
}

function triggerGlitchPeek() {
    const overlay = document.getElementById('grid-overlay');
    overlay.classList.add('glitch');
    setTimeout(() => overlay.classList.remove('glitch'), 600);

    const hiddenTiles = STATE.shuffledTiles.filter(i => {
        const t = document.getElementById(`tile-${i}`);
        return t && !t.classList.contains('revealed');
    });
    if (hiddenTiles.length > 0) {
        const peekIdx = hiddenTiles[Math.floor(Math.random() * hiddenTiles.length)];
        const peekTile = document.getElementById(`tile-${peekIdx}`);
        if (peekTile) {
            peekTile.classList.add('peek');
            setTimeout(() => peekTile.classList.remove('peek'), 600);
        }
    }
}

function offerGamble() {
    const panel = document.querySelector('.question-panel');
    if (document.getElementById('gamble-prompt')) return;

    const prompt = document.createElement('div');
    prompt.id = 'gamble-prompt';
    prompt.innerHTML = `
        <p class="gamble-text">⚡ BET A TILE? ⚡</p>
        <p class="gamble-desc">Get this right →
            <span class="reward">2 tiles revealed!</span></p>
        <p class="gamble-risk">Get it wrong →
            <span class="risk">1 tile covered back up!</span></p>
        <div class="gamble-buttons">
            <button class="gamble-btn yes" id="gamble-yes">🎲 Double or nothing!</button>
            <button class="gamble-btn no"  id="gamble-no">🛡️ Play it safe</button>
        </div>`;
    panel.prepend(prompt);

    document.getElementById('gamble-yes').addEventListener('click', acceptGamble);
    document.getElementById('gamble-no').addEventListener('click', declineGamble);
}

function acceptGamble() {
    STATE.gambleMode = true;
    document.querySelector('.game-container')?.classList.add('gamble-active');
    const prompt = document.getElementById('gamble-prompt');
    if (prompt) prompt.remove();
}

function declineGamble() {
    STATE.gambleMode = false;
    const prompt = document.getElementById('gamble-prompt');
    if (prompt) prompt.remove();
}

function resolveGambleLoss() {
    if (STATE.revealedHistory.length === 0) return;
    const lostIdx = STATE.revealedHistory.splice(
        Math.floor(Math.random() * STATE.revealedHistory.length), 1
    )[0];
    const tile = document.getElementById(`tile-${lostIdx}`);
    if (tile) {
        tile.classList.remove('revealed', 'double-reveal');
        tile.classList.add('recover-flash');
        setTimeout(() => tile.classList.remove('recover-flash'), 800);
    }
    STATE.shuffledTiles.push(lostIdx);
    updateProgress();
}

function showEncouragement(type) {
    const quips = {
        normal: [
            "So close! The image is hiding something cool… 👀",
            "Not quite! But did you catch that glimpse?",
            "The grid is teasing you! Onward! 💪",
            "Almost! The hidden image *wants* to be found!",
            "Ooh, a fragment! Your brain is locked in now 🔒"
        ],
        'gamble-win': [
            "Jackpot! Two tiles down! 🎰",
            "Risk paid off! The image is crumbling! 💎",
            "Lucky guess! Double reveal! 🍀",
            "Bold move! The grid is shaking! 🔥"
        ],
        'gamble-loss': [
            "Ouch! A tile slipped back into darkness… 😬",
            "The image retreated! Better luck next bet! 💪",
            "Risk didn't pay off. Play it safe next time? 🤔",
            "The grid fights back! Don't give up! 🔥"
        ]
    };
    const pool = quips[type] || quips.normal;
    const msg = pool[Math.floor(Math.random() * pool.length)];

    let toast = document.querySelector('.encouragement-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'encouragement-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ═══════════════════════════════════════════════════════
   SECTION 9 — END GAME (v4.2: fail state)
   ═══════════════════════════════════════════════════════ */

// Called when all questions are done OR threshold is hit early
function finishGame() {
    const won = STATE.correctCount >= getWinTarget();
    if (won) {
        cascadeRevealAndEnd(true);
    } else {
        cascadeRevealAndEnd(false);
    }
}

function cascadeRevealAndEnd(didWin) {
    const remaining = [];
    document.querySelectorAll('.grid-tile').forEach(tile => {
        if (!tile.classList.contains('revealed')) remaining.push(tile);
    });

    if (didWin) {
        // WIN: cascade reveal all remaining tiles
        if (remaining.length === 0) {
            endGame(true);
            return;
        }
        remaining.forEach((tile, i) => {
            setTimeout(() => tile.classList.add('cascade-reveal'), i * 80);
        });
        setTimeout(() => endGame(true), remaining.length * 80 + 600);
    } else {
        // LOSE: tiles stay covered, show end screen immediately
        endGame(false);
    }
}

function endGame(didWin) {
    const target = getWinTarget();
    const total = STATE.dataset.questions.length;
    const score = STATE.correctCount;
    const tileTotal = document.querySelectorAll('.grid-tile').length;
    const revealed = STATE.revealedHistory.length;

    let message = '';
    let emoji = '';

    if (didWin && score >= total) {
        emoji = '🏆';
        message = `Perfect score! ${score}/${total} — every tile unlocked!`;
        // Ensure all tiles visible
        document.querySelectorAll('.grid-tile').forEach(t => {
            t.classList.add('revealed');
            t.classList.remove('cascade-reveal');
        });
    } else if (didWin) {
        emoji = '🎉';
        message = `You got ${score}/${total} right — image unlocked!`;
        document.querySelectorAll('.grid-tile').forEach(t => {
            t.classList.add('revealed');
            t.classList.remove('cascade-reveal');
        });
    } else {
        emoji = '🔒';
        message = `You got ${score}/${total} right, but needed ${target}. The image stays hidden!`;
        // Tiles stay covered — do NOT reveal
    }

    const panel = document.querySelector('.question-panel');
    panel.innerHTML = `
        <div class="end-game-panel">
            <h2>${emoji} ${didWin ? 'Image Unlocked!' : 'Not Quite!'}</h2>
            <p>${message}</p>
            <p style="font-size:0.82rem; color:var(--color-text-muted);">
                Tiles revealed: ${revealed}/${tileTotal}
            </p>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center;">
                ${!didWin ? '<button id="retry-btn" class="end-btn retry">🔄 Try Again</button>' : ''}
                <button id="back-to-launcher" class="end-btn">← Choose Another</button>
            </div>
        </div>`;

    document.getElementById('back-to-launcher').addEventListener('click', () => {
        showScreen('launcher-screen');
        loadWorksheetIndex();
    });

    if (!didWin) {
        document.getElementById('retry-btn').addEventListener('click', () => {
            startWorksheet(STATE.currentFilePath || '');
        });
    }
}

/* ═══════════════════════════════════════════════════════
   SECTION 10 — INITIALISATION
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('back-btn').addEventListener('click', () => {
        if (confirm('Leave this worksheet? Your progress will be lost.')) {
            showScreen('launcher-screen');
            loadWorksheetIndex();
        }
    });

    showScreen('launcher-screen');
    loadWorksheetIndex();
});
