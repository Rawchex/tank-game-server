const Config = window.EngineConfig;
const Physics = window.EnginePhysics;

window.inputKeys = { w: false, a: false, s: false, d: false };

function initInput(socket) {
    // 1. KEYBOARD LISTENERS
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        let k = e.key.toLowerCase();
        if (window.inputKeys.hasOwnProperty(k)) {
            window.inputKeys[k] = true;
            socket.emit('playerInput', window.inputKeys);
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.target.tagName === 'INPUT') return;
        let k = e.key.toLowerCase();
        if (window.inputKeys.hasOwnProperty(k)) {
            window.inputKeys[k] = false;
            socket.emit('playerInput', window.inputKeys);
        }
    });

    // 2. MOUSE LISTENERS (ANGLE & SHOOTING)
    const canvas = document.getElementById('gameCanvas');
    
    canvas.addEventListener('mousemove', (e) => {
        if (window.isEditingMap) return;
        
        // Use global engine if available for world mapping
        if (window.engine && window.engine.gameState) {
             const world = window.engine.screenToWorld(e.clientX, e.clientY);
             const me = window.engine.gameState.players[socket.id];
             if (me) {
                 const angle = Math.atan2(world.y - me.y, world.x - me.x);
                 socket.emit('playerInput', { angle });
             }
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        if (window.isEditingMap || e.button !== 0) return;
        socket.emit('playerInput', { fire: true });
    });

    window.addEventListener('mouseup', () => {
        if (window.isEditingMap) return;
        socket.emit('playerInput', { fire: false });
    });
}
