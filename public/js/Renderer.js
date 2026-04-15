/**
 * Tank Engine 2.0 - Modular Renderer (Premium Edition)
 * Handles layered drawing with neon glows and high-fidelity effects.
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

        // 2. LAYER 1: Environment
        this.renderEnvironment(state);

        // 3. LAYER 2: Decals & Effects
        this.renderEffects(state);

        // 4. LAYER 3: Entities
        this.renderEntities(state, myId);

        // 5. LAYER 4: World-Space Overlay (Nameplates)
        this.renderWorldOverlay(state, myId);
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

        // Clamp to map bounds
        camX = Math.max(0, Math.min(camX, this.config.MAP_WIDTH - this.canvas.width));
        camY = Math.max(0, Math.min(camY, this.config.MAP_HEIGHT - this.canvas.height));

        this.cameraOffset = { x: camX, y: camY };
    }

    renderEnvironment(state) {
        const map = state.sandboxMap || { theme: 'grass', walls: [] };
        const theme = map.theme || 'grass';
        
        // Background
        this.ctx.fillStyle = this.getThemeColor(theme);
        this.ctx.fillRect(0, 0, this.config.MAP_WIDTH, this.config.MAP_HEIGHT);

        // Tech Grid
        this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x < this.config.MAP_WIDTH; x += 100) {
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.config.MAP_HEIGHT); this.ctx.stroke();
        }
        for (let y = 0; y < this.config.MAP_HEIGHT; y += 100) {
            this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(this.config.MAP_WIDTH, y); this.ctx.stroke();
        }

        // Walls (Obsidian Style)
        this.ctx.fillStyle = '#0f172a';
        this.ctx.shadowBlur = 0;
        for (let w of (map.walls || [])) {
            this.ctx.fillRect(w.x, w.y, w.width, w.height);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            this.ctx.strokeRect(w.x, w.y, w.width, w.height);
        }
        
        // Crates
        this.ctx.fillStyle = '#334155';
        for (let c of (map.crates || [])) {
            this.ctx.fillRect(c.x, c.y, c.width, c.height);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            this.ctx.strokeRect(c.x + 4, c.y + 4, c.width - 8, c.height - 8);
        }
    }

    renderEntities(state, myId) {
        // Players
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
            const isBlue = p.team === 'Blue';

            // Tank Glow
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = isBlue ? 'hsla(190, 100%, 50%, 0.5)' : 'hsla(340, 100%, 50%, 0.5)';

            this.ctx.save();
            this.ctx.translate(rx, ry);
            this.ctx.rotate(this.renderPlayers[id].angle);
            
            // Body
            this.ctx.fillStyle = isBlue ? 'hsl(190, 100%, 50%)' : 'hsl(340, 100%, 50%)';
            this.ctx.fillRect(-p.width/2, -p.height/2, p.width, p.height);
            
            // Barrel (Darker)
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, -3, 22, 6);
            this.ctx.restore();
            
            this.ctx.shadowBlur = 0;
            
            // Shield Effect
            if (p.shieldTime > 0) {
                this.ctx.strokeStyle = isBlue ? 'hsl(190, 100%, 50%)' : 'hsl(340, 100%, 50%)';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([4, 4]);
                this.ctx.beginPath();
                this.ctx.arc(rx, ry, p.width * 1.1, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
        }

        // Bullets (Neon)
        for (let b of (state.bullets || [])) {
            const isBlue = b.team === 'Blue';
            this.ctx.fillStyle = '#fff';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = isBlue ? 'hsl(190, 100%, 50%)' : 'hsl(340, 100%, 50%)';
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    }

    renderEffects(state) {
        if (state.explosions) {
            for (let ex of state.explosions) {
                for (let i = 0; i < 12; i++) {
                    this.particles.push({
                        x: ex.x, y: ex.y,
                        vx: (Math.random() - 0.5) * 8,
                        vy: (Math.random() - 0.5) * 8,
                        life: 1.0, color: ex.color
                    });
                }
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.life -= 0.03;
            if (p.life <= 0) { this.particles.splice(i, 1); continue; }
            
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color || '#fff';
            this.ctx.fillRect(p.x, p.y, 5, 5);
        }
        this.ctx.globalAlpha = 1.0;
    }

    renderWorldOverlay(state, myId) {
        for (let id in state.players) {
            const p = state.players[id];
            if (p.isDead) continue;

            const rx = this.renderPlayers[id]?.x || p.x;
            const ry = (this.renderPlayers[id]?.y || p.y) - 35;

            // Name
            const isSpeaking = window.speakingUsers && window.speakingUsers[id];
            this.ctx.fillStyle = isSpeaking ? 'hsl(150, 100%, 50%)' : '#fff';
            this.ctx.font = `600 ${isSpeaking ? '14px' : '12px'} Outfit`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(p.name.toUpperCase(), rx, ry);

            // Tech HP Bar
            const barW = 34;
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.fillRect(rx - barW/2, ry + 6, barW, 4);
            this.ctx.fillStyle = (p.health > 40) ? 'hsl(190, 100%, 50%)' : 'hsl(340, 100%, 50%)';
            this.ctx.fillRect(rx - barW/2, ry + 6, barW * (p.health / 100), 4);
        }
    }

    getThemeColor(theme) {
        switch(theme) {
            case 'desert': return '#1a1a05'; // Dark Desert
            case 'space': return '#050510';  // Void
            case 'grass': return '#0a1a10';  // Deep Forest
            default: return '#0a101a';
        }
    }
}

if (typeof module !== 'undefined') module.exports = Renderer;
else window.EngineRenderer = Renderer;
