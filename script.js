// Data Management
class MatchManager {
    constructor() {
        this.retentionDays = 365; // Fixed retention
        this.matches = this.loadMatches();
        this.pruneExpired();
    }

    storageKey() {
        return 'burnbankMatches';
    }

    loadMatches() {
        const stored = localStorage.getItem(this.storageKey());
        return stored ? JSON.parse(stored) : [];
    }

    saveMatches(skipCloudSync = false) {
        localStorage.setItem(this.storageKey(), JSON.stringify(this.matches));
        if (!skipCloudSync) {
            syncToFirebase().catch(err => {
                console.error('Failed to sync to Firebase after local save', err);
            });
        }
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

    pruneExpired() {
        if (!this.retentionDays) return;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - this.retentionDays);
        this.matches = this.matches.filter(match => new Date(match.date) >= cutoff);
        this.saveMatches();
    }
}

// Firebase shared storage (Cloud Firestore) configuration.
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCbpci4OzPDH4KQzRfHn1WkYAlGrdqaUH4",
    authDomain: "burnbank-blues-2d2b8.firebaseapp.com",
    projectId: "burnbank-blues-2d2b8",
    storageBucket: "burnbank-blues-2d2b8.firebasestorage.app",
    messagingSenderId: "755981614427",
    appId: "1:755981614427:web:f832b415c58b4229096e7e"
};

let firebaseInitialized = false;
let db = null;
const syncStatusEl = document.getElementById('syncStatus');

function setSyncStatus(message, mode) {
    if (!syncStatusEl) return;
    syncStatusEl.textContent = `Sync status: ${message}`;
    syncStatusEl.classList.remove('online', 'offline');
    if (mode) syncStatusEl.classList.add(mode);
}

async function initFirebase() {
    if (!window.firebase || !FIREBASE_CONFIG.apiKey) {
        setSyncStatus('firebase not configured, local only', 'offline');
        return;
    }

    try {
        firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.firestore();
        firebaseInitialized = true;
        setSyncStatus('online (Firebase enabled)', 'online');
        await syncFromFirebase();
    } catch (err) {
        console.error('Firebase init failed', err);
        setSyncStatus('firebase init failed (using local only)', 'offline');
        firebaseInitialized = false;
    }
}

async function syncFromFirebase() {
    if (!firebaseInitialized || !db) return;
    try {
        setSyncStatus('syncing from cloud...', 'online');
        const snapshot = await db.collection('matches').get();
        const remoteMatches = snapshot.docs.map(doc => {
            const data = doc.data();
            return { ...data, id: Number(data.id) || Number(doc.id) || Date.now() + Math.random() };
        });

        const merged = {};
        [...remoteMatches, ...manager.matches].forEach(match => {
            const id = String(match.id || Date.now() + Math.random());
            if (!merged[id]) {
                merged[id] = match;
            } else {
                const existingUpdated = new Date(merged[id].updatedAt || 0);
                const candidateUpdated = new Date(match.updatedAt || 0);
                merged[id] = candidateUpdated > existingUpdated ? match : merged[id];
            }
        });

        manager.matches = Object.values(merged);
        manager.saveMatches(true); // skip remote loop
        render();
        setSyncStatus('synced from cloud', 'online');
    } catch (err) {
        console.error('syncFromFirebase error', err);
        setSyncStatus('cloud sync failed', 'offline');
    }
}

