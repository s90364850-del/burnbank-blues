// Data Management
class MatchManager {
    constructor() {
        this.retentionDays = this.loadRetentionDays();
        this.matches = this.loadMatches();
        this.pruneExpired();
    }

    storageKey() {
        return 'burnbankMatches';
    }

    retentionKey() {
        return 'burnbankRetention';
    }

    loadMatches() {
        const stored = localStorage.getItem(this.storageKey());
        return stored ? JSON.parse(stored) : [];
    }

    saveMatches() {
        localStorage.setItem(this.storageKey(), JSON.stringify(this.matches));
    }

    addMatch(match) {
        if (!match.id) {
            match.id = Date.now();
            this.matches.push(match);
        } else {
            this.matches = this.matches.map(m => m.id === match.id ? match : m);
        }
        this.saveMatches();
    }

    deleteMatch(id) {
        this.matches = this.matches.filter(m => m.id !== id);
        this.saveMatches();
    }

    getAllMatches() {
        return [...this.matches].sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    getTopScorers() {
        const scorers = {};
        this.matches.forEach(match => {
            match.goalscorers.forEach(scorer => {
                const name = scorer.name.trim();
                if (!name) return;
                scorers[name] = (scorers[name] || 0) + scorer.goals;
            });
        });

        return Object.entries(scorers)
            .map(([name, goals]) => ({ name, goals }))
            .sort((a, b) => b.goals - a.goals);
    }

    clearAll() {
        this.matches = [];
        this.saveMatches();
    }

    loadRetentionDays() {
        const stored = localStorage.getItem(this.retentionKey());
        return stored ? Number(stored) : 365;
    }

    saveRetentionDays(days) {
        this.retentionDays = days;
        localStorage.setItem(this.retentionKey(), String(days));
    }

    pruneExpired() {
        if (!this.retentionDays) return;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.retentionDays);
        this.matches = this.matches.filter(match => new Date(match.date) >= cutoff);
        this.saveMatches();
    }
}

const DEFAULT_USERS = ['stephen', 'alan', 'alison', 'stacey'];
function getAllUsers() {
    const stored = localStorage.getItem('burnbankUsers');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        } catch {
            // ignore invalid value
        }
    }
    localStorage.setItem('burnbankUsers', JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
}

function saveUsers(users) {
    if (!Array.isArray(users)) return;
    localStorage.setItem('burnbankUsers', JSON.stringify(users));
}

let activeUser = '';
let manager = new MatchManager();
let currentPage = 1;

const userSelect = document.getElementById('userSelect');
const newUserNameInput = document.getElementById('newUserName');
const addUserBtn = document.getElementById('addUser');
const retentionDaysInput = document.getElementById('retentionDays');
const applyRetentionBtn = document.getElementById('applyRetention');
const totalMatchesEl = document.getElementById('totalMatches');
const winCountEl = document.getElementById('winCount');
const drawCountEl = document.getElementById('drawCount');
const lossCountEl = document.getElementById('lossCount');
const goalsForEl = document.getElementById('goalsFor');
const goalsAgainstEl = document.getElementById('goalsAgainst');
const goalDiffEl = document.getElementById('goalDiff');
const filterOpponentEl = document.getElementById('filterOpponent');
const filterOutcomeEl = document.getElementById('filterOutcome');
const filterFromDateEl = document.getElementById('filterFromDate');
const filterToDateEl = document.getElementById('filterToDate');
const pageSizeEl = document.getElementById('pageSize');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfoEl = document.getElementById('pageInfo');
const matchForm = document.getElementById('matchForm');
const topScorersDiv = document.getElementById('topScorers');
const matchHistoryDiv = document.getElementById('matchHistory');
const clearDataBtn = document.getElementById('clearData');
const matchDateInput = document.getElementById('matchDate');
const goalscorersRowsDiv = document.getElementById('goalscorersRows');
const addGoalscorerBtn = document.getElementById('addGoalscorer');
const submitMatchBtn = document.getElementById('submitMatch');
const cancelEditBtn = document.getElementById('cancelEdit');
const editingIdInput = document.getElementById('editingId');
const playerProfileDiv = document.getElementById('playerProfile');
const exportDataBtn = document.getElementById('exportData');
const importFileInput = document.getElementById('importFile');
const triggerImportBtn = document.getElementById('triggerImport');

