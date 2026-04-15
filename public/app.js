const socket = io();

// UI Elements
const loginContainer = document.getElementById('login-container');
const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');

const mainUi = document.getElementById('main-ui');
const navUsername = document.getElementById('nav-username');
const roomsList = document.getElementById('rooms-list');
const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');

const createRoomBtn = document.getElementById('create-room-btn');
const createRoomModal = document.getElementById('create-room-modal');
const newRoomName = document.getElementById('new-room-name');
const newRoomMode = document.getElementById('new-room-mode');
const cancelCreateRoom = document.getElementById('cancel-create-room');
const confirmCreateRoom = document.getElementById('confirm-create-room');

const roomLobbyContainer = document.getElementById('room-lobby-container');
const lobbyRoomName = document.getElementById('lobby-room-name');
const lobbyRoomMode = document.getElementById('lobby-room-mode');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const adminControls = document.getElementById('admin-controls');
const openMapEditorBtn = document.getElementById('open-map-editor');

const gameContainer = document.getElementById('game-container');
const mapEditorToolbar = document.getElementById('map-editor-toolbar');
const btnCloseEditor = document.getElementById('btn-close-editor');
const btnSaveLayout = document.getElementById('btn-save-layout');

// Local Account Mock
let localPlayer = {
    name: localStorage.getItem('player_name') || '',
    xp: parseInt(localStorage.getItem('player_xp') || '0'),
    layouts: JSON.parse(localStorage.getItem('player_layouts') || '[]')
};

// Start logic
if (localPlayer.name) {
    loginContainer.style.display = 'none';
    mainUi.style.display = 'block';
    navUsername.innerText = localPlayer.name;
    socket.emit('getRooms');
} else {
    loginContainer.style.display = 'flex';
}

loginBtn.addEventListener('click', () => {
    const val = usernameInput.value.trim();
    if (val) {
        localPlayer.name = val;
        localStorage.setItem('player_name', val);
        loginContainer.style.display = 'none';
        mainUi.style.display = 'block';
        navUsername.innerText = localPlayer.name;
        socket.emit('getRooms');
    }
});

// Room Browser Logic
refreshRoomsBtn.addEventListener('click', () => {
    socket.emit('getRooms');
});

socket.on('roomsList', (rooms) => {
    roomsList.innerHTML = '';
    if (rooms.length === 0) {
        roomsList.innerHTML = '<li style="justify-content:center; color:#7f8c8d;">No active rooms found.</li>';
        return;
    }
    rooms.forEach(r => {
        const li = document.createElement('li');
        li.innerHTML = `<div><strong>${r.name}</strong> <span class="subtext">(${r.playerCount} players)</span></div> <button class="btn-primary join-room-btn" data-id="${r.id}">Join</button>`;
        roomsList.appendChild(li);
    });

    document.querySelectorAll('.join-room-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            socket.emit('joinRoom', { roomId: id, playerName: localPlayer.name });
        });
    });
});

socket.on('errorMsg', (msg) => alert(msg));

// Create Room
createRoomBtn.addEventListener('click', () => createRoomModal.style.display = 'flex');
cancelCreateRoom.addEventListener('click', () => createRoomModal.style.display = 'none');
confirmCreateRoom.addEventListener('click', () => {
    const rname = newRoomName.value.trim() || 'Custom Room';
    const settings = { mode: newRoomMode.value };
    socket.emit('createRoom', { roomName: rname, settings: settings, playerName: localPlayer.name });
    createRoomModal.style.display = 'none';
});

// Room Lobby Hook
let currentRoomId = null;
let currentSettings = {};
let isRoomAdmin = false;

socket.on('roomJoined', (roomId) => {
    currentRoomId = roomId;
    mainUi.style.display = 'none';
    roomLobbyContainer.style.display = 'flex';
    // Clear lists
    document.getElementById('red-players').innerHTML = '';
    document.getElementById('blue-players').innerHTML = '';
});

socket.on('lobbyState', (players) => {
    if (!currentRoomId) return; // not in room

    const redP = document.getElementById('red-players');
    const blueP = document.getElementById('blue-players');
    redP.innerHTML = ''; blueP.innerHTML = '';

    // Check if I am host
    if (players[socket.id] && players[socket.id].isHost) {
        isRoomAdmin = true;
        adminControls.style.display = 'block';
    } else {
        isRoomAdmin = false;
        adminControls.style.display = 'none';
    }

    // Determine room mode via server or just assume if host has map editor (For simplicity, if host, show editor button)
    // In a real app the settings come from server room payload.
    if (isRoomAdmin) openMapEditorBtn.style.display = 'inline-block';

    for (let id in players) {
        let p = players[id];
        let li = document.createElement('li');
        
        let kickBtn = '';
        if (isRoomAdmin && id !== socket.id) {
            kickBtn = `<button class="btn-danger kick-btn" style="padding:2px 5px; font-size:10px; margin-left:10px;" data-id="${id}">X</button>`;
        }

        let displayName = p.name || `Player_${id.substring(0, 4)}`;
        if (id === socket.id) displayName += " (You)";
        if (p.isHost) displayName = "👑 " + displayName;

        li.innerHTML = `<span>${displayName}</span> ${kickBtn}`;

        if (p.team === 'Red') redP.appendChild(li);
        else if (p.team === 'Blue') blueP.appendChild(li);
    }
    
    document.querySelectorAll('.kick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            socket.emit('kickPlayer', e.target.getAttribute('data-id'));
        });
    });
});

leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom');
    roomLobbyContainer.style.display = 'none';
    mainUi.style.display = 'block';
    currentRoomId = null;
    socket.emit('getRooms');
});

