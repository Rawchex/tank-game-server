const socket = window.socket;

/* --- GLOBAL UI ELEMENTS --- */
const browserScreen = document.getElementById('browser-screen');
const gameScreen = document.getElementById('game-screen');
const createRoomModal = document.getElementById('create-room-modal');

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const el = document.getElementById(screenId);
    if (!el) return;
    el.style.display = (screenId === 'game-screen') ? 'block' : 'flex';
}

/* --- AUTHENTICATION & CAPTCHA --- */
const authScreen = document.getElementById('auth-screen');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const registerFields = document.getElementById('register-fields');
const captchaQuestion = document.getElementById('captcha-question');
const authCaptcha = document.getElementById('auth-captcha');
const authError = document.getElementById('auth-error');

let isRegistering = false;
let currentCaptchaExpected = 0;

function generateCaptcha() {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    currentCaptchaExpected = a + b;
    captchaQuestion.innerText = `What is ${a} + ${b}?`;
    authCaptcha.value = '';
}

tabLogin.addEventListener('click', () => {
    isRegistering = false;
    registerFields.style.display = 'none';
    authSubmitBtn.innerText = 'Login to Game';
    tabLogin.classList.replace('btn-secondary', 'btn-primary');
    tabRegister.classList.replace('btn-primary', 'btn-secondary');
});

tabRegister.addEventListener('click', () => {
    isRegistering = true;
    registerFields.style.display = 'block';
    authSubmitBtn.innerText = 'Create Account';
    tabRegister.classList.replace('btn-secondary', 'btn-primary');
    tabLogin.classList.replace('btn-primary', 'btn-secondary');
    generateCaptcha();
});

authSubmitBtn.addEventListener('click', () => {
    const username = authUsername.value.trim();
    const password = authPassword.value;
    
    if (!username || !password) {
        authError.innerText = "Please fill in all fields.";
        return;
    }

    const payload = {
        type: isRegistering ? 'register' : 'login',
        username: username,
        password: password
    };

    if (isRegistering) {
        payload.captchaAns = parseInt(authCaptcha.value);
        payload.expectedCaptcha = currentCaptchaExpected;
    }

    socket.emit('auth', payload);
});

/* --- SESSION DATA --- */
window.myAccount = null;
const navUsername = document.getElementById('nav-username');
const navXpBar = document.getElementById('nav-xp-bar');
const navXpTooltip = document.getElementById('nav-xp-tooltip');

socket.on('authResponse', (res) => {
    if (res.success) {
        window.myAccount = res.user;
        updateAccountUI();
        showScreen('main-menu-screen');
    } else {
        authError.innerText = res.msg;
        if (isRegistering) generateCaptcha(); // reset captcha on fail
    }
});

socket.on('userDataUpdate', (user) => {
    window.myAccount = user;
    updateAccountUI();
});

function updateAccountUI() {
    if (!window.myAccount) return;
    navUsername.innerText = window.myAccount.name;
    const xpNeeded = window.myAccount.level * 100;
    const xpPerc = Math.min(100, (window.myAccount.xp / xpNeeded) * 100);
    navXpBar.style.width = Math.round(xpPerc) + '%';
    navXpTooltip.title = `Level ${window.myAccount.level} - ${window.myAccount.xp}/${xpNeeded} XP`;
    
    // Update layout dropdowns (Sandbox settings & In-game Save tool)
    updateLayoutDropdowns();
}

