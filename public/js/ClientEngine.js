/**
 * Tank Engine 2.0 - Client Engine
 * Orchestrates Network, Input, and Rendering.
 */
class ClientEngine {
    constructor(socket, config, physics) {
        this.socket = socket;
        this.config = config;
        this.physics = physics;
        
        this.renderer = new EngineRenderer(document.getElementById('gameCanvas'), config);
        this.gameState = null;
        this.myId = socket.id;
        
        this.isEditingMap = false;
        this.editorPos = { x: config.MAP_WIDTH/2, y: config.MAP_HEIGHT/2 };
        
        this.setupEmitters();
        this.startLoop();
    }

    setupEmitters() {
        this.socket.on('gameState', (state) => {
            this.gameState = state;
            this.myId = this.socket.id; // Refresh just in case
        });

        this.socket.on('gamePaused', (isPaused) => {
            if (this.gameState) this.gameState.paused = isPaused;
        });
    }

    startLoop() {
        const loop = () => {
            if (this.gameState) {
                this.renderer.render(this.gameState, this.myId);
                this.handleEditorMovement();
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    handleEditorMovement() {
        if (!window.isEditingMap || !window.inputKeys) return;
        const camSpeed = 15;
        if (window.inputKeys.w) this.editorPos.y -= camSpeed;
        if (window.inputKeys.s) this.editorPos.y += camSpeed;
        if (window.inputKeys.a) this.editorPos.x -= camSpeed;
        if (window.inputKeys.d) this.editorPos.x += camSpeed;
        
        // Push editor pos to a global for renderer to find
        window.myEditorPos = this.editorPos;
    }

    /**
     * SANDBOX FIX: Precise Screen -> World coordinate mapping
     */
    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.renderer.cameraOffset.x,
            y: screenY + this.renderer.cameraOffset.y
        };
    }

    /**
     * SANDBOX FIX: Grid snapping for professional placement
     */
    getSnappedPos(screenX, screenY) {
        const world = this.screenToWorld(screenX, screenY);
        return {
            x: this.physics.snapToGrid(world.x, this.config.GRID_SIZE),
            y: this.physics.snapToGrid(world.y, this.config.GRID_SIZE)
        };
    }

    sendInput(input) {
        this.socket.emit('playerInput', input);
    }

    placeObject(type, screenX, screenY) {
        const pos = this.getSnappedPos(screenX, screenY);
        // This will be called by UI event listeners
        this.socket.emit('sandbox-place', { type, ...pos });
    }
}

if (typeof module !== 'undefined') module.exports = ClientEngine;
else window.EngineController = ClientEngine;