socket.on('kicked_from_room', () => {
    alert("You were kicked by the host.");
    roomLobbyContainer.style.display = 'none';
    gameContainer.style.display = 'none';
    mainUi.style.display = 'block';
    currentRoomId = null;
    socket.emit('getRooms');
});

// Team join logic (Proceeds to game view)
let myTeam = null;

document.getElementById('join-red').addEventListener('click', () => {
    socket.emit('joinTeam', { team: 'Red', name: localPlayer.name });
    myTeam = 'Red';
    startGame();
});
document.getElementById('join-blue').addEventListener('click', () => {
    socket.emit('joinTeam', { team: 'Blue', name: localPlayer.name });
    myTeam = 'Blue';
    startGame();
});

document.getElementById('add-bot-red').addEventListener('click', () => socket.emit('addBot', 'Red'));
document.getElementById('add-bot-blue').addEventListener('click', () => socket.emit('addBot', 'Blue'));
document.getElementById('remove-bot-red').addEventListener('click', () => socket.emit('removeBot', 'Red'));
document.getElementById('remove-bot-blue').addEventListener('click', () => socket.emit('removeBot', 'Blue'));

function startGame() {
    roomLobbyContainer.style.display = 'none';
    gameContainer.style.display = 'block';
    initInput(socket);
    if(typeof initVoiceChat === 'function') initVoiceChat();
}

socket.on('gameState', (state) => {
    window.latestGameState = state;
    if (myTeam && typeof renderGame === 'function') {
        renderGame(state, socket.id);
    }
});

socket.on('sandboxSync', (data) => {
    window.dynamicSandboxData = data;
});

// Editor Toggle
openMapEditorBtn.addEventListener('click', () => {
    // Only host can do this
    window.isEditingMap = true;
    mapEditorToolbar.style.display = 'block';
    startGame(); // Jump into the game canvas directly as observer/editor
});

btnCloseEditor.addEventListener('click', () => {
    window.isEditingMap = false;
    mapEditorToolbar.style.display = 'none';
    // Back to lobby?
    gameContainer.style.display = 'none';
    roomLobbyContainer.style.display = 'flex';
});

// Setup map tools global
window.currentEditorTool = 'wall';
document.querySelectorAll('.editor-tool').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.editor-tool').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        window.currentEditorTool = e.target.getAttribute('data-tool');
    });
});

// Load saved local layout logic mockup
btnSaveLayout.addEventListener('click', () => {
    if(window.dynamicSandboxData) {
        localStorage.setItem('player_layout_1', JSON.stringify(window.dynamicSandboxData));
        alert("Layout saved to local storage! (Slot 1)");
    }
});


// VOICE UI LOGIC
const voiceModal = document.getElementById('voice-settings-modal');
const voiceSettingsBtn = document.getElementById('voice-settings-btn');
const closeVoiceModalBtn = document.getElementById('close-voice-settings');
const masterVolumeSlider = document.getElementById('master-volume');
const volDisplay = document.getElementById('vol-display');
const muteMicCheck = document.getElementById('mute-mic');
const pttEnableCheck = document.getElementById('ptt-enable');
const voicePlayerList = document.getElementById('voice-player-list');

voiceSettingsBtn.addEventListener('click', () => {
    voiceModal.style.display = 'block';
    populateVoicePlayers();
});

closeVoiceModalBtn.addEventListener('click', () => { voiceModal.style.display = 'none'; });

masterVolumeSlider.addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    if(window.voiceSettings) window.voiceSettings.globalVolume = vol;
    volDisplay.innerText = Math.round(vol * 100) + '%';
});

muteMicCheck.addEventListener('change', (e) => {
    if(window.voiceSettings) window.voiceSettings.micMuted = e.target.checked;
    if(window.updateLocalMicState) window.updateLocalMicState();
});

pttEnableCheck.addEventListener('change', (e) => {
    if(window.voiceSettings) window.voiceSettings.pttEnabled = e.target.checked;
    if(window.updateLocalMicState) window.updateLocalMicState();
});

window.latestGameState = null;

function populateVoicePlayers() {
    voicePlayerList.innerHTML = '';
    if (!window.latestGameState || !window.latestGameState.players) return;
    
    const players = window.latestGameState.players;
    let count = 0;
    
    for (const id in players) {
        if (id === socket.id) continue;
        if (id.startsWith('bot_')) continue;
        
        count++;
        const p = players[id];
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.marginBottom = '5px';
        
        const nameSpan = document.createElement('span');
        nameSpan.innerText = p.name || id.substring(0,4);
        nameSpan.style.color = p.team === 'Red' ? '#e74c3c' : '#3498db';
        
        const muteLabel = document.createElement('label');
        muteLabel.style.cursor = 'pointer';
        muteLabel.style.fontSize = '12px';
        
        const muteMCheckbox = document.createElement('input');
        muteMCheckbox.type = 'checkbox';
        muteMCheckbox.checked = !!(window.voiceSettings && window.voiceSettings.mutedPlayers[id]);
        muteMCheckbox.addEventListener('change', (e) => {
            if(window.voiceSettings) window.voiceSettings.mutedPlayers[id] = e.target.checked;
        });
        
        muteLabel.appendChild(muteMCheckbox);
        muteLabel.appendChild(document.createTextNode(' Sustur'));
        
        row.appendChild(nameSpan);
        row.appendChild(muteLabel);
        voicePlayerList.appendChild(row);
    }
    
    if (count === 0) voicePlayerList.innerHTML = '<span style="color:#7f8c8d; font-size:12px;">Henüz başka oyuncu yok.</span>';
}
