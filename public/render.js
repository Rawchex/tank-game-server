const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Harita boyutlarına sunucu ile eşleşecek şekilde erişim ihtiyacımız var, sunucudaki değerler:
const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1600;

window.myLatestPos = null;
window.cameraOffset = { x: 0, y: 0 };

const walls = [
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
];

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

    // Draw map bounds background
    ctx.translate(-window.cameraOffset.x, -window.cameraOffset.y);
    ctx.fillStyle = '#1a252f';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    // Draw map border lines
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    const sMap = state.sandboxMap || window.dynamicSandboxData || { walls: [], crates: [], bushes: [], tires: [] };
    
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

    // Sabit Duvarları Çiz
    ctx.fillStyle = '#7f8c8d';
    for (let wall of walls) {
        ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    }
    
    // Dinamik Duvarları Çiz
    ctx.fillStyle = '#95a5a6';
    for (let w of (sMap.walls || [])) {
        ctx.fillRect(w.x, w.y, w.width, w.height);
        ctx.strokeStyle = '#bdc3c7'; ctx.lineWidth = 2;
        ctx.strokeRect(w.x+2, w.y+2, w.width-4, w.height-4);
    }

    // Dinamik Kutuları (Crates) Çiz
    for (let c of (sMap.crates || [])) {
        ctx.fillStyle = '#d35400';
        ctx.fillRect(c.x, c.y, c.width, c.height);
        ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2;
        ctx.strokeRect(c.x + 4, c.y + 4, c.width - 8, c.height - 8);
    }

    // Dinamik Lastikleri (Tires) Çiz
    for (let t of (sMap.tires || [])) {
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.arc(t.x + t.width/2, t.y + t.height/2, t.width/2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#34495e';
        ctx.stroke();
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
