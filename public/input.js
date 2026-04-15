const Config = window.EngineConfig;
const Physics = window.EnginePhysics;

window.inputKeys = { w: false, a: false, s: false, d: false, fire: false, skill: null };

function initInput(socket) {
    // 1. KEYBOARD LISTENERS
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        let k = e.key.toLowerCase();
        
        // Movement
        if (window.inputKeys.hasOwnProperty(k) && k !== 'skill' && k !== 'fire') {
            window.inputKeys[k] = true;
            socket.emit('playerInput', window.inputKeys);
        }

        // Skills (z, x, c)
        if (['z', 'x', 'c'].includes(k)) {
            socket.emit('playerInput', { skill: k });
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.target.tagName === 'INPUT') return;
        let k = e.key.toLowerCase();
        if (window.inputKeys.hasOwnProperty(k) && k !== 'skill' && k !== 'fire') {
            window.inputKeys[k] = false;
            socket.emit('playerInput', window.inputKeys);
        }
    });

    // 2. MOUSE LISTENERS (ANGLE & SHOOTING)
    const canvas = document.getElementById('gameCanvas');
    
    canvas.addEventListener('mousemove', (e) => {
        if (window.isEditingMap) return;
        
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
        window.inputKeys.fire = true;
        socket.emit('playerInput', { fire: true });
    });

    window.addEventListener('mouseup', () => {
        if (window.isEditingMap) return;
        window.inputKeys.fire = false;
        socket.emit('playerInput', { fire: false });
    });
}
