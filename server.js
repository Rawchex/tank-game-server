const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const db = require('./database');
const RoomManager = require('./roomManager');
const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // İlk açılışta odaları yolla
    socket.emit('roomsList', roomManager.getRoomsList());

    socket.on('auth', (data) => {
        let res;
        if (data.type === 'register') {
            // Basit captcha kontrolü sunucuda da teyit edilebilir
            // Fakat oyun basit olduğu için client gönderiyor
            if (parseInt(data.captchaAns) !== data.expectedCaptcha) {
                return socket.emit('authResponse', { success: false, msg: "Matematik işleminin sonucu hatalı!" });
            }
            res = db.register(data.username, data.password);
        } else {
            res = db.login(data.username, data.password);
        }
        socket.emit('authResponse', res);
    });

    socket.on('saveLayout', (data) => {
        if (db.saveLayout(data.username, data.name, data.layout)) {
            socket.emit('userDataUpdate', db.getUserData(data.username));
        }
    });

    socket.on('deleteLayout', (data) => {
        if (db.deleteLayout(data.username, data.layoutId)) {
            socket.emit('userDataUpdate', db.getUserData(data.username));
        }
    });

    socket.on('getRooms', () => {
        socket.emit('roomsList', roomManager.getRoomsList());
    });

    socket.on('createRoom', (data) => {
        const roomId = roomManager.createRoom(socket, data.roomName, data.settings, data.playerName);
        socket.emit('roomJoined', roomId);
        io.emit('roomsList', roomManager.getRoomsList()); // Update all lobby lists
    });

    socket.on('joinRoom', (data) => {
        const success = roomManager.joinRoom(socket, data.roomId, data.playerName);
        if (success) {
            socket.emit('roomJoined', data.roomId);
            io.emit('roomsList', roomManager.getRoomsList());
        } else {
            socket.emit('errorMsg', 'Room not found or full.');
        }
    });

    socket.on('leaveRoom', () => {
        roomManager.leaveRoom(socket);
        socket.emit('roomLeft');
        io.emit('roomsList', roomManager.getRoomsList());
    });

    socket.on('joinTeam', (data) => {
        roomManager.joinTeam(socket, data.team, data.name);
    });

    socket.on('kickPlayer', (targetId) => {
        roomManager.kickPlayer(socket, targetId);
    });

    // Oyun İçi Eylemler (Engine 2.0)
    socket.on('playerInput', (data) => {
        const game = roomManager.getGame(socket);
        if (game) game.handlePlayerInput(socket.id, data);
    });

    socket.on('sandbox-place', (data) => {
        const game = roomManager.getGame(socket);
        const roomId = roomManager.getRoomId(socket);
        const room = roomManager.rooms[roomId];
        if (game && room && room.hostId === socket.id) {
            game.handleSandboxPlace(data.type, data.x, data.y);
        }
    });

    socket.on('addBot', (team) => {
        roomManager.addBot(socket, team);
    });

    socket.on('adminAction', (data) => {
        const roomId = roomManager.getRoomId(socket);
        const room = roomManager.rooms[roomId];
        if (room && room.hostId === socket.id && room.game) {
            if (data.action === 'togglePause') {
                room.game.paused = !room.game.paused;
                io.to(roomId).emit('gamePaused', room.game.paused);
            } else if (data.action === 'clearBots') {
                for (let pid in room.game.players) {
                    if (room.game.players[pid].isBot) room.game.removePlayer(pid);
                }
                roomManager.broadcastLobbyState(roomId);
            } else if (data.action === 'reset') {
                room.game.timeRemaining = 180; // or setting
                room.game.teamScores = { Red: 0, Blue: 0 };
                room.game.bullets = [];
                room.game.paused = false;
                io.to(roomId).emit('gamePaused', false);
            } else if (data.action === 'startMatch') {
                room.game.startMatch();
            }
        }
    });

    socket.on('removeBot', (team) => {
        roomManager.removeBot(socket, team);
    });

    socket.on('sandbox-update', (dynamicMap) => {
        const game = roomManager.getGame(socket);
        const roomId = roomManager.getRoomId(socket);
        if (game && roomManager.rooms[roomId] && roomManager.rooms[roomId].hostId === socket.id) {
            game.dynamicMap = dynamicMap;
            // Trigger an immediate sync for clients
            io.to(roomId).emit('sandboxSync', dynamicMap);
        }
    });

    socket.on('chatMessage', (data) => {
        const roomId = roomManager.getRoomId(socket);
        if (!roomId || !roomManager.rooms[roomId]) return;
        
        const player = roomManager.rooms[roomId].players[socket.id];
        if (!player) return;

        if (data.type === 'team') {
            if (!player.team) return;
            io.to(roomId).emit('chatMessage', {
                from: player.name,
                team: player.team,
                msg: data.msg,
                type: 'team'
            });
        } else {
            io.to(roomId).emit('chatMessage', {
                from: player.name,
                team: player.team,
                msg: data.msg,
                type: 'all'
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        roomManager.leaveRoom(socket);
        io.emit('roomsList', roomManager.getRoomsList());
        
        // Notify others to remove voice connection
        socket.broadcast.emit('voice-user-left', socket.id);
    });

    socket.on('voice-join', () => {
        const roomId = roomManager.getRoomId(socket);
        const room = roomManager.rooms[roomId];
        if (room) {
            const player = room.players[socket.id];
            if (player && player.team) {
                // Only send voice connection invites to players on the same team
                Object.keys(room.players).forEach(otherId => {
                    if (otherId !== socket.id && !room.players[otherId].isBot && room.players[otherId].team === player.team) {
                        io.to(otherId).emit('voice-user-joined', socket.id);
                    }
                });
            }
        }
    });

    socket.on('voice-signal', (data) => {
        // data.to: Sinyalin gideceği hedef socket.id
        // data.signal: WebRTC sinyali (offer, answer, ice candidate)
        io.to(data.to).emit('voice-signal', {
            from: socket.id,
            signal: data.signal
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