function updateLayoutDropdowns() {
    if (!window.myAccount) return;
    
    const hostSelect = document.getElementById('layout-select');
    const saveSelect = document.getElementById('save-layout-slot');
    if (!hostSelect || !saveSelect) return;
    
    saveSelect.innerHTML = '';
    
    window.myAccount.layouts.forEach((layout, idx) => {
        // Unlock logic constraint: every 4 levels = 1 unlock ? For alpha, say 1, 5, 10, 15, 20
        const requiredLevel = idx === 0 ? 1 : idx * 5;
        const isUnlocked = window.myAccount.level >= requiredLevel;
        
        let label = `Slot ${idx + 1}`;
        if (!isUnlocked) label += ` (Unlocks Lvl ${requiredLevel})`;
        else if (!layout) label += ` (Empty)`;
        else label += ` (Saved Data)`;

        // Host selector
        const opt = document.getElementById(`slot-${idx}-opt`);
        if (opt) {
            opt.innerText = label;
            opt.disabled = !isUnlocked;
        }

        // Save selector
        if (isUnlocked) {
            const saveOpt = document.createElement('option');
            saveOpt.value = idx;
            saveOpt.innerText = `Save to Slot ${idx + 1}`;
            saveSelect.appendChild(saveOpt);
        }
    });
}

/* --- MAIN MENU --- */
document.getElementById('btn-host-game').addEventListener('click', () => {
    showScreen('mode-selection-screen');
});

document.getElementById('btn-play-online').addEventListener('click', () => {
    window.navigationContext = 'classic';
    showScreen('browser-screen');
    socket.emit('getRooms');
});

// Mode Selection Handlers
const modeClassic = document.getElementById('mode-classic');
if (modeClassic) {
    modeClassic.addEventListener('click', () => {
        window.navigationContext = 'classic';
        if (createRoomModal) createRoomModal.style.display = 'flex';
    });
}

const modeSandbox = document.getElementById('mode-sandbox');
if (modeSandbox) {
    modeSandbox.addEventListener('click', () => {
        window.navigationContext = 'sandbox';
        if (!window.myAccount) return;
        const rname = `${window.myAccount.name}'s Creative Map`;
        const settings = { mode: 'sandbox' };
        socket.emit('createRoom', { roomName: rname, settings: settings, playerName: window.myAccount.name });
    });
}

document.getElementById('btn-profile').addEventListener('click', () => {
    alert("Profile statistics view is under development.");
});

document.getElementById('btn-logout').addEventListener('click', () => {
    window.myAccount = null;
    authUsername.value = '';
    authPassword.value = '';
    authError.innerText = '';
    showScreen('auth-screen');
});

document.getElementById('btn-back-to-main').addEventListener('click', () => {
    showScreen('main-menu-screen');
});

/* --- ROOM BROWSER --- */
const roomsList = document.getElementById('rooms-list');
document.getElementById('refresh-rooms-btn').addEventListener('click', () => socket.emit('getRooms'));

socket.on('roomsList', (rooms) => {
    roomsList.innerHTML = '';
    
    // Update Title UI
    const titleEl = document.querySelector('#browser-screen h2');
    if (titleEl) {
        titleEl.innerText = window.navigationContext === 'classic' ? '🌐 Classic Battle Server' : '🛠️ Sandbox Creations';
    }

    // Filter rooms based on where we are
    const filtered = rooms.filter(r => r.mode === window.navigationContext);
    
    if (filtered.length === 0) {
        roomsList.innerHTML = `<li style="justify-content:center; color:#7f8c8d;">No ${window.navigationContext} rooms found.</li>`;
        return;
    }
    filtered.forEach(r => {
        const li = document.createElement('li');
        li.innerHTML = `<div><strong>${r.name}</strong> <span class="subtext" style="margin-left: 10px;">(${r.playerCount}/10 Players)</span></div> 
                        <button class="btn-primary join-room-btn" data-id="${r.id}">Join Battle</button>`;
        roomsList.appendChild(li);
    });

    document.querySelectorAll('.join-room-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!window.myAccount) return;
            const id = e.target.getAttribute('data-id');
            socket.emit('joinRoom', { roomId: id, playerName: window.myAccount.name });
        });
    });
});

