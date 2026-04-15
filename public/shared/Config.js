/**
 * Tank Engine 2.0 - Universal Configuration
 * Single source of truth for both Server and Client.
 */
var Config = {
    // Map Metrics
    MAP_WIDTH: 3000,
    MAP_HEIGHT: 2000,
    GRID_SIZE: 10, // For sandbox snapping

    // Gameplay Tuning
    TANK_SPEED: 4,
    TANK_ROTATION_SPEED: 0.08,
    BULLET_SPEED: 8,
    BULLET_DAMAGE: 25,
    RELOAD_TIME: 45, // 0.75s at 60fps
    MAX_HEALTH: 100,

    // Match Rules
    TEAM_LIMIT: 5,
    SHIELD_DURATION: 180, // 3s at 60fps
    MATCH_TIME_DEFAULT: 300, // 5 minutes
    
    // Physics Layers
    COLLISION_LAYERS: {
        WALLS: 1,
        CRATES: 2,
        BARRELS: 4,
        PLAYERS: 8
    }
};

if (typeof module !== 'undefined') {
    module.exports = Config;
} else {
    window.EngineConfig = Config;
}
