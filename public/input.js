window.inputKeys = { w: false, a: false, s: false, d: false };
let socketRef = null;

const skillCooldowns = { z: false, x: false, c: false };
const SKILL_COOLDOWN_MS = { z: 10000, x: 8000, c: 12000 };

function initInput(socket) {
    socketRef = socket;

    window.addEventListener('keydown', (e) => {
        if (!e.key) return;
        let k = e.key.toLowerCase();
        if (window.inputKeys.hasOwnProperty(k)) {
            window.inputKeys[k] = true;
            if (!window.isEditingMap) socketRef.emit('input', window.inputKeys);
        }

        // --- SANDBOX 2.0 HOTKEYS ---
        if (window.isEditingMap) {
            if (k === 'r') {
                window.editorRotation = (window.editorRotation + 90) % 360;
                const rotDisplay = document.getElementById('editor-rot-display');
                if (rotDisplay) rotDisplay.innerText = `Rotation: ${window.editorRotation}°`;
            }
            if (e.ctrlKey && k === 'z') {
                if (undoStack.length > 0) {
                    redoStack.push(JSON.stringify(window.dynamicSandboxData));
                    window.dynamicSandboxData = JSON.parse(undoStack.pop());
                    socketRef.emit('sandbox-update', window.dynamicSandboxData);
                }
            }
        }

        // Skills trigger
        if (['z', 'x', 'c'].includes(k) && !skillCooldowns[k]) {
            socketRef.emit('useSkill', k);
            startSkillCooldown(k);
        }
    });

    window.addEventListener('keyup', (e) => {
        if (!e.key) return;
        let k = e.key.toLowerCase();
        if (window.inputKeys.hasOwnProperty(k)) {
            window.inputKeys[k] = false;
            if (!window.isEditingMap) socketRef.emit('input', window.inputKeys);
        }
    });

    const canvas = document.getElementById('gameCanvas');

    // Sandbox 2.0 verisi
    window.dynamicSandboxData = { 
        theme: 'grass',
        walls: [], crates: [], bushes: [], tires: [], 
        barrels: [], speedPads: [], spawns: [] 
    };
    
    window.editorRotation = 0;
    const undoStack = [];
    const redoStack = [];

    window.saveToUndo = function() {
        undoStack.push(JSON.stringify(window.dynamicSandboxData));
        if (undoStack.length > 50) undoStack.shift();
        redoStack.length = 0;
    };

    const GRID_SIZE = 40;
    let selectedEditorObj = null;

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

        // Selection & Drag Logic (Sandbox 3.0)
        if (window.isEditingMap && isLeftClick) {
            const gridX = Math.floor(mouseX / GRID_SIZE) * GRID_SIZE;
            const gridY = Math.floor(mouseY / GRID_SIZE) * GRID_SIZE;
            
            for (let category in window.dynamicSandboxData) {
                if (Array.isArray(window.dynamicSandboxData[category])) {
                    const found = window.dynamicSandboxData[category].find(obj => obj.x === gridX && obj.y === gridY);
                    if (found) {
                        window.saveToUndo();
                        selectedEditorObj = found;
                        return;
                    }
                }
            }
        }

        // Editor modu devredeyken (Sadece sağ tık ile çizilir/silinir)
        if (window.isEditingMap && isRightClick) {
            saveToUndo();
            const gridX = Math.floor(mouseX / GRID_SIZE) * GRID_SIZE;
            const gridY = Math.floor(mouseY / GRID_SIZE) * GRID_SIZE;
            
            const tool = window.currentEditorTool || 'wall'; 
            
            if (e.shiftKey) {
                // Obje silme (Tüm kategorilerde)
                for (let category in window.dynamicSandboxData) {
                    if (Array.isArray(window.dynamicSandboxData[category])) {
                        window.dynamicSandboxData[category] = window.dynamicSandboxData[category].filter(obj => 
                            !(obj.x === gridX && obj.y === gridY)
                        );
                    }
                }
            } else {
                // Obje Ekleme (Categorization logic)
                let category = 'walls';
                if (tool === 'crate') category = 'crates';
                if (tool === 'bush') category = 'bushes';
                if (tool === 'tire') category = 'tires';
                if (tool === 'barrel') category = 'barrels';
                if (tool === 'speedPad') category = 'speedPads';
                if (tool === 'redSpawn' || tool === 'blueSpawn') category = 'spawns';

                let arr = window.dynamicSandboxData[category];
                
                // Diğer kategorilerden sil (Overlap koruması)
                for (let cat in window.dynamicSandboxData) {
                    if (Array.isArray(window.dynamicSandboxData[cat])) {
                        window.dynamicSandboxData[cat] = window.dynamicSandboxData[cat].filter(obj => 
                            !(obj.x === gridX && obj.y === gridY)
                        );
                    }
                }

                const newObj = { 
                    x: gridX, y: gridY, 
                    width: GRID_SIZE, height: GRID_SIZE, 
                    rotation: window.editorRotation 
                };
                
                // Spawn points are special tags
                if (tool === 'redSpawn') newObj.type = 'Red';
                if (tool === 'blueSpawn') newObj.type = 'Blue';

                arr.push(newObj);
            }
            
            socketRef.emit('sandbox-update', window.dynamicSandboxData);
            return;
        }

        // Normal oyun modu (Ateş etme)
        if (!window.isEditingMap && isLeftClick) {
            const angle = Math.atan2(mouseY - window.myLatestPos.y, mouseX - window.myLatestPos.x);
            socketRef.emit('shoot', angle);
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (window.isEditingMap && selectedEditorObj) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const mouseX = ((e.clientX - rect.left) * scaleX) + window.cameraOffset.x;
            const mouseY = ((e.clientY - rect.top) * scaleY) + window.cameraOffset.y;
            
            const gridX = Math.floor(mouseX / GRID_SIZE) * GRID_SIZE;
            const gridY = Math.floor(mouseY / GRID_SIZE) * GRID_SIZE;
            
            if (selectedEditorObj.x !== gridX || selectedEditorObj.y !== gridY) {
                selectedEditorObj.x = gridX;
                selectedEditorObj.y = gridY;
                socketRef.emit('sandbox-update', window.dynamicSandboxData);
            }
        }
    });

    window.addEventListener('mouseup', () => {
        selectedEditorObj = null;
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