/* --- MAIN MENU EXTENSIONS --- */
const mainEditorBtn = document.getElementById('main-map-editor-btn');
if (mainEditorBtn) {
    mainEditorBtn.addEventListener('click', () => {
        if (browserScreen) browserScreen.style.display = 'none';
        if (gameScreen) gameScreen.style.display = 'block';
        window.isMapEditorActive = true;
        
        const editorUI = document.getElementById('sandbox-editor-ui');
        if (editorUI) editorUI.style.display = 'flex';
        
        const skillsUI = document.getElementById('skills-ui');
        if (skillsUI) skillsUI.style.display = 'none';
        
        const scorePanel = document.getElementById('score-panel');
        if (scorePanel) scorePanel.style.display = 'none';
        
        // Reset or load default layout
        window.dynamicSandboxData = { theme: 'grass', walls: [], crates: [], bushes: [], tires: [], barrels: [], speedPads: [], spawns: [] };
    });
}

document.getElementById('btn-close-editor').addEventListener('click', () => {
    window.isMapEditorActive = false;
    document.getElementById('sandbox-editor-ui').style.display = 'none';
    document.getElementById('skills-ui').style.display = 'flex';
    document.getElementById('score-panel').style.display = 'flex';
    
    // If we were in standalone mode, go back to lobby
    if (!window.activeRoomId) {
        gameScreen.style.display = 'none';
        browserScreen.style.display = 'block';
    }
});

const gameOverOverlay = document.getElementById('game-over-overlay');
const winnerText = document.getElementById('winner-team-text');
const finalRed = document.getElementById('final-score-red');
const finalBlue = document.getElementById('final-score-blue');

socket.on('gameOver', (data) => {
    gameOverOverlay.style.display = 'flex';
    winnerText.innerText = `${data.winner.toUpperCase()} TEAM WINS!`;
    winnerText.style.color = data.winner === 'Red' ? '#e74c3c' : '#3498db';
    finalRed.innerText = data.scores.Red;
    finalBlue.innerText = data.scores.Blue;
});

document.getElementById('return-to-lobby-btn').addEventListener('click', () => {
    gameOverOverlay.style.display = 'none';
    gameScreen.style.display = 'none';
    browserScreen.style.display = 'block';
    socket.emit('leaveRoom');
});
const newRoomMode = document.getElementById('new-room-mode');
const layoutSection = document.getElementById('layout-selection-section');
const hostLayoutList = document.getElementById('host-layout-list');

newRoomMode.addEventListener('change', () => {
    layoutSection.style.display = newRoomMode.value === 'sandbox' ? 'block' : 'none';
    if (newRoomMode.value === 'sandbox') refreshHostLayoutList();
});

function refreshHostLayoutList() {
    hostLayoutList.innerHTML = '';
    if (!window.myAccount || !window.myAccount.layouts || window.myAccount.layouts.length === 0) {
        hostLayoutList.innerHTML = '<div style="color:#7f8c8d; font-size:12px; text-align:center;">No layouts found.</div>';
        return;
    }
    window.myAccount.layouts.forEach(l => {
        const div = document.createElement('div');
        div.className = 'layout-item';
        div.style = 'padding:10px; background:rgba(255,255,255,0.05); border-radius:6px; cursor:pointer; display:flex; justify-content:space-between;';
        div.innerHTML = `<span>${l.name}</span> <span style="font-size:10px; color:#bdc3c7;">${new Date(l.createdAt).toLocaleDateString()}</span>`;
        div.onclick = () => {
            document.querySelectorAll('.layout-item').forEach(i => i.style.background = 'rgba(255,255,255,0.05)');
            div.style.background = 'var(--primary)';
            window.selectedHostLayout = l.data;
        };
        hostLayoutList.appendChild(div);
    });
}

document.getElementById('create-room-btn').addEventListener('click', () => {
    createRoomModal.style.display = 'flex';
    refreshHostLayoutList();
});

document.getElementById('cancel-create-room').addEventListener('click', () => createRoomModal.style.display = 'none');

