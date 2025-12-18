// Main application entry point
console.log('🎄 Loading main.js - 3D Collection Game v6.0');

import { checkGesture, GESTURE_SEQUENCE, getGestureHint } from './gestures.js';

// Firebase SDK imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getStorage, ref, uploadString, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// Three.js imports
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAdlyfIqkJzzvsBmIvUCOpRVf0UKSlh1eg",
    authDomain: "tomato-s-christmas-gift.firebaseapp.com",
    projectId: "tomato-s-christmas-gift",
    storageBucket: "tomato-s-christmas-gift.firebasestorage.app",
    messagingSenderId: "286628774516",
    appId: "1:286628774516:web:a165c23c2ac7ea22e54721",
    measurementId: "G-GRN2LR48R0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
console.log('🔥 Firebase initialized');

// DOM Elements
const video = document.getElementById('webcam');
const canvas = document.getElementById('output_canvas');
const ctx = canvas.getContext('2d');
const uiLayer = document.getElementById('ui-layer');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalText = document.getElementById('modal-text');
const modalClose = document.getElementById('modal-close');
const finaleContainer = document.getElementById('finale-container');
const photoGrid = document.getElementById('photo-grid');
const threeCanvas = document.getElementById('three-canvas');
const introScreen = document.getElementById('intro-screen');
const introText = document.getElementById('intro-text');
const introHint = document.getElementById('intro-hint');
const instructionModal = document.getElementById('instruction-modal');
const instructionText = document.getElementById('instruction-text');
const finalePrompt = document.getElementById('finale-prompt');

// Three.js scene objects
let scene, camera, renderer;
let treeModel, santaModel;
let ambientLight, directionalLight;
let starField = null;

// MediaPipe Hands
let hands = null;

// Game State
const collectedGestures = { I: false, L: false, O: false, V: false, E: false, U: false };
const collectedPhotos = {};
let gestureStartTime = null;
let currentDetectedGesture = null;
let isPaused = false;
let isFinaleMode = false;
let isIntroMode = true;
let isInstructionsMode = false;
let introComplete = false;
let isFinaleReady = false;
let sessionId = Date.now().toString();

// Hand tracking for camera control (swipe/drag with inertia)
let previousHandX = null;
let targetRotation = 0;
let currentRotation = 0;

const HOLD_DURATION = 3000; // 3 seconds
const THUMBS_UP_DURATION = 2000; // 2 seconds for finale
const BASE_BRIGHTNESS = 0.3;
const BRIGHTNESS_STEP = 0.12; // (1.0 - 0.3) / 6 ≈ 0.12

// Letter content placeholders
const letterContent = {
    I: "I... is for the incredible moments we share together.",
    L: "L... is for the laughter that fills our days.",
    O: "O... is for the overwhelming joy you bring me.",
    V: "V... is for the very special bond we have.",
    E: "E... is for every memory we've created.",
    U: "U... is for you, the one who means everything to me."
};

// Initialize
async function init() {
    try {
        await setupCamera();
        setupCanvas();
        setup3DScene();
        await load3DModels();
        await loadMediaPipe();
        setupEventListeners();
        startRenderLoop();
        start3DLoop();
        
        // Start with intro
        await loadAndTypeIntro();
        
        console.log('✨ Game initialized!');
    } catch (error) {
        console.error('Failed to initialize:', error);
        showError('Unable to access camera. Please allow camera permissions.');
    }
}

// Load intro text and start typewriter
async function loadAndTypeIntro() {
    try {
        const response = await fetch('/intro.txt');
        const text = await response.text();
        await typewriterEffect(text);
        introComplete = true;
        introHint.classList.add('visible');
    } catch (e) {
        console.error('Failed to load intro:', e);
        introComplete = true;
        introHint.classList.add('visible');
    }
}

// Typewriter effect with variable speed
async function typewriterEffect(text) {
    introText.textContent = '';
    for (let i = 0; i < text.length; i++) {
        introText.textContent += text[i];
        // Auto-scroll to bottom as text types
        introText.scrollTop = introText.scrollHeight;
        // Random delay between 30-70ms for human feel
        const delay = 30 + Math.random() * 40;
        await new Promise(r => setTimeout(r, delay));
    }
}

// Setup Three.js scene
function setup3DScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a15);
    
    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 8);
    camera.lookAt(0, 1, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Ambient light (dim, will brighten as gestures collected)
    ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambientLight);
    
    // Directional light (main light)
    directionalLight = new THREE.DirectionalLight(0xffeedd, 0.3);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Add some point lights for atmosphere
    const warmLight = new THREE.PointLight(0xff6600, 0.2, 20);
    warmLight.position.set(-3, 2, 3);
    scene.add(warmLight);
    
    const coolLight = new THREE.PointLight(0x0066ff, 0.1, 20);
    coolLight.position.set(3, 3, -3);
    scene.add(coolLight);
    
    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(50, 50);
    const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a2e,
        roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Create star field (hidden initially)
    createStarField();
    
    console.log('🎬 3D scene setup complete');
}

