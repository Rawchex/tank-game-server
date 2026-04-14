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

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Sol tık
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const mouseX = ((e.clientX - rect.left) * scaleX) + window.cameraOffset.x;
            const mouseY = ((e.clientY - rect.top) * scaleY) + window.cameraOffset.y;

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
