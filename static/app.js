// Aegis Dashboard - Core Logic

const FEED_CONTAINER = document.getElementById('alert-feed');
const ALERT_COUNT = document.getElementById('alert-count');
const INSPECTOR_EMPTY = document.querySelector('.empty-state');
const INSPECTOR_DETAILS = document.getElementById('focal-details');

// State
let alertsData = [];
let activeAlertId = null;
let isFirstLoad = true;

// Polling interval (5 seconds)
const POLL_INTERVAL_MS = 5000;

async function fetchLiveFeed() {
    try {
        const response = await fetch('/api/alerts');
        if (!response.ok) throw new Error("API Network Error");
        
        const newAlerts = await response.json();
        
        // If empty
        if (newAlerts.length === 0) {
            if (isFirstLoad) {
                FEED_CONTAINER.innerHTML = `<div class="loading-state"><i class="fa-solid fa-check-circle" style="color:var(--accent-green)"></i> Secure. No recent threats logged.</div>`;
                isFirstLoad = false;
            }
            return;
        }

        // Just blindly overwrite the array for simplicity
        alertsData = newAlerts;
        ALERT_COUNT.innerText = alertsData.length.toString();

        renderFeed();
        isFirstLoad = false;

    } catch (err) {
        console.error("Dashboard Feed Sync Error:", err);
        if (isFirstLoad) {
            FEED_CONTAINER.innerHTML = `<div class="loading-state" style="color:var(--accent-red)"><i class="fa-solid fa-triangle-exclamation"></i> AWS Connection Failed</div>`;
        }
    }
}

function renderFeed() {
    // Clear feed
    FEED_CONTAINER.innerHTML = '';

    alertsData.forEach((alert) => {
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

function selectAlert(id) {
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
    
    // Image fallback
    const focalImg = document.getElementById('focal-image');
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

// Start Lifecycle
console.log("Aegis Dashboard UI Initialized");
fetchLiveFeed();
setInterval(fetchLiveFeed, POLL_INTERVAL_MS);
