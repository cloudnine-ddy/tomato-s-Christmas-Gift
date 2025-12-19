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

// Story Mode: map gestures to dot indices and manage surprise queue
const GESTURE_TO_INDEX = { I: 0, L: 1, O: 2, V: 3, E: 4, U: 5 };
const surprises = ['Animation', 'Voice', 'RunawayBtn', 'Angel', 'TrueWords', 'LightStar'];
let currentStoryStep = 0;

// Photo animation assets (assume .jpg files in public/animation-photos/1.jpg ... 9.jpg)
// Base path for static assets (change if your server serves assets from a different root)
const BASE_PATH = '/animation-photos';
const IMAGE_EXT = '.jpg';
const ANIMATION_PHOTOS = Array.from({ length: 9 }, (_, i) => `${BASE_PATH}/${i + 1}${IMAGE_EXT}`);
let _preloadedAnimationImages = [];
let _animationIntervalId = null;
let _animationIndex = 0;
let _animationKeyHandler = null;
let lastSurpriseClose = 0;
const SURPRISE_COOLDOWN = 1500; // ms cooldown after closing a surprise modal
// Voice assets and state
const VOICE_AUDIO_SRC = '/voice_2.mp3';
const VOICE_CAPTION_SRC = '/caption_2.txt';
let _voiceAudio = null;
let _voiceKeyHandler = null;
let _voicePlayHandler = null;
// Angel assets/state
const ANGEL_IMG_SRC = '/angel.png';
const ANGEL_CAPTION_SRC = '/caption_4.txt';
let _angelKeyHandler = null;
let _angelPreloaded = null;
// Letter modal (Surprise 5) state
let _letterIntervalId = null;
let _letterFullText = '';
let _letterIndex = 0;
let _letterKeyHandler = null;
let _letterClickHandler = null;

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
        // Start preloading animation photos
        try { await preloadAnimationPhotos(); console.log('📸 Animation photos preloaded'); } catch(e) { console.warn('Failed preloading animation photos', e); }
        setupEventListeners();
        startRenderLoop();
        start3DLoop();
        
        // Start with intro
        await loadAndTypeIntro();
        
        console.log('✨ Game initialized!');
        // Sync HUD state (in case of pre-collected items)
        try {
            for (const ch of GESTURE_SEQUENCE) {
                const el = document.querySelector(`.hud-item[data-letter="${ch}"]`);
                if (el && collectedGestures[ch]) el.classList.add('active');
            }
        } catch (e) {
            // ignore if DOM not ready
        }
    } catch (error) {
        console.error('Failed to initialize:', error);
        showError('Unable to access camera. Please allow camera permissions.');
    }
}

// --- Photo Animation: preload, start, stop ---
function preloadAnimationPhotos() {
    return new Promise((resolve, reject) => {
        const images = [];
        let loaded = 0;
        const total = ANIMATION_PHOTOS.length;

        if (total === 0) return resolve([]);

        ANIMATION_PHOTOS.forEach((src, idx) => {
            const img = new Image();
            img.onload = () => {
                loaded++;
                images[idx] = img;
                if (loaded === total) {
                    _preloadedAnimationImages = images;
                    resolve(images);
                }
            };
            img.onerror = (e) => {
                console.error('Failed to preload animation image:', src, e);
                // still count as loaded to avoid hanging
                loaded++;
                images[idx] = img;
                if (loaded === total) {
                    _preloadedAnimationImages = images;
                    resolve(images);
                }
            };
            img.src = src;
        });
    });
}