async function syncToFirebase() {
    if (!firebaseInitialized || !db) return;
    try {
        setSyncStatus('syncing to cloud...', 'online');
        const matchesRef = db.collection('matches');
        const batch = db.batch();

        const snapshot = await matchesRef.get();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));

        manager.getAllMatches().forEach(match => {
            const id = String(match.id || Date.now() + Math.random());
            batch.set(matchesRef.doc(id), { ...match, id });
        });

        await batch.commit();
        setSyncStatus('synced to cloud', 'online');
    } catch (err) {
        console.error('syncToFirebase error', err);
        setSyncStatus('cloud sync failed', 'offline');
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

const userSelect = document.getElementById('userSelect');
const newUserNameInput = document.getElementById('newUserName');
const addUserBtn = document.getElementById('addUser');
const totalMatchesEl = document.getElementById('totalMatches');
const winCountEl = document.getElementById('winCount');
const drawCountEl = document.getElementById('drawCount');
const lossCountEl = document.getElementById('lossCount');
const goalsForEl = document.getElementById('goalsFor');
const goalsAgainstEl = document.getElementById('goalsAgainst');
const goalDiffEl = document.getElementById('goalDiff');
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
const importStatusDiv = document.getElementById('importStatus');

function initUserSelect() {
    const users = getAllUsers().slice(0, 4);
    userSelect.innerHTML = users.map(user => `<option value="${user}">${user}</option>`).join('');

    activeUser = localStorage.getItem('burnbankActiveUser') || users[0];
    if (!users.includes(activeUser)) activeUser = users[0];
    userSelect.value = activeUser;
    localStorage.setItem('burnbankActiveUser', activeUser);

    manager = new MatchManager();
    currentPage = 1;
    clearEditState();
    render();
}

function getPreviousScorers() {
    const scorers = new Set();
    manager.matches.forEach(match => {
        match.goalscorers.forEach(s => scorers.add(s.name));
    });
    return Array.from(scorers).sort();
}

function addGoalscorerRow(name = '', goals = 0) {
    const row = document.createElement('div');
    row.className = 'goalscorer-row';
    const previousScorers = getPreviousScorers();
    const nameOptions = previousScorers.map(s => `<option value="${s}">${s}</option>`).join('');
    const goalsOptions = Array.from({length: 11}, (_, i) => `<option value="${i}" ${goals == i ? 'selected' : ''}>${i}</option>`).join('');
    row.innerHTML = `
        <div class="form-row" style="grid-template-columns: 2fr 1fr auto; gap: 8px;">
            <select class="goalscorer-name" required>
                <option value="">Select Player</option>
                ${nameOptions}
                <option value="new">Add New Player</option>
            </select>
            <select class="goalscorer-goals" required>
                ${goalsOptions}
            </select>
            <button type="button" class="btn btn-delete remove-scorer">✕</button>
        </div>
    `;

    const nameSelect = row.querySelector('.goalscorer-name');
    const goalsSelect = row.querySelector('.goalscorer-goals');
    if (name && !previousScorers.includes(name)) {
        nameSelect.innerHTML += `<option value="${name}" selected>${name}</option>`;
    } else if (name) {
        nameSelect.value = name;
    }

    nameSelect.addEventListener('change', function() {
        if (this.value === 'new') {
            const newName = prompt('Enter new player name:');
            if (newName && newName.trim()) {
                this.innerHTML += `<option value="${newName.trim()}" selected>${newName.trim()}</option>`;
                this.value = newName.trim();
            } else {
                this.value = '';
            }
        }
    });

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
    console.log('handleImportData called with file:', file);
    const reader = new FileReader();
    reader.onload = e => {
        console.log('FileReader onload fired');
        try {
            const imported = JSON.parse(e.target.result);
            console.log('Parsed JSON:', imported);
            if (!imported.matches || !Array.isArray(imported.matches)) {
                throw new Error('Invalid import format');
            }

            const incoming = imported.matches.map(m => ({ ...m, id: m.id || Date.now() + Math.random() }));
            console.log('Incoming matches:', incoming);
            const merged = [...manager.matches, ...incoming].reduce((acc, match) => {
                acc[String(match.id)] = match;
                return acc;
            }, {});
            manager.matches = Object.values(merged);
            console.log('Merged matches:', manager.matches);
            if (imported.retentionDays) {
                manager.saveRetentionDays(Number(imported.retentionDays));
                retentionDaysInput.value = manager.retentionDays;
            }
            manager.pruneExpired();
            manager.saveMatches();
            console.log('About to call render()');
            render();
            importStatusDiv.textContent = `Successfully imported ${imported.matches.length} matches!`;
            importStatusDiv.className = 'import-status success';
            setTimeout(() => {
                importStatusDiv.style.display = 'none';
            }, 3000);
        } catch (err) {
            console.error('Import error:', err);
            importStatusDiv.textContent = 'Import failed: ' + err.message;
            importStatusDiv.className = 'import-status error';
            setTimeout(() => {
                importStatusDiv.style.display = 'none';
            }, 5000);
            console.error(err);
        }
    };
    reader.onerror = e => {
        console.error('FileReader error:', e);
    };
    console.log('Starting to read file as text');
    reader.readAsText(file);
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

    const gd = gf - ga;
    const points = wins * 3 + draws;

    document.getElementById('played').textContent = total;
    document.getElementById('won').textContent = wins;
    document.getElementById('drawn').textContent = draws;
    document.getElementById('lost').textContent = losses;
    document.getElementById('gf').textContent = gf;
    document.getElementById('ga').textContent = ga;
    document.getElementById('gd').textContent = gd;
    document.getElementById('points').textContent = points;

    // Recent form
    const recentMatches = manager.getAllMatches().slice(-6).reverse();
    const recentFormDiv = document.getElementById('recentForm');
    recentFormDiv.innerHTML = recentMatches.map(match => {
        const result = match.burnbankScore > match.opponentScore ? 'win' : match.burnbankScore < match.opponentScore ? 'loss' : 'draw';
        return `<div class="form-circle form-${result}" title="${new Date(match.date).toLocaleDateString()}: ${match.burnbankScore}-${match.opponentScore} vs ${match.opponent}"></div>`;
    }).join('');
}

function renderTopScorers() {
    const topScorers = manager.getTopScorers();
    if (!topScorers.length) {
        topScorersDiv.innerHTML = '<p class="empty-state">No matches recorded yet</p>';
        playerProfileDiv.innerHTML = '';
        return;
    }

    const maxGoals = Math.max(...topScorers.map(s => s.goals));
    topScorersDiv.innerHTML = topScorers.map((scorer, index) => {
        const fillPercent = maxGoals > 0 ? (scorer.goals / maxGoals) * 100 : 0;
        const isLeader = index === 0;
        return `
            <div class="scorer-bar ${isLeader ? 'leader' : ''}" data-scorer-name="${scorer.name}">
                <div class="scorer-name">${index + 1}. ${scorer.name} ${isLeader ? '👑' : ''}</div>
                <div class="scorer-bar-fill" style="--fill: ${fillPercent}%;" data-goals="${scorer.goals}"></div>
            </div>
        `;
    }).join('');

    topScorersDiv.querySelectorAll('.scorer-bar').forEach(bar => {
        bar.addEventListener('click', () => showPlayerProfile(bar.dataset.scorerName));
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
    renderStats(allMatches);

    if (!allMatches.length) {
        matchHistoryDiv.innerHTML = '<p class="empty-state">No matches recorded yet</p>';
        return;
    }

    matchHistoryDiv.innerHTML = allMatches.map(match => {
        const result = match.burnbankScore > match.opponentScore ? 'win' : match.burnbankScore < match.opponentScore ? 'loss' : 'draw';
        const scorersText = match.goalscorers.length ? match.goalscorers.map(s => `${s.name}: ${s.goals}`).join(', ') : 'No scorers recorded';

        return `
            <div class="match-timeline-item">
                <div class="match-timeline-icon ${result}">
                    ${result === 'win' ? 'W' : result === 'loss' ? 'L' : 'D'}
                </div>
                <div class="match-timeline-content">
                    <div class="match-timeline-header">
                        <div class="match-timeline-score">
                            Burnbank Blues ${match.burnbankScore} - ${match.opponentScore} ${match.opponent}
                        </div>
                        <div class="match-timeline-date">${new Date(match.date).toLocaleDateString()}</div>
                    </div>
                    <div class="match-timeline-scorers">
                        <strong>Goalscorers:</strong> ${scorersText}
                    </div>
                    <div class="match-timeline-scorers">
                        <strong>Recorded By:</strong> ${match.createdBy || 'unknown'}
                    </div>
                </div>
                <div class="match-timeline-actions">
                    <button type="button" onclick="handleEditMatch(${match.id})" class="btn btn-secondary">Edit</button>
                    <button type="button" onclick="handleDeleteMatch(${match.id})" class="btn btn-delete">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderPerformanceChart() {
    const canvas = document.getElementById('performanceChart');
    if (!canvas) return;

    const matches = manager.getAllMatches().sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = [];
    const points = [];
    const goalsFor = [];
    const goalsAgainst = [];
    const wins = [];

    let cumulativePoints = 0;
    let cumulativeGF = 0;
    let cumulativeGA = 0;
    let cumulativeWins = 0;

    matches.forEach(match => {
        const date = new Date(match.date).toLocaleDateString();
        labels.push(date);

        cumulativeGF += match.burnbankScore;
        cumulativeGA += match.opponentScore;
        goalsFor.push(cumulativeGF);
        goalsAgainst.push(cumulativeGA);

        if (match.burnbankScore > match.opponentScore) {
            cumulativeWins++;
            cumulativePoints += 3;
        } else if (match.burnbankScore === match.opponentScore) {
            cumulativePoints += 1;
        }
        wins.push(cumulativeWins);
        points.push(cumulativePoints);
    });

    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Points',
                    data: points,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                },
                {
                    label: 'Goals For',
                    data: goalsFor,
                    borderColor: 'rgb(54, 162, 235)',
                    tension: 0.1
                },
                {
                    label: 'Goals Against',
                    data: goalsAgainst,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1
                },
                {
                    label: 'Wins',
                    data: wins,
                    borderColor: 'rgb(255, 205, 86)',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Performance Trends Over Time'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function render() {
    renderTopScorers();
    renderMatchHistory();
    renderPerformanceChart();
}

function bind(el, event, cb) {
    if (!el) {
        console.warn(`Skipping listener for ${event}: element not found`);
        return;
    }
    el.addEventListener(event, cb);
}

bind(matchForm, 'submit', handleAddOrUpdateMatch);
bind(addGoalscorerBtn, 'click', () => addGoalscorerRow());
bind(cancelEditBtn, 'click', clearEditState);
bind(clearDataBtn, 'click', handleClearData);
bind(exportDataBtn, 'click', handleExportData);
bind(importFileInput, 'change', e => {
    console.log('File input change event fired', e.target.files);
    const file = e.target.files[0];
    if (file) {
        console.log('File selected:', file.name, file.type, file.size);
        importStatusDiv.style.display = 'block';
        importStatusDiv.textContent = `Importing ${file.name}...`;
        importStatusDiv.className = 'import-status importing';
        handleImportData(file);
    } else {
        console.log('No file selected');
    }
    e.target.value = '';
});

const forceSyncBtn = document.getElementById('forceSyncBtn');
if (forceSyncBtn) {
    forceSyncBtn.addEventListener('click', async () => {
        setSyncStatus('manual sync running...', 'online');
        await syncFromFirebase();
        await syncToFirebase();
    });
}

matchDateInput.valueAsDate = new Date();
setGoalscorersData([]);
initFirebase().then(() => render());
