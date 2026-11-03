/* ============================================================
   MYSTERY GRID REVEAL — script.js v7.6.3
   All fixes: Q_PATH, chemistry parens, cursive text, image
   ============================================================ */
(() => {
"use strict";

const C = window.CONFIG || {};
const GH_USER     = C.GITHUB_USER    || "WK-Enjie";
const GH_REPO     = C.GITHUB_REPO    || "brain-training-app";
const GH_BRANCH   = C.GITHUB_BRANCH  || "main";
const Q_PATH      = C.QUESTIONS_PATH || "Questions";
const INDEX_FILE  = C.INDEX_FILE     || "index.json";
const SHUFFLE_OPT = C.SHUFFLE_OPTIONS !== false;
const WIN_THRESH  = C.WIN_THRESHOLD  || 0.75;
const DEL_OK      = C.DELAY_CORRECT  || 900;
const DEL_BAD     = C.DELAY_WRONG    || 1600;
const GAMBLE_ON   = C.GAMBLE_ENABLED !== false;
const G_REWARD    = C.GAMBLE_REWARD  || 2;
const G_PENALTY   = C.GAMBLE_PENALTY || 1;
const DEBUG       = C.DEBUG !== false;

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

let ws = null, qIdx = 0, score = 0, totalQ = 0;
let answered = new Set(), currentFile = "";

const $ = id => document.getElementById(id);

function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
const delay = ms => new Promise(r => setTimeout(r, ms));
function log(...a) { if (DEBUG) console.log("[MGR]", ...a); }

/* ── Notation ───────────────────────────────────────────── */

function stripOuter(s) {
    s = s.trim();
    if (s[0] === "(" && s[s.length - 1] === ")") {
        let d = 0;
        for (let i = 0; i < s.length - 1; i++) {
            if (s[i] === "(") d++;
            if (s[i] === ")") d--;
            if (d === 0) return s;
        }
        return s.slice(1, -1);
    }
    return s;
}

function convertFractions(t) {
    let out = "", i = 0;
    while (i < t.length) {
        if (t[i] !== "/") { out += t[i]; i++; continue; }
        let j = out.length - 1, numStr = "";
        if (j >= 0 && out[j] === ")") {
            let d = 1; j--;
            while (j >= 0 && d > 0) {
                if (out[j] === ")") d++;
                if (out[j] === "(") d--;
                j--;
            }
            j++; numStr = out.slice(j);
        } else {
            while (j >= 0 && /[a-zA-Z0-9.\s]/.test(out[j])) j--;
            j++; numStr = out.slice(j);
        }
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
                + "\\frac{" + stripOuter(numStr) + "}{" + stripOuter(denStr) + "}";
            i = k;
        } else { out += "/"; i++; }
    }
    return out;
}

function convertPowers(t) {
    t = t.replace(/\^-(\d+)/g,       "^{-$1}");
    t = t.replace(/\^\(([^)]+)\)/g,  "^{$1}");
    t = t.replace(/\^(\d+)([+-])/g,  "^{$1$2}");
    t = t.replace(/\^([+-])(?!\d)/g, "^{$1}");
    t = t.replace(/\^(\d+)/g,        "^{$1}");
    return t;
}

function convertSubscripts(t) {
    return t.replace(/_(\d+)/g, "_{$1}");
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

const CHEM_RE = /((?:[A-Z][a-z]?(?:_{\d+})?|\([A-Z][^)]*\)(?:_{\d+}|\^\{[^}]+\}|\^[+-])?)+(?:\^\{[^}]+\}|\^[+-])?)/g;

