const map = require('./map');

class Game {
    constructor(io, roomId, roomData) {
        this.io = io;
        this.roomId = roomId;
        this.roomData = roomData;
        this.players = {};
        this.bullets = [];
        this.explosions = [];
        this.FPS = 60;

        // Match Settings
        this.killLimit = (roomData && roomData.settings && roomData.settings.killLimit) || 15;
        this.timeRemaining = (roomData && roomData.settings && roomData.settings.timeLimit ? roomData.settings.timeLimit : 5) * 60; // seconds
        this.isGameOver = false;
        this.winner = null;

        // Custom map support
        this.dynamicMap = (roomData && roomData.settings && roomData.settings.layout) || { 
            theme: 'grass',
            walls: [], crates: [], bushes: [], tires: [],
            barrels: [], speedPads: [], spawns: []
        };

        this.teamScores = { Red: 0, Blue: 0 };
        this.frameCounter = 0; // To track seconds
        this.botDiff = (roomData && roomData.settings && roomData.settings.botDiff) || 'medium';

        // Start game loop
        this.loopInterval = setInterval(() => this.update(), 1000 / this.FPS);
    }

    getSpawnPos(team) {
        if (this.dynamicMap && this.dynamicMap.spawns) {
            const teamSpawns = this.dynamicMap.spawns.filter(s => s.type === team);
            if (teamSpawns.length > 0) {
                const s = teamSpawns[Math.floor(Math.random() * teamSpawns.length)];
                return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
            }
        }
        const defaultSpawns = map.spawns[team] || map.spawns.Red || [{x: 100, y: 100}];
        const s = defaultSpawns[Math.floor(Math.random() * defaultSpawns.length)];
        return { x: s.x, y: s.y };
    }

    destroy() {
        clearInterval(this.loopInterval);
    }

    addPlayer(socket, lobbyPlayer) {
        if (!lobbyPlayer || !lobbyPlayer.team) return;

        const spawnPos = this.getSpawnPos(lobbyPlayer.team);

        this.players[socket.id] = {
            x: spawnPos.x,
            y: spawnPos.y,
            team: lobbyPlayer.team,
            name: lobbyPlayer.name || `Player_${socket.id.substring(0, 4)}`,
            health: 100,
            width: 30,
            height: 30,
            speed: 4,
            isDead: false,
            score: 0,
            cooldown: 0,
            isHealing: false,
            isSpeedBoosted: false,
            speedBoostTimer: 0,
            hasRapidFire: false,
            rapidFireTimer: 0,
            input: { w: false, a: false, s: false, d: false },
            killedBy: null
        };
    }

    addBot(team) {
        if (!team) return;
        const spawnPos = this.getSpawnPos(team);
        const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        let speedMult = 1;
        if (this.botDiff === 'easy') speedMult = 0.7;
        if (this.botDiff === 'hard') speedMult = 1.3;

        this.players[botId] = {
            x: spawnPos.x,
            y: spawnPos.y,
            team: team,
            name: `GodAI_${team.substring(0, 1)}${Math.floor(Math.random() * 100)}`,
            health: 100,
            width: 30,
            height: 30,
            speed: 4 * speedMult,
            isDead: false,
            score: 0,
            isBot: true,
            cooldown: 0,
            isHealing: false,
            isSpeedBoosted: false,
            speedBoostTimer: 0,
            hasRapidFire: false,
            rapidFireTimer: 0,
            strafeDir: Math.random() < 0.5 ? 1 : -1,
            strafeTimer: 0,
            stuckX: spawnPos.x,
            stuckY: spawnPos.y,
            stuckTimer: 0,
            panicTimer: 0,
            panicDirX: 0,
            panicDirY: 0,
            input: { w: false, a: false, s: false, d: false }
        };
    }

    removeBot(team) {
        if (!team) return;
        for (let id in this.players) {
            const p = this.players[id];
            if (p.isBot && p.team === team) {
                this.removePlayer(id);
                return; // Remove only one at a time
            }
        }
    }

    removePlayer(socketId) {
        delete this.players[socketId];
    }

    handleInput(socketId, inputData) {
        if (this.players[socketId]) {
            this.players[socketId].input = inputData;
        }
    }

