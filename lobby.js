class Lobby {
    constructor() {
        this.players = {}; // { socketId: { team: null, ready: false } }
    }

    addPlayer(socket) {
        this.players[socket.id] = { team: null, ready: false };
    }

    removePlayer(socketId) {
        delete this.players[socketId];
    }

    joinTeam(socket, team, name) {
        if (this.players[socket.id]) {
            this.players[socket.id].team = team;
            this.players[socket.id].name = name;
        }
    }

    broadcastState(io) {
        io.emit('lobbyState', this.players);
    }
}

module.exports = Lobby;