// Create starry sky background
function createStarField() {
    const starCount = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
        // Scatter stars in a large sphere around the scene
        const radius = 50 + Math.random() * 100;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = radius * Math.cos(phi);
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.5,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });
    
    starField = new THREE.Points(geometry, material);
    starField.visible = false; // Hidden initially
    scene.add(starField);
    
    console.log('⭐ Star field created (hidden)');
}

// Load 3D models
async function load3DModels() {
    const loader = new GLTFLoader();
    
    // Load tree
    try {
        const treeGltf = await loader.loadAsync('/tree.glb');
        treeModel = treeGltf.scene;
        treeModel.scale.set(1, 1, 1); // Reduced by 50%
        treeModel.position.set(0, -1, 0);
        treeModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(treeModel);
        console.log('🎄 Tree model loaded');
    } catch (e) {
        console.warn('Could not load tree.glb:', e);
        // Fallback: create a simple cone tree
        const coneGeo = new THREE.ConeGeometry(1.5, 4, 8);
        const coneMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
        treeModel = new THREE.Mesh(coneGeo, coneMat);
        treeModel.position.set(0, 1, 0);
        treeModel.castShadow = true;
        scene.add(treeModel);
    }
    
    // Load Santa
    try {
        const santaGltf = await loader.loadAsync('/santa.glb');
        santaModel = santaGltf.scene;
        santaModel.scale.set(8, 8, 8); // Much larger (about half tree height)
        santaModel.position.set(2, 0, 1); // Right of tree, on floor (raised Y)
        santaModel.rotation.y = Math.PI; // Face the camera
        santaModel.visible = false; // Hidden until all gestures collected
        santaModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        scene.add(santaModel);
        console.log('🎅 Santa model loaded');
    } catch (e) {
        console.warn('Could not load santa.glb:', e);
        // Fallback: create a simple santa placeholder
        const santaGeo = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
        const santaMat = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
        santaModel = new THREE.Mesh(santaGeo, santaMat);
        santaModel.position.set(2.5, 0, 1.5);
        santaModel.castShadow = true;
        scene.add(santaModel);
    }
}

// 3D render loop
function start3DLoop() {
    function animate() {
        requestAnimationFrame(animate);
        
        // Silky smooth rotation with lerp
        scene.rotation.y += (targetRotation - scene.rotation.y) * 0.1;
        
        // Twinkle stars if visible
        if (starField && starField.visible) {
            starField.rotation.y += 0.0003;
            starField.rotation.x += 0.0001;
        }
        
        renderer.render(scene, camera);
    }
    animate();
}

// Animate Santa spawn
function animateSantaSpawn() {
    const targetScale = 8;
    const duration = 500;
    const startTime = Date.now();
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const scale = targetScale * eased;
        santaModel.scale.set(scale, scale, scale);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    animate();
}

// Update scene brightness based on collected gestures
function updateSceneBrightness() {
    const count = Object.values(collectedGestures).filter(Boolean).length;
    const brightness = BASE_BRIGHTNESS + (BRIGHTNESS_STEP * count);
    
    // Update lights
    ambientLight.intensity = 0.15 + (brightness * 0.5);
    directionalLight.intensity = 0.3 + (brightness * 0.7);
    
    console.log(`💡 Scene brightness: ${Math.round(brightness * 100)}%`);
}

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
    });
    video.srcObject = stream;
    return new Promise(resolve => { video.onloadedmetadata = resolve; });
}

function setupCanvas() {
    canvas.width = 320;
    canvas.height = 240;
}

async function loadMediaPipe() {
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
    
    hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onHandsResults);
    console.log('🖐️ Hand tracking ready');
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function onHandsResults(results) {
    // Clear and draw video
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawVideoFrame();
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        // Draw hand skeleton
        window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: '#FF0000', lineWidth: 3 });
        window.drawLandmarks(ctx, landmarks, { color: '#00FFFF', lineWidth: 1, radius: 3 });
        
        // Hand-controlled rotation (swipe/drag style)
        const wrist = landmarks[0];
        const currentHandX = wrist.x;
        
        if (!isPaused && previousHandX !== null) {
            const delta = currentHandX - previousHandX;
            targetRotation -= delta * 5; // Negative for natural drag feel
        }
        previousHandX = currentHandX;
        
        if (isPaused) return;
        
        if (isIntroMode) {
            processIntroGesture(landmarks);
        } else if (isInstructionsMode) {
            processInstructionsGesture(landmarks);
        } else if (isFinaleMode) {
            processThumbsUp(landmarks);
        } else {
            processGestureCollection(landmarks);
        }
    } else {
        resetGestureTimer();
        previousHandX = null; // Reset so no jump when hand reappears
    }
}