async function startPhotoAnimation() {
    // Ensure modal and img exist
    const modalEl = document.getElementById('photo-animation-modal');
    const imgEl = document.getElementById('photo-animation-img');
    const captionEl = document.getElementById('photo-animation-caption');
    if (!modalEl || !imgEl || !captionEl) return;

    // Attempt to fetch caption asynchronously (non-blocking on failure)
    try {
        const res = await fetch('/caption_1.txt');
        if (res.ok) {
            const txt = await res.text();
            captionEl.textContent = txt.trim();
        } else {
            captionEl.textContent = '';
        }
    } catch (e) {
        captionEl.textContent = '';
        console.warn('Failed to fetch caption_1.txt', e);
    }

    // Reset index
    _animationIndex = 0;

    // If we have preloaded images, use their srcs; otherwise use ANIMATION_PHOTOS
    const frames = (_preloadedAnimationImages && _preloadedAnimationImages.length) ? _preloadedAnimationImages.map(i => i.src) : ANIMATION_PHOTOS;

    // Show modal
    modalEl.classList.remove('hidden');
    modalEl.classList.add('visible');

    // Start cycling
    imgEl.src = frames[_animationIndex % frames.length];
    // Log if image fails to load (shows alt text) so we can debug path issues
    imgEl.onerror = () => {
        console.error('Failed to load image:', imgEl.src);
    };
    _animationIntervalId = setInterval(() => {
        _animationIndex = (_animationIndex + 1) % frames.length;
        imgEl.src = frames[_animationIndex];
    }, 200);

    // Click outside image closes modal and stops animation
    const onModalClick = (e) => {
        if (e.target === modalEl) {
            stopPhotoAnimation();
            modalEl.removeEventListener('click', onModalClick);
        }
    };
    modalEl.addEventListener('click', onModalClick);

    // Spacebar key closes modal while animation is active
    _animationKeyHandler = function (e) {
        if (e.code === 'Space') {
            e.preventDefault();
            stopPhotoAnimation();
        }
    };
    document.addEventListener('keydown', _animationKeyHandler);
}

function stopPhotoAnimation() {
    const modalEl = document.getElementById('photo-animation-modal');
    const imgEl = document.getElementById('photo-animation-img');
    if (_animationIntervalId) {
        clearInterval(_animationIntervalId);
        _animationIntervalId = null;
    }
    if (imgEl) imgEl.src = '';
    if (modalEl) {
        modalEl.classList.remove('visible');
        modalEl.classList.add('hidden');
    }
    // Remove key handler if present
    if (_animationKeyHandler) {
        document.removeEventListener('keydown', _animationKeyHandler);
        _animationKeyHandler = null;
    }
    // Return focus to window
    try { window.focus(); } catch (e) {}
    // resume gesture processing after a short cooldown
    isPaused = false;
    lastSurpriseClose = Date.now();
}

// --- Voice Modal: start/stop, play/pause ---
async function startVoiceModal() {
    const modalEl = document.getElementById('voice-modal');
    const btn = document.getElementById('voice-play-btn');
    const captionEl = document.getElementById('voice-caption');
    if (!modalEl || !btn || !captionEl) return;

    // Fetch caption (non-fatal)
    try {
        const res = await fetch(VOICE_CAPTION_SRC);
        if (res.ok) captionEl.textContent = (await res.text()).trim(); else captionEl.textContent = '';
    } catch (e) {
        console.warn('Failed to fetch voice caption', e);
        captionEl.textContent = '';
    }

    // Prepare audio element (but do not autoplay)
    try {
        _voiceAudio = new Audio(VOICE_AUDIO_SRC);
        _voiceAudio.preload = 'auto';
        _voiceAudio.pause();
        _voiceAudio.currentTime = 0;
    } catch (e) {
        console.warn('Could not create audio element', e);
        _voiceAudio = null;
    }

    // Show modal
    modalEl.classList.remove('hidden');
    modalEl.classList.add('visible');

    // Play button handler
    _voicePlayHandler = async function () {
        if (!_voiceAudio) return;
        if (_voiceAudio.paused) {
            try {
                await _voiceAudio.play();
                btn.classList.add('playing');
            } catch (e) {
                console.warn('Play failed', e);
            }
        } else {
            _voiceAudio.pause();
            _voiceAudio.currentTime = 0;
            btn.classList.remove('playing');
        }
    };
    btn.addEventListener('click', _voicePlayHandler);

    // When audio ends, reset button
    if (_voiceAudio) _voiceAudio.addEventListener('ended', () => { btn.classList.remove('playing'); _voiceAudio.currentTime = 0; });

    // Click outside content closes modal
    const onModalClick = (e) => {
        if (e.target === modalEl) {
            stopVoiceModal();
            modalEl.removeEventListener('click', onModalClick);
        }
    };
    modalEl.addEventListener('click', onModalClick);

    // Spacebar handler (scoped to voice modal)
    _voiceKeyHandler = function (e) {
        if (e.code === 'Space') {
            e.preventDefault();
            stopVoiceModal();
        }
    };
    document.addEventListener('keydown', _voiceKeyHandler);
}

