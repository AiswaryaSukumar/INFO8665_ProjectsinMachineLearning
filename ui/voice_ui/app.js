const BASE_URL = "http://localhost:8311/api";

// DOM Elements
const callBtn = document.getElementById('call-btn');
const endBtn = document.getElementById('end-btn');
const devToggleBtn = document.getElementById('dev-toggle-btn');
const statusBadge = document.getElementById('conn-status');
const chatHistory = document.getElementById('chat-history');
const visualizerContainer = document.getElementById('visualizer-container');
const actionText = document.getElementById('action-text');
const stateContainer = document.querySelector('.state-container');

// State Elements
const dispSession = document.getElementById('disp-session');
const dispState = document.getElementById('disp-state');
const dispTurn = document.getElementById('disp-turn');
const dispCat = document.getElementById('disp-cat');
const dispLoc = document.getElementById('disp-loc');
const dispName = document.getElementById('disp-name');
const dispPhone = document.getElementById('disp-phone');
const dispTicket = document.getElementById('disp-ticket');

// Internal App State
let sessionId = null;
let currentTurn = 1;
let currentState = "INITIALIZING";

// Audio & Recording State
let stream = null;
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let silenceTimer = null;
let isRecording = false;
let checkSilenceInterval = null;
let lastSpeechTime = Date.now();
const SILENCE_THRESHOLD = 2000; // 2 seconds

callBtn.addEventListener('click', startCall);
endBtn.addEventListener('click', endCall);
devToggleBtn.addEventListener('click', () => {
    stateContainer.classList.toggle('hidden');
    // Change icon based on state
    const icon = devToggleBtn.querySelector('ion-icon');
    if (stateContainer.classList.contains('hidden')) {
        icon.setAttribute('name', 'code-slash-outline');
        devToggleBtn.style.opacity = '0.5';
    } else {
        icon.setAttribute('name', 'code-working-outline');
        devToggleBtn.style.opacity = '1';
    }
});

function addChatMessage(sender, text) {
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${sender}`;

    const label = document.createElement('div');
    label.className = 'msg-label';
    if (sender === 'ai') {
        label.innerHTML = '<ion-icon name="planet"></ion-icon> AI Assistant';
    } else {
        label.innerHTML = 'You <ion-icon name="person"></ion-icon>';
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;

    wrapper.appendChild(label);
    wrapper.appendChild(bubble);

    chatHistory.appendChild(wrapper);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function updateVisualizer(state, text) {
    visualizerContainer.className = `audio-visualizer-container ${state !== 'hidden' ? 'active' : ''}`;
    const ring = document.querySelector('.pulse-ring');
    actionText.textContent = text;

    if (state === 'recording') {
        ring.className = 'pulse-ring';
        ring.style.background = 'var(--accent-red)';
        ring.style.boxShadow = '0 0 0 0 rgba(239, 68, 68, 0.4)';
    } else if (state === 'thinking') {
        ring.className = 'pulse-ring thinking';
        ring.style.background = 'var(--accent-purple)';
    }
}

async function startCall() {
    callBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    statusBadge.textContent = "Connecting...";
    statusBadge.style.color = "var(--accent-green)";

    try {
        // 1. Initialize Session
        const res = await fetch(`${BASE_URL}/orchestrator/initialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: "web_voice", caller_number: "555-WEB" })
        });

        if (!res.ok) throw new Error("Backend connection failed.");
        const data = await res.json();

        sessionId = data.session_id;
        currentState = data.context.current_state;
        currentTurn = 1;

        // Update Side Panel
        dispSession.textContent = sessionId.split("-")[0] + "...";
        dispState.textContent = currentState;
        dispTurn.textContent = currentTurn;

        statusBadge.textContent = "Connected";

        const aiText = data.action.text;
        addChatMessage('ai', aiText);

        // 2. Play greeting via Backend TTS
        const formData = new FormData();
        formData.append('text', aiText);

        updateVisualizer('thinking', 'Synthesizing voice...');
        const synthRes = await fetch(`${BASE_URL}/voice/synthesize`, {
            method: 'POST',
            body: formData
        });

        if (!synthRes.ok) throw new Error("TTS Synthesis failed");

        const blob = await synthRes.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audioObj = new Audio(audioUrl);

        updateVisualizer('hidden', '');

        audioObj.onended = () => {
            startListeningLoop();
        };
        await audioObj.play();

    } catch (err) {
        console.error(err);
        endCall();
        addChatMessage('system', '❌ Error connecting to server. Is FastAPI running?');
    }
}

async function fetchContext() {
    if (!sessionId) return;
    try {
        const res = await fetch(`${BASE_URL}/orchestrator/session/${sessionId}`);
        if (res.ok) {
            const data = await res.json();
            const entities = data.context_data.extracted_entities || {};
            dispCat.textContent = entities.category || "None";
            dispLoc.textContent = entities.location || "None";
            dispName.textContent = entities.caller_name || "None";
            dispPhone.textContent = entities.phone_number || "None";
            dispTicket.textContent = data.ticket_id || "None";
        }
    } catch (e) { console.error("Failed to fetch context", e); }
}

