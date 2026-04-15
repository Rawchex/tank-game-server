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
        
        // Asset Preloader
        this.assets = { sprites: new Image() };
        this.assetsLoaded = false;
        
        this.assets.sprites.src = '/assets/tankspritesheet.png';
        this.assets.sprites.onload = () => {
            console.log('Sprite sheet loaded:', this.assets.sprites.width, 'x', this.assets.sprites.height);
            this.assetsLoaded = true;
        };

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
        if (this.assetsLoaded) {
            this.renderEntitiesWithSprites(state, myId);
        } else {
            this.renderEntities(state, myId); // Fallback geometry
        }

        // 5. LAYER 4: World-Space Overlay (Nameplates)
        this.renderWorldOverlay(state, myId);

        // 6. LAYER 5: Screen-Space State Overlay
        this.renderScreenOverlays(state);
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
        if (!this.assetsLoaded) {
            this.ctx.fillStyle = this.getThemeColor(theme);
            this.ctx.fillRect(0, 0, this.config.MAP_WIDTH, this.config.MAP_HEIGHT);

            this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
            this.ctx.lineWidth = 1;
            for (let x = 0; x < this.config.MAP_WIDTH; x += 100) {
                this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.config.MAP_HEIGHT); this.ctx.stroke();
            }
            for (let y = 0; y < this.config.MAP_HEIGHT; y += 100) {
                this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(this.config.MAP_WIDTH, y); this.ctx.stroke();
            }
        } else {
            // Isometric Grass Pattern (Row 11, Col 1 => Y=1280, X=0, Size=128)
            const tileW = 128;
            for (let y = 0; y < this.config.MAP_HEIGHT; y += tileW) {
                for (let x = 0; x < this.config.MAP_WIDTH; x += tileW) {
                    this.ctx.drawImage(this.assets.sprites, 0, 1280, tileW, tileW, x, y, tileW, tileW);
                }
            }
        }

        // Walls (Stone Blocks - Row 11, Col 4 => X=384, Y=1280)
        for (let w of (map.walls || [])) {
            if (this.assetsLoaded) {
                // Determine how many tiles we need to fill the wall area
                const tileW = 64; 
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.rect(w.x, w.y, w.width, w.height);
                this.ctx.clip(); // Ensure we don't draw outside the wall bounds
                
                for (let wy = w.y; wy < w.y + w.height; wy += tileW) {
                    for (let wx = w.x; wx < w.x + w.width; wx += tileW) {
                        this.ctx.drawImage(this.assets.sprites, 384, 1280, 128, 128, wx, wy, tileW, tileW);
                    }
                }
                this.ctx.restore();
            } else {
                this.ctx.fillStyle = '#0f172a';
                this.ctx.shadowBlur = 0;
                this.ctx.fillRect(w.x, w.y, w.width, w.height);
                this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                this.ctx.strokeRect(w.x, w.y, w.width, w.height);
            }
        }
        
        // Crates
        this.ctx.fillStyle = '#334155';
        for (let c of (map.crates || [])) {
            this.ctx.fillRect(c.x, c.y, c.width, c.height);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            this.ctx.strokeRect(c.x + 4, c.y + 4, c.width - 8, c.height - 8);
        }
    }

    renderEntitiesWithSprites(state, myId) {
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

            let deg = (this.renderPlayers[id].angle * 180 / Math.PI); 
            if (deg < 0) deg += 360; // 0 to 360
            
            // Map 360 degrees to 8 Isometric Columns
            let dirIndex = 2; // Default East
            if (deg >= 337.5 || deg < 22.5) dirIndex = 2; // E
            else if (deg >= 22.5 && deg < 67.5) dirIndex = 3; // SE
            else if (deg >= 67.5 && deg < 112.5) dirIndex = 4; // S
            else if (deg >= 112.5 && deg < 157.5) dirIndex = 5; // SW
            else if (deg >= 157.5 && deg < 202.5) dirIndex = 6; // W
            else if (deg >= 202.5 && deg < 247.5) dirIndex = 7; // NW
            else if (deg >= 247.5 && deg < 292.5) dirIndex = 0; // N
            else if (deg >= 292.5 && deg < 337.5) dirIndex = 1; // NE

            // Total width=2048, 8 columns => 256px wide each
            // Depending on team, use Row 1 (0px) or Row 9 (2048)? Wait total image is 2048px tall.
            // If the image is perfectly a square with 16 rows, each is 128px high. Let's use 256x256 assumption for tanks though.
            const cellW = 256;
            const cellH = 256;
            // Let's use Row 1 (y=0) for Blue, Row 10 (y=9*cellH) for Red if we have multiple tanks? Actually let's just stick to Row 1 for both right now to ensure it draws securely.
            // Oh wait, if each is 256 tall, total 2048 allows 8 rows!
            // But the image we saw had about 16 rows. So cell height is 128. Let's use 128 for height!
            const actH = 128;
            let sy = 0; // Row 1 (Idles)
            const sx = dirIndex * cellW;

            // Optional: Draw shadow or selection ring underneath
            // ...

            // Draw Sprite
            const scale = 0.55; 
            this.ctx.drawImage(this.assets.sprites, sx, sy, cellW, actH, rx - (cellW*scale)/2, ry - (actH*scale)/2, cellW*scale, actH*scale);
            
            // Shield Effect (Over the top)
            if (p.shieldTime > 0) {
                this.ctx.strokeStyle = isBlue ? 'hsl(190, 100%, 50%)' : 'hsl(340, 100%, 50%)';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]);
                this.ctx.beginPath();
                this.ctx.arc(rx, ry, p.width * 1.5, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
        }

        // Bullets (Neon - keep original since they look cool and pseudo-3D enough)
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
                // Instead of multiple tiny boxes, we push a single Animated Explosion
                this.particles.push({
                    x: ex.x, y: ex.y,
                    frame: 0,
                    maxFrames: 8, // Assuming 8 frames for the explosion animation
                    life: 1.0
                });
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            // Advance frame based on life drop (1.0 to 0)
            p.life -= 0.05; // Play speed
            p.frame = Math.floor((1.0 - p.life) * p.maxFrames);

            if (p.life <= 0 || p.frame >= p.maxFrames) { 
                this.particles.splice(i, 1); 
                continue; 
            }
            
            if (this.assetsLoaded) {
                // Animated Explosion (Assume Row 14 `Y=1664` or Row 15 `Y=1792`)
                // We'll map the X coordinate to `p.frame * cellW`
                const expTileW = 128;
                const expSy = 1664; // Approximated position for the explosion fireballs
                const expSx = p.frame * expTileW;
                
                this.ctx.drawImage(this.assets.sprites, expSx, expSy, expTileW, expTileW, p.x - 40, p.y - 40, 80, 80);
            } else {
                // Fallback geometry
                this.ctx.globalAlpha = p.life;
                this.ctx.fillStyle = '#ff4400';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.frame * 5, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.globalAlpha = 1.0;
            }
        }
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

    renderScreenOverlays(state) {
        if (!state) return;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to screen space
        this.ctx.textAlign = 'center';
        
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        if (state.matchState === 'LOBBY') {
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '800 48px Outfit, sans-serif';
            this.ctx.fillText("WAITING FOR DEPLOYMENT", cx, cy);
            this.ctx.font = '300 24px Outfit, sans-serif';
            this.ctx.fillStyle = 'rgb(180, 180, 180)';
            this.ctx.fillText("Host must launch the operation from the hub.", cx, cy + 40);
        } else if (state.matchState === 'STARTING') {
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = 'hsl(340, 100%, 50%)'; // --secondary color
            this.ctx.font = '800 120px Outfit, sans-serif';
            this.ctx.fillText(state.countdown > 0 ? state.countdown : "FIGHT!", cx, cy);
        } else if (state.matchState === 'ROUND_END') {
            this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '800 64px Outfit, sans-serif';
            this.ctx.fillText("ROUND CONCLUDED", cx, cy);
            this.ctx.fillStyle = 'hsl(190, 100%, 50%)'; // --primary color
            this.ctx.font = '400 32px Outfit, sans-serif';
            this.ctx.fillText(`Next round in ${state.countdown}...`, cx, cy + 60);
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
