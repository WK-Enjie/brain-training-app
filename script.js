/* ============================================================
   MYSTERY GRID REVEAL — script.js v4.4
   Fixes: overlay end-screen (Try Again works), consistent x/y/z
   ============================================================ */

// ===== STATE =====
const STATE = {
    worksheetData: null,
    currentQuestion: 0,
    correctCount: 0,
    revealedTiles: new Set(),
    totalTiles: 24,
    isAnswered: false,
    currentFilePath: '',
    gambleActive: false,
    _lastFilePath: ''
};

// ===== DOM HELPERS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
    ['launcher-screen', 'game-screen', 'end-screen'].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.toggle('hidden', s !== id);
    });
}

// ===== INIT =====
async function init() {
    try {
        const url = `${CONFIG.BASE_URL}/${CONFIG.INDEX_FILE}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const index = await res.json();
        buildLauncher(index);
    } catch (err) {
        console.error('Failed to load index:', err);
        const launcher = $('#launcher-screen');
        if (launcher) {
            launcher.innerHTML =
                '<p class="error">Failed to load worksheets. Check config.js and your GitHub repo.</p>';
        }
    }
}

function buildLauncher(index) {
    const container = $('#worksheet-list');
    if (!container) return;
    container.innerHTML = '';
    index.forEach(ws => {
        const card = document.createElement('div');
        card.className = 'ws-card';
        card.innerHTML = `
            <span class="ws-icon">${ws.icon}</span>
            <h3>${ws.title}</h3>
            <p>${ws.subject} · ${ws.topic}</p>
            <span class="ws-count">${ws.questionCount} Qs</span>
        `;
        card.addEventListener('click', () => startWorksheet(ws.file));
        container.appendChild(card);
    });
}

// ===== START WORKSHEET =====
async function startWorksheet(filePath) {
    // --- full state reset (makes Try Again safe) ---
    STATE.currentFilePath = filePath;
    STATE.currentQuestion = 0;
    STATE.correctCount = 0;
    STATE.revealedTiles = new Set();
    STATE.isAnswered = false;
    STATE.gambleActive = false;

    // hide overlay if it exists from a previous round
    const overlay = document.getElementById('end-overlay');
    if (overlay) overlay.style.display = 'none';

    showScreen('game-screen');

    // fetch only if we don't already have this worksheet cached
    if (!STATE.worksheetData || STATE._lastFilePath !== filePath) {
        try {
            const url = `${CONFIG.BASE_URL}/${filePath}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            STATE.worksheetData = await res.json();
            STATE._lastFilePath = filePath;
        } catch (err) {
            console.error('Failed to load worksheet:', err);
            alert('Failed to load worksheet. Check your connection and file path.');
            showScreen('launcher-screen');
            return;
        }
    }

    STATE.totalTiles = STATE.worksheetData.questions.length;
    setupGrid(STATE.worksheetData.revealImage);
    updateScore();
    showQuestion(0);
}

