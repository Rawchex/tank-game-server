const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Harita boyutlarına sunucu ile eşleşecek şekilde erişim (3000x2000)
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 2000;

window.myLatestPos = null;
window.cameraOffset = { x: 0, y: 0 };

// Redundant walls removed. Layout is now dynamically provided by server.

let particles = [];

window.addEventListener('resize', resizeCanvas);
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas(); // Initial size

window.myEditorPos = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

function renderGame(state, myId) {
    // Determine player's position to center camera
    if (state.players[myId] && !state.players[myId].isDead) {
        window.myLatestPos = { x: state.players[myId].x, y: state.players[myId].y };
    } else if (window.isEditingMap) {
        if (window.inputKeys) {
            const camSpeed = 15;
            if (window.inputKeys.w) window.myEditorPos.y -= camSpeed;
            if (window.inputKeys.s) window.myEditorPos.y += camSpeed;
            if (window.inputKeys.a) window.myEditorPos.x -= camSpeed;
            if (window.inputKeys.d) window.myEditorPos.x += camSpeed;
            
            window.myEditorPos.x = Math.max(0, Math.min(window.myEditorPos.x, MAP_WIDTH));
            window.myEditorPos.y = Math.max(0, Math.min(window.myEditorPos.y, MAP_HEIGHT));
        }
        window.myLatestPos = window.myEditorPos;
    }

    if (window.myLatestPos) {
        // Find local player in state to get latest coordinates
        const me = state.players[myId];
        if (me && !me.isDead) {
            window.myLatestPos = { x: me.x, y: me.y };
        } else if (window.isEditingMap && window.myEditorPos) {
            window.myLatestPos = window.myEditorPos;
        }

        // Calculate camera offsets, clamped to map boundaries
        let camX = window.myLatestPos.x - canvas.width / 2;
        let camY = window.myLatestPos.y - canvas.height / 2;

        camX = Math.max(0, Math.min(camX, MAP_WIDTH - canvas.width));
        camY = Math.max(0, Math.min(camY, MAP_HEIGHT - canvas.height));

        window.cameraOffset = { x: camX, y: camY };
    }

    // Arka planı temizle ve kamerayı uygula
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // THEME SELECTION & BACKGROUND
    let sMap = state.sandboxMap || window.dynamicSandboxData || { 
        theme: 'grass', walls: [], crates: [], bushes: [], tires: [], 
        barrels: [], speedPads: [], spawns: [] 
    };
    let theme = sMap.theme || 'grass';
    if (theme === 'grass') ctx.fillStyle = '#1e824c';
    else if (theme === 'desert') ctx.fillStyle = '#e67e22';
    else if (theme === 'space') ctx.fillStyle = '#0a0a0f';
    else if (theme === 'winter') ctx.fillStyle = '#ecf0f1';
    else ctx.fillStyle = '#1a252f';

    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    // Draw map border lines
    ctx.strokeStyle = theme === 'space' ? '#3498db' : '#e74c3c';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    function drawRotatedRect(obj, color, strokeColor = null) {
        ctx.save();
        ctx.translate(obj.x + obj.width / 2, obj.y + obj.height / 2);
        if (obj.rotation) ctx.rotate(obj.rotation * Math.PI / 180);
        ctx.fillStyle = color;
        ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
        if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(-obj.width / 2 + 2, -obj.height / 2 + 2, obj.width - 4, obj.height - 4);
        }
        ctx.restore();
    }
    
    // Editor ızgarası (Grid)
    if (window.isEditingMap) {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        const GRID_SIZE = 40;
        ctx.beginPath();
        for (let x = 0; x <= MAP_WIDTH; x += GRID_SIZE) {
            ctx.moveTo(x, 0); ctx.lineTo(x, MAP_HEIGHT);
        }
        for (let y = 0; y <= MAP_HEIGHT; y += GRID_SIZE) {
            ctx.moveTo(0, y); ctx.lineTo(MAP_WIDTH, y);
        }
        ctx.stroke();
    }

    // Main walls are now part of the layout dynamically.
    
    // Dinamik Duvarları Çiz
    ctx.fillStyle = '#95a5a6';
    // Dinamik Duvarları Çiz
    for (let w of (sMap.walls || [])) {
        drawRotatedRect(w, '#95a5a6', '#bdbdbd');
    }

    // Dinamik Kutuları (Crates) Çiz
    for (let c of (sMap.crates || [])) {
        drawRotatedRect(c, '#d35400', '#e67e22');
    }

    // Dinamik Lastikleri (Tires) Çiz
    for (let t of (sMap.tires || [])) {
        ctx.save();
        ctx.translate(t.x + t.width/2, t.y + t.height/2);
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.arc(0, 0, t.width/2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#34495e';
        ctx.stroke();
        ctx.restore();
    }

    // Dinamik Çalılar (Bushes)
    for (let b of (sMap.bushes || [])) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        drawRotatedRect(b, '#0a3d1d');
        ctx.restore();
    }

    // Patlayan Variller (Barrels)
    for (let br of (sMap.barrels || [])) {
        drawRotatedRect(br, '#c0392b', '#ff4d4d');
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.fillText("EXPL", br.x + 5, br.y + 25);
    }

    // Hız Pedleri (SpeedPads)
    for (let sp of (sMap.speedPads || [])) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        drawRotatedRect(sp, '#2ecc71', '#58d68d');
        ctx.restore();
    }

    // Doğma Noktaları (Spawns)
    for (let sn of (sMap.spawns || [])) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        let color = sn.type === 'Red' ? '#e74c3c' : '#3498db';
        drawRotatedRect(sn, color);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Arial';
        ctx.fillText(sn.type + " SPAWN", sn.x + 2, sn.y + 25);
        ctx.restore();
    }

    // Mermileri Çiz (Ateş edildiği andaki açıyla ilerliyor)
    ctx.fillStyle = '#f1c40f'; // Sarı
    for (let b of state.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
    }

    // Yeni patlamaları partikül listesine ekle
    if (state.explosions) {
        for (let ex of state.explosions) {
            // Bir patlama için 10-15 küçük parça oluştur
            const count = Math.floor(Math.random() * 5) + 10;
            for (let i = 0; i < count; i++) {
                particles.push({
                    x: ex.x,
                    y: ex.y,
                    vx: (Math.random() - 0.5) * 8,
                    vy: (Math.random() - 0.5) * 8,
                    life: 1.0,
                    color: ex.color || '#e74c3c'
                });
            }
        }
    }

    // Partikülleri çiz ve güncelle
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05; // 20 frame içinde kaybolur

        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }

        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
    }
    // Alfa kanalını sıfırla
    ctx.globalAlpha = 1.0;

    let redScore = 0;
    let blueScore = 0;

    let allPlayers = [];

    // --- HUD: MATCH INTEL ---
    if (gameState.matchTime !== undefined) {
        ctx.save();
        ctx.fillStyle = "white";
        ctx.font = "bold 24px 'Inter', sans-serif";
        ctx.textAlign = "center";
        const mins = Math.floor(gameState.matchTime / 60);
        const secs = gameState.matchTime % 60;
        ctx.fillText(`${mins}:${secs < 10 ? '0' : ''}${secs}`, canvas.width / 2, 40);
        ctx.restore();
    }

    if (gameState.teamScores) {
        ctx.save();
        ctx.font = "bold 20px 'Inter', sans-serif";
        
        // Red Score (Left)
        ctx.fillStyle = "#e74c3c";
        ctx.textAlign = "left";
        ctx.fillText(`RED: ${gameState.teamScores.Red}`, 20, 40);
        
        // Blue Score (Right)
        ctx.fillStyle = "#3498db";
        ctx.textAlign = "right";
        ctx.fillText(`BLUE: ${gameState.teamScores.Blue}`, canvas.width - 20, 40);
        ctx.restore();
    }

    // --- OTHER HUD (Scores, Skills) ---
    renderScores(gameState.players);

    // Oyuncuları Çiz
    for (let id in state.players) {
        let p = state.players[id];
        allPlayers.push({ id, name: p.name, score: p.score, team: p.team });

        if (p.team === 'Red') redScore += p.score;
        if (p.team === 'Blue') blueScore += p.score;

        if (id === myId) {
            window.myLatestPos = { x: p.x, y: p.y }; // Kendi pozisyonumu angle için kaydet
        }

        if (p.isDead) continue;

        // Tank Gövdesi
        ctx.fillStyle = p.team === 'Red' ? '#e74c3c' : '#3498db';
        ctx.fillRect(p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);

        // İsim etiketi
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - p.height / 2 - 20);

        // Can Barı
        const hpBarY = p.y - p.height / 2 - 12;
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(p.x - p.width / 2, hpBarY, p.width, 5);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(p.x - p.width / 2, hpBarY, p.width * (p.health / 100), 5);

        // Heal efekti partikülü (yeşil çerçeve)
        if (p.isHealing) {
            ctx.strokeStyle = '#2ecc71';
            ctx.lineWidth = 3;
            ctx.strokeRect(p.x - p.width / 2 - 4, p.y - p.height / 2 - 4, p.width + 8, p.height + 8);
        }

        // Hız efekti
        if (p.isSpeedBoosted) {
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x - p.width / 2 - 3, p.y - p.height / 2 - 3, p.width + 6, p.height + 6);
        }

        // Kendi tankımızın etrafında parlayan bir çerçeve
        if (id === myId) {
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x - p.width / 2 - 2, p.y - p.height / 2 - 2, p.width + 4, p.height + 4);
        }
    }

    // Çalıları (Bushes) en üste çiz (Tankların üzerine)
    for (let b of (sMap.bushes || [])) {
        ctx.fillStyle = 'rgba(39, 174, 96, 0.9)'; // Koyu yeşil opak
        ctx.fillRect(b.x, b.y, b.width, b.height);
        ctx.fillStyle = 'rgba(46, 204, 113, 0.9)'; // Açık yeşil doku
        ctx.fillRect(b.x + 8, b.y + 8, 12, 12);
        ctx.fillRect(b.x + 24, b.y + 24, 8, 8);
    }

    // Skor Tablosunu Güncelle (Takım & Liderlik Tablosu)
    const scoreRedEl = document.getElementById('score-red');
    const scoreBlueEl = document.getElementById('score-blue');
    if (scoreRedEl) scoreRedEl.innerText = redScore;
    if (scoreBlueEl) scoreBlueEl.innerText = blueScore;

    // Liderlik Tablosu
    const leaderboardEl = document.getElementById('leaderboard-list');
    if (leaderboardEl) {
        allPlayers.sort((a, b) => b.score - a.score); // Highest first
        leaderboardEl.innerHTML = '';
        allPlayers.forEach(player => {
            const row = document.createElement('div');
            row.className = 'score-row';
            row.innerHTML = `<span style="color:${player.team === 'Red' ? '#e74c3c' : '#3498db'}">${player.name}</span> <span>${player.score}</span>`;
            leaderboardEl.appendChild(row);
        });
    }

    // Mesafe bazlı ses güncellemesi (Eğer voice.js yüklenmişse)
    if (typeof updateVoiceProximity === 'function') {
        updateVoiceProximity(state, myId);
    }
}