// --- Runaway Modal: 3-stage trick game ---
async function startRunawayModal() {
    const modalEl = document.getElementById('runaway-modal');
    const questionEl = document.getElementById('runaway-question');
    const area = document.getElementById('runaway-area');
    const buttonsWrap = document.getElementById('runaway-buttons');
    const btnA = document.getElementById('run-btn-a');
    const btnB = document.getElementById('run-btn-b');
    if (!modalEl || !area || !buttonsWrap || !btnA || !btnB) return;

    // Internal stage state
    let stage = 1;

    // Show modal (do NOT attach spacebar or background close for this modal)
    modalEl.classList.remove('hidden');
    modalEl.classList.add('visible');

    // Reset button states and positions
    resetRunButtons();

    // Stage 1 setup
    questionEl.textContent = '谁是shabi？';
    btnA.textContent = '我'; btnA.className = 'run-btn primary';
    btnB.textContent = '你'; btnB.className = 'run-btn danger';

    // btnB runaway on hover
    const onBHoverStage1 = (e) => {
        makeButtonRunaway(btnB, buttonsWrap);
    };
    btnB.addEventListener('mouseover', onBHoverStage1);

    // btnA click -> advance to stage 2
    const onAClickStage1 = () => {
        // cleanup stage1 handlers
        btnB.removeEventListener('mouseover', onBHoverStage1);
        btnA.removeEventListener('click', onAClickStage1);
        // advance
        stage = 2;
        setupStage2();
    };
    btnA.addEventListener('click', onAClickStage1);

    // Stage 2 setup function
    function setupStage2() {
        questionEl.textContent = 'Jorden爱你吗？';
        // Reset layout: put buttons inline center
        resetRunButtons();
        btnA.textContent = '爱'; btnA.className = 'run-btn primary';
        btnB.textContent = '不爱'; btnB.className = 'run-btn danger';

        // btnA click shows small toast (non-blocking)
        const onAClick2 = () => {
            // small visual feedback - console log
            console.log('再想想 / Think again');
        };
        btnA.addEventListener('click', onAClick2);

        // btnB hover -> change text to '超级爱' and color
        const onBHover2 = () => {
            btnB.textContent = '超级爱';
            btnB.style.background = '#ec4899';
            btnB.style.color = '#fff';
            // clicking now advances
            const onBClick2 = () => {
                btnB.removeEventListener('click', onBClick2);
                btnA.removeEventListener('click', onAClick2);
                btnB.removeEventListener('mouseover', onBHover2);
                stage = 3;
                setupStage3();
            };
            btnB.addEventListener('click', onBClick2);
        };
        btnB.addEventListener('mouseover', onBHover2);
    }

    // Stage 3 setup
    function setupStage3() {
        questionEl.textContent = '你爱Jorden吗？';
        resetRunButtons();
        btnA.textContent = '很爱'; btnA.className = 'run-btn danger';
        btnB.textContent = '超级无敌爱'; btnB.className = 'run-btn primary';

        // Make btnA runaway (optional) - on hover move it away
        const onAHover3 = () => makeButtonRunaway(btnA, buttonsWrap);
        btnA.addEventListener('mouseover', onAHover3);

        // btnB is victory
        const onBClick3 = () => {
            // Victory: close modal and resume
            btnA.removeEventListener('mouseover', onAHover3);
            btnB.removeEventListener('click', onBClick3);
            stopRunawayModal();
        };
        btnB.addEventListener('click', onBClick3);
    }

    // Reset buttons to inline centered (remove absolute positioning)
    function resetRunButtons() {
        [btnA, btnB].forEach(b => {
            b.classList.remove('runaway');
            b.style.left = '';
            b.style.top = '';
            b.style.position = '';
            b.style.background = '';
            b.style.color = '';
        });
        // ensure buttonsWrap is cleared
        buttonsWrap.style.position = 'relative';
    }

    // Helper to move a button to a random position within container
    function makeButtonRunaway(button, container) {
        const containerRect = container.getBoundingClientRect();
        const btnRect = button.getBoundingClientRect();
        const padding = 8; // keep some padding
        const maxLeft = Math.max(0, containerRect.width - btnRect.width - padding);
        const maxTop = Math.max(0, containerRect.height - btnRect.height - padding);
        const left = Math.floor(Math.random() * maxLeft);
        const top = Math.floor(Math.random() * maxTop);
        button.classList.add('runaway');
        button.style.position = 'absolute';
        button.style.left = `${left}px`;
        button.style.top = `${top}px`;
    }
}

