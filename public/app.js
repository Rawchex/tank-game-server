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

function startGame() {
    lobbyContainer.style.display = 'none';
    gameContainer.style.display = 'flex';
    initInput(socket);
    initVoiceChat();
}

socket.on('gameState', (state) => {
    if (myTeam) {
        renderGame(state, socket.id);
    }
});
