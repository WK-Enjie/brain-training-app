/* ============================================================
   MYSTERY GRID REVEAL — script.js v7.6
   Fix: trailing subscripts after ) in chemistry formulas
        e.g. Al_2(SO_4)_3  →  Al₂(SO₄)₃  (not Al₂(SO₄)_{3})
   ============================================================ */
(() => {
"use strict";

/* ── Config ─────────────────────────────────────────────── */
const C = window.CONFIG || {};
const GH_USER    = C.GITHUB_USER    || "WK-Enjie";
const GH_REPO    = C.GITHUB_REPO    || "brain-training-app";
const GH_BRANCH  = C.GITHUB_BRANCH  || "main";
const Q_PATH     = C.QUESTIONS_PATH || "Questions";
const INDEX_FILE = C.INDEX_FILE     || "index.json";
const SHUFFLE_OPT = C.SHUFFLE_OPTIONS !== false;
const WIN_THRESH = C.WIN_THRESHOLD  || 0.75;
const DEL_OK     = C.DELAY_CORRECT  || 900;
const DEL_BAD    = C.DELAY_WRONG    || 1600;
const GAMBLE_ON  = C.GAMBLE_ENABLED !== false;
const G_REWARD   = C.GAMBLE_REWARD  || 2;
const G_PENALTY  = C.GAMBLE_PENALTY || 1;
const DEBUG      = C.DEBUG !== false;

const SCHEMA = C.DEFAULT_SCHEMA || {
    worksheet: {
        title:     ["title","name","worksheetTitle"],
        image:     ["revealImage","revealImageUrl","image","imageUrl","img","picture"],
        questions: ["questions","items","quiz","qs"]
    },
    question: {
        text:    ["qText","question","text","q","prompt","stem","body"],
        options: ["options","choices","answers","opts","alternatives"],
        answer:  ["correctIndex","answerIndex","answer","correct",
                  "correctAnswer","correct_answer","correctOption",
                  "correct_index","ans","solution","key"]
    }
};

/* ── State ──────────────────────────────────────────────── */
let ws = null, qIdx = 0, score = 0, totalQ = 0;
let answered = new Set(), currentFile = "";

/* ── DOM helper ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Utilities ──────────────────────────────────────────── */
function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const delay = ms => new Promise(r => setTimeout(r, ms));
function log(...a) { if (DEBUG) console.log("[MGR]", ...a); }

/* ── Notation converters ────────────────────────────────── */

function stripOuter(s) {
    s = s.trim();
    if (s[0] === "(" && s[s.length - 1] === ")") {
        let d = 0;
        for (let i = 0; i < s.length - 1; i++) {
            if (s[i] === "(") d++;
            if (s[i] === ")") d--;
            if (d === 0) return s;          // inner close → don't strip
        }
        return s.slice(1, -1);
    }
    return s;
}

function convertFractions(t) {
    let out = "", i = 0;
    while (i < t.length) {
        if (t[i] !== "/") { out += t[i]; i++; continue; }

        /* ── numerator (backwards through `out`) ── */
        let j = out.length - 1, numStr = "";
        if (j >= 0 && out[j] === ")") {
            let d = 1; j--;
            while (j >= 0 && d > 0) {
                if (out[j] === ")") d++;
                if (out[j] === "(") d--;
                j--;
            }
            j++;
            numStr = out.slice(j);
        } else {
            while (j >= 0 && /[a-zA-Z0-9.\s]/.test(out[j])) j--;
            j++;
            numStr = out.slice(j);
        }

        /* ── denominator (forwards through `t`) ── */
        let k = i + 1, denStr = "";
        if (k < t.length && t[k] === "(") {
            let d = 1; k++;
            while (k < t.length && d > 0) {
                if (t[k] === "(") d++;
                if (t[k] === ")") d--;
                k++;
            }
            denStr = t.slice(i + 1, k);
        } else {
            while (k < t.length && /[a-zA-Z0-9.\s]/.test(t[k])) k++;
            denStr = t.slice(i + 1, k);
        }

        if (numStr.trim() && denStr.trim()) {
            out = out.slice(0, out.length - numStr.length)
                + `\\frac{${stripOuter(numStr)}}{${stripOuter(denStr)}}`;
            i = k;
        } else {
            out += "/"; i++;
        }
    }
    return out;
}

function convertPowers(t) {
    t = t.replace(/\^-(\d+)/g,        "^{-$1}");     // ^-3  → ^{-3}
    t = t.replace(/\^\(([^)]+)\)/g,   "^{$1}");       // ^(1/3) → ^{1/3}
    t = t.replace(/\^(\d+)([+-])/g,   "^{$1$2}");     // ^2+ → ^{2+}  ^2- → ^{2-}
    t = t.replace(/\^([+-])(?!\d)/g,  "^{$1}");       // ^+ → ^{+}  ^- → ^{-}
    t = t.replace(/\^(\d+)/g,         "^{$1}");       // ^2 → ^{2}
    return t;
}

function convertSubscripts(t) {
    return t.replace(/_(\d+)/g, "_{$1}");              // _2 → _{2}
}

function convertNotation(t) {
    t = convertFractions(t);
    t = t.replace(/sqrt\(([^)]+)\)/g, "\\sqrt{$1}");
    t = convertSubscripts(t);
    t = convertPowers(t);
    return t;
}

