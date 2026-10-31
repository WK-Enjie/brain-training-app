/* ============================================================
   MYSTERY GRID REVEAL — script.js v5.0
   Rewritten to match actual index.html DOM structure
   ============================================================ */

// ===== STATE =====
const STATE = {
    worksheetData: null,
    worksheetTitle: '',
    currentQuestion: 0,
    correctCount: 0,
    revealedTiles: new Set(),
    totalTiles: 24,
    isAnswered: false,
    currentFilePath: '',
    gambleActive: false,
    _lastFilePath: '',
    _indexData: null
};

// ===== DOM HELPERS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
    $$('.screen').forEach(s => {
        s.classList.toggle('active', s.id === id);
    });
}

// ===== INIT =====
async function init() {
    // Check for retry from sessionStorage
    const retry = sessionStorage.getItem('mgr_retry');
    if (retry) {
        sessionStorage.removeItem('mgr_retry');
        // Need to load index first to get title, then start
        await loadIndex();
        startWorksheet(retry);
        return;
    }

    await loadIndex();
    showScreen('launcher-screen');

    // Back button in game header
    const backBtn = $('#back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            showScreen('launcher-screen');
        });
    }
}

async function loadIndex() {
    try {
        const url = `${CONFIG.BASE_URL}/${CONFIG.INDEX_FILE}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        STATE._indexData = await res.json();
        buildLauncher(STATE._indexData);
    } catch (err) {
        console.error('Failed to load index:', err);
        const list = $('#worksheet-list');
        if (list) {
            list.innerHTML =
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
        card.addEventListener('click', () => {
            STATE.worksheetTitle = ws.title;
            startWorksheet(ws.file);
        });
        container.appendChild(card);
    });
}

// ===== START WORKSHEET =====
async function startWorksheet(filePath) {
    STATE.currentFilePath = filePath;
    STATE.currentQuestion = 0;
    STATE.correctCount = 0;
    STATE.revealedTiles = new Set();
    STATE.isAnswered = false;
    STATE.gambleActive = false;

    const overlay = document.getElementById('end-overlay');
    if (overlay) overlay.style.display = 'none';

    showScreen('game-screen');

    const titleEl = $('#worksheet-title');
    if (titleEl) titleEl.textContent = STATE.worksheetTitle || 'Mystery Grid';

    // Show loading state immediately
    const qText = $('#question-text');
    const optContainer = $('#options-container');
    if (qText) qText.textContent = 'Loading questions…';
    if (optContainer) optContainer.innerHTML = '';

    // Fetch worksheet data
    if (!STATE.worksheetData || STATE._lastFilePath !== filePath) {
        try {
            const url = `${CONFIG.BASE_URL}/${filePath}`;
            console.log('Fetching:', url);
            const res = await fetch(url);
            console.log('Response status:', res.status);
            if (!res.ok) throw new Error(`HTTP ${res.status} — file not found at ${url}`);
            STATE.worksheetData = await res.json();
            STATE._lastFilePath = filePath;
            console.log('Loaded worksheet:', STATE.worksheetData);
        } catch (err) {
            console.error('FAILED to load worksheet:', err);
            if (qText) {
                qText.innerHTML = `<strong style="color:var(--color-wrong)">⚠️ ${err.message}</strong><br><br>Check that the file path in <code>index.json</code> matches your GitHub repo.`;
            }
            return;
        }
    }

    if (!STATE.worksheetData || !STATE.worksheetData.questions) {
        if (qText) qText.textContent = '⚠️ Worksheet data is missing a "questions" array.';
        return;
    }

    STATE.totalTiles = STATE.worksheetData.questions.length;
    setupGrid(STATE.worksheetData.revealImage);
    updateProgress();
    showQuestion(0);
}

// ===== GRID =====
function setupGrid(imageUrl) {
    // Set the reveal image
    const img = $('#reveal-image');
    if (img) img.src = imageUrl;

    // Build tile grid inside the overlay
    const grid = $('#grid-overlay');
    if (!grid) return;
    grid.innerHTML = '';

    // Calculate grid dimensions
    const cols = Math.ceil(Math.sqrt(STATE.totalTiles * 1.5));
    const rows = Math.ceil(STATE.totalTiles / cols);
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

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
    const grid = $('#grid-overlay');
    if (!grid) return;
    grid.classList.add('glitch-peek');
    setTimeout(() => grid.classList.remove('glitch-peek'), 600);
}

// ===== GAMBLE =====
function gamblePrompt() {
    if (STATE.revealedTiles.size === 0 ||
        STATE.revealedTiles.size >= STATE.totalTiles) return;

    const qText = $('#question-text');
    if (!qText) return;

    const gambleDiv = document.createElement('div');
    gambleDiv.className = 'gamble-prompt';
    gambleDiv.innerHTML = `
        <p>🎰 <strong>Bet a tile?</strong>
           Right → reveal 2! Wrong → lose 1.</p>
        <button class="gamble-yes">Yes, bet!</button>
        <button class="gamble-no">No thanks</button>
    `;
    qText.before(gambleDiv);

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

function wrapStandaloneVars(text) {
    const parts = text.split(/(\\\([\s\S]*?\\\))/g);
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith('\\(')) continue;
        parts[i] = parts[i].replace(/\b([xyz])\b/g, '\\($1\\)');
    }
    return parts.join('');
}

function processMath(text) {
    return wrapStandaloneVars(wrapMathRuns(text));
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

    // Question text
    const qText = $('#question-text');
    if (qText) {
        qText.innerHTML = processMath(q.question);
    }

    // Options
    const optContainer = $('#options-container');
    if (optContainer) {
        optContainer.innerHTML = '';
        let options = [...q.options];
        if (CONFIG.SHUFFLE_OPTIONS) options = shuffleArray(options);

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'opt-btn';
            btn.dataset.value = opt;
            btn.innerHTML = processMath(opt);
            btn.addEventListener('click', () => checkAnswer(opt, q.answer, optContainer));
            optContainer.appendChild(btn);
        });
    }

    // Render MathJax in the question panel
    const panel = $('.question-panel');
    if (panel) renderMath(panel);

    updateProgress();

    if (STATE.revealedTiles.size > 0 &&
        STATE.revealedTiles.size < STATE.totalTiles) {
        gamblePrompt();
    }
}

// ===== CHECK ANSWER =====
function checkAnswer(selected, correct, optContainer) {
    if (STATE.isAnswered) return;
    STATE.isAnswered = true;

    const buttons = optContainer.querySelectorAll('.opt-btn');
    const isCorrect = selected === correct;

    buttons.forEach(btn => {
        if (btn.dataset.value === correct) btn.classList.add('correct');
        if (btn.dataset.value === selected && !isCorrect) btn.classList.add('wrong');
        btn.disabled = true;
    });

    if (isCorrect) {
        STATE.correctCount++;
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

    updateProgress();

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

// ===== END GAME (dynamic overlay) =====
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
                <button class="end-btn" id="end-back-btn">Choose Another</button>
            </div>
        </div>
    `;
    overlay.style.display = 'flex';

    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            sessionStorage.setItem('mgr_retry', STATE.currentFilePath);
            location.reload();
        });
    }

    document.getElementById('end-back-btn').addEventListener('click', () => {
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

// ===== PROGRESS =====
function updateProgress() {
    const el = $('#progress-tracker');
    if (el) {
        el.textContent = `Q${STATE.currentQuestion + 1}/${STATE.totalTiles}  ·  Score: ${STATE.correctCount}`;
    }
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
