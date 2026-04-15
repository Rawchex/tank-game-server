let inputKeys = { w: false, a: false, s: false, d: false };
let socketRef = null;

const skillCooldowns = { z: false, x: false, c: false };
const SKILL_COOLDOWN_MS = { z: 10000, x: 8000, c: 12000 };

function initInput(socket) {
    socketRef = socket;

    window.addEventListener('keydown', (e) => {
        let k = e.key.toLowerCase();
        if (inputKeys.hasOwnProperty(k)) {
            inputKeys[k] = true;
            socketRef.emit('input', inputKeys);
        }

        // Skills trigger
        if (['z', 'x', 'c'].includes(k) && !skillCooldowns[k]) {
            socketRef.emit('useSkill', k);
            startSkillCooldown(k);
        }
    });

    window.addEventListener('keyup', (e) => {
        let k = e.key.toLowerCase();
        if (inputKeys.hasOwnProperty(k)) {
            inputKeys[k] = false;
            socketRef.emit('input', inputKeys);
        }
    });

    const canvas = document.getElementById('gameCanvas');

    // Sandbox default verisi
    window.dynamicSandboxData = { walls: [], crates: [], bushes: [], tires: [] };
    const GRID_SIZE = 40;

    // Sağ tıktaki menüyü engelle
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const mouseX = ((e.clientX - rect.left) * scaleX) + window.cameraOffset.x;
        const mouseY = ((e.clientY - rect.top) * scaleY) + window.cameraOffset.y;

        const isRightClick = e.button === 2;
        const isLeftClick = e.button === 0;

        // Editor modu devredeyken (Sadece sağ tık ile çizilir/silinir)
        if (window.isEditingMap && isRightClick) {
            const gridX = Math.floor(mouseX / GRID_SIZE) * GRID_SIZE;
            const gridY = Math.floor(mouseY / GRID_SIZE) * GRID_SIZE;
            
            const tool = window.currentEditorTool || 'wall'; // wall, crate, bush, tire
            
            if (e.shiftKey) {
                // Obje silme
                for (let category in window.dynamicSandboxData) {
                    window.dynamicSandboxData[category] = window.dynamicSandboxData[category].filter(obj => 
                        !(obj.x === gridX && obj.y === gridY)
                    );
                }
            } else {
                // Obje Ekleme
                let arr = window.dynamicSandboxData.walls;
                if (tool === 'crate') arr = window.dynamicSandboxData.crates;
                if (tool === 'bush') arr = window.dynamicSandboxData.bushes;
                if (tool === 'tire') arr = window.dynamicSandboxData.tires;
                
                // Aynı kategori içerisinde aynı yerde var mı kontrol et
                const exists = arr.find(o => o.x === gridX && o.y === gridY);
                if (!exists) {
                    // Diğer kategorilerden de siliyoruz ki üst üste binmesin
                    for (let category in window.dynamicSandboxData) {
                        window.dynamicSandboxData[category] = window.dynamicSandboxData[category].filter(obj => 
                            !(obj.x === gridX && obj.y === gridY)
                        );
                    }
                    arr.push({ x: gridX, y: gridY, width: GRID_SIZE, height: GRID_SIZE });
                }
            }
            
            socketRef.emit('sandbox-update', window.dynamicSandboxData);
            return;
        }

        // Normal oyun modu (Ateş etme)
        if (isLeftClick && !window.isEditingMap) {
            if (window.myLatestPos) {
                let dx = mouseX - window.myLatestPos.x;
                let dy = mouseY - window.myLatestPos.y;
                let angle = Math.atan2(dy, dx);
                socketRef.emit('shoot', angle);
            }
        }
    });
}

function startSkillCooldown(skill) {
    skillCooldowns[skill] = true;
    const uiEl = document.getElementById(`skill-${skill}`);
    if (uiEl) {
        uiEl.classList.remove('ready');
        uiEl.classList.add('cooldown');
    }

    setTimeout(() => {
        skillCooldowns[skill] = false;
        if (uiEl) {
            uiEl.classList.remove('cooldown');
            uiEl.classList.add('ready');
        }
    }, SKILL_COOLDOWN_MS[skill]);
}