// ===== GRID =====
function setupGrid(imageUrl) {
    const grid = $('#grid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.style.backgroundImage = `url(${imageUrl})`;

    for (let i = 0; i < STATE.totalTiles; i++) {
        const tile = document.createElement('div');
        tile.className = 'grid-tile';
        tile.dataset.index = i;
        grid.appendChild(tile);
    }
}

function revealRandomTile() {
    const unrevealed = [];
    for (let i = 0; i < STATE.totalTiles; i++) {
        if (!STATE.revealedTiles.has(i)) unrevealed.push(i);
    }
    if (unrevealed.length === 0) return;
    const idx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    STATE.revealedTiles.add(idx);
    const tile = $(`.grid-tile[data-index="${idx}"]`);
    if (tile) tile.classList.add('revealed');
}

function removeTile() {
    if (STATE.revealedTiles.size === 0) return;
    const arr = Array.from(STATE.revealedTiles);
    const idx = arr[Math.floor(Math.random() * arr.length)];
    STATE.revealedTiles.delete(idx);
    const tile = $(`.grid-tile[data-index="${idx}"]`);
    if (tile) tile.classList.remove('revealed');
}

// ===== GLITCH PEEK =====
function glitchPeek() {
    const grid = $('#grid');
    if (!grid) return;
    grid.classList.add('glitch-peek');
    setTimeout(() => grid.classList.remove('glitch-peek'), 600);
}

// ===== GAMBLE =====
function gamblePrompt() {
    if (STATE.revealedTiles.size === 0 ||
        STATE.revealedTiles.size >= STATE.totalTiles) return;

    const qArea = $('#question-area');
    if (!qArea) return;

    const gambleDiv = document.createElement('div');
    gambleDiv.className = 'gamble-prompt';
    gambleDiv.innerHTML = `
        <p>🎰 <strong>Bet a tile?</strong>
           Right → reveal 2 tiles! Wrong → lose 1 tile.</p>
        <button class="gamble-yes">Yes, bet!</button>
        <button class="gamble-no">No thanks</button>
    `;
    qArea.prepend(gambleDiv);

    gambleDiv.querySelector('.gamble-yes').addEventListener('click', () => {
        STATE.gambleActive = true;
        gambleDiv.remove();
        const unrevealed = [];
        for (let i = 0; i < STATE.totalTiles; i++) {
            if (!STATE.revealedTiles.has(i)) unrevealed.push(i);
        }
        if (unrevealed.length > 0) {
            const idx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
            const tile = $(`.grid-tile[data-index="${idx}"]`);
            if (tile) tile.classList.add('gamble-glow');
        }
    });

    gambleDiv.querySelector('.gamble-no').addEventListener('click', () => {
        STATE.gambleActive = false;
        gambleDiv.remove();
    });
}

// ===== MATH RENDERING =====
const MATH_VARS = /^[xyzabcnmkpqrtuvw]$/i;

function hasMathOperator(s) {
    return /[+\-×÷=^/√∛<>≤≥≠≈]/.test(s);
}

function isPureExpression(s) {
    const t = s.trim();
    if (t.length === 1 && MATH_VARS.test(t)) return true;
    if (t.length < 2) return false;
    const stripped = t.replace(/[\s\d().+\-×÷=^/√∛<>≤≥≠≈]/g, '');
    const proseWords = stripped.match(/[a-zA-Z]{2,}/g);
    return hasMathOperator(t) && !proseWords;
}

function wrapMathRuns(text) {
    const MATH_START  = /[+\-×÷=^/([\]√∛<>≤≥≠≈\d]/;
    const MATH_CHARS  = /[+\-×÷=^/()[\]√∛<>≤≥≠≈\d\w.]/;
    const AFTER_SPACE = /[+\-×÷=^/([\]√∛<>≤≥≠≈\d]/;
    const VAR_NEXT    = /[\s,.;:!?)+\-=×÷^/<>≤≥≠≈\]]/;

    let result = '';
    let i = 0;

    while (i < text.length) {
        const ch = text[i];
        let startMath = false;

        if (MATH_START.test(ch)) {
            startMath = true;
        } else if (MATH_VARS.test(ch)) {
            const prev = i > 0 ? text[i - 1] : ' ';
            const next = i < text.length - 1 ? text[i + 1] : ' ';
            if (/[\s(]/.test(prev) && VAR_NEXT.test(next)) {
                startMath = true;
            }
        }

        if (startMath) {
            let j = i;
            while (j < text.length) {
                if (text[j] === ' ') {
                    const k = j + 1;
                    if (k < text.length && AFTER_SPACE.test(text[k])) {
                        j = k;
                        continue;
                    }
                    break;
                }
                if (MATH_CHARS.test(text[j])) { j++; }
                else { break; }
            }

            const run = text.slice(i, j);
            result += isPureExpression(run) ? `\\(${run}\\)` : run;
            i = j;
        } else {
            result += ch;
            i++;
        }
    }
    return result;
}

/* Wrap lone x, y, z in prose so every variable uses the same MathJax glyph */
function wrapStandaloneVars(text) {
    const parts = text.split(/(\\\([\s\S]*?\\\))/g);
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith('\\(')) continue;   // already math
        parts[i] = parts[i].replace(/\b([xyz])\b/g, '\\($1\\)');
    }
    return parts.join('');
}

async function renderMath(el) {
    if (window.MathJax && MathJax.typesetPromise) {
        try {
            MathJax.startup.document.clear();
            MathJax.startup.document.updateDocument();
            await MathJax.typesetPromise([el]);
        } catch (e) {
            console.warn('MathJax typeset error:', e);
        }
    }
}

// ===== SHOW QUESTION =====
function showQuestion(index) {
    if (index >= STATE.worksheetData.questions.length) {
        finishGame();
        return;
    }

    STATE.currentQuestion = index;
    STATE.isAnswered = false;
    STATE.gambleActive = false;

    const q = STATE.worksheetData.questions[index];
    const qArea = $('#question-area');
    if (!qArea) return;

    // question number
    const qNum = document.createElement('div');
    qNum.className = 'q-number';
    qNum.textContent = `Q${index + 1} of ${STATE.totalTiles}`;

    // question text  (math runs → standalone vars)
    const qText = document.createElement('div');
    qText.className = 'q-text';
    qText.innerHTML = wrapStandaloneVars(wrapMathRuns(q.question));

    // options (always shuffled)
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'options';

    let options = [...q.options];
    if (CONFIG.SHUFFLE_OPTIONS) options = shuffleArray(options);

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'opt-btn';
        btn.dataset.value = opt;
        btn.innerHTML = wrapStandaloneVars(wrapMathRuns(opt));
        btn.addEventListener('click', () => checkAnswer(opt, q.answer, optionsDiv));
        optionsDiv.appendChild(btn);
    });

    qArea.innerHTML = '';
    qArea.appendChild(qNum);
    qArea.appendChild(qText);
    qArea.appendChild(optionsDiv);

    renderMath(qArea);
    updateProgress();

    if (STATE.revealedTiles.size > 0 &&
        STATE.revealedTiles.size < STATE.totalTiles) {
        gamblePrompt();
    }
}