function initUserSelect() {
    const users = getAllUsers().slice(0, 4);
    userSelect.innerHTML = users.map(user => `<option value="${user}">${user}</option>`).join('');

    activeUser = localStorage.getItem('burnbankActiveUser') || users[0];
    if (!users.includes(activeUser)) activeUser = users[0];
    userSelect.value = activeUser;
    localStorage.setItem('burnbankActiveUser', activeUser);

    manager = new MatchManager();
    retentionDaysInput.value = manager.retentionDays;
    currentPage = 1;
    clearEditState();
    render();
}

function addGoalscorerRow(name = '', goals = '') {
    const row = document.createElement('div');
    row.className = 'goalscorer-row';
    row.innerHTML = `
        <div class="form-row" style="grid-template-columns: 2fr 1fr auto; gap: 8px;">
            <input type="text" class="goalscorer-name" placeholder="Player name" value="${name}">
            <input type="number" class="goalscorer-goals" placeholder="Goals" min="0" value="${goals}">
            <button type="button" class="btn btn-delete remove-scorer">?</button>
        </div>
    `;

    row.querySelector('.remove-scorer').addEventListener('click', () => row.remove());
    goalscorersRowsDiv.appendChild(row);
}

function getGoalscorersData() {
    const rows = [...goalscorersRowsDiv.querySelectorAll('.goalscorer-row')];
    const scorers = rows.map(row => {
        const name = row.querySelector('.goalscorer-name').value.trim();
        const goals = Number(row.querySelector('.goalscorer-goals').value);
        return { name, goals: isNaN(goals) ? 0 : goals };
    }).filter(s => s.name && s.goals > 0);

    const aggregate = {};
    scorers.forEach(s => {
        aggregate[s.name] = (aggregate[s.name] || 0) + s.goals;
    });

    return Object.entries(aggregate).map(([name, goals]) => ({ name, goals }));
}

function setGoalscorersData(goalscorers) {
    goalscorersRowsDiv.innerHTML = '';
    if (!goalscorers.length) {
        addGoalscorerRow();
        return;
    }
    goalscorers.forEach(g => addGoalscorerRow(g.name, g.goals));
}

function clearForm() {
    matchForm.reset();
    matchDateInput.valueAsDate = new Date();
    setGoalscorersData([]);
    editingIdInput.value = '';
    submitMatchBtn.textContent = 'Add Match';
    cancelEditBtn.style.display = 'none';
}

function clearEditState() {
    clearForm();
}

function loadForm(match) {
    document.getElementById('opponent').value = match.opponent;
    document.getElementById('burnbankScore').value = match.burnbankScore;
    document.getElementById('opponentScore').value = match.opponentScore;
    document.getElementById('matchDate').value = match.date;
    setGoalscorersData(match.goalscorers);
    editingIdInput.value = match.id;
    submitMatchBtn.textContent = 'Save Match';
    cancelEditBtn.style.display = 'inline-block';
}

function isDateDuplicate(date, editingId) {
    return manager.matches.some(m => m.date === date && String(m.id) !== String(editingId));
}

function handleAddOrUpdateMatch(e) {
    e.preventDefault();

    const opponent = document.getElementById('opponent').value.trim();
    const burnbankScore = Number(document.getElementById('burnbankScore').value);
    const opponentScore = Number(document.getElementById('opponentScore').value);
    const matchDate = document.getElementById('matchDate').value;
    const goalscorers = getGoalscorersData();

    if (!opponent) {
        alert('Please enter opponent team name.');
        return;
    }

    if (!matchDate) {
        alert('Please select a match date.');
        return;
    }

    const totalGoals = goalscorers.reduce((sum, s) => sum + s.goals, 0);
    if (totalGoals !== burnbankScore) {
        alert(`Total goals from scorers (${totalGoals}) must match Burnbank score (${burnbankScore}).`);
        return;
    }

    const editingId = editingIdInput.value;
    if (isDateDuplicate(matchDate, editingId)) {
        alert('A match on this date already exists. The team cannot play two matches on the same day.');
        return;
    }

    const match = {
        opponent,
        burnbankScore,
        opponentScore,
        date: matchDate,
        goalscorers,
        createdBy: editingId ? manager.matches.find(m => String(m.id) === String(editingId))?.createdBy || activeUser : activeUser,
        updatedBy: activeUser,
        updatedAt: new Date().toISOString()
    };

    if (editingId) {
        match.id = Number(editingId);
    }

    manager.addMatch(match);
    clearForm();
    render();
    alert(editingId ? 'Match updated successfully!' : 'Match added successfully!');
}