function drawVideoFrame() {
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

// Process OK gesture during intro
function processIntroGesture(landmarks) {
    if (!introComplete) return;
    
    // Check for OK gesture (same as 'O')
    const isOK = checkGesture(landmarks, 'O');
    
    if (isOK) {
        if (!gestureStartTime) {
            gestureStartTime = Date.now();
            console.log('👌 OK gesture detected - Hold for 5s!');
        }
        
        const elapsed = Date.now() - gestureStartTime;
        const progress = Math.min(elapsed / 5000, 1); // 5 seconds
        updateHoldFeedback(progress, '👌');
        
        if (elapsed >= 5000) {
            startMainGame();
        }
    } else {
        resetGestureTimer();
    }
}

// Process OK gesture during instructions
function processInstructionsGesture(landmarks) {
    const isOK = checkGesture(landmarks, 'O');
    
    if (isOK) {
        if (!gestureStartTime) {
            gestureStartTime = Date.now();
            console.log('👌 OK gesture detected - Hold for 5s!');
        }
        
        const elapsed = Date.now() - gestureStartTime;
        const progress = Math.min(elapsed / 5000, 1); // 5 seconds
        updateHoldFeedback(progress, '👌');
        
        if (elapsed >= 5000) {
            startGameplay();
        }
    } else {
        resetGestureTimer();
    }
}

// Transition from intro to instructions
function startMainGame() {
    console.log('📖 Showing instructions...');
    isIntroMode = false;
    isInstructionsMode = true;
    resetGestureTimer();
    
    // Fade out intro
    introScreen.style.transition = 'opacity 1s ease';
    introScreen.style.opacity = '0';
    setTimeout(() => {
        introScreen.classList.add('hidden');
    }, 1000);
    
    // Show instruction modal
    loadInstructions();
}

// Load and show instructions
async function loadInstructions() {
    try {
        const response = await fetch('/hello.txt');
        const text = await response.text();
        instructionText.textContent = text;
    } catch (e) {
        instructionText.textContent = 'Ready to play!';
    }
    instructionModal.classList.remove('hidden');
}

// Transition from instructions to gameplay
function startGameplay() {
    console.log('🎮 Starting gameplay!');
    isInstructionsMode = false;
    resetGestureTimer();
    
    // Fade out instruction modal
    instructionModal.style.transition = 'opacity 1s ease';
    instructionModal.style.opacity = '0';
    setTimeout(() => {
        instructionModal.classList.add('hidden');
    }, 1000);
}

function processGestureCollection(landmarks) {
    // Check all uncollected gestures
    let detected = null;
    for (const char of GESTURE_SEQUENCE) {
        if (!collectedGestures[char] && checkGesture(landmarks, char)) {
            detected = char;
            break;
        }
    }
    
    if (detected) {
        if (currentDetectedGesture !== detected) {
            // New gesture detected
            gestureStartTime = Date.now();
            currentDetectedGesture = detected;
            console.log(`🎯 Detected '${detected}' - Hold!`);
        }
        
        const elapsed = Date.now() - gestureStartTime;
        const progress = Math.min(elapsed / HOLD_DURATION, 1);
        updateHoldFeedback(progress, detected);
        
        if (elapsed >= HOLD_DURATION) {
            onGestureCollected(detected);
        }
    } else {
        resetGestureTimer();
    }
}

function processThumbsUp(landmarks) {
    if (!isFinaleReady) return;
    
    const isThumbsUp = checkThumbsUp(landmarks);
    
    if (isThumbsUp) {
        if (!gestureStartTime) {
            gestureStartTime = Date.now();
            console.log('👍 Thumbs up detected - Hold for 3s!');
        }
        
        const elapsed = Date.now() - gestureStartTime;
        const progress = Math.min(elapsed / HOLD_DURATION, 1); // 3 seconds
        updateHoldFeedback(progress, '👍');
        
        if (elapsed >= HOLD_DURATION) {
            showFinale();
        }
    } else {
        resetGestureTimer();
    }
}

function checkThumbsUp(landmarks) {
    // Thumb extended upward, other fingers curled
    const thumbTip = landmarks[4];
    const thumbMcp = landmarks[2];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];
    
    const thumbUp = thumbTip.y < thumbMcp.y - 0.05;
    const indexCurled = indexTip.y > indexPip.y;
    const middleCurled = middleTip.y > middlePip.y;
    
    return thumbUp && indexCurled && middleCurled;
}

function resetGestureTimer() {
    gestureStartTime = null;
    currentDetectedGesture = null;
    hideHoldFeedback();
}

