/**
 * Tank Engine 2.0 - Modular Renderer
 * Handles layered drawing and visual effects.
 */
class Renderer {
    constructor(canvas, config) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.config = config;
        this.cameraOffset = { x: 0, y: 0 };
        this.renderPlayers = {};
        this.LERP_FACTOR = 0.25;
        this.particles = [];
        
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    render(state, myId) {
        if (!state) return;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Camera Update
        this.updateCamera(state, myId);

        // Apply Camera Transform
        this.ctx.translate(-this.cameraOffset.x, -this.cameraOffset.y);

        // 2. LAYER 1: Background & Environment
        this.renderEnvironment(state);

        // 3. LAYER 2: Decals & Effects (Explosions/Particles)
        this.renderEffects(state);

        // 4. LAYER 3: Entities (Tanks/Bullets)
        this.renderEntities(state, myId);

        // 5. LAYER 4: UI / HUD (Names/Bars) - Handled separately in world space
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset for HUD if needed, or keep in world space
        this.renderOverlay(state, myId);
    }

    updateCamera(state, myId) {
        const me = state.players[myId];
        let targetX = this.config.MAP_WIDTH / 2;
        let targetY = this.config.MAP_HEIGHT / 2;

        if (me && !me.isDead) {
            targetX = me.x;
            targetY = me.y;
        } else if (window.isEditingMap && window.myEditorPos) {
            targetX = window.myEditorPos.x;
            targetY = window.myEditorPos.y;
        }

        let camX = targetX - this.canvas.width / 2;
        let camY = targetY - this.canvas.height / 2;

        // Clamp
        camX = Math.max(0, Math.min(camX, this.config.MAP_WIDTH - this.canvas.width));
        camY = Math.max(0, Math.min(camY, this.config.MAP_HEIGHT - this.canvas.height));

        this.cameraOffset = { x: camX, y: camY };
    }

    renderEnvironment(state) {
        const map = state.sandboxMap || { theme: 'grass', walls: [] };
        const theme = map.theme || 'grass';
        
        // Background Fill
        this.ctx.fillStyle = this.getThemeColor(theme);
        this.ctx.fillRect(0, 0, this.config.MAP_WIDTH, this.config.MAP_HEIGHT);

        // Grid lines
        this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x < this.config.MAP_WIDTH; x += 100) {
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.config.MAP_HEIGHT); this.ctx.stroke();
        }
        for (let y = 0; y < this.config.MAP_HEIGHT; y += 100) {
            this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(this.config.MAP_WIDTH, y); this.ctx.stroke();
        }

        // Walls
        this.ctx.fillStyle = '#2c3e50';
        for (let w of (map.walls || [])) {
            this.ctx.fillRect(w.x, w.y, w.width, w.height);
        }
        // Crates
        this.ctx.fillStyle = '#d35400';
        for (let c of (map.crates || [])) {
            this.ctx.fillRect(c.x, c.y, c.width, c.height);
            this.ctx.strokeStyle = '#e67e22';
            this.ctx.strokeRect(c.x + 2, c.y + 2, c.width - 4, c.height - 4);
        }
    }

    renderEntities(state, myId) {
        // Players with LERP
        for (let id in state.players) {
            const p = state.players[id];
            if (!this.renderPlayers[id]) {
                this.renderPlayers[id] = { x: p.x, y: p.y, angle: p.angle };
            } else {
                this.renderPlayers[id].x += (p.x - this.renderPlayers[id].x) * this.LERP_FACTOR;
                this.renderPlayers[id].y += (p.y - this.renderPlayers[id].y) * this.LERP_FACTOR;
                this.renderPlayers[id].angle = p.angle;
            }

            if (p.isDead) { delete this.renderPlayers[id]; continue; }

            const rx = this.renderPlayers[id].x;
            const ry = this.renderPlayers[id].y;

            // Draw Tank
            this.ctx.save();
            this.ctx.translate(rx, ry);
            this.ctx.rotate(this.renderPlayers[id].angle);
            this.ctx.fillStyle = p.team === 'Red' ? '#e74c3c' : '#3498db';
            this.ctx.fillRect(-p.width/2, -p.height/2, p.width, p.height);
            // Barrel
            this.ctx.fillStyle = '#333';
            this.ctx.fillRect(0, -4, 25, 8);
            this.ctx.restore();

            // Status Effects (Shield)
            if (p.shieldTime > 0) {
                this.ctx.strokeStyle = '#3498db';
                this.ctx.setLineDash([5, 5]);
                this.ctx.beginPath();
                this.ctx.arc(rx, ry, p.width * 0.9, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
        }

        // Bullets
        this.ctx.fillStyle = '#f1c40f';
        for (let b of (state.bullets || [])) {
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    renderEffects(state) {
        // Handle Explosions from state to particles
        if (state.explosions) {
            for (let ex of state.explosions) {
                for (let i = 0; i < 10; i++) {
                    this.particles.push({
                        x: ex.x, y: ex.y,
                        vx: (Math.random() - 0.5) * 6,
                        vy: (Math.random() - 0.5) * 6,
                        life: 1.0, color: ex.color
                    });
                }
            }
        }

        // Particle update & draw
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.life -= 0.04;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color || '#e74c3c';
            this.ctx.fillRect(p.x, p.y, 4, 4);
        }
        this.ctx.globalAlpha = 1.0;
    }

    renderOverlay(state, myId) {
        const transX = -this.cameraOffset.x;
        const transY = -this.cameraOffset.y;

        for (let id in state.players) {
            const p = state.players[id];
            if (p.isDead) continue;

            const rx = (this.renderPlayers[id]?.x || p.x) + transX;
            const ry = (this.renderPlayers[id]?.y || p.y) + transY;

            // Name
            const isSpeaking = window.speakingUsers && window.speakingUsers[id];
            this.ctx.fillStyle = isSpeaking ? '#2ecc71' : '#fff';
            this.ctx.font = isSpeaking ? 'bold 13px Inter' : '11px Inter';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(p.name, rx, ry - 35);

            // HP Bar
            this.ctx.fillStyle = '#c0392b';
            this.ctx.fillRect(rx - 15, ry - 30, 30, 4);
            this.ctx.fillStyle = '#2ecc71';
            this.ctx.fillRect(rx - 15, ry - 30, 30 * (p.health / 100), 4);
        }
        
        // Pause UI
        if (state.paused) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 40px Inter';
            this.ctx.textAlign = 'center';
            this.ctx.fillText("MATCH PAUSED", this.canvas.width/2, this.canvas.height/2);
        }
    }

    getThemeColor(theme) {
        switch(theme) {
            case 'desert': return '#e67e22';
            case 'space': return '#0a0a0f';
            case 'winter': return '#ecf0f1';
            default: return '#1e824c';
        }
    }
}

if (typeof module !== 'undefined') module.exports = Renderer;
else window.EngineRenderer = Renderer;