function handleClearData() {
    if (confirm('Delete all shared match records? This cannot be undone.')) {
        manager.clearAll();
        render();
        alert('All shared data cleared.');
    }
}

function handleDeleteMatch(id) {
    if (confirm('Delete this match record?')) {
        manager.deleteMatch(id);
        render();
    }
}

function handleEditMatch(id) {
    const match = manager.getAllMatches().find(m => m.id === id);
    if (!match) return;
    loadForm(match);
}

function handleExportData() {
    const data = {
        shared: true,
        matches: manager.getAllMatches(),
        retentionDays: manager.retentionDays,
        updatedBy: activeUser,
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `burnbank_export_${activeUser}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function handleImportData(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported.matches || !Array.isArray(imported.matches)) {
                throw new Error('Invalid import format');
            }

            const incoming = imported.matches.map(m => ({ ...m, id: m.id || Date.now() + Math.random() }));
            const merged = [...manager.matches, ...incoming].reduce((acc, match) => {
                acc[String(match.id)] = match;
                return acc;
            }, {});
            manager.matches = Object.values(merged);
            if (imported.retentionDays) {
                manager.saveRetentionDays(Number(imported.retentionDays));
                retentionDaysInput.value = manager.retentionDays;
            }
            manager.pruneExpired();
            manager.saveMatches();
            render();
            alert('Imported ' + imported.matches.length + ' matches.');
        } catch (err) {
            alert('Failed to import file. Ensure JSON format is correct.');
            console.error(err);
        }
    };
    reader.readAsText(file);
}

function applyRetentionPolicy() {
    const days = Number(retentionDaysInput.value);
    if (!Number.isInteger(days) || days < 30 || days > 3650) {
        alert('Retention must be between 30 and 3650 days.');
        return;
    }
    manager.saveRetentionDays(days);
    manager.pruneExpired();
    render();
    alert(`Retention policy set to ${days} days.`);
}

function filterMatches(matches) {
    let filtered = [...matches];

    const opponentFilter = filterOpponentEl.value.trim().toLowerCase();
    if (opponentFilter) {
        filtered = filtered.filter(m => m.opponent.toLowerCase().includes(opponentFilter));
    }

    const outcome = filterOutcomeEl.value;
    if (outcome !== 'all') {
        filtered = filtered.filter(m => {
            const win = m.burnbankScore > m.opponentScore;
            const draw = m.burnbankScore === m.opponentScore;
            const loss = m.burnbankScore < m.opponentScore;
            return (outcome === 'win' && win) || (outcome === 'draw' && draw) || (outcome === 'loss' && loss);
        });
    }

    const from = filterFromDateEl.value ? new Date(filterFromDateEl.value) : null;
    const to = filterToDateEl.value ? new Date(filterToDateEl.value) : null;
    if (from) filtered = filtered.filter(m => new Date(m.date) >= from);
    if (to) filtered = filtered.filter(m => new Date(m.date) <= to);

    return filtered;
}

function getPagedMatches(matches) {
    const pageSize = Number(pageSizeEl.value);
    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * pageSize;
    pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;
    return matches.slice(start, start + pageSize);
}

function renderStats(matches) {
    const total = matches.length;
    let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;

    matches.forEach(m => {
        gf += m.burnbankScore;
        ga += m.opponentScore;
        if (m.burnbankScore > m.opponentScore) wins++;
        else if (m.burnbankScore < m.opponentScore) losses++;
        else draws++;
    });

    totalMatchesEl.textContent = total;
    winCountEl.textContent = wins;
    drawCountEl.textContent = draws;
    lossCountEl.textContent = losses;
    goalsForEl.textContent = gf;
    goalsAgainstEl.textContent = ga;
    goalDiffEl.textContent = gf - ga;
}

function renderTopScorers() {
    const topScorers = manager.getTopScorers();
    if (!topScorers.length) {
        topScorersDiv.innerHTML = '<p class="empty-state">No matches recorded yet</p>';
        playerProfileDiv.innerHTML = '';
        return;
    }

    topScorersDiv.innerHTML = topScorers.map((scorer, index) => `
        <div class="scorer-row" data-scorer-name="${scorer.name}">
            <div class="scorer-name">${index + 1}. ${scorer.name}</div>
            <div class="scorer-goals">${scorer.goals}</div>
        </div>
    `).join('');

    topScorersDiv.querySelectorAll('.scorer-row').forEach(row => {
        row.addEventListener('click', () => showPlayerProfile(row.dataset.scorerName));
    });

    playerProfileDiv.innerHTML = '<p>Click a scorer for profile details.</p>';
}

function showPlayerProfile(name) {
    const stats = manager.getTopScorers().find(s => s.name === name);
    if (!stats) return;
    const appearances = manager.matches.filter(match => match.goalscorers.some(s => s.name === name)).length;
    playerProfileDiv.innerHTML = `
        <h3>${name}</h3>
        <p><strong>Total Goals:</strong> ${stats.goals}</p>
        <p><strong>Match Appearances:</strong> ${appearances}</p>
        <p><strong>Average Goals/Match:</strong> ${(stats.goals / appearances).toFixed(2)}</p>
    `;
}

function renderMatchHistory() {
    const allMatches = manager.getAllMatches();
    const filtered = filterMatches(allMatches);
    renderStats(filtered);
    const pageMatches = getPagedMatches(filtered);

    if (!pageMatches.length) {
        matchHistoryDiv.innerHTML = '<p class="empty-state">No matches recorded yet</p>';
        return;
    }

    matchHistoryDiv.innerHTML = pageMatches.map(match => {
        const result = match.burnbankScore > match.opponentScore ? 'win' : match.burnbankScore < match.opponentScore ? 'loss' : 'draw';
        const resultClass = `burnbank-${result}`;
        const scorersText = match.goalscorers.length ? match.goalscorers.map(s => `${s.name}: ${s.goals}`).join(', ') : 'No scorers recorded';

        return `
            <div class="match-card">
                <div class="match-header">
                    <div class="match-score">
                        Burnbank Blues <span class="${resultClass}">${match.burnbankScore}</span> - <span>${match.opponentScore}</span> ${match.opponent}
                    </div>
                    <div class="match-date">${new Date(match.date).toLocaleDateString()}</div>
                </div>
                <div class="match-goalscorers">
                    <strong>Goalscorers:</strong> ${scorersText}
                </div>
                <div class="match-goalscorers">
                    <strong>Recorded By:</strong> ${match.createdBy || 'unknown'}
                </div>
                <div class="match-actions">
                    <button type="button" onclick="handleEditMatch(${match.id})" class="btn btn-secondary">Edit</button>
                    <button type="button" onclick="handleDeleteMatch(${match.id})" class="btn btn-delete">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function render() {
    renderTopScorers();
    renderMatchHistory();
}

matchForm.addEventListener('submit', handleAddOrUpdateMatch);
addGoalscorerBtn.addEventListener('click', () => addGoalscorerRow());
cancelEditBtn.addEventListener('click', clearEditState);
clearDataBtn.addEventListener('click', handleClearData);
applyRetentionBtn.addEventListener('click', applyRetentionPolicy);
filterOpponentEl.addEventListener('input', () => { currentPage = 1; render(); });
filterOutcomeEl.addEventListener('change', () => { currentPage = 1; render(); });
filterFromDateEl.addEventListener('change', () => { currentPage = 1; render(); });
filterToDateEl.addEventListener('change', () => { currentPage = 1; render(); });
pageSizeEl.addEventListener('change', () => { currentPage = 1; render(); });
prevPageBtn.addEventListener('click', () => { currentPage--; render(); });
nextPageBtn.addEventListener('click', () => { currentPage++; render(); });
userSelect.addEventListener('change', e => {
    activeUser = e.target.value;
    localStorage.setItem('burnbankActiveUser', activeUser);
});
addUserBtn.addEventListener('click', () => {
    const newName = newUserNameInput.value.trim();
    if (!newName) { alert('Enter a username'); return; }
    const users = getAllUsers();
    if (users.includes(newName)) { alert('User already exists'); return; }
    if (users.length >= 4) { alert('Maximum 4 users allowed'); return; }
    users.push(newName);
    saveUsers(users);
    initUserSelect();
    newUserNameInput.value = '';
});
exportDataBtn.addEventListener('click', handleExportData);
triggerImportBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleImportData(file);
    e.target.value = '';
});

matchDateInput.valueAsDate = new Date();
setGoalscorersData([]);
initUserSelect();
render();
