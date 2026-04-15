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

        // Custom map dynamic support
        this.dynamicMap = { walls: [], bushes: [], destructibles: [] };

        // Start game loop
        this.loopInterval = setInterval(() => this.update(), 1000 / this.FPS);
    }

    destroy() {
        clearInterval(this.loopInterval);
    }

    addPlayer(socket, lobbyPlayer) {
        if (!lobbyPlayer || !lobbyPlayer.team) return;

        const teamSpawns = map.spawns[lobbyPlayer.team];
        const spawnIndex = Object.keys(this.players).filter(pid => this.players[pid].team === lobbyPlayer.team).length % teamSpawns.length;
        const spawnPos = teamSpawns[spawnIndex];

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
            input: { w: false, a: false, s: false, d: false }
        };
    }

    addBot(team) {
        if (!team) return;
        const teamSpawns = map.spawns[team];
        const spawnPos = teamSpawns[Math.floor(Math.random() * teamSpawns.length)];
        const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        this.players[botId] = {
            x: spawnPos.x,
            y: spawnPos.y,
            team: team,
            name: `GodAI_${team.substring(0, 1)}${Math.floor(Math.random() * 100)}`,
            health: 100,
            width: 30,
            height: 30,
            speed: 4,
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

            let bulletSpeed = player.hasRapidFire ? 18 : 12;

            this.bullets.push({
                x: spawnX,
                y: spawnY,
                vx: Math.cos(angle) * bulletSpeed,
                vy: Math.sin(angle) * bulletSpeed,
                owner: socketId,
                team: player.team,
                radius: 5,
                life: 100 // frames
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

        // 1. Find Closest Target & Swarm Repulsion
        let swarmVectorX = 0;
        let swarmVectorY = 0;

        for (let eid in this.players) {
            const enemy = this.players[eid];
            if (enemy.team !== p.team && !enemy.isDead) {
                let dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
                if (dist < minDist) {
                    minDist = dist;
                    closestEnemy = enemy;
                }
            } else if (eid !== id && enemy.team === p.team && !enemy.isDead) {
                // Swarm repulsion
                let dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
                if (dist < 100) { // Keep 100px distance from allies
                    swarmVectorX += (p.x - enemy.x) / dist;
                    swarmVectorY += (p.y - enemy.y) / dist;
                }
            }
        }

        // 2. Advanced Dodging (God-Tier)
        let isDodging = false;
        let dangerVectorX = 0;
        let dangerVectorY = 0;

        for (let b of this.bullets) {
            if (b.team !== p.team) {
                let speed = Math.hypot(b.vx, b.vy) || 1;
                let dx = b.vx / speed;
                let dy = b.vy / speed;

                let tx = p.x - b.x;
                let ty = p.y - b.y;
                let distToBullet = Math.hypot(tx, ty);

                let dot = (tx * dx + ty * dy);
                if (dot > 0 && distToBullet < 450) {
                    let px = b.x + dx * dot;
                    let py = b.y + dy * dot;

                    let distToLine = Math.hypot(p.x - px, p.y - py);
                    if (distToLine < p.width + 15) {
                        isDodging = true;
                        // Orthogonal avoidance
                        dangerVectorX += p.x - px;
                        dangerVectorY += p.y - py;
                    }
                }
            }
        }

        p.input = { w: false, a: false, s: false, d: false };

        if (isDodging) {
            if (Math.abs(dangerVectorX) > Math.abs(dangerVectorY)) {
                if (dangerVectorX > 0) p.input.d = true;
                else p.input.a = true;
            } else {
                if (dangerVectorY === 0 && dangerVectorX === 0) {
                    p.input.w = true;
                } else if (dangerVectorY > 0) p.input.s = true;
                else p.input.w = true;
            }
        } else if (closestEnemy) {
            // Cover Seeking Logic vs Pure Approach
            let wantX = false, wantY = false;
            let targetX = closestEnemy.x;
            let targetY = closestEnemy.y;

            if (p.cooldown > 20) {
                // Try to find a cover wall between us and enemy
                let bestCover = null;
                let bestDist = Infinity;
                for (let wall of map.walls) {
                    let wx = wall.x + wall.width / 2;
                    let wy = wall.y + wall.height / 2;
                    let distToWall = Math.hypot(p.x - wx, p.y - wy);
                    let distEnemyToWall = Math.hypot(closestEnemy.x - wx, closestEnemy.y - wy);

                    // Wall is closer to us than enemy
                    if (distToWall < distEnemyToWall && distToWall < 600) {
                        if (distToWall < bestDist) {
                            bestDist = distToWall;
                            bestCover = wall;
                        }
                    }
                }

                if (bestCover) {
                    // Move to the opposite side of the wall from the enemy
                    let dx = bestCover.x + bestCover.width / 2 - closestEnemy.x;
                    let dy = bestCover.y + bestCover.height / 2 - closestEnemy.y;
                    let len = Math.hypot(dx, dy);
                    if (len > 0) {
                        targetX = (bestCover.x + bestCover.width / 2) + (dx / len) * (Math.max(bestCover.width, bestCover.height));
                        targetY = (bestCover.y + bestCover.height / 2) + (dy / len) * (Math.max(bestCover.width, bestCover.height));
                    }
                }
            }

            let dirX = targetX - p.x;
            let dirY = targetY - p.y;
            let distToTarget = Math.hypot(dirX, dirY);

            // Normalize base direction
            if (distToTarget > 0) {
                dirX /= distToTarget;
                dirY /= distToTarget;
            }

            // ADD STRAFING
            p.strafeTimer = (p.strafeTimer || 0) - 1;
            if (p.strafeTimer <= 0) {
                p.strafeDir = Math.random() < 0.5 ? 1 : -1;
                p.strafeTimer = Math.floor(Math.random() * 60) + 60; // 1 to 2 seconds
            }

            // If we have LoS and are in combat range, add perpendicular strafe vector
            if (p.cooldown > 0 && distToTarget < 600) {
                let strafeVx = -dirY * p.strafeDir;
                let strafeVy = dirX * p.strafeDir;
                dirX += strafeVx * 1.5;
                dirY += strafeVy * 1.5;
            }

            // CONTINUOUS WALL REPULSION
            let wallRepulsionX = 0;
            let wallRepulsionY = 0;
            for (let wall of map.walls) {
                // Find nearest point on the wall rect to the player center
                let wx = Math.max(wall.x, Math.min(p.x, wall.x + wall.width));
                let wy = Math.max(wall.y, Math.min(p.y, wall.y + wall.height));

                let distToSurface = Math.hypot(p.x - wx, p.y - wy);
                if (distToSurface < p.width + 30 && distToSurface > 0) {
                    // Strong repulsion inversely proportional to distance
                    let force = (p.width + 30 - distToSurface) / (p.width + 30);
                    wallRepulsionX += ((p.x - wx) / distToSurface) * force * 6;
                    wallRepulsionY += ((p.y - wy) / distToSurface) * force * 6;
                }
            }

            // STUCK DETECTION & PANIC
            p.stuckTimer = (p.stuckTimer || 0) + 1;
            if (p.stuckTimer > 60) {
                let movedDist = Math.hypot(p.x - (p.stuckX || p.x), p.y - (p.stuckY || p.y));
                if (movedDist < 10) {
                    p.panicTimer = 45; // Panic for 45 frames
                    p.panicDirX = (Math.random() - 0.5) * 2;
                    p.panicDirY = (Math.random() - 0.5) * 2;
                }
                p.stuckX = p.x;
                p.stuckY = p.y;
                p.stuckTimer = 0;
            }

            p.panicTimer = (p.panicTimer || 0) - 1;

            // COMBINE VECTORS
            let finalDirX, finalDirY;
            if (p.panicTimer > 0) {
                finalDirX = p.panicDirX;
                finalDirY = p.panicDirY;
            } else {
                finalDirX = dirX + (swarmVectorX * 1.5) + wallRepulsionX;
                finalDirY = dirY + (swarmVectorY * 1.5) + wallRepulsionY;
            }

            // Apply Continuous Steering to WASD Intention
            if (Math.abs(finalDirX) > 0.1) {
                if (finalDirX > 0) p.input.d = true;
                else p.input.a = true;
            }
            if (Math.abs(finalDirY) > 0.1) {
                if (finalDirY > 0) p.input.s = true;
                else p.input.w = true;
            }

            // 4. Predictive Aiming
            p.cooldown = p.cooldown || 0;
            if (p.cooldown > 0) p.cooldown--;

            if (p.cooldown <= 0) {
                let hasLos = true;
                for (let wall of map.walls) {
                    if (this.lineIntersectsRect(p.x, p.y, closestEnemy.x, closestEnemy.y, wall)) {
                        hasLos = false; break;
                    }
                }

                if (hasLos) {
                    let ex = closestEnemy.x;
                    let ey = closestEnemy.y;

                    let evx = 0; let evy = 0;
                    if (closestEnemy.input.w) evy -= closestEnemy.speed;
                    if (closestEnemy.input.s) evy += closestEnemy.speed;
                    if (closestEnemy.input.a) evx -= closestEnemy.speed;
                    if (closestEnemy.input.d) evx += closestEnemy.speed;

                    // Interception time
                    let bulletSpeed = 12;
                    let t = minDist / bulletSpeed;

                    let predX = ex + evx * t;
                    let predY = ey + evy * t;

                    let angle = Math.atan2(predY - p.y, predX - p.x);
                    this.handleShoot(id, angle);
                    p.cooldown = 45 + Math.floor(Math.random() * 20); // Cooldown with staggered firing (45-65 frames)
                }
            }
        }
    }

    update() {
        // Enforce max 9 bots rule if humans are present
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

            const allWallsAndCrates = [...map.walls, ...this.dynamicMap.walls, ...this.dynamicMap.crates];

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

            // Wall and Crate collision detection (Line to Rect)
            if (!destroyed) {
                const allWallsAndCrates = [...map.walls, ...this.dynamicMap.walls, ...this.dynamicMap.crates];
                for (let wall of allWallsAndCrates) {
                    if (this.lineIntersectsRect(b.x - b.vx, b.y - b.vy, b.x, b.y, wall)) {
                        destroyed = true;
                        
                        // Kutu parçalanma mekaniği (Destructible crates)
                        let isCrate = this.dynamicMap.crates.includes(wall);
                        if (isCrate) {
                            this.dynamicMap.crates = this.dynamicMap.crates.filter(c => c !== wall);
                            // Senkronizasyonu başlat (Clientlara gitsin diye)
                            this.io.to(this.roomId).emit('sandboxSync', this.dynamicMap);
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

                                // Puanı atan oyuncuya ver
                                if (this.players[b.owner]) {
                                    this.players[b.owner].score++;
                                }

                                // Respawn
                                setTimeout(() => {
                                    if (this.players[id]) {
                                        this.players[id].isDead = false;
                                        this.players[id].health = 100;
                                        const teamSpawns = map.spawns[p.team];
                                        const spawnPos = teamSpawns[Math.floor(Math.random() * teamSpawns.length)];
                                        this.players[id].x = spawnPos.x;
                                        this.players[id].y = spawnPos.y;
                                    }
                                }, 3000);
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
            sandboxMap: this.dynamicMap // Pass sandbox layout if exists
        });

        this.explosions = [];
    }
}

module.exports = Game;