async function initMicrophone() {
    if (stream) return; // Already initialized
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
    } catch (err) {
        console.error("Microphone access denied:", err);
        addChatMessage('system', '❌ Microphone access denied. Cannot proceed.');
        throw err;
    }
}

async function startListeningLoop() {
    if (currentState === "SUBMITTED" || currentState === "ESCALATED") {
        updateVisualizer('hidden', '');
        addChatMessage('system', '🎫 Ticket Submitted Successfully. Call Ended.');
        endCall();
        return;
    }

    try {
        if (!stream) await initMicrophone();

        // Create a fresh MediaRecorder for this specific turn
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        // Note: Soundfile supports WebM/Opus on modern FFmpeg/libsndfile, but we'll send it as is.
        // If Python fails, we might need a wav converter, but let's test.

        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            clearInterval(checkSilenceInterval);

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

            // Only send if user actually spoke (blob size check)
            if (audioBlob.size > 1000) {
                await processAudioBackend(audioBlob);
            } else {
                // Too quiet or glitch, restart listening
                startListeningLoop();
            }
        };

        mediaRecorder.start();
        isRecording = true;
        updateVisualizer('recording', 'Listening... (Speak now)');

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        lastSpeechTime = Date.now();

        let speakingStarted = false;
        let consecutiveSpeech = 0;
        const MIN_SPEECH_ITERATIONS = 3; // roughly 300ms of sound required

        checkSilenceInterval = setInterval(() => {
            if (!isRecording) return;

            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
            let avg = sum / bufferLength;

            if (avg > 20) {
                consecutiveSpeech++;
                if (!speakingStarted && consecutiveSpeech >= MIN_SPEECH_ITERATIONS) {
                    speakingStarted = true;
                    // Provide visual feedback that we heard them
                    const ring = document.querySelector('.pulse-ring');
                    ring.style.boxShadow = '0 0 0 10px rgba(239, 68, 68, 0.4)';
                }
                lastSpeechTime = Date.now();
            } else {
                consecutiveSpeech = 0;
                if (speakingStarted) {
                    if (Date.now() - lastSpeechTime > SILENCE_THRESHOLD) {
                        // Silence reached AFTER someone spoke, stop recording
                        isRecording = false;
                        mediaRecorder.stop();
                    }
                } else {
                    // Timeout (15 seconds) if nobody ever speaks
                    if (Date.now() - lastSpeechTime > 15000) {
                        isRecording = false;
                        mediaRecorder.stop();
                        console.log("No speech detected. Timed out.");
                    }
                }
            }
        }, 100);

    } catch (err) {
        console.error("Microphone access denied:", err);
        addChatMessage('system', '❌ Microphone access denied. Cannot proceed.');
    }
}

async function processAudioBackend(audioBlob) {
    updateVisualizer('thinking', 'Processing Audio (STT -> NLU -> Orchestrator)........');

    // We append the blob as .wav or .webm. The Python soundfile reads bytes directly. 
    // To be safe with Python's libsndfile, we should specify it as audio/wav in the form data even if it's webm container, or handle backend conversion.
    const formData = new FormData();
    formData.append('audio_file', audioBlob, `turn_${currentTurn}.wav`);
    formData.append('session_id', sessionId);
    formData.append('turn', currentTurn);

    try {
        const response = await fetch(`${BASE_URL}/voice/process_audio`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        // Read Custom Headers
        const transcript = response.headers.get("X-Transcript");
        const aiResponseText = response.headers.get("X-Response-Text");
        currentState = response.headers.get("X-Current-State");

        currentTurn++;

        if (transcript && transcript.trim() !== "") {
            addChatMessage('user', transcript);
        }

        if (aiResponseText) {
            addChatMessage('ai', aiResponseText);
        }

        // Update Side Panel
        dispState.textContent = currentState;
        dispTurn.textContent = currentTurn;
        await fetchContext();

        // Play the returned audio bytes
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audioObj = new Audio(audioUrl);

        updateVisualizer('hidden', '');

        audioObj.onended = () => {
            if (currentState === "SUBMITTED" || currentState === "ESCALATED") {
                addChatMessage('system', '🎫 Ticket Submitted Successfully. Call Ended.');
                endCall();
            } else {
                // Once AI finishes speaking, listen again
                startListeningLoop();
            }
        };

        await audioObj.play();

    } catch (err) {
        console.error("Failed to process audio:", err);
        addChatMessage('system', '❌ Server failed to process audio.');
        endCall();
    }
}

function endCall() {
    if (isRecording && mediaRecorder) {
        isRecording = false;
        mediaRecorder.stop();
    }
    clearInterval(checkSilenceInterval);
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
    }

    callBtn.classList.remove('hidden');
    endBtn.classList.add('hidden');
    statusBadge.textContent = "Disconnected";
    statusBadge.style.color = "var(--text-secondary)";
    updateVisualizer('hidden', '');

    sessionId = null;
    window.speechSynthesis.cancel();
}
