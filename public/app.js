const socket = window.socket;
let engine = null; 

/* --- SCREEN MANAGEMENT --- */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const el = document.getElementById(screenId);
    if (!el) return;
    el.style.display = 'block';
    
    // Accessibility check: focus on main input if any
    const mainInput = el.querySelector('input');
    if (mainInput) mainInput.focus();
}

/* --- AUTHENTICATION & SESSION --- */
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const registerFields = document.getElementById('register-fields');
const authError = document.getElementById('auth-error');

let isRegistering = false;
let currentCaptchaExpected = 0;

document.getElementById('tab-login').addEventListener('click', () => {
    isRegistering = false;
    registerFields.style.display = 'none';
    authSubmitBtn.innerText = 'Initialize Session';
});

document.getElementById('tab-register').addEventListener('click', () => {
    isRegistering = true;
    registerFields.style.display = 'block';
    authSubmitBtn.innerText = 'Join The Fleet';
    generateCaptcha();
});

function generateCaptcha() {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    currentCaptchaExpected = a + b;
    document.getElementById('captcha-question').innerText = `${a} + ${b} = ?`;
}

authSubmitBtn.addEventListener('click', () => {
    const username = authUsername.value.trim();
    const password = authPassword.value;
    if (!username || !password) { authError.innerText = "Credentials Required"; return; }
    
    const payload = { type: isRegistering ? 'register' : 'login', username, password };
    if (isRegistering) {
        payload.captchaAns = parseInt(document.getElementById('auth-captcha').value);
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
        authError.innerText = res.msg;
        if (isRegistering) generateCaptcha();
    }
});

function updateAccountUI() {
    if (!window.myAccount) return;
    document.getElementById('nav-username').innerText = window.myAccount.name.toUpperCase();
    const xpNeeded = window.myAccount.level * 100;
    const xpPerc = Math.min(100, (window.myAccount.xp / xpNeeded) * 100);
    document.getElementById('nav-xp-bar').style.width = xpPerc + '%';
}

/* --- HUB NAVIGATION --- */
document.getElementById('btn-host-game').addEventListener('click', () => showScreen('mode-selection-screen'));
document.getElementById('btn-play-online').addEventListener('click', () => {
    window.navigationContext = 'classic';
    showScreen('browser-screen'); // Wait, browser-screen might be missing in new HTML? Let's check.
    socket.emit('getRooms');
});

// Mode Selection
document.getElementById('mode-classic').addEventListener('click', () => {
    window.navigationContext = 'classic';
    document.getElementById('create-room-modal').style.display = 'flex';
});

document.getElementById('mode-sandbox').addEventListener('click', () => {
    window.navigationContext = 'sandbox';
    const rname = `${window.myAccount.name.toUpperCase()}'S FORGE`;
    socket.emit('createRoom', { roomName: rname, settings: { mode: 'sandbox' }, playerName: window.myAccount.name });
});

document.getElementById('btn-logout').addEventListener('click', () => {
    window.myAccount = null;
    showScreen('auth-screen');
});

/* --- LOBBY & TEAM SELECTION --- */
socket.on('roomJoined', (roomId) => {
    window.activeRoomId = roomId;
    if (window.navigationContext === 'sandbox') {
        window.isEditingMap = true;
        document.getElementById('map-editor-toolbar').style.display = 'block';
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
    
    document.getElementById('admin-controls').style.display = window.isHost ? 'block' : 'none';

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

document.getElementById('join-red').addEventListener('click', () => { 
    socket.emit('joinTeam', { team: 'Red', name: window.myAccount.name }); 
    startGame(); 
});
document.getElementById('join-blue').addEventListener('click', () => { 
    socket.emit('joinTeam', { team: 'Blue', name: window.myAccount.name }); 
    startGame(); 
});

document.getElementById('leave-room-btn').addEventListener('click', () => {
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
    canvas.addEventListener('mousedown', (e) => {
        if (!window.isEditingMap || !window.isHost) return;
        engine.placeObject(window.currentEditorTool, e.clientX, e.clientY);
    });
}

/* --- HUD & SCOREBOARD --- */
socket.on('gameState', (state) => {
    document.getElementById('score-red').innerText = state.teamScores.Red;
    document.getElementById('score-blue').innerText = state.teamScores.Blue;
    
    // Leaderboard
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
        wrapper.style.display = 'block';
        chatInput.focus();
        e.preventDefault();
    }
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const msg = chatInput.value.trim();
        if (msg) socket.emit('chatMessage', { type: 'all', msg });
        chatInput.value = '';
        document.getElementById('chat-input-wrapper').style.display = 'none';
        chatInput.blur();
    }
});

socket.on('chatMessage', (data) => {
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

document.getElementById('btn-close-editor').addEventListener('click', () => {
    window.isEditingMap = false;
    document.getElementById('map-editor-toolbar').style.display = 'none';
    showScreen('lobby-screen');
});

document.getElementById('btn-test-map').addEventListener('click', () => {
    window.isEditingMap = false;
    document.getElementById('map-editor-toolbar').style.display = 'none';
    socket.emit('joinTeam', { team: 'Red', name: window.myAccount.name });
    startGame();
});

// Initialization
showScreen('auth-screen');
