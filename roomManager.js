const Game = require('./game');

class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = {}; // roomId -> Room details
        this.playersToRoom = {}; // socketId -> roomId
    }

    createRoom(socket, roomName, settings, playerName) {
        const roomId = 'room_' + Math.random().toString(36).substr(2, 9);
        this.rooms[roomId] = {
            id: roomId,
            name: roomName || `${playerName}'s Room`,
            hostId: socket.id,
            settings: settings || {},
            players: {},
            game: null
        };
        
        socket.join(roomId);
        this.playersToRoom[socket.id] = roomId;
        this.rooms[roomId].players[socket.id] = { team: null, isHost: true, name: playerName };
        
        // Initialize Game
        this.rooms[roomId].game = new Game(this.io, roomId, this.rooms[roomId]);
        
        return roomId;
    }

    joinRoom(socket, roomId, playerName) {
        if (!this.rooms[roomId]) return false;
        
        socket.join(roomId);
        this.playersToRoom[socket.id] = roomId;
        this.rooms[roomId].players[socket.id] = { team: null, isHost: false, name: playerName };
        this.broadcastLobbyState(roomId);
        return true;
    }

    leaveRoom(socket) {
        const roomId = this.playersToRoom[socket.id];
        if (roomId && this.rooms[roomId]) {
            delete this.rooms[roomId].players[socket.id];
            if (this.rooms[roomId].game) {
                this.rooms[roomId].game.removePlayer(socket.id);
            }
            socket.leave(roomId);
            delete this.playersToRoom[socket.id];

            // If empty, delete room
            if (Object.keys(this.rooms[roomId].players).length === 0) {
                if (this.rooms[roomId].game) this.rooms[roomId].game.destroy();
                delete this.rooms[roomId];
            } else if (this.rooms[roomId].hostId === socket.id) {
                // reassign host
                this.rooms[roomId].hostId = Object.keys(this.rooms[roomId].players)[0];
                this.rooms[roomId].players[this.rooms[roomId].hostId].isHost = true;
                this.broadcastLobbyState(roomId);
            } else {
                this.broadcastLobbyState(roomId);
            }
            
            // Voice disconnect for room
            socket.to(roomId).emit('voice-user-left', socket.id);
        }
    }

    joinTeam(socket, team, name) {
        const roomId = this.playersToRoom[socket.id];
        if (roomId && this.rooms[roomId]) {
            this.rooms[roomId].players[socket.id].team = team;
            this.rooms[roomId].players[socket.id].name = name;
            // Add to game
            if (this.rooms[roomId].game) {
                this.rooms[roomId].game.addPlayer(socket, this.rooms[roomId].players[socket.id]);
            }
            this.broadcastLobbyState(roomId);
        }
    }

    getGame(socket) {
        const roomId = this.playersToRoom[socket.id];
        if (roomId && this.rooms[roomId]) return this.rooms[roomId].game;
        return null;
    }

    getRoomId(socket) {
        return this.playersToRoom[socket.id];
    }
    
    getRoomsList() {
        return Object.values(this.rooms).map(r => ({
            id: r.id,
            name: r.name,
            hostId: r.hostId,
            mode: r.settings.mode || 'classic',
            playerCount: Object.keys(r.players).length
        }));
    }

    broadcastLobbyState(roomId) {
        if (this.rooms[roomId]) {
            this.io.to(roomId).emit('lobbyState', this.rooms[roomId].players);
        }
    }
    
    // Admin Controls
    kickPlayer(socket, targetId) {
        const roomId = this.playersToRoom[socket.id];
        if (roomId && this.rooms[roomId] && this.rooms[roomId].hostId === socket.id) {
            // Target is in this room?
            if (this.rooms[roomId].players[targetId]) {
                const targetSocket = this.io.sockets.sockets.get(targetId);
                if (targetSocket) {
                    targetSocket.emit('kicked_from_room');
                    this.leaveRoom(targetSocket);
                }
            }
        }
    }
}
module.exports = RoomManager;
