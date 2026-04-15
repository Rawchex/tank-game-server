const socket = window.socket;
let engine = null; 

/* --- SCREEN MANAGEMENT --- */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const el = document.getElementById(screenId);
    if (!el) return;
    el.style.display = 'block';
}

/* --- AUTHENTICATION & SESSION --- */
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const registerFields = document.getElementById('register-fields');
const authError = document.getElementById('auth-error');

let isRegistering = false;
let currentCaptchaExpected = 0;

document.getElementById('tab-login')?.addEventListener('click', () => {
    isRegistering = false;
    if (registerFields) registerFields.style.display = 'none';
    if (authSubmitBtn) authSubmitBtn.innerText = 'Initialize Session';
});

document.getElementById('tab-register')?.addEventListener('click', () => {
    isRegistering = true;
    if (registerFields) registerFields.style.display = 'block';
    if (authSubmitBtn) authSubmitBtn.innerText = 'Join The Fleet';
    generateCaptcha();
});

function generateCaptcha() {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    currentCaptchaExpected = a + b;
    const q = document.getElementById('captcha-question');
    if (q) q.innerText = `${a} + ${b} = ?`;
}

authSubmitBtn?.addEventListener('click', () => {
    const username = authUsername.value.trim();
    const password = authPassword.value;
    if (!username || !password) { if(authError) authError.innerText = "Credentials Required"; return; }
    
    const payload = { type: isRegistering ? 'register' : 'login', username, password };
    if (isRegistering) {
        payload.captchaAns = parseInt(document.getElementById('auth-captcha')?.value || 0);
        payload.expectedCaptcha = currentCaptchaExpected;
    }
    socket.emit('auth', payload);
});

window.myAccount = null;
socket.on('authResponse', (res) => {
    if (res.success) {
        window.myAccount = res.user;
        updateAccountUI();
        showScreen('main-menu-screen');
    } else {
        if(authError) authError.innerText = res.msg;
        if (isRegistering) generateCaptcha();
    }
});

function updateAccountUI() {
    if (!window.myAccount) return;
    const userDisplay = document.getElementById('nav-username');
    if (userDisplay) userDisplay.innerText = window.myAccount.name.toUpperCase();
    const xpNeeded = window.myAccount.level * 100;
    const xpPerc = Math.min(100, (window.myAccount.xp / xpNeeded) * 100);
    const xpBar = document.getElementById('nav-xp-bar');
    if (xpBar) xpBar.style.width = xpPerc + '%';
}

/* --- HUB NAVIGATION --- */
document.getElementById('btn-host-game')?.addEventListener('click', () => showScreen('mode-selection-screen'));
document.getElementById('btn-play-online')?.addEventListener('click', () => {
    window.navigationContext = 'classic';
    showScreen('browser-screen');
    socket.emit('getRooms');
});

// Mode Selection
document.getElementById('mode-classic')?.addEventListener('click', () => {
    window.navigationContext = 'classic';
    const modal = document.getElementById('create-room-modal');
    if (modal) modal.style.display = 'flex';
});

document.getElementById('mode-sandbox')?.addEventListener('click', () => {
    window.navigationContext = 'sandbox';
    if (!window.myAccount) return;
    const rname = `${window.myAccount.name.toUpperCase()}'S FORGE`;
    socket.emit('createRoom', { roomName: rname, settings: { mode: 'sandbox' }, playerName: window.myAccount.name });
});

document.getElementById('btn-logout')?.addEventListener('click', () => {
    window.myAccount = null;
    showScreen('auth-screen');
});

/* --- ROOM BROWSER --- */
const roomsList = document.getElementById('rooms-list');
document.getElementById('refresh-rooms-btn')?.addEventListener('click', () => socket.emit('getRooms'));