function stopRunawayModal() {
    const modalEl = document.getElementById('runaway-modal');
    if (modalEl) {
        modalEl.classList.remove('visible');
        modalEl.classList.add('hidden');
    }
    // Allow gameplay to resume
    isPaused = false;
    lastSurpriseClose = Date.now();
    updateUI();
}

// --- Angel Modal ---
async function startAngelModal() {
    const modalEl = document.getElementById('angel-modal');
    const imgEl = document.getElementById('angel-img');
    const captionEl = document.getElementById('angel-caption');
    if (!modalEl || !imgEl || !captionEl) return;

    // Preload angel image if not already
    try {
        if (!_angelPreloaded) {
            _angelPreloaded = new Image();
            _angelPreloaded.src = ANGEL_IMG_SRC;
        }
    } catch (e) { /* ignore */ }

    // Fetch caption
    try {
        const res = await fetch(ANGEL_CAPTION_SRC);
        captionEl.textContent = res.ok ? (await res.text()).trim() : '';
    } catch (e) {
        captionEl.textContent = '';
    }

    // Set image src (use preloaded if available)
    imgEl.src = _angelPreloaded && _angelPreloaded.src ? _angelPreloaded.src : ANGEL_IMG_SRC;

    // Show modal
    modalEl.classList.remove('hidden');
    modalEl.classList.add('visible');
    isPaused = true;

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => {
        imgEl.classList.add('entered');
    });

    // Click background closes
    const onModalClick = (e) => {
        if (e.target === modalEl) {
            stopAngelModal();
            modalEl.removeEventListener('click', onModalClick);
        }
    };
    modalEl.addEventListener('click', onModalClick);

    // Spacebar closes (scoped handler)
    _angelKeyHandler = function (e) {
        if (e.code === 'Space') {
            e.preventDefault();
            stopAngelModal();
        }
    };
    document.addEventListener('keydown', _angelKeyHandler);
}

function stopAngelModal() {
    const modalEl = document.getElementById('angel-modal');
    const imgEl = document.getElementById('angel-img');
    if (imgEl) imgEl.classList.remove('entered');
    if (modalEl) {
        modalEl.classList.remove('visible');
        modalEl.classList.add('hidden');
    }
    // cleanup key handler
    if (_angelKeyHandler) {
        document.removeEventListener('keydown', _angelKeyHandler);
        _angelKeyHandler = null;
    }
    // resume
    isPaused = false;
    lastSurpriseClose = Date.now();
}

