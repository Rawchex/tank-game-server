const socket = io();

const lobbyContainer = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-container');
const joinRedBtn = document.getElementById('join-red');
const joinBlueBtn = document.getElementById('join-blue');
const addBotRedBtn = document.getElementById('add-bot-red');
const addBotBlueBtn = document.getElementById('add-bot-blue');
const removeBotRedBtn = document.getElementById('remove-bot-red');
const removeBotBlueBtn = document.getElementById('remove-bot-blue');
const redPlayers = document.getElementById('red-players');
const bluePlayers = document.getElementById('blue-players');
const playerNameInput = document.getElementById('player-name');

socket.on('lobbyState', (players) => {
    redPlayers.innerHTML = '';
    bluePlayers.innerHTML = '';

    for (let id in players) {
        let p = players[id];
        let li = document.createElement('li');
        let displayName = p.name || `Player ${id.substring(0, 4)}`;
        li.innerText = id === socket.id ? `${displayName} (You)` : displayName;

        if (p.team === 'Red') {
            redPlayers.appendChild(li);
        } else if (p.team === 'Blue') {
            bluePlayers.appendChild(li);
        }
    }
});

let myTeam = null;

joinRedBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || `Player_${Math.floor(Math.random() * 1000)}`;
    socket.emit('joinTeam', { team: 'Red', name: name });
    myTeam = 'Red';
    startGame();
});

joinBlueBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || `Player_${Math.floor(Math.random() * 1000)}`;
    socket.emit('joinTeam', { team: 'Blue', name: name });
    myTeam = 'Blue';
    startGame();
});

addBotRedBtn.addEventListener('click', () => {
    socket.emit('addBot', 'Red');
});

addBotBlueBtn.addEventListener('click', () => {
    socket.emit('addBot', 'Blue');
});

removeBotRedBtn.addEventListener('click', () => {
    socket.emit('removeBot', 'Red');
});

removeBotBlueBtn.addEventListener('click', () => {
    socket.emit('removeBot', 'Blue');
});

// Ses Ayarları UI Bağlantıları
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

closeVoiceModalBtn.addEventListener('click', () => {
    voiceModal.style.display = 'none';
});

masterVolumeSlider.addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    window.voiceSettings.globalVolume = vol;
    volDisplay.innerText = Math.round(vol * 100) + '%';
});

muteMicCheck.addEventListener('change', (e) => {
    window.voiceSettings.micMuted = e.target.checked;
    if(window.updateLocalMicState) window.updateLocalMicState();
});

pttEnableCheck.addEventListener('change', (e) => {
    window.voiceSettings.pttEnabled = e.target.checked;
    if(window.updateLocalMicState) window.updateLocalMicState();
});

window.latestGameState = null; // Oyuncu listesini tutmak için

function populateVoicePlayers() {
    voicePlayerList.innerHTML = '';
    if (!window.latestGameState || !window.latestGameState.players) return;
    
    const players = window.latestGameState.players;
    let count = 0;
    
    for (const id in players) {
        if (id === socket.id) continue; // Kendimizi susturma listesinde göstermeye gerek yok
        if (id.startsWith('bot_')) continue; // Botların zaten sesi yok
        
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
        muteMCheckbox.checked = !!window.voiceSettings.mutedPlayers[id];
        muteMCheckbox.addEventListener('change', (e) => {
            window.voiceSettings.mutedPlayers[id] = e.target.checked;
        });
        
        muteLabel.appendChild(muteMCheckbox);
        muteLabel.appendChild(document.createTextNode(' Sustur'));
        
        row.appendChild(nameSpan);
        row.appendChild(muteLabel);
        voicePlayerList.appendChild(row);
    }
    
    if (count === 0) {
        voicePlayerList.innerHTML = '<span style="color:#7f8c8d; font-size:12px;">Henüz başka oyuncu yok.</span>';
    }
}

function startGame() {
    lobbyContainer.style.display = 'none';
    gameContainer.style.display = 'flex';
    initInput(socket);
    initVoiceChat();
}

socket.on('gameState', (state) => {
    window.latestGameState = state; // Modal için saklıyoruz
    if (myTeam) {
        renderGame(state, socket.id);
    }
});
