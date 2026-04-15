const MatchInstance = require('./server/MatchInstance');

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
        
        // Initialize Engine 2.0 Match
        this.rooms[roomId].game = new MatchInstance(this.io, roomId, this.rooms[roomId]);
        
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
            // Enforce 5-member limit (Players + Bots)
            let currentCount = 0;
            const room = this.rooms[roomId];
            
            // Count humans in team
            Object.values(room.players).forEach(p => { if (p.team === team) currentCount++; });
            // Count bots in team
            if (room.game) {
                Object.values(room.game.players).forEach(p => { if (p.isBot && p.team === team) currentCount++; });
            }

            if (currentCount >= 5) {
                socket.emit('team_full', { team });
                return;
            }

            room.players[socket.id].team = team;
            room.players[socket.id].name = name;
            // Add to game
            if (room.game) {
                room.game.addPlayer(socket.id, room.players[socket.id]);
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
            const players = { ...this.rooms[roomId].players };
            // Include bots from the game instance in the lobby listing
            if (this.rooms[roomId].game && this.rooms[roomId].game.players) {
                for (let id in this.rooms[roomId].game.players) {
                    if (id.startsWith('bot_')) {
                        const bot = this.rooms[roomId].game.players[id];
                        players[id] = { 
                            name: bot.name, 
                            team: bot.team, 
                            isHost: false,
                            isBot: true 
                        };
                    }
                }
            }
            this.io.to(roomId).emit('lobbyState', players);
        }
    }
    
    // Admin Controls
    addBot(socket, team) {
        const roomId = this.playersToRoom[socket.id];
        if (roomId && this.rooms[roomId] && this.rooms[roomId].hostId === socket.id) {
            if (this.rooms[roomId].game) {
                // Enforce 5-member limit
                let currentCount = 0;
                Object.values(this.rooms[roomId].players).forEach(p => { if (p.team === team) currentCount++; });
                Object.values(this.rooms[roomId].game.players).forEach(p => { if (p.isBot && p.team === team) currentCount++; });

                if (currentCount >= 5) {
                    socket.emit('team_full', { team });
                    return;
                }

                this.rooms[roomId].game.addBot(team);
                this.broadcastLobbyState(roomId);
            }
        }
    }

    removeBot(socket, team) {
        const roomId = this.playersToRoom[socket.id];
        if (roomId && this.rooms[roomId] && this.rooms[roomId].hostId === socket.id) {
            if (this.rooms[roomId].game) {
                this.rooms[roomId].game.removeBot(team);
                this.broadcastLobbyState(roomId);
            }
        }
    }

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