// --- Letter Modal (Surprise 5: My Sincere Words) ---
async function startLetterModal() {
    const modalEl = document.getElementById('letter-modal');
    const textEl = document.getElementById('letter-text');
    if (!modalEl || !textEl) return;

    // Fetch the text file (preserve newlines)
    try {
        const res = await fetch('/caption_5.txt');
        if (res.ok) {
            _letterFullText = await res.text();
        } else {
            _letterFullText = '...';
        }
    } catch (e) {
        console.warn('Failed to fetch caption_5.txt', e);
        _letterFullText = '';
    }

    // Prepare UI
    textEl.textContent = '';
    _letterIndex = 0;
    modalEl.classList.remove('hidden');
    modalEl.classList.add('visible');
    isPaused = true;

    // Start typing interval (50ms per char)
    _letterIntervalId = setInterval(() => {
        if (_letterIndex >= _letterFullText.length) {
            clearInterval(_letterIntervalId);
            _letterIntervalId = null;
            return;
        }
        textEl.textContent += _letterFullText[_letterIndex++];
        // keep scroll at bottom while typing
        textEl.scrollTop = textEl.scrollHeight;
    }, 50);

    // Click to fast-forward (display full text)
    _letterClickHandler = () => {
        if (_letterIntervalId) {
            clearInterval(_letterIntervalId);
            _letterIntervalId = null;
        }
        textEl.textContent = _letterFullText;
        textEl.scrollTop = textEl.scrollHeight;
    };
    textEl.addEventListener('click', _letterClickHandler);

    // Click outside content closes modal
    const onModalClick = (e) => {
        if (e.target === modalEl) {
            stopLetterModal();
            modalEl.removeEventListener('click', onModalClick);
        }
    };
    modalEl.addEventListener('click', onModalClick);

    // Spacebar closes (scoped handler)
    _letterKeyHandler = function (e) {
        if (e.code === 'Space') {
            e.preventDefault();
            stopLetterModal();
        }
    };
    document.addEventListener('keydown', _letterKeyHandler);
}

function stopLetterModal() {
    const modalEl = document.getElementById('letter-modal');
    const textEl = document.getElementById('letter-text');

    // Clear interval
    if (_letterIntervalId) {
        clearInterval(_letterIntervalId);
        _letterIntervalId = null;
    }

    // Remove click handler
    if (textEl && _letterClickHandler) {
        textEl.removeEventListener('click', _letterClickHandler);
        _letterClickHandler = null;
    }

    // Remove key handler
    if (_letterKeyHandler) {
        document.removeEventListener('keydown', _letterKeyHandler);
        _letterKeyHandler = null;
    }

    // Hide modal
    if (modalEl) {
        modalEl.classList.remove('visible');
        modalEl.classList.add('hidden');
    }

    // Resume gameplay after cooldown
    isPaused = false;
    lastSurpriseClose = Date.now();
    // If all collected, ensure Santa is visible (defensive: in case Surprise 5 just finished)
    try {
        const count = Object.values(collectedGestures).filter(Boolean).length;
        if (count === 6 && santaModel) {
            santaModel.visible = true;
        }
    } catch (e) {}
}

