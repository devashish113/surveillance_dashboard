// Aegis Dashboard - Core Logic

const FEED_CONTAINER = document.getElementById('alert-feed');
const ALERT_COUNT = document.getElementById('alert-count');
const INSPECTOR_EMPTY = document.querySelector('.empty-state');
const INSPECTOR_DETAILS = document.getElementById('focal-details');

// State
let alertsData = [];
let activeAlertId = null;
let isFirstLoad = true;
let latestAlertIdStr = null;
let userInteracted = false;

// Audio Context Engine
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let soundEnabled = false;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('sound-toggle');
    if (soundEnabled) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> SOUND: ON';
        playSoftAlarm(); // Test beep
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> SOUND: OFF';
    }
}

function playSoftAlarm() {
    if (!soundEnabled || !audioCtx) return;
    const playBeep = (freq, startTime) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startTime);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + startTime + 0.1);
        osc.start(audioCtx.currentTime + startTime);
        osc.stop(audioCtx.currentTime + startTime + 0.1);
    };
    playBeep(600, 0);
    playBeep(800, 0.15);
}

function playPanicAlarm() {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    
    // Siren modulation
    for (let i = 0; i < 7; i++) {
        osc.frequency.setValueAtTime(600, audioCtx.currentTime + (i * 0.3));
        osc.frequency.linearRampToValueAtTime(1400, audioCtx.currentTime + (i * 0.3) + 0.15);
        osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + (i * 0.3) + 0.3);
    }
    
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 2.1);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 2.1);
}


// Polling interval removed, replaced with WebSockets
async function fetchLiveFeed() {
    try {
        const response = await fetch('/api/alerts');
        if (!response.ok) throw new Error("API Network Error");
        const newAlerts = await response.json();
        processIncomingFeed(newAlerts);
    } catch (err) {
        console.error("Dashboard Feed Sync Error:", err);
        if (isFirstLoad) {
            FEED_CONTAINER.innerHTML = `<div class="loading-state" style="color:var(--accent-red)"><i class="fa-solid fa-triangle-exclamation"></i> AWS Connection Failed</div>`;
        }
    }
}

function processIncomingFeed(newAlerts) {
    // If empty
    if (newAlerts.length === 0) {
        if (isFirstLoad) {
            FEED_CONTAINER.innerHTML = `<div class="loading-state"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Secure. No recent threats logged.</div>`;
            isFirstLoad = false;
        }
        return;
    }

    // Detect new incoming alerts to trigger sounds and notifications
    if (newAlerts.length > 0) {
        const newestAlert = newAlerts[0];
        if (latestAlertIdStr !== newestAlert.id) {
            if (latestAlertIdStr !== null) { // don't beep on first page load
                const reason = (newestAlert.reason || "").toLowerCase();
                if (reason.includes("object") || reason.includes("weapon") || reason.includes("knife")) {
                    playPanicAlarm();
                } else {
                    playSoftAlarm();
                }
                
                // Phase 12: OS Push Notification
                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("🚨 AEGIS THREAT DETECTED", {
                        body: newestAlert.reason || "Unknown Security Breach",
                    });
                }
            }
            latestAlertIdStr = newestAlert.id;
        }
    }

    alertsData = newAlerts;
    ALERT_COUNT.innerText = alertsData.length.toString();
    renderFeed();
    
    // Phase 13 UX: Auto-select newest alert if user is in "Live" mode
    if (!userInteracted && alertsData.length > 0) {
        selectAlert(alertsData[0].id, false);
    }
    
    isFirstLoad = false;
}

function renderFeed() {
    // Clear feed
    FEED_CONTAINER.innerHTML = '';
    const searchInput = document.getElementById('alert-filter');
    const filterText = searchInput ? searchInput.value.toLowerCase() : '';

    const filteredAlerts = alertsData.filter(alert => {
        const reason = (alert.reason || '').toLowerCase();
        return reason.includes(filterText);
    });

    if (filteredAlerts.length === 0 && alertsData.length > 0) {
        FEED_CONTAINER.innerHTML = '<div class="loading-state">No matching alerts found...</div>';
        return;
    }

    filteredAlerts.forEach((alert) => {
        const card = document.createElement('div');
        card.className = `alert-card ${activeAlertId === alert.id ? 'active' : ''}`;
        card.onclick = () => selectAlert(alert.id);

        const timeStr = alert.timestamp || 'Unknown Time';
        const reasonStr = alert.reason || 'Unidentified Threat';

        // Get some meta tags
        let tagsHTML = '';
        if (alert.ai_results?.face?.threat) tagsHTML += `<span class="meta-tag"><i class="fa-solid fa-user-xmark"></i> Face</span>`;
        if (alert.ai_results?.yolo?.threat) tagsHTML += `<span class="meta-tag"><i class="fa-solid fa-box-open"></i> Object</span>`;
        if (alert.ai_results?.motion?.motion) tagsHTML += `<span class="meta-tag"><i class="fa-solid fa-person-running"></i> Motion</span>`;

        card.innerHTML = `
            <div class="alert-time">${timeStr}</div>
            <div class="alert-reason">${reasonStr}</div>
            <div class="alert-meta">${tagsHTML}</div>
        `;

        FEED_CONTAINER.appendChild(card);
    });
}

