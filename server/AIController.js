const Config = require('../public/shared/Config');
const Physics = require('../public/shared/Physics');

/**
 * Tank Engine 2.0 - AI Controller
 * Manages autonomous bot behavior and decision making.
 */
class AIController {
    constructor(match) {
        this.match = match;
        this.botDiff = match.botDiff || 'medium';
    }

    update(botId, p) {
        if (p.isDead) return;

        let closestEnemy = null;
        let minDist = Infinity;

        // 1. Target Selection
        for (let eid in this.match.players) {
            const enemy = this.match.players[eid];
            if (enemy.team !== p.team && !enemy.isDead) {
                let dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
                if (dist < minDist) {
                    minDist = dist;
                    closestEnemy = enemy;
                }
            }
        }

        p.input = { w: false, a: false, s: false, d: false, left: false, right: false, fire: false };
        if (!closestEnemy) return;

        // 2. Navigation & Dodging
        let targetX = closestEnemy.x;
        let targetY = closestEnemy.y;

        // Dodge logic: Move perpendicular to incoming bullets
        for (let b of this.match.bullets) {
            if (b.team !== p.team) {
                let dist = Math.hypot(p.x - b.x, p.y - b.y);
                if (dist < 200) {
                    targetX += (p.x - b.x) * 2;
                    targetY += (p.y - b.y) * 2;
                }
            }
        }

        // 3. Aim & Fire Decision
        let angleToTarget = Math.atan2(targetY - p.y, targetX - p.x);
        p.angle = angleToTarget; // For bots, aiming is instant in 2.0 unless refactored

        const distToEnemy = Math.hypot(closestEnemy.x - p.x, closestEnemy.y - p.y);
        
        // Strategy based on difficulty
        const fireChance = this.botDiff === 'easy' ? 0.02 : (this.botDiff === 'medium' ? 0.05 : 0.08);
        if (distToEnemy < 600 && Math.random() < fireChance) {
            p.input.fire = true;
        }

        // 4. Movement Logic
        if (distToEnemy > 250) {
            // Move towards
            if (p.x < targetX - 20) p.input.d = true;
            else if (p.x > targetX + 20) p.input.a = true;
            if (p.y < targetY - 20) p.input.s = true;
            else if (p.y > targetY + 20) p.input.w = true;
        } else if (distToEnemy < 150) {
            // Backup
            if (p.x < targetX) p.input.a = true; else p.input.d = true;
            if (p.y < targetY) p.input.w = true; else p.input.s = true;
        }
    }
}

module.exports = AIController;