function stopVoiceModal() {
    const modalEl = document.getElementById('voice-modal');
    const btn = document.getElementById('voice-play-btn');

    // Stop audio
    if (_voiceAudio) {
        try { _voiceAudio.pause(); _voiceAudio.currentTime = 0; } catch (e) {}
        try { _voiceAudio.src = ''; } catch (e) {}
        _voiceAudio = null;
    }

    // Remove play handler
    if (btn && _voicePlayHandler) {
        btn.removeEventListener('click', _voicePlayHandler);
        _voicePlayHandler = null;
    }

    // Hide modal
    if (modalEl) {
        modalEl.classList.remove('visible');
        modalEl.classList.add('hidden');
    }

    // Remove key handler
    if (_voiceKeyHandler) {
        document.removeEventListener('keydown', _voiceKeyHandler);
        _voiceKeyHandler = null;
    }

    // Return focus
    try { window.focus(); } catch (e) {}
    // resume gesture processing after a short cooldown
    isPaused = false;
    lastSurpriseClose = Date.now();
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
            // Finale waiting for direct trigger (no live-hand star drag)
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
    // cooldown after closing a surprise modal
    if (Date.now() - lastSurpriseClose < SURPRISE_COOLDOWN) {
        resetGestureTimer();
        return;
    }
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

// --- Finale direct trigger ---
function openFinalPhotoModal() {
    const modalEl = document.getElementById('final-collage-modal');
    if (!modalEl) return;
    const img = document.getElementById('final-collage-img');
    if (img) img.src = '/final_photo.jpg';
    modalEl.classList.remove('hidden');
    // hide scene and pause
    try { document.getElementById('scene-container').style.display = 'none'; } catch (e) {}
    try { document.getElementById('camera-pip').style.display = 'none'; } catch (e) {}
    try { finalePrompt.style.display = 'none'; } catch (e) {}
    isPaused = true;
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

    // Was this dot already lit?
    const wasAlready = !!collectedGestures[char];

    // Mark visual dot as collected
    collectedGestures[char] = true;

    // Light HUD dot by index mapping (story-mode visuals)
    try {
        const idx = GESTURE_TO_INDEX[char];
        const hudItems = document.querySelectorAll('.hud-item');
        if (hudItems && hudItems[idx]) hudItems[idx].classList.add('active');
    } catch (e) {
        // ignore if HUD not present
    }

    // Capture photo and upload (visual asset)
    const imageData = captureFrame();
    collectedPhotos[char] = imageData;
    uploadToFirebase(char, imageData);
    updateSceneBrightness();

    // If this was newly lit, trigger the next surprise in the fixed queue
    let surpriseTriggered = false;
    if (!wasAlready) {
        if (currentStoryStep < surprises.length) {
            const surpriseName = surprises[currentStoryStep];
            console.log(`🎁 Triggering surprise #${currentStoryStep}: ${surpriseName}`);
            // If the surprise is the photo animation, start the modal animation (fetch caption inside)
            if (surpriseName === 'Animation') {
                try { await startPhotoAnimation(); surpriseTriggered = true; } catch (e) { console.error('Failed to start photo animation', e); }
            } else if (surpriseName === 'Voice') {
                try { await startVoiceModal(); surpriseTriggered = true; } catch (e) { console.error('Failed to start voice modal', e); }
            } else if (surpriseName === 'RunawayBtn') {
                try { await startRunawayModal(); surpriseTriggered = true; } catch (e) { console.error('Failed to start runaway modal', e); }
                } else if (surpriseName === 'Angel') {
                    try { await startAngelModal(); surpriseTriggered = true; } catch (e) { console.error('Failed to start angel modal', e); }
            } else if (surpriseName === 'TrueWords') {
                try { await startLetterModal(); surpriseTriggered = true; } catch (e) { console.error('Failed to start letter modal', e); }
            } else if (surpriseName === 'LightStar') {
                try {
                    // As a fallback, save collected photos and navigate to final page
                    try { sessionStorage.setItem('finalPhotos', JSON.stringify(collectedPhotos)); } catch (e) { console.warn('could not save finalPhotos', e); }
                    window.location.href = 'merry_christmas.html';
                    surpriseTriggered = true;
                } catch (e) { console.error('Failed to open final page', e); }
            } else {
                // non-blocking placeholder: log instead of alert to keep flow seamless
                console.log('Surprise:', surpriseName);
            }
            currentStoryStep = Math.min(currentStoryStep + 1, surprises.length);
        } else {
            console.log('All surprises have been triggered');
        }
    }

    // Check if all 6 collected - immediately navigate to final page
    const count = Object.keys(collectedPhotos).length;
    if (count === 6 && santaModel && !isFinaleReady) {
        // Show Santa with animation briefly (optional)
        try { santaModel.visible = true; santaModel.scale.set(0,0,0); animateSantaSpawn(); } catch (e) {}

        // Show stars if present (optional)
        try { if (starField) starField.visible = true; } catch (e) {}

        // Store collected photos into sessionStorage so the final page can read them
        try {
            sessionStorage.setItem('finalPhotos', JSON.stringify(collectedPhotos));
        } catch (e) { console.warn('Failed to save final photos to sessionStorage', e); }

        // Immediately navigate to the final 'Merry Christmas' page
        try {
            window.location.href = 'merry_christmas.html';
        } catch (e) {
            console.error('Failed to navigate to final page', e);
        }

        // Mark finale state to avoid duplicate triggers
        isFinaleReady = true;
        isFinaleMode = true;
        console.log('🎄 All collected — redirecting to finale page...');
    }

    // Only show the letter modal if no surprise modal was triggered
    if (!surpriseTriggered) {
        showModal(char);
    }
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
        <div class="hint">Perform the final gesture to see the surprise!</div>
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