document.getElementById('confirm-create-room').addEventListener('click', () => {
    if (!window.myAccount) return;
    const rname = document.getElementById('new-room-name').value.trim() || 'Epic Battle';
    const settings = { 
        mode: newRoomMode.value,
        killLimit: parseInt(document.getElementById('match-kill-limit').value),
        timeLimit: parseInt(document.getElementById('match-time-limit').value),
        botCount: parseInt(document.getElementById('match-bot-count').value),
        botDiff: document.getElementById('match-bot-diff').value,
        layout: (newRoomMode.value === 'sandbox') ? window.selectedHostLayout : null
    };
    socket.emit('createRoom', { roomName: rname, settings: settings, playerName: window.myAccount.name });
    createRoomModal.style.display = 'none';
});

/* --- ROOM LOBBY --- */
let currentRoomId = null;
let currentSettings = {};
let isRoomAdmin = false;
const adminControls = document.getElementById('admin-controls');
const sandboxHostPanel = document.getElementById('sandbox-host-panel');

socket.on('roomJoined', (roomId) => {
    currentRoomId = roomId;
    if (window.navigationContext === 'sandbox') {
        // Direct jump to editor
        window.isEditingMap = true;
        document.getElementById('map-editor-toolbar').style.display = 'block';
        document.getElementById('hud').style.display = 'none';
        document.getElementById('scoreboard-ui').style.display = 'none';
        document.getElementById('skills-ui').style.display = 'none';
        startGame();
    } else {
        document.getElementById('hud').style.display = 'flex';
        document.getElementById('scoreboard-ui').style.display = 'block';
        document.getElementById('skills-ui').style.display = 'flex';
        showScreen('lobby-screen');
    }
});

socket.on('lobbyState', (players) => {
    if (!currentRoomId) return;

    const redP = document.getElementById('red-players');
    const blueP = document.getElementById('blue-players');
    redP.innerHTML = ''; blueP.innerHTML = '';

    if (players[socket.id] && players[socket.id].isHost) {
        isRoomAdmin = true;
        adminControls.style.display = 'block';
        ['add-bot-red', 'add-bot-blue', 'remove-bot-red', 'remove-bot-blue'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'inline-block';
        });
        // Check sandbox mode for layout
        if (window.latestGameSettings && window.latestGameSettings.mode === 'sandbox') {
            sandboxHostPanel.style.display = 'block';
        } else {
            sandboxHostPanel.style.display = 'none';
        }
    } else {
        isRoomAdmin = false;
        adminControls.style.display = 'none';
        ['add-bot-red', 'add-bot-blue', 'remove-bot-red', 'remove-bot-blue'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    for (let id in players) {
        let p = players[id];
        let li = document.createElement('li');
        
        let kickBtn = '';
        if (isRoomAdmin && id !== socket.id && !id.startsWith('bot_')) {
            kickBtn = `<button class="btn-danger kick-btn" style="padding:4px 8px; font-size:11px; margin-left:15px; float:right;" data-id="${id}">Kick</button>`;
        }

        let displayName = p.name || `Player_${id.substring(0, 4)}`;
        if (p.isBot) displayName = "🤖 " + displayName + " [BOT]";
        if (id === socket.id) displayName += " <span style='color:var(--success)'>(You)</span>";
        if (p.isHost) displayName = "👑 " + displayName;

        li.innerHTML = `<span>${displayName}</span> ${kickBtn}`;

        if (p.team === 'Red') redP.appendChild(li);
        else if (p.team === 'Blue') blueP.appendChild(li);
    }
    
    document.querySelectorAll('.kick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => socket.emit('kickPlayer', e.target.getAttribute('data-id')));
    });
});

document.getElementById('leave-room-btn').addEventListener('click', () => {
    socket.emit('leaveRoom');
    currentRoomId = null;
    showScreen('browser-screen');
    socket.emit('getRooms');
});

document.getElementById('ingame-leave-btn').addEventListener('click', () => {
    socket.emit('leaveRoom');
    currentRoomId = null;
    window.isEditingMap = false;
    document.getElementById('map-editor-toolbar').style.display = 'none';
    showScreen('browser-screen');
    socket.emit('getRooms');
});

