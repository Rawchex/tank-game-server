const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const Lobby = require('./lobby');
const Game = require('./game');

const lobby = new Lobby();
const game = new Game(io, lobby);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Lobi işlemleri
    lobby.addPlayer(socket);
    lobby.broadcastState(io);

    socket.on('joinTeam', (data) => {
        const team = data.team;
        const name = data.name;
        lobby.joinTeam(socket, team, name);
        lobby.broadcastState(io);

        // Eğer lobi hazırsa (örn. oyun başlamalıysa) oyunu başlatabiliriz.
        // Şimdilik oyuncular takıma katıldıklarında direkt oyuna dahil ediyoruz.
        game.addPlayer(socket, lobby.players[socket.id]);
    });

    // Oyun içi (Input) eylemler
    socket.on('input', (data) => {
        game.handleInput(socket.id, data);
    });

    // Ateş etme (Mouse tıklama veya boşluk)
    socket.on('shoot', (angle) => {
        game.handleShoot(socket.id, angle);
    });

    socket.on('useSkill', (skill) => {
        game.handleSkill(socket.id, skill);
    });

    socket.on('addBot', (team) => {
        game.addBot(team);
    });

    socket.on('removeBot', (team) => {
        game.removeBot(team);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        game.removePlayer(socket.id);
        lobby.removePlayer(socket.id);
        lobby.broadcastState(io);
        
        // Notify others to remove voice connection
        socket.broadcast.emit('voice-user-left', socket.id);
    });

    // Sesli sohbet (Voice Chat) sinyalleri
    socket.on('voice-join', () => {
        // Mevcut diğer oyunculara yeni birinin sesli sohbete katıldığını bildir
        socket.broadcast.emit('voice-user-joined', socket.id);
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