    handleSkill(socketId, skillKey) {
        const player = this.players[socketId];
        if (player && !player.isDead) {
            if (skillKey === 'z') { // Heal
                player.health = Math.min(100, player.health + 40);
                player.isHealing = true;
                setTimeout(() => { if (this.players[socketId]) this.players[socketId].isHealing = false; }, 1000);
            }
            else if (skillKey === 'x') { // Speed Boost
                player.speed = 8; // Double speed
                player.isSpeedBoosted = true;
                player.speedBoostTimer = this.FPS * 4; // 4 seconds
            }
            else if (skillKey === 'c') { // Rapid Fire
                player.hasRapidFire = true;
                player.rapidFireTimer = this.FPS * 5; // 5 seconds
            }
        }
    }

    handleShoot(socketId, angle) {
        const player = this.players[socketId];
        if (player && !player.isDead) {
            const spawnX = player.x + Math.cos(angle) * (player.width / 2);
            const spawnY = player.y + Math.sin(angle) * (player.height / 2);

            // Bullet spawn physics fix (Remove "falso"/drift effect)
            let bulletSpeed = player.hasRapidFire ? 19 : 13;
            this.bullets.push({
                x: spawnX,
                y: spawnY,
                vx: Math.cos(angle) * bulletSpeed,
                vy: Math.sin(angle) * bulletSpeed,
                owner: socketId,
                team: player.team,
                radius: 4,
                life: 110 
            });

            // Muzzle flash efekti için sarı partikül
            this.explosions.push({
                x: spawnX,
                y: spawnY,
                color: '#f1c40f'
            });
        }
    }

    checkCollision(rect1, rect2) {
        return (
            rect1.x - rect1.width / 2 < rect2.x + rect2.width &&
            rect1.x + rect1.width / 2 > rect2.x &&
            rect1.y - rect1.height / 2 < rect2.y + rect2.height &&
            rect1.y + rect1.height / 2 > rect2.y
        );
    }

    lineIntersectsRect(x1, y1, x2, y2, rect) {
        // AABB test for early rejection
        let minX = Math.min(x1, x2);
        let maxX = Math.max(x1, x2);
        let minY = Math.min(y1, y2);
        let maxY = Math.max(y1, y2);

        if (maxX < rect.x || minX > rect.x + rect.width || maxY < rect.y || minY > rect.y + rect.height) {
            return false;
        }

        // Sampling points along the line for wall collision
        let steps = 15;
        for (let i = 0; i <= steps; i++) {
            let px = x1 + (x2 - x1) * (i / steps);
            let py = y1 + (y2 - y1) * (i / steps);
            if (px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height) {
                return true;
            }
        }
        return false;
    }

    updateAI(id, p) {
        let closestEnemy = null;
        let minDist = Infinity;

        // 1. Find Closest Target
        for (let eid in this.players) {
            const enemy = this.players[eid];
            if (enemy.team !== p.team && !enemy.isDead) {
                let dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
                if (dist < minDist) {
                    minDist = dist;
                    closestEnemy = enemy;
                }
            }
        }

        p.input = { w: false, a: false, s: false, d: false };
        if (!closestEnemy) return;

        // 2. Realistic Target Rotation
        let targetAngle = Math.atan2(closestEnemy.y - p.y, closestEnemy.x - p.x);
        
        // 3. Bullet Avoidance (Dodging)
        let avoidX = 0, avoidY = 0;
        for (let b of this.bullets) {
            if (b.team !== p.team) {
                let dist = Math.hypot(p.x - b.x, p.y - b.y);
                if (dist < 250) {
                    avoidX += (p.x - b.x) / dist;
                    avoidY += (p.y - b.y) / dist;
                }
            }
        }

        // 4. Block Avoidance
        const allBlocks = [...map.walls, ...this.dynamicMap.walls, ...this.dynamicMap.crates];
        for (let block of allBlocks) {
            let wx = block.x + block.width/2;
            let wy = block.y + block.height/2;
            let dist = Math.hypot(p.x - wx, p.y - wy);
            if (dist < 130) {
                avoidX += (p.x - wx) / (dist || 1) * 6;
                avoidY += (p.y - wy) / (dist || 1) * 6;
            }
        }

        // 5. Final Angle Blend
        let moveAngle = Math.atan2(Math.sin(targetAngle) + avoidY * 2.5, Math.cos(targetAngle) + avoidX * 2.5);

        // Smooth Turn Simulation
        if (p.angle === undefined) p.angle = moveAngle;
        let diff = moveAngle - p.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        p.angle += diff * 0.12; // Turn responsiveness

        // Applied Movement
        p.input.w = true; // Always moving forward relative to p.angle
        p.x += Math.cos(p.angle) * p.speed * 0.75;
        p.y += Math.sin(p.angle) * p.speed * 0.75;

        // 6. Combat Logic (Interception Aiming)
        p.cooldown = p.cooldown || 0;
        if (p.cooldown > 0) p.cooldown--;

        if (p.cooldown <= 0 && minDist < 500) {
            // Check Line of Sight
            let hasLos = true;
            for (let wall of allBlocks) {
                if (this.lineIntersectsRect(p.x, p.y, closestEnemy.x, closestEnemy.y, wall)) {
                    hasLos = false;
                    break;
                }
            }

            if (hasLos) {
                // Predictive shoot
                let ex = closestEnemy.x; let ey = closestEnemy.y;
                let bSpeed = 13;
                let t = minDist / bSpeed;
                // Check enemy movement via input (basic prediction)
                let evx = 0; let evy = 0;
                if (closestEnemy.input.w) evy -= closestEnemy.speed;
                if (closestEnemy.input.s) evy += closestEnemy.speed;
                if (closestEnemy.input.a) evx -= closestEnemy.speed;
                if (closestEnemy.input.d) evx += closestEnemy.speed;

                let shootAngle = Math.atan2((ey + evy*t) - p.y, (ex + evx*t) - p.x);
                this.handleShoot(id, shootAngle);
                p.cooldown = 45 + Math.floor(Math.random()*15);
            }
        }
    }

