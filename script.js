/* ═══════════════════════════════════════════════════════
   Mystery Grid Reveal — Game Engine v7.2
   Robust fraction parser · Fixed gamble · Fixed CSS
   ═══════════════════════════════════════════════════════ */

const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

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
   MATH PIPELINE
   ══════════════════════════════════════════════ */

/**
 * Convert plain-text fractions and powers to LaTeX.
 * Uses ordered regex passes from most-specific to least-specific
 * so nested parens like 5/(2(x-3)) and (7p+5)/((p+3)(p-1)) work.
 */
function convertNotation(t) {
    if (!t) return t;

    // 1  n/(nested)  e.g. 5/(2(x - 3))  or  5/(2(x - 3)^2)  or  9/(6y^2)
    t = t.replace(
        /(\d+)\s*\/\s*(\([^()]*(?:\([^()]*\)[^()]*)*\))/g,
        '\\frac{$1}{$2}'
    );

    // 2  (nested)/(nested)  e.g. (7p + 5)/((p + 3)(p - 1))
    t = t.replace(
        /(\([^()]*(?:\([^()]*\)[^()]*)*\))\s*\/\s*(\([^()]*(?:\([^()]*\)[^()]*)*\))/g,
        '\\frac{$1}{$2}'
    );

    // 3  (expr)/n  e.g. (3x - 2)/4   or  (17x + 14)/12
    t = t.replace(
        /(\([^()]+\))\s*\/\s*(\d+[a-z]?(?:\^\{?\d+\}?)?)/gi,
        '\\frac{$1}{$2}'
    );

    // 4  n/(simple)  e.g. 7/(3y)  or  4/(p + 3)
    t = t.replace(
        /(\d+)\s*\/\s*(\([^()]+\))/g,
        '\\frac{$1}{$2}'
    );

    // 5  n/var  e.g. 2/y
    t = t.replace(
        /(\d+)\s*\/\s*([a-z](?:\^\d+)?)/gi,
        '\\frac{$1}{$2}'
    );

    // 6  var/n  e.g. x/3
    t = t.replace(
        /([a-z])\s*\/\s*(\d+)/gi,
        '\\frac{$1}{$2}'
    );

    // 7  n/n  e.g. 7/12
    t = t.replace(
        /(\d+)\s*\/\s*(\d+)/g,
        '\\frac{$1}{$2}'
   