function updateHoldFeedback(progress, char) {
    const cameraPip = document.getElementById('camera-pip');
    
    // Subtle border glow on camera when detecting (no text, no letter shown)
    if (progress > 0) {
        cameraPip.classList.add('detecting');
        cameraPip.style.setProperty('--progress', `${progress * 100}%`);
    }
}

function hideHoldFeedback() {
    const cameraPip = document.getElementById('camera-pip');
    cameraPip.classList.remove('detecting');
    cameraPip.style.setProperty('--progress', '0%');
}

async function onGestureCollected(char) {
    console.log(`✅ Collected '${char}'!`);
    isPaused = true;
    resetGestureTimer();
    
    // Mark as collected
    collectedGestures[char] = true;
    
    // Capture photo
    const imageData = captureFrame();
    collectedPhotos[char] = imageData;
    
    // Upload to Firebase (silent)
    uploadToFirebase(char, imageData);
    
    // Update scene brightness
    updateSceneBrightness();
    
    // Check if all 6 collected - show Santa, stars, and finale prompt!
    const count = Object.keys(collectedPhotos).length;
    if (count === 6 && santaModel && !isFinaleReady) {
        // Show Santa with animation
        santaModel.visible = true;
        santaModel.scale.set(0, 0, 0);
        animateSantaSpawn();
        
        // Show stars
        if (starField) {
            starField.visible = true;
            console.log('🌟 Stars revealed!');
        }
        
        // Show finale prompt
        finalePrompt.classList.remove('hidden');
        setTimeout(() => finalePrompt.classList.add('visible'), 100);
        
        // Enter finale ready state
        isFinaleReady = true;
        isFinaleMode = true;
        console.log('🎄 Finale ready! Show thumbs up to complete.');
    }
    
    // Show modal
    showModal(char);
}

function captureFrame() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.translate(tempCanvas.width, 0);
    tempCtx.scale(-1, 1);
    tempCtx.drawImage(video, 0, 0);
    return tempCanvas.toDataURL('image/png');
}

async function uploadToFirebase(char, imageData) {
    try {
        const fileName = `sessions/${sessionId}/${char}.png`;
        const storageRef = ref(storage, fileName);
        await uploadString(storageRef, imageData, 'data_url');
        const url = await getDownloadURL(storageRef);
        console.log(`📤 Uploaded ${char}: ${url}`);
    } catch (e) {
        console.error(`Upload failed for ${char}:`, e);
    }
}


function showModal(char) {
    modalTitle.textContent = `You found '${char}'! ✨`;
    modalText.textContent = letterContent[char];
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
    isPaused = false;
    
    const count = Object.values(collectedGestures).filter(Boolean).length;
    if (count === 6 && !isFinaleMode) {
        enterFinaleMode();
    } else {
        updateUI();
    }
}

function enterFinaleMode() {
    isFinaleMode = true;
    console.log('🎉 All collected! Entering finale mode...');
    
    const info = document.querySelector('.game-info');
    info.innerHTML = `
        <div class="collected-count">All fragments collected! 🎄</div>
        <div class="hint">Give me a Thumbs Up 👍 to see the surprise!</div>
    `;
}

function showFinale() {
    console.log('🎄 Showing finale!');
    isPaused = true;
    
    // Hide everything else
    document.getElementById('scene-container').style.display = 'none';
    document.getElementById('camera-pip').style.display = 'none';
    finalePrompt.style.display = 'none';
    
    // Build photo grid
    photoGrid.innerHTML = '';
    for (const char of GESTURE_SEQUENCE) {
        const div = document.createElement('div');
        div.className = 'photo-item';
        div.innerHTML = `
            <img src="${collectedPhotos[char]}" alt="${char}">
            <div class="letter-label">${char}</div>
        `;
        photoGrid.appendChild(div);
    }
    
    // Show finale
    finaleContainer.classList.remove('hidden');
}

function updateUI() {
    const count = Object.values(collectedGestures).filter(Boolean).length;
    
    const info = document.querySelector('.game-info');
    info.innerHTML = `
        <div class="collected-count">${count}/6 Collected</div>
        <div class="hint">Try different hand gestures...</div>
    `;
}

function setupEventListeners() {
    modalClose.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !modal.classList.contains('hidden')) {
            e.preventDefault();
            closeModal();
        }
    });
    window.addEventListener('resize', () => {
        setupCanvas();
        // Resize 3D renderer
        if (renderer && camera) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    });
}

function startRenderLoop() {
    async function render() {
        if (video.readyState === video.HAVE_ENOUGH_DATA && hands) {
            await hands.send({ image: video });
        }
        requestAnimationFrame(render);
    }
    render();
}

function showError(msg) {
    uiLayer.innerHTML = `<div class="game-info"><div style="color:#ff6b6b;">⚠️ ${msg}</div></div>`;
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