function formatOption(raw) {
    let t = raw.trim(), vault = [];
    t = t.replace(UNIT_RE,     m => { vault.push(m); return "\u00A7V" + (vault.length - 1) + "\u00A7"; });
    t = t.replace(CURRENCY_RE, m => { vault.push(m); return "\u00A7V" + (vault.length - 1) + "\u00A7"; });
    t = convertNotation(t);
    if (/\\frac|\\sqrt|\^{|\_{|=/.test(t)) {
        var cleaned = t.replace(/[A-Z][a-z]?/g, " ");
        var hasWords = /\b[a-z]{3,}\b/i.test(cleaned);
        if (hasWords) {
            t = t.replace(CHEM_RE, function(m) {
                return /_{|\^{/.test(m) ? "\\(" + m + "\\)" : m;
            });
        } else {
            t = "\\(" + t + "\\)";
        }
    }
    return t.replace(/\u00A7V(\d+)\u00A7/g, function(_, i) { return vault[+i]; });
}

function formatQuestionText(raw) {
    let t = raw, vault = [];
    t = t.replace(CURRENCY_RE, m => { vault.push(m); return "\u00A7V" + (vault.length - 1) + "\u00A7"; });
    t = t.replace(UNIT_RE,     m => { vault.push(m); return "\u00A7V" + (vault.length - 1) + "\u00A7"; });
    t = convertNotation(t);
    t = t.replace(/(:\s*)([^:]+?)(?=\s*[.!?]|$)/g, function(m, colon, expr) {
        expr = expr.trim();
        if (!(/[a-z]/i.test(expr) && /[+\-*/=^_{\\]/.test(expr))) return m;
        if (/,/.test(expr)) return m;
        var words = expr.replace(/[A-Z][a-z]?/g, " ")
            .replace(/[_^{}\\()\d,.\s+\-*/=]/g, " ")
            .trim().split(/\s+/).filter(function(w) { return w.length >= 2; });
        if (words.length > 1) return m;
        return colon + "\\(" + expr + "\\)";
    });
    t = t.replace(CHEM_RE, function(m, offset, str) {
        if (!/_{|\^{/.test(m)) return m;
        var before = str.substring(Math.max(0, offset - 2), offset);
        if (before.endsWith("\\(")) return m;
        return "\\(" + m + "\\)";
    });
    t = t.replace(/(?<![a-zA-Z\\])([xyz])(?![a-zA-Z_{])/g, "\\($1\\)");
    t = t.replace(/\u00A7V(\d+)\u00A7/g, function(_, i) { return vault[+i]; });
    return t;
}

/* ── Schema ─────────────────────────────────────────────── */

function findByKeys(obj, keys) {
    if (!obj || !keys) return undefined;
    for (var i = 0; i < keys.length; i++) {
        if (obj[keys[i]] !== undefined) return obj[keys[i]];
    }
    return undefined;
}

function normaliseWorksheet(raw) {
    var w = SCHEMA.worksheet, q = SCHEMA.question;
    return {
        title:     findByKeys(raw, w.title) || "Untitled",
        image:     findByKeys(raw, w.image) || "",
        randomise: raw.randomise !== false,
        questions: (findByKeys(raw, w.questions) || []).map(function(qs) {
            return {
                text:    findByKeys(qs, q.text)    || "",
                options: findByKeys(qs, q.options) || [],
                answer:  findByKeys(qs, q.answer)
            };
        })
    };
}

/* ── Fetch ──────────────────────────────────────────────── */

function rawUrl(p) {
    return "https://raw.githubusercontent.com/" + GH_USER + "/" + GH_REPO + "/" + GH_BRANCH + "/" + p;
}

async function fetchJSON(p) {
    var u = rawUrl(p);
    log("Fetch:", u);
    var r = await fetch(u);
    if (!r.ok) throw new Error("HTTP " + r.status + ": " + u);
    return r.json();
}

/* ── Screens ────────────────────────────────────────────── */

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function(s) { s.classList.remove("active"); });
    $(id).classList.add("active");
}

/* ── Launcher ───────────────────────────────────────────── */

async function loadIndex() {
    showScreen("launcher-screen");
    try {
        var list = await fetchJSON(Q_PATH + "/" + INDEX_FILE);
        buildLauncher(list);
    } catch (e) {
        log("Index error:", e);
        var el = $("launcher-error");
        if (el) { el.textContent = "Could not load worksheet list."; el.style.display = "block"; }
    }
}

function buildLauncher(list) {
    var c = $("worksheet-list");
    c.innerHTML = "";
    list.forEach(function(item) {
        var d = document.createElement("div");
        d.className = "ws-card";
        d.innerHTML = '<span class="ws-icon">' + (item.icon || "\uD83D\uDCDD") + '</span>'
            + '<div class="ws-info"><h3>' + item.title + '</h3>'
            + '<p>' + (item.subject || "") + ' \u00B7 ' + (item.topic || "") + ' \u00B7 ' + (item.questionCount || "?") + ' Qs</p></div>';
        d.onclick = function() { launchGame(item.file); };
        c.appendChild(d);
    });
}

/* ── Game ───────────────────────────────────────────────── */

async function launchGame(fp) {
    currentFile = fp;
    showScreen("game-screen");
    try {
        var data = await fetchJSON(Q_PATH + "/" + fp);
        ws = normaliseWorksheet(data);
        if (ws.randomise) shuffle(ws.questions);
        qIdx = 0;
        score = 0;
        answered = new Set();
        totalQ = ws.questions.length;

        $("worksheet-title").textContent = ws.title;

        var img = $("reveal-image");
        var imgUrl = ws.image
            ? (ws.image.indexOf("http") === 0 ? ws.image : rawUrl(ws.image))
            : "";
        img.src = imgUrl;
        img.style.display = "none";

        buildGrid();
        showQuestion();
    } catch (e) {
        log("Launch error:", e);
        alert("Could not load worksheet.");
        loadIndex();
    }
}

/* ── Grid ───────────────────────────────────────────────── */

function buildGrid() {
    var g = $("grid-overlay");
    g.innerHTML = "";
    var cols = 4, rows = 3, n = cols * rows;
    g.style.gridTemplateColumns = "repeat(" + cols + ",1fr)";
    g.style.gridTemplateRows    = "repeat(" + rows + ",1fr)";
    for (var i = 0; i < n; i++) {
        var t = document.createElement("div");
        t.className = "tile";
        t.dataset.i = i;
        g.appendChild(t);
    }
    $("reveal-image").style.display = "block";
}

function covered()  { return Array.from(document.querySelectorAll(".tile:not(.revealed)")); }
function revealed() { return Array.from(document.querySelectorAll(".tile.revealed")); }

function removeTile() {
    var c = covered();
    if (!c.length) return false;
    c[Math.floor(Math.random() * c.length)].classList.add("revealed");
    return true;
}

function restoreTile() {
    var r = revealed();
    if (!r.length) return false;
    r[Math.floor(Math.random() * r.length)].classList.remove("revealed");
    return true;
}

function glitchPeek() {
    var tiles = covered();
    tiles.forEach(function(t) { t.classList.add("glitch"); });
    setTimeout(function() {
        tiles.forEach(function(t) { t.classList.remove("glitch"); });
    }, 800);
}

/* ── Questions ──────────────────────────────────────────── */

function showQuestion() {
    if (qIdx >= totalQ) { showEnd(); return; }
    var q = ws.questions[qIdx];
    $("question-text").innerHTML = formatQuestionText(q.text);

    var order = q.options.map(function(_, i) { return i; });
    if (SHUFFLE_OPT) shuffle(order);

    var box = $("options-container");
    box.innerHTML = "";
    order.forEach(function(oi) {
        var b = document.createElement("button");
        b.className = "option-btn";
        b.dataset.oi = oi;
        b.innerHTML = formatOption(q.options[oi]);
        b.onclick = function() { handleAnswer(b, oi); };
        box.appendChild(b);
    });

    $("progress-tracker").textContent = "Q" + (qIdx + 1) + " / " + totalQ;

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([$("question-text"), box]).catch(function(e) { log("MJ:", e); });
    }
}

async function handleAnswer(btn, chosen) {
    if (answered.has(qIdx)) return;
    answered.add(qIdx);
    var q = ws.questions[qIdx];
    var ok = chosen === q.answer;

    document.querySelectorAll(".option-btn").forEach(function(b) {
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
        if (GAMBLE_ON && covered().length > 0 && revealed().length >= G_PENALTY) {
            await showGamble();
        }
    }
    qIdx++;
    showQuestion();
}

/* ── Gamble ─────────────────────────────────────────────── */

function showGamble() {
    return new Promise(function(resolve) {
        var slot = $("gamble-slot");
        slot.innerHTML = '<p>\uD83C\uDFB2 Gamble? Risk ' + G_PENALTY + ' tile(s) for a chance to gain ' + G_REWARD + '!</p>'
            + '<button id="gamble-yes">Yes!</button> <button id="gamble-no">No</button>';
        slot.style.display = "block";
        $("gamble-yes").onclick = function() {
            slot.style.display = "none";
            var win = Math.random() < 0.5;
            if (win) {
                for (var i = 0; i < G_REWARD; i++) removeTile();
                showToast("\uD83C\uDF89 Won " + G_REWARD + " tiles!");
            } else {
                for (var j = 0; j < G_PENALTY; j++) restoreTile();
                showToast("\uD83D\uDE2C Lost " + G_PENALTY + " tile(s)!");
            }
            resolve();
        };
        $("gamble-no").onclick = function() { slot.style.display = "none"; resolve(); };
    });
}

function showToast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function() { t.classList.remove("show"); }, 2000);
}

/* ── End ────────────────────────────────────────────────── */

function showEnd() {
    var pct = score / totalQ;
    var won = pct >= WIN_THRESH;
    $("end-overlay").classList.add("active");
    $("end-title").textContent = won ? "\uD83C\uDF89 Amazing!" : "\uD83D\uDE05 Not quite!";
    $("end-message").textContent = "You scored " + score + "/" + totalQ + " (" + Math.round(pct * 100) + "%). "
        + (won ? "Image unlocked!" : "Need " + Math.round(WIN_THRESH * 100) + "% to unlock. Try again!");
    if (won) cascadeReveal();
    $("retry-btn").onclick = retryGame;
    $("end-back-btn").onclick = function() {
        $("end-overlay").classList.remove("active");
        loadIndex();
    };
}

async function cascadeReveal() {
    var tiles = covered();
    for (var i = 0; i < tiles.length; i++) {
        tiles[i].classList.add("revealed");
        await delay(150);
    }
}

/* ── Retry ──────────────────────────────────────────────── */

function retryGame() {
    sessionStorage.setItem("mgr_retry", currentFile);
    location.reload();
}

/* ── Init ───────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", function() {
    var retry = sessionStorage.getItem("mgr_retry");
    if (retry) { sessionStorage.removeItem("mgr_retry"); launchGame(retry); }
    else loadIndex();
    var bb = $("back-btn");
    if (bb) bb.onclick = function() {
        if (confirm("Leave? Progress will be lost.")) loadIndex();
    };
});

})();
