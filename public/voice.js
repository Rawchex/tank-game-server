let localStream = null;
const peers = {}; // socket.id -> RTCPeerConnection
const audioElements = {}; // socket.id -> HTMLAudioElement

// Ses Ayarları Objeleri
window.voiceSettings = {
    globalVolume: 1.0,  // %0 ile %100 arası master ses seviyesi
    pttEnabled: false,  // Bas-Konuş modu aktif mi? (Push-To-Talk)
    pttActive: false,   // PTT butonuna basılıyor mu?
    micMuted: false,    // Mikrofon tamamen kapalı mı?
    mutedPlayers: {}    // socket.id -> true (Sesi kapatılan oyuncular)
};

// Speaking Detection Setup
window.speakingUsers = {}; 
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analysers = {}; 


// Mikrofon durumunu günceller (Susturma ve Bas-Konuş için)
window.updateLocalMicState = function() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (window.voiceSettings.micMuted) {
        track.enabled = false; // Tamamen susturulmuş
    } else if (window.voiceSettings.pttEnabled) {
        track.enabled = window.voiceSettings.pttActive; // Sadece basılıyorsa aktif
    } else {
        track.enabled = true; // Açık mikrofon
    }
};

// V tuşuna basılı tutulduğunda konuş (Bas-Konuş)
document.addEventListener('keydown', (e) => {
    if ((e.code === 'KeyV' || e.key === 'v' || e.key === 'V') && !e.repeat) {
        window.voiceSettings.pttActive = true;
        window.updateLocalMicState();
    }
});
document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyV' || e.key === 'v' || e.key === 'V') {
        window.voiceSettings.pttActive = false;
        window.updateLocalMicState();
    }
});

// RTCPeerConnection konfigürasyonu (STUN server)
const peerConnectionConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

async function initVoiceChat() {
    if (localStream) return; // ALREADY INITIALIZED! Prevent double STUN calls.
    try {
        // ... optimize
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 24000 // Tarayıcı performansını ve network yükünü azaltır
            }, 
            video: false 
        });
        console.log("Mikrofon izni alındı ve optimize edildi.");
        
        // Başlangıç durumu mikrofon ayarlarını uygula
        window.updateLocalMicState();
        
        // Sunucuya sesli sohbete katıldığımızı bildir
        socket.emit('voice-join');
    } catch (err) {
        alert("Mikrofon izni reddedildi. Sesli sohbete katılamayacaksınız.");
        console.warn("Mikrofon erişimi reddedildi veya bulunamadı:", err);
    }
}

// Başka bir oyuncu koptuğunda bağlantısını temizle
socket.on('voice-user-left', (userId) => {
    if (peers[userId]) {
        peers[userId].close();
        delete peers[userId];
    }
    if (audioElements[userId]) {
        audioElements[userId].remove();
        delete audioElements[userId];
    }
});

// Yeni bir kullanıcı katıldığında ona bir teklif (Offer) başlat
socket.on('voice-user-joined', (userId) => {
    if (!localStream) return;
    createPeerConnection(userId, true);
});

// Gelen WebRTC sinyallerini işle (Offer, Answer, ICE Candidate)
socket.on('voice-signal', async (data) => {
    if (!localStream) return;
    const { from, signal } = data;
    
    if (signal.type === 'offer') {
        const pc = createPeerConnection(from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice-signal', { to: from, signal: { type: 'answer', sdp: pc.localDescription } });
    } else if (signal.type === 'answer') {
        if (peers[from]) {
            await peers[from].setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
    } else if (signal.type === 'ice') {
        if (peers[from]) {
            await peers[from].addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }
});

function createPeerConnection(userId, isInitiator) {
    if (peers[userId]) return peers[userId]; // Zaten varsa geri dön

    const pc = new RTCPeerConnection(peerConnectionConfig);
    peers[userId] = pc;
    
    // Lokal sesi karşı tarafa ekle
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    
    // ICE adaylarını (network yolu tespiti) bulduğumuzda gönder
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('voice-signal', { to: userId, signal: { type: 'ice', candidate: event.candidate } });
        }
    };
    
    // Karşıdan bir ses/video track geldiğinde oynat
    pc.ontrack = (event) => {
        if (!audioElements[userId]) {
            const audio = document.createElement('audio');
            audio.autoplay = true;
            // Sesin üst üste binmemesi için ilk başta sesi kısıyoruz
            audio.volume = 0; 
            document.body.appendChild(audio);
            audioElements[userId] = audio;
        }
        audioElements[userId].srcObject = event.streams[0];
        
        // Setup analyser for speaking highlight
        const source = audioCtx.createMediaStreamSource(event.streams[0]);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analysers[userId] = analyser;
    };
    
    // Offer oluşturan taraf isek
    if (isInitiator) {
        pc.onnegotiationneeded = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('voice-signal', { to: userId, signal: { type: 'offer', sdp: pc.localDescription } });
            } catch (error) {
                console.error("Offer oluştururken hata:", error);
            }
        };
    }
    
    return pc;
}

// render.js içerisinde her karede (frame) çağrılacak fonksiyon
// Mesafe bazlı (Proximity) ses ayarlaması yapar
function updateVoiceProximity(state, myId) {
    const isSpectatorOrDead = !state.players[myId] || state.players[myId].isDead;
    let myPos = null;

    if (!isSpectatorOrDead) {
        myPos = { x: state.players[myId].x, y: state.players[myId].y };
    } else if (window.isEditingMap && window.myEditorPos) {
        myPos = window.myEditorPos; // Use camera pos for hearing
    }
    
    const maxHearingDist = 600; // Sesi duyabilmek için max mesafe
    
    for (let id in audioElements) {
        if (state.players[id]) {
            let vol = 1.0;
            
            if (myPos) {
                const dx = state.players[id].x - myPos.x;
                const dy = state.players[id].y - myPos.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                vol = 1.0 - (dist / maxHearingDist);
                if (vol < 0) vol = 0;
            } else {
                // If completely dead, grant them 50% global volume
                vol = 0.5;
            }

            if (vol > 1) vol = 1;

            // Global ses ayarını (Master Volume) uygula
            vol *= window.voiceSettings.globalVolume;

            // Oyuncu ölü mü, veya bilerek susturuldu mu kontrol et
            if (state.players[id].isDead || window.voiceSettings.mutedPlayers[id]) {
                vol = 0; 
            }
            
            // Performans optimizasyonu: Eğer ses zaten 0 ve hala 0 hesaplanmışsa ses elemanını hiç yorma
            if (audioElements[id].volume !== vol) {
                audioElements[id].volume = vol;
            }
            
            // Speaking detection
            if (analysers[id]) {
                const dataArray = new Uint8Array(analysers[id].frequencyBinCount);
                analysers[id].getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                window.speakingUsers[id] = (sum / dataArray.length) > 15;
            }
        } else {
            if (audioElements[id].volume !== 0) audioElements[id].volume = 0;
            window.speakingUsers[id] = false;
        }
    }

    // Check local mic
    if (localStream) {
        if (!analysers['local']) {
            const source = audioCtx.createMediaStreamSource(localStream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analysers['local'] = analyser;
        }
        const dataArray = new Uint8Array(analysers['local'].frequencyBinCount);
        analysers['local'].getByteFrequencyData(dataArray);
        let sum = 0;
        for (let j = 0; j < dataArray.length; j++) sum += dataArray[j];
        window.speakingUsers[myId] = (sum / dataArray.length) > 15 && (!window.voiceSettings.pttEnabled || window.voiceSettings.pttActive);
    }
}