socket.on('roomsList', (rooms) => {
    if (!roomsList) return;
    roomsList.innerHTML = '';
    const filtered = rooms.filter(r => r.mode === (window.navigationContext || 'classic'));
    
    if (filtered.length === 0) {
        roomsList.innerHTML = `<li style="justify-content:center; color:var(--text-dim);">No active battle signals detected.</li>`;
        return;
    }

    filtered.forEach(r => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div><strong>${r.name}</strong> <span class="subtext" style="margin-left:15px;">(${r.playerCount}/10)</span></div>
            <button class="btn-primary join-room-btn" data-id="${r.id}">Deploy</button>
        `;
        roomsList.appendChild(li);
    });

    document.querySelectorAll('.join-room-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const rid = e.target.getAttribute('data-id');
            socket.emit('joinRoom', { roomId: rid, playerName: window.myAccount.name });
        });
    });
});

/* --- ROOM CREATION --- */
document.getElementById('cancel-create-room')?.addEventListener('click', () => {
    const modal = document.getElementById('create-room-modal');
    if (modal) modal.style.display = 'none';
});

document.getElementById('confirm-create-room')?.addEventListener('click', () => {
    if (!window.myAccount) return;
    const rname = document.getElementById('new-room-name').value.trim() || 'Tactical Operation';
    const settings = {
        mode: document.getElementById('new-room-mode').value,
        killLimit: parseInt(document.getElementById('match-kill-limit').value),
        timeLimit: parseInt(document.getElementById('match-time-limit').value),
        botCount: parseInt(document.getElementById('match-bot-count').value),
        botDiff: document.getElementById('match-bot-diff').value
    };
    socket.emit('createRoom', { roomName: rname, settings: settings, playerName: window.myAccount.name });
    const modal = document.getElementById('create-room-modal');
    if(modal) modal.style.display = 'none';
});

/* --- LOBBY & TEAM SELECTION --- */
socket.on('roomJoined', (roomId) => {
    window.activeRoomId = roomId;
    if (window.navigationContext === 'sandbox') {
        window.isEditingMap = true;
        const toolbar = document.getElementById('map-editor-toolbar');
        if (toolbar) toolbar.style.display = 'block';
        showScreen('game-screen');
        startGame();
    } else {
        showScreen('lobby-screen');
    }
});

socket.on('lobbyState', (players) => {
    const redP = document.getElementById('red-players');
    const blueP = document.getElementById('blue-players');
    if (!redP || !blueP) return;
    
    redP.innerHTML = ''; blueP.innerHTML = '';
    window.isHost = players[socket.id]?.isHost;
    
    const adminPanel = document.getElementById('admin-controls');
    if(adminPanel) adminPanel.style.display = window.isHost ? 'block' : 'none';

    for (let id in players) {
        let p = players[id];
        let li = document.createElement('li');
        let displayName = (p.isHost ? "👑 " : "") + (p.isBot ? "🤖 " : "") + p.name;
        if (id === socket.id) displayName += " (YOU)";
        
        li.innerHTML = `<span>${displayName}</span>`;
        if (p.team === 'Red') redP.appendChild(li);
        else if (p.team === 'Blue') blueP.appendChild(li);
    }
});

document.getElementById('join-red')?.addEventListener('click', () => { 
    socket.emit('joinTeam', { team: 'Red', name: window.myAccount.name }); 
    startGame(); 
});
document.getElementById('join-blue')?.addEventListener('click', () => { 
    socket.emit('joinTeam', { team: 'Blue', name: window.myAccount.name }); 
    startGame(); 
});

document.getElementById('leave-room-btn')?.addEventListener('click', () => {
    socket.emit('leaveRoom');
    showScreen('main-menu-screen');
});

/* --- GAME ORCHESTRATION --- */
function startGame() {
    showScreen('game-screen');
    if (!engine) {
        engine = new EngineController(socket, window.EngineConfig, window.EnginePhysics);
        setupSandboxPlacement();
    }
    if(typeof initInput === 'function') initInput(socket);
}

function setupSandboxPlacement() {
    const canvas = document.getElementById('gameCanvas');
    canvas?.addEventListener('mousedown', (e) => {
        if (!window.isEditingMap || !window.isHost) return;
        engine.placeObject(window.currentEditorTool, e.clientX, e.clientY);
    });
}

/* --- HUD & SCOREBOARD --- */
socket.on('gameState', (state) => {
    const redScore = document.getElementById('score-red');
    if(redScore) redScore.innerText = state.teamScores.Red;
    const blueScore = document.getElementById('score-blue');
    if(blueScore) blueScore.innerText = state.teamScores.Blue;
    
    const lb = document.getElementById('leaderboard-list');
    if (lb) {
        lb.innerHTML = Object.values(state.players)
            .sort((a,b) => b.score - a.score)
            .map(p => `<div class="score-row"><span>${p.name}</span><strong>${p.score}</strong></div>`)
            .join('');
    }
});

/* --- CHAT SYSTEM --- */
const chatInput = document.getElementById('chat-input');
const chatContainer = document.getElementById('chat-container');

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 't') {
        const wrapper = document.getElementById('chat-input-wrapper');
        if (wrapper) wrapper.style.display = 'block';
        if (chatInput) chatInput.focus();
        e.preventDefault();
    }
});

chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const msg = chatInput.value.trim();
        if (msg) socket.emit('chatMessage', { type: 'all', msg });
        chatInput.value = '';
        const wrapper = document.getElementById('chat-input-wrapper');
        if (wrapper) wrapper.style.display = 'none';
        chatInput.blur();
    }
});

socket.on('chatMessage', (data) => {
    if (!chatContainer) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<strong>${data.from}:</strong> ${data.msg}`;
    chatContainer.prepend(div);
    setTimeout(() => div.remove(), 8000);
});

/* --- SANDBOX EDITOR --- */
window.currentEditorTool = 'wall';
document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.tool-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        window.currentEditorTool = card.getAttribute('data-tool');
    });
});

document.getElementById('btn-close-editor')?.addEventListener('click', () => {
    window.isEditingMap = false;
    const toolbar = document.getElementById('map-editor-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    showScreen('lobby-screen');
});

document.getElementById('btn-test-map')?.addEventListener('click', () => {
    window.isEditingMap = false;
    const toolbar = document.getElementById('map-editor-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    socket.emit('joinTeam', { team: 'Red', name: window.myAccount.name });
    startGame();
});

// Initial Signal
showScreen('auth-screen');