    checkWinCondition() {
        if (this.isGameOver) return;

        let winnerTeam = null;
        if (this.teamScores.Red >= this.killLimit) winnerTeam = 'Red';
        if (this.teamScores.Blue >= this.killLimit) winnerTeam = 'Blue';
        if (this.timeRemaining <= 0) {
            winnerTeam = (this.teamScores.Red >= this.teamScores.Blue) ? 'Red' : 'Blue';
        }

        if (winnerTeam) {
            this.isGameOver = true;
            this.winner = winnerTeam;
            this.io.to(this.roomId).emit('gameOver', { winner: winnerTeam, scores: this.teamScores });
        }
    }

    update() {
        if (this.isGameOver) return;
        
        this.frameCounter++;
        if (this.frameCounter >= 60) {
            this.timeRemaining--;
            this.frameCounter = 0;
            this.checkWinCondition();
        }

        // Run AI behavior
        let humanCount = 0;
        let bots = [];
        for (let id in this.players) {
            if (this.players[id].isBot) bots.push(id);
            else humanCount++;
        }

        if (humanCount > 0 && bots.length > 9) {
            const botsToRemove = bots.length - 9;
            for (let i = 0; i < botsToRemove; i++) {
                this.removePlayer(bots[i]);
            }
        }

        // Run AI behavior
        for (let id in this.players) {
            const p = this.players[id];
            if (p.isBot && !p.isDead) {
                this.updateAI(id, p);
            }
        }

        // Player movements and skill timers
        for (let id in this.players) {
            const p = this.players[id];
            if (p.isDead) continue;

            if (p.speedBoostTimer > 0) {
                p.speedBoostTimer--;
                if (p.speedBoostTimer <= 0) {
                    p.speed = 4; // Reset speed
                    p.isSpeedBoosted = false;
                }
            }

            if (p.rapidFireTimer > 0) {
                p.rapidFireTimer--;
                if (p.rapidFireTimer <= 0) {
                    p.hasRapidFire = false;
                }
            }

            let nextX = p.x;
            let nextY = p.y;

            if (p.input.w) nextY -= p.speed;
            if (p.input.s) nextY += p.speed;
            if (p.input.a) nextX -= p.speed;
            if (p.input.d) nextX += p.speed;

            let canMoveX = true;
            let canMoveY = true;

            const allWallsAndCrates = [...map.walls, ...this.dynamicMap.walls, ...this.dynamicMap.crates, ...this.dynamicMap.tires];

            for (let wall of allWallsAndCrates) {
                if (this.checkCollision({ x: nextX, y: p.y, width: p.width, height: p.height }, wall)) canMoveX = false;
                if (this.checkCollision({ x: p.x, y: nextY, width: p.width, height: p.height }, wall)) canMoveY = false;
            }

            // Check map boundaries tightly
            if (nextX - p.width / 2 < 0 || nextX + p.width / 2 > map.width) canMoveX = false;
            if (nextY - p.height / 2 < 0 || nextY + p.height / 2 > map.height) canMoveY = false;

            // Slide logic if hitting a map boundary (invisible walls)
            if (!canMoveX) p.x += 0; // prevent X movement, allow Y
            else p.x = nextX;

            if (!canMoveY) p.y += 0; // prevent Y movement, allow X
            else p.y = nextY;

            // --- SPEED PAD OVERLAP ---
            for (let sp of (this.dynamicMap.speedPads || [])) {
                if (this.checkCollision({ x: p.x, y: p.y, width: p.width, height: p.height }, sp)) {
                    p.speed = 8.5; // Massive boost
                    p.speedBoostTimer = 60; // 1 second fast burst
                    p.isSpeedBoosted = true;
                }
            }
        }

        // Bullet updates
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            let b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;

            let destroyed = false;
            if (b.life <= 0) destroyed = true;

            // Check Map Bounds for bullets
            if (b.x < 0 || b.x > map.width || b.y < 0 || b.y > map.height) {
                destroyed = true;
            }

            // Prop collision detection
            if (!destroyed) {
                const allProps = [...map.walls, ...this.dynamicMap.walls, ...this.dynamicMap.crates, ...this.dynamicMap.barrels];
                for (let wall of allProps) {
                    if (this.lineIntersectsRect(b.x - b.vx, b.y - b.vy, b.x, b.y, wall)) {
                        destroyed = true;
                        
                        // Kutu parçalanma mekaniği (Destructible crates)
                        if (this.dynamicMap.crates.includes(wall)) {
                            this.dynamicMap.crates = this.dynamicMap.crates.filter(c => c !== wall);
                            this.io.to(this.roomId).emit('sandboxSync', this.dynamicMap);
                        }

                        // Varil patlama mekaniği (Explosive barrels)
                        if (this.dynamicMap.barrels.includes(wall)) {
                            this.dynamicMap.barrels = this.dynamicMap.barrels.filter(br => br !== wall);
                            // AOE Damage
                            for (let pid in this.players) {
                                let targets = this.players[pid];
                                if (targets.isDead) continue;
                                let dist = Math.hypot(targets.x - (wall.x + wall.width/2), targets.y - (wall.y + wall.height/2));
                                if (dist < 130) {
                                    targets.health -= 60;
                                    if (targets.health <= 0) {
                                        targets.isDead = true; 
                                        if (this.players[b.owner]) this.players[b.owner].score++;
                                        this.handleRespawn(pid);
                                    }
                                }
                            }
                            this.io.to(this.roomId).emit('sandboxSync', this.dynamicMap);
                            this.explosions.push({ x: wall.x + wall.width/2, y: wall.y + wall.height/2, color: '#e67e22' });
                        }

                        break;
                    }
                }
            }

            // Player collision
            if (!destroyed) {
                for (let id in this.players) {
                    let p = this.players[id];
                    if (p.isDead) continue;

                    if (p.team !== b.team) {
                        if (b.x > p.x - p.width / 2 && b.x < p.x + p.width / 2 &&
                            b.y > p.y - p.height / 2 && b.y < p.y + p.height / 2) {

                            p.health -= 25;
                            destroyed = true;

                            if (p.health <= 0) {
                                p.isDead = true;
                                p.killedBy = b.owner;

                                // Puanı atan oyuncuya ve takıma ver
                                if (this.players[b.owner]) {
                                    this.players[b.owner].score++;
                                    const killersTeam = this.players[b.owner].team;
                                    this.teamScores[killersTeam]++;
                                    this.checkWinCondition();
                                }

                                this.handleRespawn(id);
                            }
                            break;
                        }
                    }
                }
            }

            if (destroyed) {
                this.explosions.push({ x: b.x, y: b.y, color: '#e74c3c' });
                this.bullets.splice(i, 1);
            }
        }

        this.io.to(this.roomId).emit('gameState', {
            players: this.players,
            bullets: this.bullets,
            explosions: this.explosions,
            sandboxMap: this.dynamicMap,
            matchTime: this.timeRemaining,
            teamScores: this.teamScores
        });

        this.explosions = [];
    }
    handleRespawn(id) {
        setTimeout(() => {
            if (this.players[id]) {
                const p = this.players[id];
                p.isDead = false;
                p.health = 100;
                const spawnPos = this.getSpawnPos(p.team);
                p.x = spawnPos.x;
                p.y = spawnPos.y;
            }
        }, 3000);
    }
}

module.exports = Game;
