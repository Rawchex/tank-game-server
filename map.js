const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1600;

const map = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    walls: [
        // Top-left
        { x: 400, y: 400, width: 300, height: 60 },
        { x: 400, y: 400, width: 60, height: 300 },

        // Center blocks
        { x: 1000, y: 700, width: 200, height: 200 },
        { x: 1200, y: 900, width: 200, height: 200 },
        { x: 800, y: 900, width: 200, height: 60 },

        // Bottom-right
        { x: 1700, y: 1140, width: 300, height: 60 },
        { x: 1940, y: 900, width: 60, height: 300 },

        // Additional side walls
        { x: 1200, y: 200, width: 60, height: 300 },
        { x: 1200, y: 1100, width: 60, height: 300 }
    ],
    spawns: {
        Red: [
            { x: 200, y: 200 },
            { x: 300, y: 200 },
            { x: 200, y: 300 },
            { x: 300, y: 300 },
            { x: 250, y: 250 }
        ],
        Blue: [
            { x: 2200, y: 1400 },
            { x: 2100, y: 1400 },
            { x: 2200, y: 1300 },
            { x: 2100, y: 1300 },
            { x: 2150, y: 1350 }
        ]
    }
};

module.exports = map;