/* ── Formatting ─────────────────────────────────────────── */

const UNIT_RE = /\d+(?:\.\d+)?\s*(?:km\/h|m\/s|cm\/s|g\/cm³|kg\/m³|mol\/dm³|g\/dm³|g\/mol|°C|°F|cm²|m²|km²|cm³|m³|dm³|ml|l|cm|mm|m|km|kg|g|mg|Hz|dB|Nm|N|kJ|J|kW|W|kV|V|A|Ω|kPa|Pa|atm|N\/m²)/gi;
const CURRENCY_RE = /\$[\d,.]+/g;

function formatOption(raw) {
    let t = raw.trim(), vault = [];
    t = t.replace(UNIT_RE,     m => { vault.push(m); return `§V${vault.length-1}§`; });
    t = t.replace(CURRENCY_RE, m => { vault.push(m); return `§V${vault.length-1}§`; });
    t = convertNotation(t);
    if (/\\frac|\\sqrt|\^{|\_{|=/.test(t)) t = `\\(${t}\\)`;
    return t.replace(/§V(\d+)§/g, (_, i) => vault[+i]);
}

function formatQuestionText(raw) {
    let t = raw, vault = [];

    /* Phase 1 — stash currency & units */
    t = t.replace(CURRENCY_RE, m => { vault.push(m); return `§V${vault.length-1}§`; });
    t = t.replace(UNIT_RE,     m => { vault.push(m); return `§V${vault.length-1}§`; });

    /* Phase 2 — convert notation */
    t = convertNotation(t);

    /* Phase 3 — wrap expression after colon */
    t = t.replace(/(:\s*)([^:]+?)(?=\s*[.!?]|$)/g, (m, colon, expr) => {
        expr = expr.trim();
        if (/[a-z]/i.test(expr) && /[+\-*/=^_{\\]/.test(expr))
            return colon + `\\(${expr}\\)`;
        return m;
    });

    /* Phase 4 — chemistry formulas  ★ FIXED v7.6 ★
       Now grabs trailing _{n} or ^{charge} after closing ) */
    t = t.replace(
        /((?:[A-Z][a-z]?(?:_{\d+})?|\([^)]+\)(?:_{\d+}|\^\{[^}]+\}|\^[+-])?)+(?:\^\{[^}]+\}|\^[+-])?)/g,
        (m, _off, str) => {
            if (!/_{|\^{/.test(m)) return m;
            const before = str.substring(Math.max(0, _off - 2), _off);
            if (before.endsWith("\\(")) return m;       // already wrapped
            return `\\(${m}\\)`;
        }
    );

    /* Phase 5 — standalone math variables */
    t = t.replace(/(?<![a-zA-Z\\])([xyz])(?![a-zA-Z_{])/g, "\\($1\\)");

    /* Phase 6 — restore vault */
    t = t.replace(/§V(\d+)§/g, (_, i) => vault[+i]);
    return t;
}

/* ── Schema helpers ─────────────────────────────────────── */

function findByKeys(obj, keys) {
    if (!obj || !keys) return undefined;
    for (const k of keys) if (obj[k] !== undefined) return obj[k];
    return undefined;
}

function normaliseWorksheet(raw) {
    const w = SCHEMA.worksheet, q = SCHEMA.question;
    return {
        title:     findByKeys(raw, w.title) || "Untitled",
        image:     findByKeys(raw, w.image) || "",
        randomise: raw.randomise !== false,
        questions: (findByKeys(raw, w.questions) || []).map(qs => ({
            text:    findByKeys(qs, q.text)    || "",
            options: findByKeys(qs, q.options) || [],
            answer:  findByKeys(qs, q.answer)
        }))
    };
}

/* ── GitHub fetch ───────────────────────────────────────── */

function rawUrl(p) {
    return `https://raw.githubusercontent.com/${GH_USER}/${GH_REPO}/${GH_BRANCH}/${p}`;
}
async function fetchJSON(p) {
    const u = rawUrl(p); log("Fetch:", u);
    const r = await fetch(u);
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${u}`);
    return r.json();
}

/* ── Screens ────────────────────────────────────────────── */

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    $(id).classList.add("active");
}

/* ── Launcher ───────────────────────────────────────────── */

async function loadIndex() {
    showScreen("launcher-screen");
    try {
        const list = await fetchJSON(`${Q_PATH}/${INDEX_FILE}`);
        buildLauncher(list);
    } catch (e) {
        log("Index error:", e);
        const el = $("launcher-error");
        if (el) { el.textContent = "Could not load worksheet list."; el.style.display = "block"; }
    }
}

function buildLauncher(list) {
    const c = $("worksheet-list"); c.innerHTML = "";
    list.forEach(item => {
        const d = document.createElement("div");
        d.className = "ws-card";
        d.innerHTML = `<span class="ws-icon">${item.icon||"📝"}</span>
            <div class="ws-info"><h3>${item.title}</h3>
            <p>${item.subject||""} · ${item.topic||""} · ${item.questionCount||"?"} Qs</p></div>`;
        d.onclick = () => launchGame(item.file);
        c.appendChild(d);
    });
}

/* ── Game ───────────────────────────────────────────────── */

async function launchGame(fp) {
    currentFile = fp;
    showScreen("game-screen");
    try {
        ws = normaliseWorksheet(await fetchJSON(`${Q_PATH}/${fp}`));
        if (ws.randomise) shuffle(ws.questions);
        qIdx = 0; score = 0; answered = new Set(); totalQ = ws.questions.length;

        $("worksheet-title").textContent = ws.title;
        const img = $("reveal-image");
        img.src = ws.image ? rawUrl(ws.image) : "";
        img.style.display = "none";

        buildGrid();
        showQuestion();
    } catch (e) {
        log("Launch error:", e);
        alert("Could not load worksheet."); loadIndex();
    }
}

/* ── Grid / Tiles ───────────────────────────────────────── */

function buildGrid() {
    const g = $("grid-overlay"); g.innerHTML = "";
    const cols = 4, rows = 3, n = cols * rows;
    g.style.gridTemplateColumns = `repeat(${cols},1fr)`;
    g.style.gridTemplateRows    = `repeat(${rows},1fr)`;
    for (let i = 0; i < n; i++) {
        const t = document.createElement("div");
        t.className = "tile"; t.dataset.i = i;
        g.appendChild(t);
    }
    $("reveal-image").style.display = "block";
}

const covered  = () => [...document.querySelectorAll(".tile:not(.revealed)")];
const revealed = () => [...document.querySelectorAll(".tile.revealed")];

function removeTile() {
    const c = covered(); if (!c.length) return false;
    c[Math.floor(Math.random() * c.length)].classList.add("revealed");
    return true;
}
function restoreTile() {
    const r = revealed(); if (!r.length) return false;
    r[Math.floor(Math.random() * r.length)].classList.remove("revealed");
    return true;
}

function glitchPeek() {
    const tiles = covered();
    tiles.forEach(t => t.classList.add("glitch"));
    setTimeout(() => tiles.forEach(t => t.classList.remove("glitch")), 800);
}

/* ── Questions ──────────────────────────────────────────── */

function showQuestion() {
    if (qIdx >= totalQ) { showEnd(); return; }
    const q = ws.questions[qIdx];

    $("question-text").innerHTML = formatQuestionText(q.text);

    const order = q.options.map((_, i) => i);
    if (SHUFFLE_OPT) shuffle(order);

    const box = $("options-container"); box.innerHTML = "";
    order.forEach(oi => {
        const b = document.createElement("button");
        b.className = "option-btn";
        b.dataset.oi = oi;
        b.innerHTML = formatOption(q.options[oi]);
        b.onclick = () => handleAnswer(b, oi);
        box.appendChild(b);
    });

    $("progress-tracker").textContent = `Q${qIdx + 1} / ${totalQ}`;

    if (window.MathJax && MathJax.typesetPromise)
        MathJax.typesetPromise([$("question-text"), box]).catch(e => log("MJ:", e));
}

async function handleAnswer(btn, chosen) {
    if (answered.has(qIdx)) return;
    answered.add(qIdx);

    const q = ws.questions[qIdx];
    const ok = chosen === q.answer;

    document.querySelectorAll(".option-btn").forEach(b => {
        b.disabled = true;
        if (+b.dataset.oi === q.answer) b.classList.add("correct");
    });

    if (ok) {
        btn.classList.add("correct");
        score++;
        removeTile();
        await delay(DEL_OK);
    } else {
        btn.classList.add("wrong");
        glitchPeek();
        await delay(DEL_BAD);
        if (GAMBLE_ON && covered().length > 0 && revealed().length >= G_PENALTY)
            await showGamble();
    }

    qIdx++;
    showQuestion();
}

/* ── Gamble ─────────────────────────────────────────────── */

function showGamble() {
    return new Promise(resolve => {
        const slot = $("gamble-slot");
        slot.innerHTML = `<p>🎲 Gamble? Risk ${G_PENALTY} tile(s) for a chance to gain ${G_REWARD}!</p>
            <button id="gamble-yes">Yes!</button> <button id="gamble-no">No</button>`;
        slot.style.display = "block";

        $("gamble-yes").onclick = () => {
            slot.style.display = "none";
            const win = Math.random() < 0.5;
            if (win) {
                for (let i = 0; i < G_REWARD; i++) removeTile();
                showToast(`🎉 Won ${G_REWARD} tiles!`);
            } else {
                for (let i = 0; i < G_PENALTY; i++) restoreTile();
                showToast(`😬 Lost ${G_PENALTY} tile(s)!`);
            }
            resolve();
        };
        $("gamble-no").onclick = () => { slot.style.display = "none"; resolve(); };
    });
}

function showToast(msg) {
    const t = $("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
}

/* ── End screen ─────────────────────────────────────────── */

function showEnd() {
    const pct = score / totalQ;
    const won = pct >= WIN_THRESH;

    $("end-overlay").classList.add("active");
    $("end-title").textContent   = won ? "🎉 Amazing!" : "😅 Not quite!";
    $("end-message").textContent = `You scored ${score}/${totalQ} (${Math.round(pct*100)}%). `
        + (won ? "Image unlocked!" : `Need ${Math.round(WIN_THRESH*100)}% to unlock. Try again!`);

    if (won) cascadeReveal();

    $("retry-btn").onclick     = retryGame;
    $("end-back-btn").onclick  = () => { $("end-overlay").classList.remove("active"); loadIndex(); };
}

async function cascadeReveal() {
    for (const t of covered()) { t.classList.add("revealed"); await delay(150); }
}

/* ── Retry ──────────────────────────────────────────────── */

function retryGame() {
    sessionStorage.setItem("mgr_retry", currentFile);
    location.reload();
}

/* ── Init ───────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
    const retry = sessionStorage.getItem("mgr_retry");
    if (retry) { sessionStorage.removeItem("mgr_retry"); launchGame(retry); }
    else loadIndex();

    const bb = $("back-btn");
    if (bb) bb.onclick = () => { if (confirm("Leave? Progress will be lost.")) loadIndex(); };
});

})();