socket.on('kicked_from_room', () => {
    alert("You were kicked from the server by the Host.");
    currentRoomId = null;
    window.isEditingMap = false;
    document.getElementById('map-editor-toolbar').style.display = 'none';
    showScreen('main-menu-screen'); // Send completely back to menu
});

// Teams
let myTeam = null;
document.getElementById('join-red').addEventListener('click', () => { socket.emit('joinTeam', { team: 'Red', name: window.myAccount.name }); myTeam = 'Red'; startGame(); });
document.getElementById('join-blue').addEventListener('click', () => { socket.emit('joinTeam', { team: 'Blue', name: window.myAccount.name }); myTeam = 'Blue'; startGame(); });

document.getElementById('add-bot-red').addEventListener('click', () => socket.emit('addBot', 'Red'));
document.getElementById('add-bot-blue').addEventListener('click', () => socket.emit('addBot', 'Blue'));
document.getElementById('remove-bot-red').addEventListener('click', () => socket.emit('removeBot', 'Red'));
document.getElementById('remove-bot-blue').addEventListener('click', () => socket.emit('removeBot', 'Blue'));

function startGame() {
    showScreen('game-screen');
    if(typeof initInput === 'function') initInput(socket);
    if(typeof initVoiceChat === 'function') initVoiceChat();
}

socket.on('gameState', (state) => {
    window.latestGameState = state;
    window.latestGameSettings = state.settings || { mode: 'classic' };
    
    // Update lobby info display
    document.getElementById('lobby-room-name').innerText = state.name || 'Room';
    document.getElementById('lobby-room-mode').innerText = `Mode: ${window.latestGameSettings.mode.toUpperCase()}`;

    // Adjust visibility of panels dynamically if we are host and in lobby
    if (isRoomAdmin && roomLobbyContainerVisible()) {
       sandboxHostPanel.style.display = window.latestGameSettings.mode === 'sandbox' ? 'block' : 'none';
    }

    if ((myTeam || window.isEditingMap) && typeof renderGame === 'function') {
        renderGame(state, socket.id);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        const gameScreen = document.getElementById('game-screen');
        if (gameScreen && gameScreen.style.display !== 'none' && isRoomAdmin) {
            e.preventDefault(); // Prevent browser focus shifting
            const p = document.getElementById('ingame-admin');
            if (p) p.style.display = (p.style.display === 'none') ? 'block' : 'none';
        }
    }
});

function roomLobbyContainerVisible() {
    return document.getElementById('lobby-screen').style.display !== 'none';
}

socket.on('sandboxSync', (data) => {
    window.dynamicSandboxData = data;
});

// Editor Loading
document.getElementById('load-layout-btn').addEventListener('click', () => {
    const slot = document.getElementById('layout-select').value;
    if (slot === "-1") {
        socket.emit('sandbox-update', { walls: [], crates: [], bushes: [], tires: [] });
        alert("Board cleared (Default Sandbox loaded).");
        return;
    }
    const idx = parseInt(slot);
    if (window.myAccount && window.myAccount.layouts[idx]) {
        socket.emit('sandbox-update', window.myAccount.layouts[idx]);
        alert(`Loaded Layout from Slot ${idx + 1}`);
    } else {
        alert("This slot is empty.");
    }
});

// Live Editor Toggle
document.getElementById('open-map-editor').addEventListener('click', () => {
    window.isEditingMap = true;
    document.getElementById('map-editor-toolbar').style.display = 'block';
    // Jump straight into the game to observe and edit (no team needed)
    startGame();
});

document.getElementById('btn-close-editor').addEventListener('click', () => {
    window.isEditingMap = false;
    document.getElementById('map-editor-toolbar').style.display = 'none';
    showScreen('lobby-screen');
});

// Map Tools global
window.currentEditorTool = 'wall';
document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.tool-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        window.currentEditorTool = card.getAttribute('data-tool');
    });
});

document.getElementById('editor-theme-select').addEventListener('change', (e) => {
    if (!isRoomAdmin) return;
    if (window.saveToUndo) window.saveToUndo();
    window.dynamicSandboxData.theme = e.target.value;
    socket.emit('sandbox-update', window.dynamicSandboxData);
});