function selectAlert(id, isUserClick = true) {
    if (isUserClick) {
        // Resume Live Mode if they click the newest alert, otherwise lock inspection string
        if (alertsData.length > 0 && id === alertsData[0].id) {
            userInteracted = false;
        } else {
            userInteracted = true;
        }
    }

    activeAlertId = id;
    
    // Find alert data
    const alert = alertsData.find(a => a.id === id);
    if (!alert) return;

    // Update active UI classes in Sidebar
    document.querySelectorAll('.alert-card').forEach(el => el.classList.remove('active'));
    // Triggering re-render handles it
    renderFeed();

    // Populate Inspector
    INSPECTOR_EMPTY.style.display = 'none';
    INSPECTOR_DETAILS.style.display = 'flex';

    document.getElementById('selected-timestamp').innerText = alert.timestamp;
    
    // Image fallback and Bounding Box trigger
    const focalImg = document.getElementById('focal-image');
    document.getElementById('bounding-boxes-container').innerHTML = ''; // clear boxes
    
    focalImg.onload = () => {
        drawBoundingBoxes(alert);
    };
    focalImg.src = alert.snapshot_url || '';
    focalImg.onerror = () => { focalImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="%23222"><rect width="100%" height="100%"/></svg>'; };

    document.getElementById('focal-reason').innerText = alert.reason || "Unknown Threat";

    // Populate Sub-cards
    const ai = alert.ai_results || {};
    
    // 1. Face
    const faceList = document.getElementById('face-list');
    faceList.innerHTML = '';
    const faceData = ai.face || {};
    if (faceData.error) {
        faceList.innerHTML = `<li class="text-danger">Engine Error</li>`;
    } else if (faceData.faces && faceData.faces.length > 0) {
        faceData.faces.forEach(f => {
            const isUnknown = f.name.toLowerCase() === 'unknown';
            faceList.innerHTML += `<li class="${isUnknown ? 'text-danger' : 'text-success'}">
                <strong>ID:</strong> ${f.name} <br>
                <small>Confidence: ${(f.confidence * 100).toFixed(0)}%</small>
            </li>`;
        });
    } else {
        faceList.innerHTML = `<li>No faces actively in frame</li>`;
    }

    // 2. YOLO
    const yoloList = document.getElementById('yolo-list');
    yoloList.innerHTML = '';
    const yoloData = ai.yolo || {};
    if (yoloData.error) {
         yoloList.innerHTML = `<li class="text-danger">Engine Error</li>`;
    } else if (yoloData.objects && yoloData.objects.length > 0) {
        yoloData.objects.forEach(o => {
            const isThreat = o.category === 'suspicious';
            yoloList.innerHTML += `<li class="${isThreat ? 'text-danger' : ''}">
                <strong style="text-transform: capitalize">${o.class}</strong> <br>
                <small>Score: ${(o.confidence * 100).toFixed(0)}%</small>
            </li>`;
        });
    } else {
        yoloList.innerHTML = `<li>No flagged objects</li>`;
    }

    // 3. Motion
    const motionDiv = document.getElementById('motion-data');
    const motionData = ai.motion || {};
    if (motionData.error) {
        motionDiv.innerHTML = `<span class="text-danger">Sensor Malfunction</span>`;
    } else {
        if (motionData.motion) {
             motionDiv.innerHTML = `<strong class="text-danger">MOVEMENT DETECTED</strong><br><br>Contours: ${motionData.contours}<br>Intensity: ${motionData.score.toFixed(2)}`;
        } else {
             motionDiv.innerHTML = `Area Secure / Static`;
        }
    }
}

function drawBoundingBoxes(alert) {
    const container = document.getElementById('bounding-boxes-container');
    container.innerHTML = '';
    const img = document.getElementById('focal-image');
    
    if (!img.naturalWidth) return;

    const containerRect = img.parentElement.getBoundingClientRect();
    const ratio = Math.min(containerRect.width / img.naturalWidth, containerRect.height / img.naturalHeight);
    
    const renderedWidth = img.naturalWidth * ratio;
    const renderedHeight = img.naturalHeight * ratio;
    
    const offsetX = (containerRect.width - renderedWidth) / 2;
    const offsetY = (containerRect.height - renderedHeight) / 2;
    
    const ai = alert.ai_results || {};
    
    if (ai.yolo && ai.yolo.objects) {
        ai.yolo.objects.forEach(obj => {
            if (!obj.bbox) return;
            const b = obj.bbox; 
            const left = offsetX + (b.x1 / img.naturalWidth) * renderedWidth;
            const top = offsetY + (b.y1 / img.naturalHeight) * renderedHeight;
            const width = ((b.x2 - b.x1) / img.naturalWidth) * renderedWidth;
            const height = ((b.y2 - b.y1) / img.naturalHeight) * renderedHeight;
            
            const div = document.createElement('div');
            div.className = 'bounding-box';
            div.style.left = left + 'px';
            div.style.top = top + 'px';
            div.style.width = Math.max(width, 10) + 'px';
            div.style.height = Math.max(height, 10) + 'px';
            
            const label = document.createElement('div');
            label.className = 'bounding-box-label';
            // Phase 12: Integrated Identity Tracker
            let identityStr = obj.identity ? ` [${obj.identity.toUpperCase()}]` : '';
            label.innerText = obj.track_id ? `${obj.class.toUpperCase()} #${obj.track_id}${identityStr}` : obj.class.toUpperCase();
            
            div.appendChild(label);
            container.appendChild(div);
        });
    }

    // Phase 12: Face Selection Bounding Boxes
    if (ai.face && ai.face.faces) {
        ai.face.faces.forEach(face => {
            if (!face.location) return;
            const l = face.location; // top, right, bottom, left
            const left = offsetX + (l.left / img.naturalWidth) * renderedWidth;
            const top = offsetY + (l.top / img.naturalHeight) * renderedHeight;
            const width = ((l.right - l.left) / img.naturalWidth) * renderedWidth;
            const height = ((l.bottom - l.top) / img.naturalHeight) * renderedHeight;
            
            const div = document.createElement('div');
            div.className = 'bounding-box';
            div.style.left = left + 'px';
            div.style.top = top + 'px';
            div.style.width = Math.max(width, 10) + 'px';
            div.style.height = Math.max(height, 10) + 'px';
            div.style.borderColor = '#ff3333';
            div.style.boxShadow = '0 0 10px rgba(255, 51, 51, 0.5)';
            
            const label = document.createElement('div');
            label.className = 'bounding-box-label';
            label.style.backgroundColor = '#ff3333';
            label.innerText = `FACE: ${face.name}`;
            
            div.appendChild(label);
            container.appendChild(div);
        });
    }
}

// Start Lifecycle
console.log("Aegis Dashboard UI Initialized");
document.getElementById('sound-toggle')?.addEventListener('click', initAudio);
document.getElementById('alert-filter')?.addEventListener('input', renderFeed);

// Phase 12: Request OS Notifications
if ("Notification" in window) {
    Notification.requestPermission();
}

// Phase 12: Zero-Latency WebSocket Connection
const socket = io();
socket.on('new_alerts_push', (newAlerts) => {
    console.log("🚀 Incoming low-latency push received!");
    processIncomingFeed(newAlerts);
});

// Initial population
fetchLiveFeed();

// Phase 13: Face Uploader Modal Logic
const uploadBtn = document.getElementById('upload-face-btn');
const modal = document.getElementById('upload-modal');
const closeBtn = document.getElementById('close-modal');
const uploadForm = document.getElementById('upload-form');
const uploadStatus = document.getElementById('upload-status');

uploadBtn?.addEventListener('click', () => { modal.classList.add('show'); uploadStatus.innerHTML = ''; });
closeBtn?.addEventListener('click', () => { modal.classList.remove('show'); });
window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });

uploadForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-upload-btn');
    const nameStr = document.getElementById('target-name').value;
    const file = document.getElementById('target-image').files[0];
    
    if (!file || !nameStr) return;
    
    const formData = new FormData();
    formData.append('person_name', nameStr);
    formData.append('face_image', file);
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Injecting...';
    btn.style.opacity = '0.7';
    
    try {
        const res = await fetch('/api/upload-face', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (res.ok) {
            uploadStatus.innerHTML = `<span style="color:var(--accent-green)">✅ Success! EC2 Face Engine Hot-Reloaded.</span>`;
            setTimeout(() => { modal.classList.remove('show'); uploadForm.reset(); }, 2500);
        } else {
            uploadStatus.innerHTML = `<span style="color:var(--accent-red)">⚠️ Error: ${data.error}</span>`;
        }
    } catch (err) {
        uploadStatus.innerHTML = `<span style="color:var(--accent-red)">⚠️ Network Error</span>`;
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-upload"></i> Inject & Deploy';
        btn.style.opacity = '1';
    }
});
