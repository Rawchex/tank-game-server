const Config = require('../public/shared/Config');
const Physics = require('../public/shared/Physics');
const AIController = require('./AIController');
const mapData = require('../map');

/**
 * Tank Engine 2.0 - Match Instance
 * Handles the server-side authoritative physics and game state for a single room.
 */
class MatchInstance {
    constructor(io, roomId, roomData) {
        this.io = io;
        this.roomId = roomId;
        this.roomData = roomData;
        
        this.players = {};
        this.bullets = [];
        this.explosions = [];
        
        // Settings from room
        const settings = roomData.settings || {};
        this.killLimit = settings.killLimit || 15;
        this.timeRemaining = (settings.timeLimit || 5) * 60;
        this.botDiff = settings.botDiff || 'medium';
        this.maxRounds = settings.maxRounds || 3;
        
        // State Machine & Rounds
        this.matchState = 'LOBBY'; // LOBBY -> STARTING -> PLAYING -> ROUND_END -> MATCH_OVER
        this.countdown = 0;
        this.currentRound = 1;
        this.roundWins = { Red: 0, Blue: 0 };
        this.teamScores = { Red: 0, Blue: 0 }; // Current round score
        
        // Map Logic (Unified Sandbox + Static)
        this.dynamicMap = settings.layout || { 
            theme: 'grass', walls: [], crates: [], bushes: [], tires: [], 
            barrels: [], speedPads: [], spawns: [] 
        };

        this.ai = new AIController(this);
        this.frameCounter = 0;
        
        // Professional fixed timestep loop
        this.loop = setInterval(() => this.update(), 1000 / 60);
    }

    destroy() {
        clearInterval(this.loop);
    }

    addPlayer(socketId, pData) {
        const spawn = this.getSpawn(pData.team);
        this.players[socketId] = {
            id: socketId,
            name: pData.name || `Player_${socketId.substring(0, 4)}`,
            team: pData.team,
            x: spawn.x, y: spawn.y,
            health: Config.MAX_HEALTH,
            width: 30, height: 30,
            angle: 0,
            isDead: false,
            score: 0, kills: 0, deaths: 0, assists: 0,
            shieldTime: Config.SHIELD_DURATION,
            input: { w:false, a:false, s:false, d:false, fire:false }
        };
    }

    removePlayer(socketId) {
        if (this.players[socketId]) {
            delete this.players[socketId];
        }
    }

    handlePlayerInput(socketId, input) {
        if (this.players[socketId]) {
            // Merge regular movement/fire
            this.players[socketId].input = { ...this.players[socketId].input, ...input };
            if (input.angle !== undefined) this.players[socketId].angle = input.angle;
            
            // Skill trigger (One-time event)
            if (input.skill) {
                this.handleSkill(socketId, input.skill);
            }
        }
    }

    handleSkill(socketId, skill) {
        const p = this.players[socketId];
        if (!p || p.isDead) return;

        switch(skill) {
            case 'z': // HEAL
                p.health = Math.min(Config.MAX_HEALTH, p.health + 25);
                break;
            case 'x': // SPEED
                p.speedBoostTime = 180; // 3 seconds at 60fps
                break;
            case 'c': // RAPID FIRE
                p.rapidFireTime = 180;
                break;
        }
    }

    handleSandboxPlace(type, x, y) {
        // Simple sizing based on type
        let width = 40, height = 40;
        let category = 'walls';

        switch(type) {
            case 'wall': width = 100; height = 40; category = 'walls'; break;
            case 'crate': width = 40; height = 40; category = 'crates'; break;
            case 'barrel': width = 30; height = 30; category = 'barrels'; break;
            case 'redSpawn': width = 40; height = 40; category = 'spawns'; break;
            case 'blueSpawn': width = 40; height = 40; category = 'spawns'; break;
            case 'bushes': width = 60; height = 60; category = 'bushes'; break;
            case 'speedPad': width = 50; height = 50; category = 'speedPads'; break;
        }

        const obj = { x, y, width, height, type };
        if (!this.dynamicMap[category]) this.dynamicMap[category] = [];
        this.dynamicMap[category].push(obj);
        
        this.io.to(this.roomId).emit('sandboxSync', this.dynamicMap);
    }

