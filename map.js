/**
 * THE ULTIMATE MAP ENGINE FOUNDATION
 * Handles core metrics, themes, and base layout generation.
 */

const MAP_WIDTH = 3000; // Increased for sandbox freedom
const MAP_HEIGHT = 2000;

const THEMES = {
    GRASS: {
        id: 'grass',
        bgColor: '#2c3e50',
        tileColor: '#27ae60',
        gridColor: 'rgba(255,255,255,0.05)'
    },
    DESERT: {
        id: 'desert',
        bgColor: '#d35400',
        tileColor: '#f39c12',
        gridColor: 'rgba(0,0,0,0.1)'
    },
    SPACE: {
        id: 'space',
        bgColor: '#000000',
        tileColor: '#1a1a2e',
        gridColor: 'rgba(0,255,255,0.1)'
    },
    WINTER: {
        id: 'winter',
        bgColor: '#2980b9',
        tileColor: '#ecf0f1',
        gridColor: 'rgba(0,0,0,0.05)'
    }
};

const map = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    themes: THEMES,
    
    // Professional Base Layout (Classic)
    walls: [
        // Symmetric Center Cross
        { x: MAP_WIDTH/2 - 300, y: MAP_HEIGHT/2 - 30, width: 600, height: 60 },
        { x: MAP_WIDTH/2 - 30, y: MAP_HEIGHT/2 - 300, width: 60, height: 600 },
        
        // Perimeter Pillars
        { x: 600, y: 400, width: 100, height: 100 },
        { x: MAP_WIDTH - 700, y: 400, width: 100, height: 100 },
        { x: 600, y: MAP_HEIGHT - 500, width: 100, height: 100 },
        { x: MAP_WIDTH - 700, y: MAP_HEIGHT - 500, width: 100, height: 100 }
    ],
    
    spawns: {
        Red: [
            { x: 200, y: 200 }, { x: 400, y: 200 },
            { x: 200, y: 400 }, { x: 400, y: 400 }
        ],
        Blue: [
            { x: MAP_WIDTH - 200, y: MAP_HEIGHT - 200 },
            { x: MAP_WIDTH - 400, y: MAP_HEIGHT - 200 },
            { x: MAP_WIDTH - 200, y: MAP_HEIGHT - 400 },
            { x: MAP_WIDTH - 400, y: MAP_HEIGHT - 400 }
        ]
    },

    // Utility to get a clean layout object
    getEmptyLayout: (themeKey = 'GRASS') => {
        return {
            theme: THEMES[themeKey].id,
            walls: [], crates: [], bushes: [], tires: [],
            barrels: [], speedPads: [], spawns: []
        };
    }
};

module.exports = map;
