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
        if (db.saveLayout(data.username, data.slot, data.layout)) {
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

    // Oyun İçi Eylemler
    socket.on('input', (data) => {
        const game = roomManager.getGame(socket);
        if (game) game.handleInput(socket.id, data);
    });

    socket.on('shoot', (angle) => {
        const game = roomManager.getGame(socket);
        if (game) game.handleShoot(socket.id, angle);
    });

    socket.on('useSkill', (skill) => {
        const game = roomManager.getGame(socket);
        if (game) game.handleSkill(socket.id, skill);
    });

    socket.on('addBot', (team) => {
        roomManager.addBot(socket, team);
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

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        roomManager.leaveRoom(socket);
        io.emit('roomsList', roomManager.getRoomsList());
        
        // Notify others to remove voice connection
        socket.broadcast.emit('voice-user-left', socket.id);
    });

    // Sesli sohbet (Voice Chat) sinyalleri
    socket.on('voice-join', () => {
        // Sadece bulunduğumuz odadaki diğer kullanıcılara gitmeli
        const roomId = roomManager.getRoomId(socket);
        if (roomId) {
            socket.to(roomId).emit('voice-user-joined', socket.id);
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
