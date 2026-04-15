/**
 * Tank Engine 2.0 - Universal Physics Engine
 * Handles collisions, bounds, and raycasting.
 */
const Physics = {
    /**
     * Standard AABB (Box-Box) collision
     */
    checkRectCollision: (rect1, rect2) => {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    },

    /**
     * Circle-Rectangle collision (Perfect for Bullets)
     */
    checkCircleRectCollision: (circle, rect) => {
        let closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
        let closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

        let distanceX = circle.x - closestX;
        let distanceY = circle.y - closestY;

        let distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
        return distanceSquared < (circle.radius * circle.radius);
    },

    /**
     * Circle-Circle collision (Ideal for Tanks/Powerups)
     */
    checkCircleCollision: (c1, c2) => {
        let dist = Math.hypot(c1.x - c2.x, c1.y - c2.y);
        return dist < (c1.radius || c1.width/2) + (c2.radius || c2.width/2);
    },

    /**
     * Grid Snapping for Sandbox Engine
     */
    snapToGrid: (val, gridSize) => {
        return Math.round(val / gridSize) * gridSize;
    },

    /**
     * Line-Rect intersection (Raycasting for Bullet Walls)
     */
    lineIntersectsRect: (x1, y1, x2, y2, rect) => {
        let minX = Math.min(x1, x2);
        let maxX = Math.max(x1, x2);
        let minY = Math.min(y1, y2);
        let maxY = Math.max(y1, y2);

        if (maxX < rect.x || minX > rect.x + rect.width || maxY < rect.y || minY > rect.y + rect.height) {
            return false;
        }

        let steps = 10;
        for (let i = 0; i <= steps; i++) {
            let px = x1 + (x2 - x1) * (i / steps);
            let py = y1 + (y2 - y1) * (i / steps);
            if (px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height) {
                return true;
            }
        }
        return false;
    }
};

if (typeof module !== 'undefined') {
    module.exports = Physics;
} else {
    window.EnginePhysics = Physics;
}
