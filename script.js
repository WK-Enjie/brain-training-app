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
