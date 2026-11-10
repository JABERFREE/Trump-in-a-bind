import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PlayerController, ThirdPersonCameraController } from './rosie/controls/rosieControls.js';
import { Maze } from './maze.js';
import { CharacterManager, PIRATES } from './characters.js';
import { MultiplayerManager } from './multiplayer.js';
import { crazyGames } from './crazygames.js';

const TRANSLATIONS = {
    en: {
        title: "THE PIRATE MAZE",
        selectCaptain: "Select Your Captain",
        setSail: "SET SAIL!",
        progress: "Progress",
        tryAgain: "Try Again",
        gameOver: "GAME OVER",
        seaClaimed: "The sea has claimed your crew.",
        revive: "WATCH AD TO REVIVE (+3 ❤️)",
        restartCampaign: "RESTART CAMPAIGN",
        campaignComplete: "CAMPAIGN COMPLETE!",
        allBoarded: "All Captains have boarded the ship.",
        totalGold: "TOTAL GOLD COLLECTED",
        playAgain: "PLAY AGAIN",
        loading: "Loading Assets...",
        goalReached: "GOAL REACHED!"
    },
    ar: {
        title: "متاهة القراصنة",
        selectCaptain: "اختر القبطان",
        setSail: "أبحر الآن!",
        progress: "التقدم",
        tryAgain: "حاول ثانية",
        gameOver: "انتهت اللعبة",
        seaClaimed: "البحر استولى على طاقمك.",
        revive: "شاهد إعلان للعودة (+3 ❤️)",
        restartCampaign: "إعادة الحملة",
        campaignComplete: "اكتملت الحملة!",
        allBoarded: "كل القادة صعدوا السفينة.",
        totalGold: "إجمالي الذهب المجمع",
        playAgain: "اللعب ثانية",
        loading: "جاري التحميل...",
        goalReached: "وصلت للهدف!"
    }
};

class Game {
    constructor() {
        console.log("Game constructor started");
        
        this.language = 'en'; // Default language
        crazyGames.init().catch(err => {
            console.warn("CrazyGames SDK initialization bypassed:", err);
        }).finally(() => {
            crazyGames.gameLoadingStart();
        });

        this.container = document.getElementById('game-container');
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
        this.goldCount = 0;
        this.lives = 10;
        this.isMusicPaused = false; 
        this.goldVoiceTimer = 0; // Cooldown for gold collection voices
        
       this.timer = new THREE.Clock();
        this.particles = []; // Array to track active particles
        this.characterManager = new CharacterManager();
        this.remotePlayers = new Map();
        
        // Victory State
        this.waitingForCelebration = false;
        this.hasCelebrated = false;
        this.isGameOver = false; // Flag to prevent Game Over re-entry freeze
        
        // Ability state
        this.abilityActive = false;
        this.abilityCooldown = false;
        this.abilityTimer = 0;
        this.cooldownTimer = 0;
        
        this.setupRenderer();
        this.setupLighting();
        
        // Initialize basic world immediately so user sees something
        this.assets = {}; 
        this.init();
        this.animate();

        console.log("Loading assets in background...");
        this.loadAssets().then(() => {
            console.log("Assets loaded, applying to world...");
            this.applyAssets();
            crazyGames.gameLoadingFinished();
        }).catch(err => {
            console.error("Error loading assets:", err);
            // Even on error, we should allow the game to start if possible
            crazyGames.gameLoadingFinished();
        });
    }

    toggleLanguage() {
        this.language = this.language === 'en' ? 'ar' : 'en';
        
        const langBtn = document.getElementById('lang-btn');
        if (langBtn) {
            langBtn.innerText = this.language === 'en' ? 'AR' : 'EN';
        }
        
        if (this.maze) {
            this.maze.updateLanguage(this.language);
        }
        
        this.updateUIStrings();
    }

    updateUIStrings() {
        const t = TRANSLATIONS[this.language];
        
        // Start Overlay
        const startTitle = document.querySelector('#start-overlay h1');
        if (startTitle) startTitle.innerText = t.title;
        const startSub = document.querySelector('#start-overlay p');
        if (startSub) startSub.innerText = t.selectCaptain;
        const startBtn = document.getElementById('start-btn');
        if (startBtn) startBtn.innerText = t.setSail;
        
        // HUD
        this.updateUI(); // Updates pirate name/progress
        this.updateHUD(); // Updates Try Again button
        
        // Victory/Game Over if they are visible
        const gameOverTitle = document.querySelector('#end-overlay h1');
        if (gameOverTitle) {
            // Check if game over or victory is showing by looking at the title content
            const currentTitle = gameOverTitle.innerText;
            const isGameOver = currentTitle === TRANSLATIONS.en.gameOver || currentTitle === TRANSLATIONS.ar.gameOver;
            const isVictory = currentTitle === TRANSLATIONS.en.campaignComplete || currentTitle === TRANSLATIONS.ar.campaignComplete;
            
            if (isGameOver) {
                this.showGameOver();
            } else if (isVictory) {
                this.showVictory();
            }
        }
    }

