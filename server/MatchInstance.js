const Config = require('../shared/Config');
const Physics = require('../shared/Physics');
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
        this.isGameOver = false;
        this.paused = false;
        this.teamScores = { Red: 0, Blue: 0 };
        
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
            score: 0,
            shieldTime: Config.SHIELD_DURATION,
            input: { w:false, a:false, s:false, d:false, fire:false }
        };
    }

    handlePlayerInput(socketId, input) {
        if (this.players[socketId]) {
            this.players[socketId].input = { ...this.players[socketId].input, ...input };
            if (input.angle !== undefined) this.players[socketId].angle = input.angle;
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
            score: 0,
            shieldTime: Config.SHIELD_DURATION,
            input: { w:false, a:false, s:false, d:false, fire:false }
        };
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

    update() {
        if (this.paused || this.isGameOver) {
            if (this.paused) this.io.to(this.roomId).emit('gamePaused', true);
            return;
        }

        // 1. Logic Timer
        this.frameCounter++;
        if (this.frameCounter >= 60) {
            this.timeRemaining--;
            this.frameCounter = 0;
            this.checkWinConditions();
        }

        // 2. Entity Updates
        for (let id in this.players) {
            const p = this.players[id];
            if (p.isDead) continue;

            if (p.isBot) this.ai.update(id, p);

            this.handlePlayerMovement(p);
            this.handlePlayerCombat(id, p);
        }

        // 3. Bullet Updates
        this.updateBullets();

        // 4. State Broadcast (Engine 2.0 Optimized)
        this.io.to(this.roomId).emit('gameState', {
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
        if (p.input.w) dy -= Config.TANK_SPEED;
        if (p.input.s) dy += Config.TANK_SPEED;
        if (p.input.a) dx -= Config.TANK_SPEED;
        if (p.input.d) dx += Config.TANK_SPEED;

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
            // Simplified reloading for server logic
            if (!p.lastFire || Date.now() - p.lastFire > 750) {
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
        if (this.players[killerId]) {
            this.players[killerId].score++;
            this.teamScores[this.players[killerId].team]++;
            this.checkWinConditions();
        }
        
        setTimeout(() => {
            if (this.players[victimId]) {
                const s = this.getSpawn(victim.team);
                victim.x = s.x; victim.y = s.y;
                victim.health = Config.MAX_HEALTH;
                victim.isDead = false;
                victim.shieldTime = Config.SHIELD_DURATION;
            }
        }, 3000);
    }

    checkWinConditions() {
        if (this.isGameOver) return;
        let winner = null;
        if (this.teamScores.Red >= this.killLimit) winner = 'Red';
        if (this.teamScores.Blue >= this.killLimit) winner = 'Blue';
        if (this.timeRemaining <= 0) winner = this.teamScores.Red > this.teamScores.Blue ? 'Red' : 'Blue';

        if (winner) {
            this.isGameOver = true;
            this.io.to(this.roomId).emit('gameOver', { winner, scores: this.teamScores });
        }
    }
}

module.exports = MatchInstance;