// ===== CHECK ANSWER =====
function checkAnswer(selected, correct, optionsDiv) {
    if (STATE.isAnswered) return;
    STATE.isAnswered = true;

    const buttons = optionsDiv.querySelectorAll('.opt-btn');
    const isCorrect = selected === correct;

    buttons.forEach(btn => {
        if (btn.dataset.value === correct) btn.classList.add('correct');
        if (btn.dataset.value === selected && !isCorrect) btn.classList.add('wrong');
        btn.disabled = true;
    });

    if (isCorrect) {
        STATE.correctCount++;
        updateScore();
        if (STATE.gambleActive) {
            revealRandomTile();
            revealRandomTile();
            showToast('🎰 Jackpot! +2 tiles!');
        } else {
            revealRandomTile();
        }
    } else {
        if (STATE.gambleActive) {
            removeTile();
            showToast('😬 Lost a tile!');
        }
        glitchPeek();
    }

    setTimeout(() => {
        showQuestion(STATE.currentQuestion + 1);
    }, isCorrect ? 1000 : 1500);
}

// ===== FINISH GAME =====
function finishGame() {
    const won = STATE.correctCount >= getWinTarget();
    cascadeRevealAndEnd(won);
}

function cascadeRevealAndEnd(didWin) {
    if (!didWin) {
        endGame(false);
        return;
    }

    const unrevealed = [];
    for (let i = 0; i < STATE.totalTiles; i++) {
        if (!STATE.revealedTiles.has(i)) unrevealed.push(i);
    }

    unrevealed.forEach((idx, i) => {
        setTimeout(() => {
            STATE.revealedTiles.add(idx);
            const tile = $(`.grid-tile[data-index="${idx}"]`);
            if (tile) {
                tile.classList.add('cascade-reveal');
                setTimeout(() => tile.classList.add('revealed'), 500);
            }
        }, i * 80);
    });

    setTimeout(() => endGame(true), unrevealed.length * 80 + 600);
}

// ===== END GAME  (floating overlay — game DOM stays intact) =====
function endGame(didWin) {
    const total     = STATE.totalTiles;
    const correct   = STATE.correctCount;
    const target    = getWinTarget();
    const isPerfect = correct === total;

    let title, message;
    if (didWin && isPerfect) {
        title   = '🏆 Perfect Score!';
        message = `You got all ${total} correct! Amazing!`;
    } else if (didWin) {
        title   = '🎉 Image Unlocked!';
        message = `You got ${correct}/${total} right (needed ${target}). Great job!`;
    } else {
        title   = '🔒 Not Quite!';
        message = `You got ${correct}/${total} right, but needed ${target}. The image stays hidden!`;
    }

    // create overlay once, reuse on retry
    let overlay = document.getElementById('end-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'end-overlay';
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div class="end-card">
            <h2>${title}</h2>
            <p>${message}</p>
            <div class="end-buttons">
                ${!didWin ? '<button class="end-btn retry" id="retry-btn">Try Again</button>' : ''}
                <button class="end-btn" id="back-btn">Choose Another</button>
            </div>
        </div>
    `;
    overlay.style.display = 'flex';

    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            overlay.style.display = 'none';
            startWorksheet(STATE.currentFilePath);
        });
    }

    document.getElementById('back-btn').addEventListener('click', () => {
        overlay.style.display = 'none';
        STATE.worksheetData = null;
        STATE._lastFilePath = '';
        showScreen('launcher-screen');
    });
}

// ===== WIN TARGET =====
function getWinTarget() {
    const t = CONFIG.WIN_THRESHOLD;
    if (t >= 1) return Math.min(t, STATE.totalTiles);
    return Math.ceil(STATE.totalTiles * t);
}

// ===== UTILITIES =====
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function updateScore() {
    const el = $('#score-display');
    if (el) el.textContent = `${STATE.correctCount}/${STATE.totalTiles}`;
}

function updateProgress() {
    const el = $('#progress-bar');
    if (el) {
        const pct = (STATE.currentQuestion / STATE.totalTiles) * 100;
        el.style.width = `${pct}%`;
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', init);