    setupRenderer() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.container.appendChild(this.renderer.domElement);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupLighting() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(50, 100, 30);
        sun.castShadow = true;
        // Sharpen shadows for the large maze
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        sun.shadow.mapSize.width = 4096;
        sun.shadow.mapSize.height = 4096;
        sun.shadow.bias = -0.0001;
        this.scene.add(sun);

        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.005);
    }

    async loadAssets() {
        const loader = new THREE.TextureLoader();
        const gltfLoader = new GLTFLoader();
        const loadingBar = document.getElementById('loading-bar');
        const loadingText = document.getElementById('loading-text');
        
        const texturesToLoad = [
            './assets/sand_stone_texture.webp',
            './assets/wood_planks_texture.webp',
            './assets/pirate_ship.webp',
            './assets/spike_trap.webp',
            './assets/tropical_ocean_bg.webp',
            './assets/burning_fire_trap.webp',
            './assets/barbed_wire_trap.webp',
            './assets/modern_oil_tanker.webp',
            './assets/pirate_lighthouse.webp',
            './assets/modern_cargo_ship_with_containers.webp',
            './assets/floating_pirate_debris.webp',
            './assets/tropical_palm_tree.webp',
            './assets/tropical_shrub.webp',
            './assets/pirate_treasure_chest.webp',
            './assets/blue_sea_waves_texture.webp',
            './assets/pirate_barrel_bomb-webp.webp'
        ];

        const modelsToLoad = [
            './assets/models/great-white-shark.glb'
        ];

        const audioToLoad = [
            './assets/audio/pirate_theme-mp3.mp3',
            './assets/audio/jump_sfx.mp3',
            './assets/audio/success_sfx.mp3',
            './assets/audio/trump_victory_voice.mp3',
            './assets/audio/rubio_victory_voice.mp3',
            './assets/audio/hegseth_victory_voice.mp3',
            './assets/audio/vance_victory_voice.mp3',
            './assets/audio/witkopf_victory_voice.mp3',
            './assets/audio/kushner_victory_voice.mp3',
            './assets/audio/trump_intro_voice.mp3',
            './assets/audio/rubio_intro_voice.mp3',
            './assets/audio/hegseth_intro_voice.mp3',
            './assets/audio/vance_intro_voice.mp3',
            './assets/audio/witkopf_intro_voice.mp3',
            './assets/audio/kushner_intro_voice.mp3',
            './assets/audio/gold-ring-sfx.mp3',
            './assets/audio/failure_sfx.mp3',
            './assets/audio/level_victory_fanfare.mp3',
            './assets/audio/i-survived-voice.mp3',
            './assets/audio/pirate_follow_me.mp3',
            './assets/audio/trump_jump_success_voice.mp3',
            './assets/audio/rubio_jump_success_voice.mp3',
            './assets/audio/hegseth_jump_success_voice.mp3',
            './assets/audio/vance_jump_success_voice.mp3',
            './assets/audio/witkoff_jump_success_voice.mp3',
            './assets/audio/kushner_jump_success_voice.mp3',
            './assets/audio/trump_treasure_voice.mp3',
            './assets/audio/rubio_treasure_voice.mp3',
            './assets/audio/hegseth_treasure_voice.mp3',
            './assets/audio/vance_treasure_voice.mp3',
            './assets/audio/witkoff_treasure_voice.mp3',
            './assets/audio/kushner_treasure_voice.mp3',
            './assets/audio/trump_gold_voice.mp3',
            './assets/audio/rubio_gold_voice.mp3',
            './assets/audio/hegseth_gold_voice.mp3',
            './assets/audio/vance_gold_voice.mp3',
            './assets/audio/witkoff_gold_voice.mp3',
            './assets/audio/kushner_gold_voice.mp3',
            './assets/audio/trump_selection_voice.mp3',
            './assets/audio/rubio_selection_voice.mp3',
            './assets/audio/hegseth_selection_voice.mp3',
            './assets/audio/vance_selection_voice.mp3',
            './assets/audio/witkoff_selection_voice.mp3',
            './assets/audio/kushner_selection_voice.mp3',
            './assets/audio/maze_clear_victory_jingle.mp3',
            './assets/audio/pirate_scream_death.mp3',
            './assets/audio/pirate_i_made_it.mp3'
        ];

        const totalAssets = texturesToLoad.length + modelsToLoad.length + audioToLoad.length;
        let loadedAssetsCount = 0;

        const updateProgress = () => {
            loadedAssetsCount++;
            const progress = Math.round((loadedAssetsCount / totalAssets) * 100);
            if (loadingBar) loadingBar.style.width = `${progress}%`;
            if (loadingText) loadingText.innerText = `${TRANSLATIONS[this.language].loading} ${progress}%`;
        };

        const loadTexture = (path) => new Promise((resolve, reject) => {
            loader.load(path, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
                updateProgress();
                resolve(tex);
            }, undefined, (err) => {
                console.error(`Failed to load texture: ${path}`, err);
                updateProgress(); // Count as "processed" even if failed
                reject(err);
            });
        });

        const loadModel = (path) => new Promise((resolve) => {
            gltfLoader.load(path, (gltf) => {
                updateProgress();
                resolve(gltf.scene);
            }, undefined, (err) => {
                console.error(`Failed to load model: ${path}`, err);
                updateProgress();
                resolve(null);
            });
        });

        const loadAudio = (path) => new Promise((resolve, reject) => {
            const audio = new Audio();
            const onLoaded = () => {
                audio.removeEventListener('loadedmetadata', onLoaded);
                audio.removeEventListener('error', onError);
                updateProgress();
                resolve(audio);
            };
            const onError = (err) => {
                audio.removeEventListener('loadedmetadata', onLoaded);
                audio.removeEventListener('error', onError);
                console.error(`Failed to load audio: ${path}`, err);
                updateProgress();
                resolve(null); // Resolve with null so we don't block
            };
            audio.addEventListener('loadedmetadata', onLoaded);
            audio.addEventListener('error', onError);
            audio.src = path;
            audio.load();
        });

        try {
            // Textures usually load faster and are more critical for visual "opening"
            const textureResults = await Promise.allSettled(texturesToLoad.map(path => loadTexture(path)));
            
            // Models
            const modelResults = await Promise.allSettled(modelsToLoad.map(path => loadModel(path)));

            // Audio loading - we won't wait for ALL audio to be ready before showing UI
            // but we want the progress bar to move
            const audioResults = await Promise.allSettled(audioToLoad.map(path => loadAudio(path)));

            const getResult = (results, index) => results[index].status === 'fulfilled' ? results[index].value : null;

            this.assets = {
                wall: getResult(textureResults, 0),
                floor: getResult(textureResults, 0),
                wood: getResult(textureResults, 1),
                ship: getResult(textureResults, 2),
                spike: getResult(textureResults, 3),
                bg: getResult(textureResults, 4),
                fire: getResult(textureResults, 5),
                wire: getResult(textureResults, 6),
                tanker: getResult(textureResults, 7),
                lighthouse: getResult(textureResults, 8),
                cargoShip: getResult(textureResults, 9),
                debris: getResult(textureResults, 10),
                palm: getResult(textureResults, 11),
                shrub: getResult(textureResults, 12),
                chest: getResult(textureResults, 13),
                seaWaves: getResult(textureResults, 14),
                explosive: getResult(textureResults, 15),
                music: getResult(audioResults, 0),
                jumpSfx: getResult(audioResults, 1),
                successSfx: getResult(audioResults, 2),
                voices: [
                    getResult(audioResults, 3), 
                    getResult(audioResults, 4), 
                    getResult(audioResults, 5), 
                    getResult(audioResults, 6), 
                    getResult(audioResults, 7), 
                    getResult(audioResults, 8)
                ],
                intros: [
                    getResult(audioResults, 9), 
                    getResult(audioResults, 10), 
                    getResult(audioResults, 11), 
                    getResult(audioResults, 12), 
                    getResult(audioResults, 13), 
                    getResult(audioResults, 14)
                ],
                goldRingSfx: getResult(audioResults, 15),
                failureSfx: getResult(audioResults, 16),
                victorySfx: getResult(audioResults, 17),
                survivedVoice: getResult(audioResults, 18),
                followMeVoice: getResult(audioResults, 19),
                jumpSuccessVoices: [
                    getResult(audioResults, 20), // Trump
                    getResult(audioResults, 21), // Rubio
                    getResult(audioResults, 22), // Hegseth
                    getResult(audioResults, 23), // Vance
                    getResult(audioResults, 24), // Witkoff
                    getResult(audioResults, 25)  // Kushner
                ],
                treasureVoices: [
                    getResult(audioResults, 26), // Trump
                    getResult(audioResults, 27), // Rubio
                    getResult(audioResults, 28), // Hegseth
                    getResult(audioResults, 29), // Vance
                    getResult(audioResults, 30), // Witkoff
                    getResult(audioResults, 31)  // Kushner
                ],
                goldVoices: [
                    getResult(audioResults, 32), // Trump
                    getResult(audioResults, 33), // Rubio
                    getResult(audioResults, 34), // Hegseth
                    getResult(audioResults, 35), // Vance
                    getResult(audioResults, 36), // Witkoff
                    getResult(audioResults, 37)  // Kushner
                ],
                selectionVoices: [
                    getResult(audioResults, 38), // Trump
                    getResult(audioResults, 39), // Rubio
                    getResult(audioResults, 40), // Hegseth
                    getResult(audioResults, 41), // Vance
                    getResult(audioResults, 42), // Witkoff
                    getResult(audioResults, 43)  // Kushner
                ],
                mazeClearSfx: getResult(audioResults, 44),
                screamSfx: getResult(audioResults, 45),
                iMadeItVoice: getResult(audioResults, 46),
                sharkModel: getResult(modelResults, 0)
            };

            if (this.assets.wall) this.assets.wall.wrapS = this.assets.wall.wrapT = THREE.RepeatWrapping;
            if (this.assets.wood) this.assets.wood.wrapS = this.assets.wood.wrapT = THREE.RepeatWrapping;
            if (this.assets.seaWaves) {
                this.assets.seaWaves.wrapS = this.assets.seaWaves.wrapT = THREE.RepeatWrapping;
                this.assets.seaWaves.repeat.set(1, 1); // Single seamless image, no square tiling
            }
            if (this.assets.music) this.assets.music.loop = true;
            if (this.assets.ambience) this.assets.ambience.loop = true;

            // Hide loading overlay quickly
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.3s ease-out';
                setTimeout(() => overlay.remove(), 300);
            }
        } catch (err) {
            console.error("Asset loading failed, continuing with partial assets if possible...", err);
            if (!this.assets) this.assets = {};
        }
    }

    applyAssets() {
        if (!this.assets) return;

        // Update Maze Textures
        if (this.maze) {
            this.maze.updateTextures({
                wallTexture: this.assets.wall,
                floorTexture: this.assets.wall,
                spikeTexture: this.assets.spike,
                fireTexture: this.assets.fire,
                barbedWireTexture: this.assets.wire,
                debrisTexture: this.assets.debris,
                palmTexture: this.assets.palm,
                shrubTexture: this.assets.shrub,
                chestTexture: this.assets.chest,
                seaWavesTexture: this.assets.seaWaves,
                explosiveTexture: this.assets.explosive,
                sharkModel: this.assets.sharkModel
            });
        }

        // Update Sea
        if (this.sea && this.assets.bg) {
            this.sea.material.map = this.assets.bg;
            this.sea.material.needsUpdate = true;
        }

        // Update Ship
        if (this.shipSprite && this.assets.ship) {
            this.shipSprite.material.map = this.assets.ship;
            this.shipSprite.material.needsUpdate = true;
        }

        // Update Lighthouse
        if (this.lighthouse && this.assets.lighthouse) {
            this.lighthouse.material.map = this.assets.lighthouse;
            this.lighthouse.material.needsUpdate = true;
        }

        // Update Background
        if (this.assets.bg) {
            this.scene.background = this.assets.bg;
        }

        // Apply initial music state
        if (this.assets.music) {
            this.assets.music.loop = true;
            if (this.isMusicPaused) {
                this.assets.music.pause();
            }
        }
        
        // Ensure all voice/sfx volumes are at full volume (not affected by music toggle)
        const sfxVolume = 1.0;
        if (this.assets.voices) this.assets.voices.forEach(v => { if(v) v.volume = sfxVolume; });
        if (this.assets.intros) this.assets.intros.forEach(v => { if(v) v.volume = sfxVolume; });
        if (this.assets.jumpSfx) this.assets.jumpSfx.volume = sfxVolume;
        if (this.assets.successSfx) this.assets.successSfx.volume = sfxVolume;
        if (this.assets.goldRingSfx) this.assets.goldRingSfx.volume = sfxVolume;
        if (this.assets.failureSfx) this.assets.failureSfx.volume = sfxVolume;
        if (this.assets.victorySfx) this.assets.victorySfx.volume = sfxVolume;
        if (this.assets.survivedVoice) this.assets.survivedVoice.volume = sfxVolume;
        if (this.assets.followMeVoice) this.assets.followMeVoice.volume = sfxVolume;
        if (this.assets.jumpSuccessVoices) this.assets.jumpSuccessVoices.forEach(v => { if(v) v.volume = sfxVolume; });
        if (this.assets.treasureVoices) this.assets.treasureVoices.forEach(v => { if(v) v.volume = sfxVolume; });
        if (this.assets.goldVoices) this.assets.goldVoices.forEach(v => { if(v) v.volume = sfxVolume; });
        if (this.assets.selectionVoices) this.assets.selectionVoices.forEach(v => { if(v) v.volume = sfxVolume; });
        if (this.assets.mazeClearSfx) this.assets.mazeClearSfx.volume = sfxVolume;
        if (this.assets.screamSfx) this.assets.screamSfx.volume = sfxVolume;
        if (this.assets.iMadeItVoice) this.assets.iMadeItVoice.volume = sfxVolume;
    }

    init() {
        this.worldGroup = new THREE.Group();
        this.scene.add(this.worldGroup);

        this.maze = new Maze(this.worldGroup, {
            width: 23,
            height: 35,
            cellSize: 6,
            wallHeight: 14, // Slightly smaller walls for better visibility
            wallTexture: this.assets.wall,
            floorTexture: this.assets.wall,
            spikeTexture: this.assets.spike,
            fireTexture: this.assets.fire,
            barbedWireTexture: this.assets.wire,
            debrisTexture: this.assets.debris,
            palmTexture: this.assets.palm,
            shrubTexture: this.assets.shrub,
            chestTexture: this.assets.chest,
            seaWavesTexture: this.assets.seaWaves,
            explosiveTexture: this.assets.explosive,
            sharkModel: this.assets.sharkModel,
            language: this.language
        });

        // Add Sea (Single massive seamless plane)
        const seaGeo = new THREE.PlaneGeometry(2000, 2000);
        const seaMat = new THREE.MeshStandardMaterial({ 
            color: 0x0077be,
            transparent: true,
            opacity: 0.8
        });
        if (this.assets.seaWaves) {
            seaMat.map = this.assets.seaWaves;
            // Texture tiling logic moved here to ensure "seamless full image"
            this.assets.seaWaves.wrapS = this.assets.seaWaves.wrapT = THREE.RepeatWrapping;
            this.assets.seaWaves.repeat.set(1, 1);
        }
        this.sea = new THREE.Mesh(seaGeo, seaMat);
        this.sea.rotation.x = -Math.PI / 2;
        this.sea.position.y = -5.5; // Slightly below the maze base
        this.worldGroup.add(this.sea);

        // Tilt the world slightly towards the player
        this.worldGroup.rotation.x = -Math.PI * 0.1; // Increased tilt to ~18 degrees

        // Camera Transition State
        this.isTransitioning = false;
        this.transitionAlpha = 0;
        this.transitionStartPos = new THREE.Vector3();
        this.transitionStartTarget = new THREE.Vector3();
        this.transitionEndPos = new THREE.Vector3();
        this.transitionEndTarget = new THREE.Vector3();
        this.transitionDuration = 0.8; // Seconds
        this.transitionTimer = 0;

        // Background
        this.scene.background = this.assets.bg;

        // Create Ship at end (Mirage that becomes solid)
        const shipSpriteMat = new THREE.SpriteMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0
            // Removed AdditiveBlending to make it "solid" when formed
        });
        if (this.assets.ship) shipSpriteMat.map = this.assets.ship;
        this.shipSprite = new THREE.Sprite(shipSpriteMat);
        const endPos = this.maze.getEndPosition();
        this.shipSprite.scale.set(45, 36, 1); // Enlarged ship
        this.worldGroup.add(this.shipSprite);
        
        this.isShipDocking = false;
        this.shipDockTimer = 0;
        
        if (this.maze) this.maze.setDifficulty(this.characterManager.currentIndex);

        // Positioned near the end of the maze, stationary (no bobbing)
        this.targetShipPos = new THREE.Vector3(endPos.x, -5.5, endPos.z + 10); 
        this.shipSprite.position.copy(this.targetShipPos); 

        // Add Lighthouse near the finish line
        const lighthouseMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true });
        if (this.assets.lighthouse) lighthouseMat.map = this.assets.lighthouse;
        this.lighthouse = new THREE.Sprite(lighthouseMat);
        this.lighthouse.position.set(endPos.x - 15, 6, endPos.z + 5);
        this.lighthouse.scale.set(15, 22.5, 1); // Scaled down lighthouse
        this.worldGroup.add(this.lighthouse);

        // Add Light Beam
        const beamGeo = new THREE.ConeGeometry(4, 30, 32); // Scaled down beam
        // Rotate geometry so it points along X axis when mesh rotation is 0
        beamGeo.rotateZ(-Math.PI / 2);
        beamGeo.translate(15, 0, 0); // Move cone so its tip is at origin

        const beamMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffaa, 
            transparent: true, 
            opacity: 0.4, 
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        this.lightBeam = new THREE.Mesh(beamGeo, beamMat);
        // Position it at the top of the scaled down lighthouse
        this.lightBeam.position.set(endPos.x - 15, 15, endPos.z + 5);
        this.worldGroup.add(this.lightBeam);

        this.playerGroup = new THREE.Group();
        this.worldGroup.add(this.playerGroup);

        // Also add camera to worldGroup so it's tilted with everything else
        this.worldGroup.add(this.camera);

        // Character Appearance
        const pirate = this.characterManager.getCurrentPirate();
        const portraitTexture = new THREE.TextureLoader().load(pirate.figure);
        const playerMat = new THREE.SpriteMaterial({ map: portraitTexture });
        this.playerSprite = new THREE.Sprite(playerMat);
        this.playerSprite.position.y = 3.33;
        this.playerSprite.scale.set(5, 6.66, 1);
        this.playerGroup.add(this.playerSprite);

        // Shield mesh for Pete Hegseth
        this.shieldMesh = new THREE.Mesh(
            new THREE.SphereGeometry(3.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.3, wireframe: true })
        );
        this.shieldMesh.position.y = 3.33;
        this.shieldMesh.visible = false;
        this.playerGroup.add(this.shieldMesh);

        this.controller = new PlayerController(this.playerGroup, {
            moveSpeed: 12,
            jumpForce: 20, // Increased for easier trap jumping
            groundLevel: 14 // wallHeight is 14
        });

        this.cameraController = new ThirdPersonCameraController(this.camera, this.playerGroup, this.renderer.domElement, {
            distance: 25, 
            height: 25    // Higher for better wall-top visibility
        });

        this.shakeIntensity = 0;
        this.shakeDecay = 0.9;

        this.multiplayer = new MultiplayerManager(this);
        
        this.cameraMode = 'follow'; // Defaulting to 'follow' (pirate) view
        
        this.resetPlayer();
        this.setupUI();
        this.setupInteraction();
        this.setupKeyboardControls();
    }

    setupKeyboardControls() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') this.controller.keys['KeyW'] = true; // Down is Forward
            if (e.key === 'ArrowUp') this.controller.keys['KeyS'] = true;   // Up is Backward
            if (e.key === 'ArrowLeft') this.controller.keys['KeyA'] = true;
            if (e.key === 'ArrowRight') this.controller.keys['KeyD'] = true;
            if (e.key === ' ') this.controller.keys['Space'] = true;
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowDown') this.controller.keys['KeyW'] = false;
            if (e.key === 'ArrowUp') this.controller.keys['KeyS'] = false;
            if (e.key === 'ArrowLeft') this.controller.keys['KeyA'] = false;
            if (e.key === 'ArrowRight') this.controller.keys['KeyD'] = false;
            if (e.key === ' ') this.controller.keys['Space'] = false;
        });
    }

    createGoldTag(count) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        ctx.fillStyle = 'rgba(255, 215, 0, 0.8)'; // Golden background
        ctx.roundRect = function (x, y, w, h, r) {
            if (w < 2 * r) r = w / 2;
            if (h < 2 * r) r = h / 2;
            this.beginPath();
            this.moveTo(x + r, y);
            this.arcTo(x + w, y, x + w, y + h, r);
            this.arcTo(x + w, y + h, x, y + h, r);
            this.arcTo(x, y + h, x, y, r);
            this.arcTo(x, y, x + w, y, r);
            this.closePath();
            return this;
        };
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.roundRect(0, 0, 256, 64, 15).fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        ctx.font = 'bold 36px Arial';
        ctx.fillStyle = '#ffd700';
        ctx.textAlign = 'center';
        ctx.fillText(`GOLD: ${count}/10`, 128, 45);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.y = 9.5; // Above the name tag
        sprite.scale.set(5, 1.25, 1);
        return sprite;
    }

    updateGoldTag() {
        // Tag removed at user request
    }

    createNameTag(name) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0,0,256,64);
        ctx.font = 'bold 40px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.fillText(name, 128, 48);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.y = 7.5; // Adjusted for smaller pirates
        sprite.scale.set(6, 1.5, 1);
        return sprite;
    }

    updateNameTag(name) {
        // Tag removed at user request
    }

    setupUI() {
        // ... (previous style code)
        // Add repeat level handler
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#repeat-btn');
            if (btn && !btn.disabled) {
                this.repeatLevel();
            }
        });

        const style = document.createElement('style');
        style.innerHTML = `
            #mini-map-container {
                position: absolute;
                top: 85px; /* Moved down slightly */
                left: 10px;
                width: 80px; /* Minimized width */
                height: 122px; /* Minimized height, maintaining vertical aspect */
                background: rgba(0,0,0,0.7);
                border: 1px solid #ffd700;
                border-radius: 6px;
                overflow: hidden;
                pointer-events: auto;
                z-index: 100;
                transition: transform 0.2s, opacity 0.3s;
            }
            #mini-map-container:hover {
                transform: scale(1.1);
            }
            #music-btn, #lang-btn {
                position: absolute;
                top: 10px;
                width: 32px;
                height: 32px;
                background: rgba(0,0,0,0.6);
                border: 2px solid #ffd700;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                pointer-events: auto;
                z-index: 2500;
                transition: transform 0.2s, background 0.3s;
                -webkit-tap-highlight-color: transparent;
                color: #ffd700;
                font-weight: bold;
                font-size: 0.8em;
                font-family: Orbitron, sans-serif;
            }
            #music-btn { left: 10px; }
            #lang-btn { left: 50px; }
            #music-btn:hover, #lang-btn:hover {
                transform: scale(1.1);
                background: rgba(0,0,0,0.8);
            }
            #mini-map-canvas {
                width: 100%;
                height: 100%;
                image-rendering: pixelated;
            }
            .character-card {
                width: 70px; /* Reduced from 80px */
                padding: 6px; /* Reduced from 8px */
                background: rgba(255,255,255,0.05);
                border: 2px solid transparent;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                text-align: center;
                pointer-events: auto;
                -webkit-tap-highlight-color: transparent;
            }
            .character-card:hover {
                background: rgba(255,255,255,0.15);
                transform: translateY(-3px);
            }
            .character-card.selected {
                border-color: #ffd700;
                background: rgba(255, 215, 0, 0.15);
            }
            .character-card img {
                width: 50px; /* Reduced from 60px */
                height: 62px; /* Reduced from 75px */
                border-radius: 4px;
                margin-bottom: 4px;
                display: block;
                margin-left: auto;
                margin-right: auto;
                border: 1px solid rgba(255,255,255,0.3);
            }
            .character-card span {
                font-size: 0.55em; /* Reduced from 0.6em */
                display: block;
                color: #ffd700;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #start-overlay h1 { color: #ffd700; font-size: 2em; margin-bottom: 0.2em; text-align: center; }
            #start-overlay p { margin-bottom: 1.5em; text-align: center; font-size: 0.8em; color: #ccc; }
            #character-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
                margin-bottom: 1.5em;
                max-width: 320px;
            }
            #start-btn {
                padding: 10px 40px;
                font-size: 1.2em;
                background: #ffd700;
                color: black;
                border: none;
                border-radius: 30px;
                cursor: pointer;
                font-weight: bold;
                pointer-events: auto;
                transition: transform 0.2s, background 0.3s;
            }
            #start-btn:hover {
                transform: scale(1.05);
                background: #ffec8b;
            }
            @media (max-height: 500px) {
                #start-overlay h1 { font-size: 1.2em; margin-bottom: 5px; }
                #start-overlay p { font-size: 0.7em; margin-bottom: 10px; }
                #character-grid { gap: 8px; margin-bottom: 10px; }
                .character-card { width: 60px; padding: 4px; }
                .character-card img { width: 40px; height: 50px; }
                #start-btn { padding: 6px 30px; font-size: 1em; }
            }
        `;
        document.head.appendChild(style);

        // Mini-map setup
        const miniMapContainer = document.createElement('div');
        miniMapContainer.id = 'mini-map-container';
        miniMapContainer.innerHTML = `
            <canvas id="mini-map-canvas"></canvas>
        `;
        document.body.appendChild(miniMapContainer);
        this.miniMapCanvas = document.getElementById('mini-map-canvas');
        this.miniMapCtx = this.miniMapCanvas.getContext('2d');
        
        // Music button setup
        const musicBtn = document.createElement('div');
        musicBtn.id = 'music-btn';
        musicBtn.title = 'Play/Pause Music';
        musicBtn.innerHTML = this.getMusicIcon(this.isMusicPaused);
        document.body.appendChild(musicBtn);
        
        musicBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleMusic();
        };
        musicBtn.ontouchstart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleMusic();
        };

        // Language button setup
        const langBtn = document.createElement('div');
        langBtn.id = 'lang-btn';
        langBtn.title = 'Toggle Language';
        langBtn.innerText = this.language === 'en' ? 'AR' : 'EN';
        document.body.appendChild(langBtn);
        
        langBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleLanguage();
        };
        langBtn.ontouchstart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleLanguage();
        };

        const ui = document.createElement('div');
        ui.id = 'game-ui';
        ui.style.cssText = `
            position: absolute; top: 10px; left: 100px; right: 10px;
            pointer-events: none; color: white; text-shadow: 2px 2px 4px black;
            font-family: Orbitron, sans-serif;
        `;
        ui.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div id="character-info" style="background: rgba(0,0,0,0.6); padding: 4px 8px; border-radius: 6px; border: 1px solid #ffd700; display: flex; align-items: center; gap: 6px; scale: 1.0; transform-origin: top left;">
                    <img id="pirate-portrait" src="${this.characterManager.getCurrentPirate().portrait}" style="width: 32px; height: 40px; border: 1px solid white; display: block;">
                    <div>
                        <div id="pirate-name" style="font-size: 0.8em; color: #ffd700; margin-bottom: 1px;">${this.characterManager.getCurrentPirate().name}</div>
                        <div id="pirate-progress" style="font-size: 0.65em;">${TRANSLATIONS[this.language].progress}: ${this.characterManager.getProgress()}</div>
                        <div id="stats-panel" style="font-size: 0.65em; margin-top: 2px; display: flex; flex-direction: column; gap: 2px;">
                            <div style="display: flex; gap: 8px;">
                                <span id="lives-display" style="color: #ff4444;">❤ ${this.lives}</span>
                                <span id="gold-display" style="color: #ffd700;">🪙 ${this.goldCount}</span>
                            </div>
                            <button id="repeat-btn" style="
                                background: #ffd700; color: black; border: none; 
                                border-radius: 4px; padding: 2px 8px; font-size: 0.75em;
                                font-weight: bold; cursor: pointer; pointer-events: auto;
                                opacity: 0.5; transition: opacity 0.3s; margin-top: 2px;
                            " disabled>${TRANSLATIONS[this.language].tryAgain} (10🪙)</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(ui);

        const overlay = document.createElement('div');
        overlay.id = 'start-overlay';
        overlay.style.cssText = `
            position: absolute; inset: 0; background: rgba(0,0,0,0.95);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: white; z-index: 100; font-family: Orbitron, sans-serif;
            padding: 20px;
        `;
        
        const characterCardsHTML = PIRATES.map((p, i) => `
            <div class="character-card ${i === 0 ? 'selected' : ''}" data-index="${i}">
                <img src="${p.portrait}">
                <span>${p.name}</span>
            </div>
        `).join('');

        overlay.innerHTML = `
            <h1>THE PIRATE MAZE</h1>
            <p>Select Your Captain</p>
            
            <div id="character-grid">
                ${characterCardsHTML}
            </div>

            <button id="start-btn">SET SAIL!</button>
        `;
        document.body.appendChild(overlay);

        // Character selection logic
        const cards = overlay.querySelectorAll('.character-card');
        cards.forEach(card => {
            card.onclick = () => {
                cards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.characterManager.currentIndex = parseInt(card.dataset.index);
                this.updateUI(); // Updates HUD and player sprite
                
                // Play "I'm coming" selection voice
                if (this.assets && this.assets.selectionVoices && this.assets.selectionVoices[this.characterManager.currentIndex]) {
                    // Stop any playing selection/intro voices first
                    const allVoices = [...(this.assets.selectionVoices || []), ...(this.assets.intros || [])];
                    allVoices.forEach(v => { if(v) { v.pause(); v.currentTime = 0; } });
                    this.assets.selectionVoices[this.characterManager.currentIndex].play().catch(() => {});
                }
            };
        });

        const startBtn = document.getElementById('start-btn');
        const handleStart = () => {
            overlay.style.display = 'none';
            
            // Request full screen on mobile for 2400x1080 display optimization
            if (this.container.requestFullscreen) {
                this.container.requestFullscreen().catch(err => {
                    console.warn("Full screen request failed:", err);
                });
            }

            crazyGames.gameplayStart();
            const camToggle = document.getElementById('mobile-cam-toggle');
            if (camToggle) camToggle.style.display = 'flex';
            
            // Ensure audio is unmuted and activated by this gesture
            this.isMusicPaused = false; 

            if (this.assets) {
                // Background music specifically
                if (this.assets.music) {
                    this.assets.music.muted = false;
                    this.assets.music.volume = 1.0;
                    this.assets.music.play().then(() => {
                        console.log("Music started successfully");
                    }).catch(e => {
                        console.warn("Initial music play failed, retrying on next interaction:", e);
                    });
                }
            }
            
            const musicBtn = document.getElementById('music-btn');
            if (musicBtn) {
                musicBtn.innerHTML = this.getMusicIcon(this.isMusicPaused);
            }
            // Play current pirate intro voice
            if (this.assets && this.assets.intros && this.assets.intros[this.characterManager.currentIndex]) {
                this.assets.intros[this.characterManager.currentIndex].currentTime = 0;
                this.assets.intros[this.characterManager.currentIndex].play().catch(() => {});
            }
        };
        startBtn.addEventListener('click', handleStart);
        startBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handleStart();
        }, { passive: false });

        this.updateUI();
        this.setupEndOverlay();
    }

    setupEndOverlay() {
        const endOverlay = document.createElement('div');
        endOverlay.id = 'end-overlay';
        endOverlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85);
            display: none; flex-direction: column; align-items: center; justify-content: center;
            color: white; z-index: 2000; font-family: Orbitron, sans-serif;
            pointer-events: auto;
        `;
        document.body.appendChild(endOverlay);
    }

    restartGame() {
        crazyGames.gameplayStart();
        // Reset state
        this.lives = 10; // Reset to 10 lives
        this.goldCount = 0;
        this.isGameOver = false; // Reset game over flag
        this.characterManager.currentIndex = 0;
        this.characterManager.completedPirates = [];
        this.waitingForCelebration = false;
        this.hasCelebrated = false;
        this.isShipDocking = false;
        this.playerGroup.visible = true;
        this.controller.moveSpeed = 12;
        this.nearTrapTimer = 0; // Reset trap success timer
        
        if (this.maze) this.maze.setDifficulty(0);

        // Reset visual/UI
        const endOverlay = document.getElementById('end-overlay');
        if (endOverlay) endOverlay.style.display = 'none';
        
        this.resetPlayer();
        this.updateUI();
        this.updateHUD();

        // Play intro voice for first character again
        if (this.assets && this.assets.intros && this.assets.intros[0]) {
            this.assets.intros[0].currentTime = 0;
            this.assets.intros[0].play();
        }
    }

    updateUI() {
        const pirate = this.characterManager.getCurrentPirate();
        const portraitElem = document.getElementById('pirate-portrait');
        if (portraitElem) portraitElem.src = pirate.portrait;
        const nameElem = document.getElementById('pirate-name');
        if (nameElem) nameElem.innerText = pirate.name;
        const progressElem = document.getElementById('pirate-progress');
        if (progressElem) progressElem.innerText = `${TRANSLATIONS[this.language].progress}: ${this.characterManager.getProgress()}`;
        
        new THREE.TextureLoader().load(pirate.figure, (tex) => {
            if (this.playerSprite) {
                this.playerSprite.material.map = tex;
                this.playerSprite.material.needsUpdate = true;
            }
        });
        this.updateNameTag(pirate.name);
    }

    useAbility() {
        if (this.abilityCooldown) return;
        const pirate = this.characterManager.getCurrentPirate();
        const ability = pirate.ability;
        this.abilityCooldown = true;
        this.cooldownTimer = ability.cooldown;
        
        switch (ability.type) {
            case 'speed':
                this.abilityActive = true;
                this.abilityTimer = ability.duration;
                this.controller.moveSpeed = 24;
                break;
            case 'dash':
                const dashDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.playerGroup.quaternion).normalize();
                this.playerGroup.position.add(dashDir.multiplyScalar(15));
                break;
            case 'shield':
                this.abilityActive = true;
                this.abilityTimer = ability.duration;
                this.shieldMesh.visible = true;
                break;
            case 'jump':
                this.controller.velocity.y = 40;
                this.controller.isOnGround = false;
                this.assets.jumpSfx.play();
                break;
            case 'vision':
                this.abilityActive = true;
                this.abilityTimer = ability.duration;
                break;
            case 'teleport':
                const blinkDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.playerGroup.quaternion).normalize();
                const targetPos = this.playerGroup.position.clone().add(blinkDir.multiplyScalar(8));
                if (!this.maze.checkCollision(targetPos, 0.5)) {
                    this.playerGroup.position.copy(targetPos);
                }
                break;
        }
    }

    setupInteraction() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.controller.isOnGround) {
                this.assets.jumpSfx.play();
            }
            if (e.code === 'KeyE') {
                this.useAbility();
            }
            if (e.code === 'Enter') {
                this.handleCelebration();
            }
        });

        // Add touch/click handler for mobile celebration
        document.addEventListener('touchstart', (e) => {
            if (this.waitingForCelebration && !this.hasCelebrated) {
                this.handleCelebration();
            }
        });
    }

    handleCelebration() {
        if (!this.waitingForCelebration || this.hasCelebrated) return;
        
        this.hasCelebrated = true;
        const prompt = document.getElementById('celebration-prompt');
        if (prompt) prompt.style.display = 'none';

        // Trigger Midroll Ad on transition
        crazyGames.requestAd('midroll');

        // Play "I survived" voice line
        if (this.assets.survivedVoice) {
            this.assets.survivedVoice.play();
        }

        // Jump onto ship effect
        const startPos = this.playerGroup.position.clone();
        const shipPos = this.shipSprite.position.clone();
        const jumpTime = 1.0;
        let elapsed = 0;

        const jumpInterval = setInterval(() => {
            elapsed += 0.016;
            const t = Math.min(elapsed / jumpTime, 1);
            // Parabolic arc with higher height to reach the sea surface
            const jumpHeight = 15;
            const currentY = THREE.MathUtils.lerp(startPos.y, shipPos.y + 8, t) + Math.sin(t * Math.PI) * jumpHeight;
            this.playerGroup.position.x = THREE.MathUtils.lerp(startPos.x, shipPos.x, t);
            this.playerGroup.position.z = THREE.MathUtils.lerp(startPos.z, shipPos.z, t);
            this.playerGroup.position.y = currentY;

            if (t >= 1) {
                clearInterval(jumpInterval);
                this.playerGroup.visible = false; // Hide player once on ship
            }
        }, 16);

        // Play character specific victory voice line slightly after
        setTimeout(() => {
            const currentPirateIndex = this.characterManager.currentIndex;
            if (this.assets.voices[currentPirateIndex]) {
                this.assets.voices[currentPirateIndex].play();
            } else {
                this.assets.successSfx.play();
            }
        }, 800);

        // Character transitions happen after jump completes
        setTimeout(() => {
            this.showLevelComplete();
        }, 2500);
    }

    showLevelComplete() {
        const overlay = document.getElementById('end-overlay');
        if (!overlay) return;
        
        const pirate = this.characterManager.getCurrentPirate();
        const t = TRANSLATIONS[this.language];
        const isLast = this.characterManager.isLastPirate();
        
        overlay.innerHTML = `
            <div style="background: rgba(0,0,0,0.9); padding: 30px; border-radius: 20px; border: 5px solid #ffd700; text-align: center; pointer-events: auto; max-width: 400px;">
                <h1 style="color: #ffd700; font-size: 2.5em; margin-top: 0;">${t.goalReached}</h1>
                <img src="${pirate.portrait}" style="width: 80px; height: 100px; border: 2px solid #ffd700; border-radius: 8px; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;">
                <p style="font-size: 1.1em; color: white; margin-bottom: 1.5em;">${pirate.name} ${this.language === 'en' ? 'has boarded!' : 'صعد السفينة!'}</p>
                
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${!isLast ? `
                    <button id="next-cap-btn" style="
                        padding: 12px 40px; font-size: 1.2em; background: #ffd700; color: black;
                        border: none; border-radius: 30px; cursor: pointer; font-weight: bold;
                        transition: transform 0.2s; pointer-events: auto;
                    ">${this.language === 'en' ? 'CONTINUE' : 'استمرار'}</button>
                    ` : ''}
                    
                    <button id="play-again-cap-btn" style="
                        padding: 10px 30px; font-size: 1em; background: rgba(255,255,255,0.1); color: white;
                        border: 1px solid white; border-radius: 30px; cursor: pointer; font-weight: bold;
                        transition: transform 0.2s; pointer-events: auto;
                    ">${t.playAgain}</button>
                </div>
            </div>
        `;
        overlay.style.display = 'flex';
        
        const nextBtn = document.getElementById('next-cap-btn');
        if (nextBtn) {
            nextBtn.onclick = () => {
                overlay.style.display = 'none';
                this.proceedToNextLevel();
            };
        }
        
        const againBtn = document.getElementById('play-again-cap-btn');
        againBtn.onclick = () => {
            overlay.style.display = 'none';
            if (isLast) {
                this.restartGame();
            } else {
                this.replayCurrentLevel();
            }
        };
    }

    replayCurrentLevel() {
        this.waitingForCelebration = false;
        this.hasCelebrated = false;
        this.controller.moveSpeed = 12;
        this.playerGroup.visible = true;
        this.resetPlayer();
        this.updateUI();
        crazyGames.gameplayStart();
    }

    proceedToNextLevel() {
        this.waitingForCelebration = false;
        this.hasCelebrated = false;
        this.controller.moveSpeed = 12; // Restore speed
        this.playerGroup.visible = true;
        
        if (this.characterManager.nextPirate()) {
            this.maze.setDifficulty(this.characterManager.currentIndex);
            this.resetPlayer();
            this.updateUI();
            this.multiplayer.broadcastVictory(this.characterManager.currentIndex - 1);
            
            // Play intro for next character
            if (this.assets && this.assets.intros && this.assets.intros[this.characterManager.currentIndex]) {
                this.assets.intros[this.characterManager.currentIndex].play();
            }
            crazyGames.gameplayStart();
        } else {
            this.showVictory();
        }
    }

    toggleCameraMode() {
        // Camera switching disabled as requested
        return;
    }

    toggleMusic() {
        this.isMusicPaused = !this.isMusicPaused;
        
        if (this.assets && this.assets.music) {
            if (this.isMusicPaused) {
                this.assets.music.pause();
            } else {
                this.assets.music.play().catch(e => console.warn("Music play failed:", e));
            }
        }
        
        const musicBtn = document.getElementById('music-btn');
        if (musicBtn) {
            musicBtn.innerHTML = this.getMusicIcon(this.isMusicPaused);
        }
    }

    getMusicIcon(isPaused) {
        if (isPaused) {
            // Play icon
            return `<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffd700">
                <path d="M8 5v14l11-7z"></path>
            </svg>`;
        } else {
            // Pause icon
            return `<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffd700">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>
            </svg>`;
        }
    }

    updateAutoZoom(deltaTime) {
        // Feature fully removed to prevent any camera jitter or zooming
    }

    updatePathVisualization() {
        if (!this.maze || !this.maze.pathGroup) return;

        // Only calculate every few frames for performance
        if (Math.floor(Date.now() / 100) % 5 !== 0) return;

        const endPos = this.maze.getEndPosition();
        const path = this.maze.findPath(this.playerGroup.position, endPos);

        // Clear previous path
        while (this.maze.pathGroup.children.length > 0) {
            this.maze.pathGroup.remove(this.maze.pathGroup.children[0]);
        }

        if (path) {
            const dotGeo = new THREE.CircleGeometry(0.8, 8);
            const dotMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 });
            
            path.forEach(([x, z]) => {
                const dot = new THREE.Mesh(dotGeo, dotMat);
                dot.rotation.x = -Math.PI / 2;
                dot.position.set(x * this.maze.cellSize, this.maze.wallHeight + 0.1, z * this.maze.cellSize);
                this.maze.pathGroup.add(dot);
            });
        }
    }

    resetPlayer() {
        const start = this.maze.getStartPosition();
        this.playerGroup.position.copy(start);
        this.controller.velocity.set(0, 0, 0);

        // Force camera to update immediately to prevent blank first frame
        this.cameraController.update();
    }

    updateRemotePlayers(peers) {
        Object.entries(peers).forEach(([id, data]) => {
            if (id === this.multiplayer.playerId) return;
            let remote = this.remotePlayers.get(id);
            if (!remote) {
                const pirate = PIRATES[data.pirateIndex || 0];
                const tex = new THREE.TextureLoader().load(pirate.figure);
                const mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.6 }));
                mesh.scale.set(5, 6.66, 1);
                this.worldGroup.add(mesh);
                remote = { mesh };
                this.remotePlayers.set(id, remote);
            }
            remote.mesh.position.set(data.x, data.y + 3.33, data.z);
            if (remote.lastPirateIndex !== data.pirateIndex) {
                const pirate = PIRATES[data.pirateIndex || 0];
                new THREE.TextureLoader().load(pirate.figure, (tex) => {
                    remote.mesh.material.map = tex;
                });
                remote.lastPirateIndex = data.pirateIndex;
            }
        });
        for (const [id, remote] of this.remotePlayers.entries()) {
            if (!peers[id]) {
                this.worldGroup.remove(remote.mesh);
                this.remotePlayers.delete(id);
            }
        }
    }

    spawnGoldParticles(pos) {
        const particleCount = 12;
        const geo = new THREE.SphereGeometry(0.15, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffd700 });

        for (let i = 0; i < particleCount; i++) {
            const p = new THREE.Mesh(geo, mat.clone());
            p.position.copy(pos);
            
            // Random velocity in a sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const speed = 0.1 + Math.random() * 0.2;
            
            p.userData = {
                velocity: new THREE.Vector3(
                    speed * Math.sin(phi) * Math.cos(theta),
                    speed * Math.sin(phi) * Math.sin(theta),
                    speed * Math.cos(phi)
                ),
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03
            };
            
            this.worldGroup.add(p);
            this.particles.push(p);
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.position.add(p.userData.velocity);
            p.userData.life -= p.userData.decay;
            p.material.opacity = p.userData.life;
            p.material.transparent = true;
            p.scale.setScalar(p.userData.life);

            if (p.userData.life <= 0) {
                this.worldGroup.remove(p);
                this.particles.splice(i, 1);
            }
        }
    }

    checkCollisions(deltaTime) {
        const oldPos = this.playerGroup.position.clone();
        const pirate = this.characterManager.getCurrentPirate();

        // Check if player is near a trap while jumping
        const nearTrapResult = this.maze.checkTrapsExtended(this.playerGroup.position, 2.5); // Slightly larger radius for "near"
        if (nearTrapResult && !this.controller.isOnGround) {
            this.wasNearTrapInAir = true;
            this.lastTrapNearInAir = nearTrapResult;
        }

        // When player lands after being near a trap in air
        if (this.controller.isOnGround && this.wasNearTrapInAir) {
            this.wasNearTrapInAir = false;
            // Cooldown to prevent spamming the voice line
            if (!this.nearTrapTimer || this.nearTrapTimer <= 0) {
                const currentPirateIndex = this.characterManager.currentIndex;
                if (this.lastTrapNearInAir === 'explosive' && this.assets.iMadeItVoice) {
                    this.assets.iMadeItVoice.currentTime = 0;
                    this.assets.iMadeItVoice.play().catch(() => {});
                    this.nearTrapTimer = 4000;
                } else if (this.assets.jumpSuccessVoices && this.assets.jumpSuccessVoices[currentPirateIndex]) {
                    this.assets.jumpSuccessVoices[currentPirateIndex].currentTime = 0;
                    this.assets.jumpSuccessVoices[currentPirateIndex].play().catch(() => {});
                    this.nearTrapTimer = 3000; // 3 second cooldown
                }
            }
        }

        if (this.nearTrapTimer > 0) {
            this.nearTrapTimer -= deltaTime * 1000;
        }

        if (this.goldVoiceTimer > 0) {
            this.goldVoiceTimer -= deltaTime * 1000;
        }

        // Check for gold collection
        const goldResult = this.maze.checkGold(this.playerGroup.position);
        if (goldResult) {
            this.spawnGoldParticles(goldResult.pos);
            if (this.assets.goldRingSfx) {
                this.assets.goldRingSfx.currentTime = 0;
                this.assets.goldRingSfx.play();
            }
            this.goldCount += goldResult.value;
            
            // Play character-specific gold collection voice line with cooldown
            if (this.goldVoiceTimer <= 0) {
                const currentPirateIndex = this.characterManager.currentIndex;
                if (this.assets.goldVoices && this.assets.goldVoices[currentPirateIndex]) {
                    this.assets.goldVoices[currentPirateIndex].currentTime = 0;
                    this.assets.goldVoices[currentPirateIndex].play().catch(() => {});
                    this.goldVoiceTimer = 4000; // 4 second cooldown
                }
            }
            
            // Check for life bonus every 10 total gold (not resetting counter)
            // But user said "every ten gold pieces increases their lives"
            // Let's keep the existing logic where 10 gold = 1 life, and we reset the sub-counter for life but keep total gold?
            // Actually, let's keep goldCount for the "Repeat level" budget and use a hidden counter for lives if needed.
            // Or simpler: Gold increases, and if >= 10, you can use it to repeat.
            // Re-interpreting: "Every ten gold pieces increases their lives" -> automatic life up at 10.
            if (this.goldCount >= 10) {
                // We'll keep the gold count high for the "Repeat level" button but check threshold
            }
            this.updateHUD();
            this.updateGoldTag();
        }

        if (this.isTransitioning) {
            this.transitionTimer += deltaTime;
            const alpha = Math.min(this.transitionTimer / this.transitionDuration, 1);
            // Smoothstep for cinematic feel
            const t = alpha * alpha * (3 - 2 * alpha);
            
            this.camera.position.lerpVectors(this.transitionStartPos, this.transitionEndPos, t);
            const currentTarget = new THREE.Vector3().lerpVectors(this.transitionStartTarget, this.transitionEndTarget, t);
            this.camera.lookAt(currentTarget);

            if (alpha >= 1) {
                this.isTransitioning = false;
            }
            // Still update player (but they might be moving under the transition)
            this.controller.update(deltaTime, this.cameraMode === 'aerial' ? 0 : this.cameraController.rotation);
        } else {
            // Update Camera - Pirate Display (Follow) only
            const cameraRot = this.cameraController.update();
            this.controller.update(deltaTime, cameraRot);

            if (this.abilityActive && pirate.ability.type === 'vision') {
                const height = 40;
                this.camera.position.set(this.playerGroup.position.x, height, this.playerGroup.position.z);
                this.camera.lookAt(this.playerGroup.position);
            }
        }

        // In wall-top mode, check if player has fallen (skip if celebrating/transitioning)
        if (!this.waitingForCelebration && !this.hasCelebrated && !this.isTransitioning) {
            if (this.maze.checkCollision(this.playerGroup.position, 0.5)) {
                this.handleDeath();
                return;
            }

            const trapType = this.maze.checkTrapsExtended(this.playerGroup.position);
            // Disable death for 'debris' (old bomb traps) while keeping it for other types
            if (trapType && trapType !== 'debris') {
                if (!(this.abilityActive && pirate.ability.type === 'shield')) {
                    this.handleDeath(trapType === 'explosive' ? 'explosion' : 'default');
                }
            }
        }
        
        const endPos = this.maze.getEndPosition();
        const distToEnd = new THREE.Vector3(this.playerGroup.position.x, 0, this.playerGroup.position.z).distanceTo(new THREE.Vector3(endPos.x, 0, endPos.z));
        if (distToEnd < 2.0) {
            this.onGoalReached();
        }
    }

    repeatLevel() {
        if (this.goldCount < 10) return;
        
        this.goldCount -= 10;
        this.resetPlayer();
        this.deactivateAbility();
        this.updateHUD();
        
        // Play intro voice again for the repeat
        if (this.assets && this.assets.intros && this.assets.intros[this.characterManager.currentIndex]) {
            this.assets.intros[this.characterManager.currentIndex].currentTime = 0;
            this.assets.intros[this.characterManager.currentIndex].play();
        }
    }

    handleDeath(cause = 'default') {
        if (this.isGameOver) return; // Prevent double trigger
        
        if (cause === 'explosion') {
            this.shakeIntensity = 1.5;
            if (this.maze) this.maze.triggerExplosion(this.playerGroup.position);
            if (this.assets.screamSfx) {
                this.assets.screamSfx.currentTime = 0;
                this.assets.screamSfx.play().catch(() => {});
            }
        }

        this.lives--;
        this.updateHUD();
        
        // Play failure sound effect once (if not already playing scream for explosion)
        if (cause !== 'explosion' && this.assets && this.assets.failureSfx) {
            this.assets.failureSfx.currentTime = 0;
            this.assets.failureSfx.play().catch(e => console.warn("Failure SFX playback failed:", e));
        }
        
        if (this.lives <= 0) {
            this.isGameOver = true;
            this.showGameOver();
        } else {
            this.resetPlayer();
            this.deactivateAbility();
        }
    }

    updateHUD() {
        const livesElem = document.getElementById('lives-display');
        const goldElem = document.getElementById('gold-display');
        const repeatBtn = document.getElementById('repeat-btn');
        
        if (livesElem) livesElem.innerText = `❤ ${this.lives}`;
        if (goldElem) goldElem.innerText = `🪙 ${this.goldCount}`;
        
        if (repeatBtn) {
            repeatBtn.innerText = `${TRANSLATIONS[this.language].tryAgain} (10🪙)`;
            if (this.goldCount >= 10) {
                repeatBtn.disabled = false;
                repeatBtn.style.opacity = '1.0';
            } else {
                repeatBtn.disabled = true;
                repeatBtn.style.opacity = '0.5';
            }
        }
        
        this.updateGoldTag();
    }

    showGameOver() {
        crazyGames.gameplayStop();
        const overlay = document.getElementById('end-overlay');
        if (!overlay) return;
        
        const t = TRANSLATIONS[this.language];
        overlay.innerHTML = `
            <div style="background: rgba(0,0,0,0.8); padding: 50px; border-radius: 20px; border: 5px solid #ff4444; text-align: center; pointer-events: auto; max-width: 400px;">
                <h1 style="color: #ff4444; font-size: 3em; margin-top: 0;">${t.gameOver}</h1>
                <p style="font-size: 1.5em; color: white; margin-bottom: 2em;">${t.seaClaimed}</p>
                
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <button id="revive-btn" style="
                        padding: 15px 40px; font-size: 1.2em; background: #ffd700; color: black;
                        border: none; border-radius: 30px; cursor: pointer; font-weight: bold;
                        transition: transform 0.2; pointer-events: auto;
                        box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
                    ">${t.revive}</button>

                    <button id="restart-btn-gameover" style="
                        padding: 10px 40px; font-size: 1em; background: #ff4444; color: white;
                        border: none; border-radius: 30px; cursor: pointer; font-weight: bold;
                        transition: transform 0.2s; pointer-events: auto;
                        opacity: 0.8;
                    ">${t.restartCampaign}</button>
                </div>
            </div>
        `;
        overlay.style.display = 'flex';
        
        const reviveBtn = document.getElementById('revive-btn');
        if (reviveBtn) reviveBtn.onclick = () => this.reviveWithAd();

        const restartBtn = document.getElementById('restart-btn-gameover');
        if (restartBtn) restartBtn.onclick = () => this.restartGame();
    }

    reviveWithAd() {
        crazyGames.requestAd('rewarded', {
            adFinished: () => {
                console.log("Rewarded ad finished - Reviving!");
                this.lives = 3;
                this.isGameOver = false; // Reset game over flag
                this.updateHUD();
                const overlay = document.getElementById('end-overlay');
                if (overlay) overlay.style.display = 'none';
                crazyGames.gameplayStart();
                this.resetPlayer();
            },
            adError: (error) => {
                console.warn("Rewarded ad failed or was skipped:", error);
                // Optionally handle error (e.g., show a message)
            }
        });
    }

    deactivateAbility() {
        this.abilityActive = false;
        this.shieldMesh.visible = false;
        this.controller.moveSpeed = 12;
    }

    onGoalReached() {
        if (this.waitingForCelebration || this.hasCelebrated) return;

        this.waitingForCelebration = true;
        
        // Play victory fanfare
        if (this.assets && this.assets.mazeClearSfx) {
            this.assets.mazeClearSfx.currentTime = 0;
            this.assets.mazeClearSfx.play().catch(e => console.warn("Victory SFX playback failed:", e));
        } else if (this.assets && this.assets.victorySfx) {
            this.assets.victorySfx.currentTime = 0;
            this.assets.victorySfx.play().catch(e => console.warn("Victory SFX playback failed:", e));
        }

        // Play "Follow me" voice line
        if (this.assets && this.assets.followMeVoice) {
            this.assets.followMeVoice.currentTime = 0;
            this.assets.followMeVoice.play().catch(e => console.warn("Follow Me voice failed:", e));
        }

        // Play character specific treasure voice line
        const currentPirateIndex = this.characterManager.currentIndex;
        if (this.assets && this.assets.treasureVoices && this.assets.treasureVoices[currentPirateIndex]) {
            setTimeout(() => {
                this.assets.treasureVoices[currentPirateIndex].currentTime = 0;
                this.assets.treasureVoices[currentPirateIndex].play().catch(e => console.warn("Treasure voice failed:", e));
            }, 1000); // Small delay to not overlap with victory fanfare too much
        }

        this.deactivateAbility();
        
        // Disable controls
        this.controller.moveSpeed = 0;

        // Automatically trigger celebration/boarding jump
        this.handleCelebration();
    }

    showVictory() {
        crazyGames.gameplayStop();

        // Play big victory sound for campaign clear
        if (this.assets && this.assets.mazeClearSfx) {
            this.assets.mazeClearSfx.currentTime = 0;
            this.assets.mazeClearSfx.play().catch(() => {});
        }

        const overlay = document.getElementById('end-overlay');
        if (!overlay) return;
        
        const piratesHTML = PIRATES.map(p => `
            <div style="text-align: center;">
                <img src="${p.portrait}" style="width: 50px; height: 62px; border: 1px solid #ffd700; border-radius: 4px;">
                <div style="font-size: 0.5em; color: #ffd700; margin-top: 2px;">${p.name.split(' ')[0]}</div>
            </div>
        `).join('');

        const t = TRANSLATIONS[this.language];
        overlay.innerHTML = `
            <div style="background: rgba(0,0,0,0.9); padding: 30px; border-radius: 20px; border: 5px solid #ffd700; text-align: center; pointer-events: auto; max-width: 450px;">
                <h1 style="color: #ffd700; font-size: 2.5em; margin-top: 0; margin-bottom: 0.2em;">${t.campaignComplete}</h1>
                <p style="font-size: 1.1em; color: white; margin-bottom: 1.5em;">${t.allBoarded}</p>
                
                <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5em;">
                    ${piratesHTML}
                </div>

                <div style="background: rgba(255, 215, 0, 0.1); padding: 15px; border-radius: 10px; margin-bottom: 2em; border: 1px dashed #ffd700;">
                    <div style="font-size: 1.2em; color: #ffd700;">${t.totalGold}</div>
                    <div style="font-size: 2.5em; color: white;">🪙 ${this.goldCount}</div>
                </div>

                <button id="restart-btn-victory" style="
                    padding: 12px 40px; font-size: 1.3em; background: #ffd700; color: black;
                    border: none; border-radius: 30px; cursor: pointer; font-weight: bold;
                    transition: transform 0.2s; pointer-events: auto;
                    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
                ">${t.playAgain}</button>
            </div>
        `;
        overlay.style.display = 'flex';
        
        const btn = document.getElementById('restart-btn-victory');
        if (btn) btn.onclick = () => this.restartGame();
    }

    updateMiniMap() {
        if (!this.maze || !this.miniMapCanvas) return;
        
        const ctx = this.miniMapCtx;
        const grid = this.maze.grid;
        const rows = grid.length;
        const cols = grid[0].length;
        
        // Match canvas dimensions to the rectangular maze
        this.miniMapCanvas.width = cols * 10;
        this.miniMapCanvas.height = rows * 10;
        
        ctx.clearRect(0, 0, this.miniMapCanvas.width, this.miniMapCanvas.height);
        
        // Draw background (Black for tactical feel)
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, this.miniMapCanvas.width, this.miniMapCanvas.height);
        
        // Draw grid - Inverting colors because WALLS are the path now
        const cellSize = 10;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (grid[y][x] === 1) {
                    ctx.fillStyle = '#c2a385'; // Wall top (Path)
                    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
                }
                // No need to draw gaps, background is already dark
            }
        }
        
        // Draw Goal
        const endPos = this.maze.getEndPosition();
        const endGridX = Math.round(endPos.x / this.maze.cellSize);
        const endGridZ = Math.round(endPos.z / this.maze.cellSize);
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(endGridX * cellSize + cellSize/2, endGridZ * cellSize + cellSize/2, cellSize/3, 0, Math.PI * 2);
        ctx.fill();

        // Draw Start Point
        const startPos = this.maze.getStartPosition();
        const startGridX = Math.round(startPos.x / this.maze.cellSize);
        const startGridZ = Math.round(startPos.z / this.maze.cellSize);
        ctx.fillStyle = '#00ffff';
        ctx.beginPath();
        ctx.arc(startGridX * cellSize + cellSize/2, startGridZ * cellSize + cellSize/2, cellSize/4, 0, Math.PI * 2);
        ctx.fill();

        // Draw Trap Indicators on Mini-map
        ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
        
        // Static spikes
        this.maze.traps.children.forEach(trap => {
            const tx = Math.round(trap.position.x / this.maze.cellSize);
            const tz = Math.round(trap.position.z / this.maze.cellSize);
            ctx.fillRect(tx * cellSize + 2, tz * cellSize + 2, cellSize - 4, cellSize - 4);
        });

        // Draw Remote Players
        this.remotePlayers.forEach((remote) => {
            const rx = Math.round(remote.mesh.position.x / this.maze.cellSize);
            const rz = Math.round(remote.mesh.position.z / this.maze.cellSize);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.beginPath();
            ctx.arc(rx * cellSize + cellSize/2, rz * cellSize + cellSize/2, cellSize/4, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw Player
        const px = Math.round(this.playerGroup.position.x / this.maze.cellSize);
        const pz = Math.round(this.playerGroup.position.z / this.maze.cellSize);
        
        // Draw Player "Route Box" (Current Cell Highlight)
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px * cellSize, pz * cellSize, cellSize, cellSize);

        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(px * cellSize + cellSize/2, pz * cellSize + cellSize/2, cellSize/2.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Pulse effect for player
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px * cellSize + cellSize/2, pz * cellSize + cellSize/2, (cellSize/2.5) * (1 + Math.sin(Date.now() * 0.01) * 0.2), 0, Math.PI * 2);
        ctx.stroke();
    }

    animate(time) {
        requestAnimationFrame((t) => this.animate(t));
       const delta = this.timer.getDelta();
        if (delta > 0) {
            // Update Maze (for moving traps and sharks)
            if (this.maze) this.maze.update(time, delta);
            
            // Update Mini-map
            this.updateMiniMap();

            // Refined Mirage logic: ship materializes as you approach the exit
            if (this.shipSprite && this.shipSprite.material) {
                const dist = this.playerGroup.position.distanceTo(this.targetShipPos);
                // Materialize only when getting fairly close to the goal
                const maxMirageDist = 65; 
                const minMirageDist = 18; 
                const alpha = 1 - THREE.MathUtils.smoothstep(dist, minMirageDist, maxMirageDist);
                
                this.shipSprite.material.opacity = alpha;
                this.shipSprite.visible = this.shipSprite.material.opacity > 0.001;
                
                // Subtle scale-up effect as it "materializes"
                const baseScale = 45;
                const currentScale = baseScale * (0.85 + 0.15 * alpha);
                this.shipSprite.scale.set(currentScale, currentScale * 0.8, 1);
            }

            // Ship stationary animation removed (not floating)
            this.shipSprite.position.y = this.targetShipPos.y;

            // Update Light Beam rotation
            if (this.lightBeam) {
                this.lightBeam.rotation.y += delta * 1.5;
            }

            // Sync main sea plane swell and wave animation
            if (this.sea && this.assets.seaWaves) {
                const waveTime = time * 0.0006;
                // Amplified oscillating offset for highly visible wave motion
                this.assets.seaWaves.offset.x = Math.sin(waveTime * 0.7) * 0.05;
                this.assets.seaWaves.offset.y = Math.cos(waveTime * 0.5) * 0.05;
                
                // Amplified vertical swell
                this.sea.position.y = -5.5 + Math.sin(time * 0.0012) * 0.35;
            }

            if (this.abilityActive) {
                this.abilityTimer -= delta * 1000;
                if (this.abilityTimer <= 0) this.deactivateAbility();
            }
            if (this.abilityCooldown) {
                this.cooldownTimer -= delta * 1000;
                const pirate = this.characterManager.getCurrentPirate();
                const progress = Math.max(0, this.cooldownTimer / pirate.ability.cooldown);
                const overlay = document.getElementById('cooldown-overlay');
                if (overlay) overlay.style.height = `${progress * 100}%`;
                if (this.cooldownTimer <= 0) {
                    this.abilityCooldown = false;
                    if (overlay) overlay.style.height = `0%`;
                }
            }
            this.checkCollisions(delta);
            this.updateParticles();
            this.multiplayer.updateLocalState({
                x: this.playerGroup.position.x,
                y: this.playerGroup.position.y,
                z: this.playerGroup.position.z,
                ry: this.playerGroup.rotation.y,
                pirateIndex: this.characterManager.currentIndex,
                shield: this.shieldMesh.visible
            });
        }
        this.renderer.render(this.scene, this.camera);

        // Apply screen shake after render for the next frame
        if (this.shakeIntensity > 0.01) {
            const shake = new THREE.Vector3(
                (Math.random() - 0.5) * this.shakeIntensity,
                (Math.random() - 0.5) * this.shakeIntensity,
                (Math.random() - 0.5) * this.shakeIntensity
            );
            this.camera.position.add(shake);
            this.shakeIntensity *= this.shakeDecay;
        }
    }
}

new Game();
overlay.innerHTML = `
            <div style="background: rgba(0,0,0,0.9); padding: 30px; border-radius: 20px; border: 5px solid #ffd700; text-align: center; pointer-events: auto; max-width: 450px;">
                <h1 style="color: #ffd700; font-size: 2.2em; margin-top: 0;">${t.campaignComplete}</h1>
                <p style="font-size: 1em; color: white; margin-bottom: 1em;">${t.allBoarded}</p>
                
                <div style="display: flex; justify-content: center; gap: 8px; margin-bottom: 20px; flex-wrap: wrap;">
                    ${piratesHTML}
                </div>

                <div style="font-size: 1.1em; color: #ffd700; margin-bottom: 20px; font-weight: bold;">
                    ${t.totalGold}: 🪙 ${this.goldCount}
                </div>
                
                <button id="restart-campaign-btn" style="
                    padding: 12px 40px; font-size: 1.2em; background: #ffd700; color: black;
                    border: none; border-radius: 30px; cursor: pointer; font-weight: bold;
                    transition: transform 0.2s; pointer-events: auto;
                    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
                ">${t.restartCampaign}</button>
            </div>
        `;
        overlay.style.display = 'flex';
        
       const restartBtn = document.getElementById('restart-campaign-btn');
        if (restartBtn) {
            restartBtn.onclick = () => {
                overlay.style.display = 'none';
                this.restartGame();
            };
        }
     // <-- إغلاق دالة showVictory بشكل صحيح

    animate(time) 
        requestAnimationFrame((t) => this.animate(t));
        
        const delta = this.timer.getDelta();
        
        if (delta > 0) {
            // Update Maze (for moving traps and sharks)
            if (this.maze) this.maze.update(time, delta);
            
            // Screen shake effect reduction
            if (this.shakeIntensity > 0) {
                this.shakeIntensity *= this.shakeDecay;
                if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
                this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
                this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
            }

            // Update Multiplayer & Particles
            if (this.multiplayer) this.multiplayer.update(this.playerGroup.position);
            this.updateParticles();

            // Ability timer countdown
            if (this.abilityActive) {
                this.abilityTimer -= delta;
                if (this.abilityTimer <= 0) {
                    this.deactivateAbility();
                }
            }

            if (this.abilityCooldown) {
                this.cooldownTimer -= delta;
                if (this.cooldownTimer <= 0) {
                    this.abilityCooldown = false;
                }
            }

            // Main Collision and Movement Check
            if (!this.waitingForCelebration && !this.hasCelebrated && !this.isGameOver) {
                this.checkCollisions(delta);
            }
        }

        this.renderer.render(this.scene, this.camera);
    