// Save Map
document.getElementById('btn-save-layout').addEventListener('click', () => {
    if (!window.myAccount) return;
    const mapName = prompt("Enter a name for this layout:", "My Epic Map");
    if (mapName) {
        socket.emit('saveLayout', {
            username: window.myAccount.name,
            name: mapName,
            layout: window.dynamicSandboxData
        });
        alert("Layout saved to library!");
    }
});

document.getElementById('btn-clear-map').addEventListener('click', () => {
    if (!isRoomAdmin) return;
    if (confirm("Are you sure you want to CLEAR the entire map?")) {
        const emptyMap = { 
            theme: window.dynamicSandboxData.theme || 'grass',
            walls: [], crates: [], bushes: [], tires: [], 
            barrels: [], speedPads: [], spawns: [] 
        };
        window.dynamicSandboxData = emptyMap;
        socket.emit('sandbox-update', emptyMap);
    }
});

document.getElementById('btn-test-map').addEventListener('click', () => {
    window.isEditingMap = false;
    document.getElementById('map-editor-toolbar').style.display = 'none';
    // Join Red team to play instantly
    const playerName = window.myAccount ? window.myAccount.name : 'Host';
    socket.emit('joinTeam', { team: 'Red', name: playerName });
    myTeam = 'Red';
    startGame();
});

/* --- VOICE SETTINGS --- */
const voiceModal = document.getElementById('voice-settings-modal');
document.getElementById('voice-settings-btn').addEventListener('click', () => {
    voiceModal.style.display = 'block';
    populateVoicePlayers();
});
document.getElementById('close-voice-settings').addEventListener('click', () => { voiceModal.style.display = 'none'; });

document.getElementById('master-volume').addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    if(window.voiceSettings) window.voiceSettings.globalVolume = vol;
    document.getElementById('vol-display').innerText = Math.round(vol * 100) + '%';
});

document.getElementById('mute-mic').addEventListener('change', (e) => {
    if(window.voiceSettings) window.voiceSettings.micMuted = e.target.checked;
    if(window.updateLocalMicState) window.updateLocalMicState();
});

document.getElementById('ptt-enable').addEventListener('change', (e) => {
    if(window.voiceSettings) window.voiceSettings.pttEnabled = e.target.checked;
    if(window.updateLocalMicState) window.updateLocalMicState();
});

function populateVoicePlayers() {
    const voicePlayerList = document.getElementById('voice-player-list');
    voicePlayerList.innerHTML = '';
    if (!window.latestGameState || !window.latestGameState.players) return;
    
    const players = window.latestGameState.players;
    let count = 0;
    
    for (const id in players) {
        if (id === socket.id || id.startsWith('bot_')) continue;
        
        count++;
        const p = players[id];
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.marginBottom = '5px';
        
        const nameSpan = document.createElement('span');
        nameSpan.innerText = p.name || id.substring(0,4);
        nameSpan.style.color = p.team === 'Red' ? '#e74c3c' : '#3498db';
        
        const muteLabel = document.createElement('label');
        muteLabel.style.cursor = 'pointer'; muteLabel.style.fontSize = '12px';
        
        const muteMCheckbox = document.createElement('input');
        muteMCheckbox.type = 'checkbox';
        muteMCheckbox.checked = !!(window.voiceSettings && window.voiceSettings.mutedPlayers[id]);
        muteMCheckbox.addEventListener('change', (e) => {
            if(window.voiceSettings) window.voiceSettings.mutedPlayers[id] = e.target.checked;
        });
        
        muteLabel.appendChild(muteMCheckbox); muteLabel.appendChild(document.createTextNode(' Mute'));
        row.appendChild(nameSpan); row.appendChild(muteLabel);
        voicePlayerList.appendChild(row);
    }
    
    if (count === 0) voicePlayerList.innerHTML = '<span style="color:#7f8c8d; font-size:12px;">No other voice players.</span>';
}