    addBot(team) {
        const botId = `bot_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        const spawn = this.getSpawn(team);
        this.players[botId] = {
            id: botId,
            name: `AI_${team[0]}${Math.floor(Math.random()*99)}`,
            team: team,
            isBot: true,
            x: spawn.x, y: spawn.y,
            health: Config.MAX_HEALTH,
            width: 30, height: 30,
            angle: 0,
            isDead: false,
            score: 0, kills: 0, deaths: 0, assists: 0,
            shieldTime: Config.SHIELD_DURATION,
            input: { w:false, a:false, s:false, d:false, fire:false }
        };
    }

    removeBot(team) {
        const botId = Object.keys(this.players).find(id => id.startsWith('bot_') && this.players[id].team === team);
        if (botId) delete this.players[botId];
    }

    getSpawn(team) {
        // Shared logic with Sandbox spawns
        const custom = (this.dynamicMap.spawns || []).filter(s => s.type === (team === 'Red' ? 'redSpawn' : 'blueSpawn'));
        if (custom.length > 0) {
            const s = custom[Math.floor(Math.random() * custom.length)];
            return { x: s.x + s.width/2, y: s.y + s.height/2 };
        }
        // Fallback to static map
        const fallback = mapData.spawns[team][0];
        return { x: fallback.x, y: fallback.y };
    }

    startMatch() {
        if (this.matchState !== 'LOBBY') return;
        this.matchState = 'STARTING';
        this.countdown = 3;
    }

    startRound() {
        this.matchState = 'PLAYING';
        this.teamScores = { Red: 0, Blue: 0 };
        this.timeRemaining = (this.roomData.settings.timeLimit || 5) * 60;
        this.bullets = [];
        this.explosions = [];
        
        // Reset players to spawns
        for (let id in this.players) {
            const p = this.players[id];
            const spawn = this.getSpawn(p.team);
            p.x = spawn.x; p.y = spawn.y;
            p.health = Config.MAX_HEALTH;
            p.isDead = false;
            p.shieldTime = Config.SHIELD_DURATION;
            p.input = { w:false, a:false, s:false, d:false, fire:false };
        }
    }

    update() {
        if (this.paused) {
            this.io.to(this.roomId).emit('gamePaused', true);
            return;
        }

        // 1. Logic Timer
        this.frameCounter++;
        if (this.frameCounter >= 60) {
            this.frameCounter = 0;
            
            if (this.matchState === 'STARTING') {
                this.countdown--;
                if (this.countdown <= 0) this.startRound();
            } else if (this.matchState === 'ROUND_END') {
                this.countdown--;
                if (this.countdown <= 0) {
                    // Check if match over
                    const requiredWins = Math.ceil(this.maxRounds / 2);
                    if (this.roundWins.Red >= requiredWins || this.roundWins.Blue >= requiredWins) {
                        this.endMatch();
                    } else {
                        this.currentRound++;
                        this.matchState = 'STARTING';
                        this.countdown = 3;
                    }
                }
            } else if (this.matchState === 'PLAYING') {
                this.timeRemaining--;
                this.checkWinConditions();
            }
        }

        // 2. Entity Updates (Only if Playing)
        if (this.matchState === 'PLAYING') {
            for (let id in this.players) {
                const p = this.players[id];
                if (p.isDead) continue;

                if (p.isBot) this.ai.update(id, p);

                // Handle temporary effects
                if (p.speedBoostTime > 0) p.speedBoostTime--;
                if (p.rapidFireTime > 0) p.rapidFireTime--;
                if (p.shieldTime > 0) p.shieldTime--;

                this.handlePlayerMovement(p);
                this.handlePlayerCombat(id, p);
            }

            // 3. Bullet Updates
            this.updateBullets();
        }

        // 4. State Broadcast
        this.io.to(this.roomId).emit('gameState', {
            matchState: this.matchState,
            countdown: this.countdown,
            currentRound: this.currentRound,
            roundWins: this.roundWins,
            players: this.players,
            bullets: this.bullets.map(b => ({ x: b.x, y: b.y, radius: b.radius, team: b.team })),
            explosions: this.explosions,
            matchTime: this.timeRemaining,
            teamScores: this.teamScores,
            sandboxMap: this.dynamicMap
        });
        this.explosions = [];
    }

    handlePlayerMovement(p) {
        let dx = 0, dy = 0;
        const speed = p.speedBoostTime > 0 ? Config.TANK_SPEED * 1.5 : Config.TANK_SPEED;
        
        if (p.input.w) dy -= speed;
        if (p.input.s) dy += speed;
        if (p.input.a) dx -= speed;
        if (p.input.d) dx += speed;

        if (dx !== 0 || dy !== 0) {
            const nextX = p.x + dx;
            const nextY = p.y + dy;

            // Collision checks against walls and crates
            const collidables = [...mapData.walls, ...this.dynamicMap.walls, ...this.dynamicMap.crates];
            let canX = true, canY = true;

            for (let prop of collidables) {
                if (Physics.checkRectCollision({x: nextX - p.width/2, y: p.y - p.height/2, width: p.width, height: p.height}, prop)) canX = false;
                if (Physics.checkRectCollision({x: p.x - p.width/2, y: nextY - p.height/2, width: p.width, height: p.height}, prop)) canY = false;
            }

            // Map Bounds
            if (nextX < 15 || nextX > Config.MAP_WIDTH - 15) canX = false;
            if (nextY < 15 || nextY > Config.MAP_HEIGHT - 15) canY = false;

            if (canX) p.x = nextX;
            if (canY) p.y = nextY;
            
            // Auto-angle for bots/key movement
            if (!p.isBot) {
                // p.angle is usually updated by mouse on client, but we can sync here
            }
        }

        if (p.shieldTime > 0) p.shieldTime--;
    }

    handlePlayerCombat(id, p) {
        if (p.input.fire && !p.isDead) {
            const reload = p.rapidFireTime > 0 ? Config.RELOAD_TIME / 2 : Config.RELOAD_TIME;
            const msReload = (reload / 60) * 1000;
            
            if (!p.lastFire || Date.now() - p.lastFire > msReload) {
                this.bullets.push({
                    x: p.x, y: p.y,
                    vx: Math.cos(p.angle) * Config.BULLET_SPEED,
                    vy: Math.sin(p.angle) * Config.BULLET_SPEED,
                    team: p.team,
                    owner: id,
                    radius: 5,
                    life: 100
                });
                p.lastFire = Date.now();
            }
        }
    }

    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;

            let hit = false;

            // Wall Collisions
            const collidables = [...mapData.walls, ...this.dynamicMap.walls, ...this.dynamicMap.crates, ...this.dynamicMap.barrels];
            for (let prop of collidables) {
                if (Physics.checkCircleRectCollision(b, prop)) {
                    hit = true;
                    // Destructible crates
                    if (this.dynamicMap.crates.includes(prop)) {
                        this.dynamicMap.crates = this.dynamicMap.crates.filter(c => c !== prop);
                        this.io.to(this.roomId).emit('sandboxSync', this.dynamicMap);
                    }
                    break;
                }
            }

            // Player Collisions
            if (!hit) {
                for (let pid in this.players) {
                    const p = this.players[pid];
                    if (p.isDead || p.team === b.team || p.shieldTime > 0) continue;
                    if (Physics.checkCircleRectCollision(b, {x: p.x - p.width/2, y: p.y - p.height/2, width: p.width, height: p.height})) {
                        p.health -= Config.BULLET_DAMAGE;
                        hit = true;
                        if (p.health <= 0) this.handleKill(b.owner, pid);
                        break;
                    }
                }
            }

            if (hit || b.life <= 0 || b.x < 0 || b.x > Config.MAP_WIDTH || b.y < 0 || b.y > Config.MAP_HEIGHT) {
                this.explosions.push({ x: b.x, y: b.y, color: '#e74c3c' });
                this.bullets.splice(i, 1);
            }
        }
    }

    handleKill(killerId, victimId) {
        const victim = this.players[victimId];
        victim.isDead = true;
        victim.deaths++;
        if (this.players[killerId]) {
            this.players[killerId].score += 100;
            this.players[killerId].kills++;
            this.teamScores[this.players[killerId].team]++;
            this.checkWinConditions();
        }
        
        // Only respawn if match is still playing (not round end)
        if (this.matchState === 'PLAYING') {
            setTimeout(() => {
                if (this.players[victimId] && this.matchState === 'PLAYING') {
                    const s = this.getSpawn(victim.team);
                    victim.x = s.x; victim.y = s.y;
                    victim.health = Config.MAX_HEALTH;
                    victim.isDead = false;
                    victim.shieldTime = Config.SHIELD_DURATION;
                }
            }, 3000);
        }
    }

    checkWinConditions() {
        if (this.matchState !== 'PLAYING') return;
        
        let endRound = false;
        let roundWinner = null;
        
        if (this.teamScores.Red >= this.killLimit) { endRound = true; roundWinner = 'Red'; }
        else if (this.teamScores.Blue >= this.killLimit) { endRound = true; roundWinner = 'Blue'; }
        else if (this.timeRemaining <= 0) {
            endRound = true;
            roundWinner = this.teamScores.Red > this.teamScores.Blue ? 'Red' : (this.teamScores.Blue > this.teamScores.Red ? 'Blue' : 'Draw');
        }

        if (endRound) {
            this.matchState = 'ROUND_END';
            this.countdown = 5; // 5 seconds inter-round delay
            if (roundWinner === 'Red') this.roundWins.Red++;
            if (roundWinner === 'Blue') this.roundWins.Blue++;
        }
    }

    endMatch() {
        this.matchState = 'MATCH_OVER';
        let matchWinner = this.roundWins.Red > this.roundWins.Blue ? 'Red' : 'Blue';
        if (this.roundWins.Red === this.roundWins.Blue) matchWinner = 'Draw';
        this.io.to(this.roomId).emit('gameOver', { winner: matchWinner, finalScores: this.roundWins, players: this.players });
    }
}

module.exports = MatchInstance;
