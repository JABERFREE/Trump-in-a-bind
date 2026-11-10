import * as THREE from 'three';

export class Maze {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.particles = []; // Array to track local water splash particles

        this.width = options.width || 11; // Must be odd
        this.height = options.height || 11; // Must be odd
        this.cellSize = options.cellSize || 4;
        this.wallHeight = options.wallHeight || 5;
        
        this.grid = [];
        this.walls = new THREE.Group();
        this.traps = new THREE.Group();
        this.movingTraps = new THREE.Group();
        this.flickerTraps = new THREE.Group();
        this.goldGroup = new THREE.Group(); // New group for gold rewards
        this.debrisGroup = new THREE.Group(); // New group for floating debris
        this.floraGroup = new THREE.Group(); // New group for tropical flora
        this.sharkGroup = new THREE.Group(); // Group for animated sharks
        this.chestGroup = new THREE.Group(); // Group for treasure chest
        this.pathGroup = new THREE.Group(); // Group for path visualization
        this.explosiveGroup = new THREE.Group(); // Group for explosive traps
        this.group.add(this.walls);
        this.group.add(this.traps);
        this.group.add(this.movingTraps);
        this.group.add(this.flickerTraps);
        this.group.add(this.goldGroup);
        this.group.add(this.debrisGroup);
        this.group.add(this.floraGroup);
        this.group.add(this.sharkGroup);
        this.group.add(this.chestGroup);
        this.group.add(this.pathGroup);
        this.group.add(this.explosiveGroup);
        
        this.wallTexture = options.wallTexture;
        this.floorTexture = options.floorTexture;
        this.spikeTexture = options.spikeTexture;
        this.fireTexture = options.fireTexture;
        this.barbedWireTexture = options.barbedWireTexture;
        this.debrisTexture = options.debrisTexture;
        this.palmTexture = options.palmTexture;
        this.shrubTexture = options.shrubTexture;
        this.chestTexture = options.chestTexture;
        this.seaWavesTexture = options.seaWavesTexture;
        this.explosiveTexture = options.explosiveTexture;
        this.sharkModel = options.sharkModel;
        this.language = options.language || 'en';
        this.difficultyLevel = 0; // Increases with characters
        
        this.generate();
    }

    setDifficulty(level) {
        this.difficultyLevel = level;
    }

    generate() {
        // Initialize grid with "holes" (0)
        for (let y = 0; y < this.height; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.width; x++) {
                this.grid[y][x] = 0;
            }
        }

        // Recursive backtracker to carve out the "Wall Path"
        // In this mode, we carve 1s (walls) instead of 0s
        const walk = (x, y) => {
            this.grid[y][x] = 1;

            const dirs = [
                [0, 2], [0, -2], [2, 0], [-2, 0]
            ].sort(() => Math.random() - 0.5);

            for (const [dx, dy] of dirs) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx > 0 && nx < this.width - 1 && ny > 0 && ny < this.height - 1 && this.grid[ny][nx] === 0) {
                    this.grid[y + dy / 2][x + dx / 2] = 1;
                    walk(nx, ny);
                }
            }
        };

        walk(1, 1);
        
        // Explicitly ensure start and end are walls (1)
        this.grid[1][1] = 1;
        this.grid[this.height - 2][this.width - 2] = 1;

        // Solve the maze to find the direct path for trap placement
        const startPos = this.getStartPosition();
        const endPos = this.getEndPosition();
        this.criticalPath = this.findPath(startPos, endPos) || [];

        this.buildMesh();
        this.addStartPoint();
    }

    addStartPoint() {
        const startPos = this.getStartPosition();
        const geometry = new THREE.CircleGeometry(this.cellSize * 0.4, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 });
        const marker = new THREE.Mesh(geometry, material);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(startPos.x, this.wallHeight + 0.05, startPos.z);
        this.group.add(marker);

        this.startLabel = this.createLabel(this.language === 'en' ? 'START' : 'البداية', startPos.x, startPos.z);
        this.group.add(this.startLabel);
    }

    createLabel(text, x, z) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(text, 64, 40);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(x, this.wallHeight + 3, z);
        sprite.scale.set(4, 2, 1);
        return sprite;
    }

    updateLanguage(lang) {
        this.language = lang;
        if (this.startLabel) {
            this.group.remove(this.startLabel);
            const startPos = this.getStartPosition();
            this.startLabel = this.createLabel(this.language === 'en' ? 'START' : 'البداية', startPos.x, startPos.z);
            this.group.add(this.startLabel);
        }
    }

    buildMesh() {
        // High-clarity box geometry for walls
        // Making walls continuous by using the full cellSize
        const wallSize = this.cellSize; 
        const wallGeo = new THREE.BoxGeometry(wallSize, this.wallHeight, wallSize);
        
        const stoneMat = new THREE.MeshStandardMaterial({ 
            color: 0x888888, // Gray stone
            roughness: 0.7,
            metalness: 0.1
        });
        if (this.wallTexture) stoneMat.map = this.wallTexture;

        const woodMat = new THREE.MeshStandardMaterial({ 
            color: 0x8b4513, // SaddleBrown
            roughness: 0.8
        });
        if (this.wallTexture) woodMat.map = this.wallTexture;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                if (this.grid[y][x] === 1) {
                    // Randomly choose between stone and wood for visual variety like the image
                    const mat = Math.random() > 0.3 ? stoneMat : woodMat;
                    const wall = new THREE.Mesh(wallGeo, mat);
                    wall.position.set(x * this.cellSize, this.wallHeight / 2, y * this.cellSize);
                    wall.castShadow = true;
                    wall.receiveShadow = true;
                    this.walls.add(wall);

                    const isStart = (x === 1 && y === 1);
                    const isEnd = (x === this.width - 2 && y === this.height - 2);
                    
                    if (!isStart && !isEnd) {
                        // Check if this cell is on the critical path to the ship
                        const isOnPath = this.criticalPath.some(p => p[0] === x && p[1] === y);
                        
                        // Higher trap probability on the critical path (0.35) vs other areas (0.2)
                        const trapChance = isOnPath ? 0.35 : 0.2;
                        
                        if (Math.random() < trapChance) {
                            const rand = Math.random();
                            if (rand < 0.33) {
                                this.addWallSpikes(x, y);
                            } else if (rand < 0.66) {
                                this.addDebrisHazard(x, y);
                            } else {
                                this.addExplosiveTrap(x, y);
                            }
                        } else if (Math.random() < 0.25) {
                            // Only add gold if there's no trap
                            this.addGold(x, y);
                        }
                    }
                } else {
                    // This is a gap/sea area, add decorative flora or sharks
                    const rand = Math.random();
                    const isBottomArea = y > this.height * 0.6; // Stricter goal area threshold

                    if (isBottomArea) {
                        // Gaps are now completely clear of flora
                    } else {
                        // Gaps are now completely clear of flora
                    }
                }
            }
        }
    }

    addShark(x, y) {
        if (!this.sharkModel) return;
        const shark = this.sharkModel.clone();
        
        // Random scale and rotation
        const scale = 8 + Math.random() * 4;
        shark.scale.set(scale, scale, scale);
        shark.rotation.y = Math.random() * Math.PI * 2;
        
        const group = new THREE.Group();
        group.add(shark);
        
        // Initial position deep underwater
        const posX = x * this.cellSize + (Math.random() - 0.5) * 4;
        const posZ = y * this.cellSize + (Math.random() - 0.5) * 4;
        group.position.set(posX, -30, posZ);

        group.userData = {
            phase: 'waiting',
            timer: Math.random() * 5000, // Initial wait time
            originalY: -30,
            peakY: this.wallHeight - 5,
            animSpeed: 0.002 + Math.random() * 0.001,
            splashed: false
        };

        this.sharkGroup.add(group);
    }

    spawnSplash(pos) {
        const particleCount = 20;
        const geo = new THREE.SphereGeometry(0.3, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xccffff, transparent: true, opacity: 0.8 });

        for (let i = 0; i < particleCount; i++) {
            const p = new THREE.Mesh(geo, mat.clone());
            p.position.set(
                pos.x + (Math.random() - 0.5) * 4,
                -2, // Sea level
                pos.z + (Math.random() - 0.5) * 4
            );
            
            const theta = Math.random() * Math.PI * 2;
            const speed = 0.2 + Math.random() * 0.3;
            
            p.userData = {
                velocity: new THREE.Vector3(
                    Math.cos(theta) * speed * 0.5,
                    speed + Math.random() * 0.5,
                    Math.sin(theta) * speed * 0.5
                ),
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03
            };
            
            this.group.add(p);
            this.particles.push(p);
        }
    }

    addWallSpikes(x, y) {
        const trapGroup = new THREE.Group();
        const spikeGeo = new THREE.ConeGeometry(0.5, 2, 8);
        const spikeMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8 });
        
        // Add 4 spikes in a pattern on the wall top
        const positions = [
            [0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8]
        ];
        
        positions.forEach(pos => {
            const spike = new THREE.Mesh(spikeGeo, spikeMat);
            spike.position.set(pos[0], 1, pos[1]);
            trapGroup.add(spike);
        });

        trapGroup.position.set(x * this.cellSize, this.wallHeight, y * this.cellSize);
        trapGroup.userData = { 
            type: 'spike', 
            x, 
            y,
            interval: 1500, // Base interval
            offset: Math.random() * 5000,
            active: true
        };
        this.traps.add(trapGroup);
    }

    addDebrisHazard(x, y) {
        const spriteMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true });
        if (this.debrisTexture) spriteMat.map = this.debrisTexture;
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(2.5, 2.5, 1); // Reduced size
        
        const group = new THREE.Group();
        group.add(sprite);
        group.position.set(x * this.cellSize, this.wallHeight + 1.5, y * this.cellSize); // Lowered/Secured
        
        group.userData = {
            type: 'debris',
            bobOffset: 0,
            bobSpeed: 0,
            originalY: this.wallHeight + 1.5,
            active: false // Disable collision for old debris bomb traps
        };
        this.debrisGroup.add(group);
    }

    addExplosiveTrap(x, y) {
        const spriteMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true });
        if (this.explosiveTexture) spriteMat.map = this.explosiveTexture;
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(3, 3, 1);
        
        const group = new THREE.Group();
        group.add(sprite);
        group.position.set(x * this.cellSize, this.wallHeight + 1.5, y * this.cellSize);
        
        group.userData = {
            type: 'explosive',
            x,
            y,
            smokeTimer: 0,
            active: true
        };
        this.explosiveGroup.add(group);
    }

    spawnSmoke(pos, color = 0x888888) {
        const particleCount = 1;
        const geo = new THREE.SphereGeometry(0.4, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6 });
        
        for (let i = 0; i < particleCount; i++) {
            const p = new THREE.Mesh(geo, mat.clone());
            p.position.set(
                pos.x + (Math.random() - 0.5) * 1.0,
                pos.y + 1.0,
                pos.z + (Math.random() - 0.5) * 1.0
            );
            
            p.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.05,
                    0.05 + Math.random() * 0.1,
                    (Math.random() - 0.5) * 0.05
                ),
                life: 1.0,
                decay: 0.01 + Math.random() * 0.02,
                gravity: -0.002, // Slight upward drift
                baseOpacity: 0.6,
                baseScale: 1.0 + Math.random() * 0.5
            };
            
            this.group.add(p);
            this.particles.push(p);
        }
    }

    addFlickerTrap(x, y) {
        const type = Math.random() > 0.5 ? 'fire' : 'wire';
        const tex = type === 'fire' ? this.fireTexture : this.barbedWireTexture;
        const spriteMat = new THREE.SpriteMaterial({ transparent: true });
        if (tex) spriteMat.map = tex;
        const sprite = new THREE.Sprite(spriteMat);
        
        if (type === 'fire') {
            sprite.scale.set(4, 4, 1);
            sprite.position.y = 2.0;
        } else {
            sprite.scale.set(3, 2, 1);
            sprite.position.y = 1.0;
        }

        const group = new THREE.Group();
        group.add(sprite);
        group.position.set(x * this.cellSize, 0, y * this.cellSize);
        
        group.userData = {
            type: 'flicker',
            hazardType: type,
            interval: 2000 + Math.random() * 2000,
            offset: Math.random() * 5000,
            active: true
        };

        this.flickerTraps.add(group);
    }

    addTrap(x, y) {
        const trapGroup = new THREE.Group();
        const spriteMat = new THREE.SpriteMaterial({ color: 0xffffff });
        if (this.spikeTexture) spriteMat.map = this.spikeTexture;
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(3, 3, 1);
        sprite.position.y = 1.5;
        trapGroup.add(sprite);
        
        trapGroup.position.set(x * this.cellSize, 0, y * this.cellSize);
        trapGroup.userData = { type: 'trap', x, y };
        this.traps.add(trapGroup);
    }

    getStartPosition() {
        return new THREE.Vector3(1 * this.cellSize, this.wallHeight, 1 * this.cellSize);
    }

    getEndPosition() {
        return new THREE.Vector3((this.width - 2) * this.cellSize, this.wallHeight, (this.height - 2) * this.cellSize);
    }

    checkCollision(position, radius = 0.5) {
        // Grid coordinates based on player position
        const gridX = Math.round(position.x / this.cellSize);
        const gridY = Math.round(position.z / this.cellSize);

        // If outside bounds, it's a "collision" (falling)
        if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) return true;
        
        // In the new mode, "collision" means stepping into a gap (grid === 0)
        // We use a safe radius to allow the player to be slightly off-center
        const cellCenterX = gridX * this.cellSize;
        const cellCenterZ = gridY * this.cellSize;
        const distToCenterSq = Math.pow(position.x - cellCenterX, 2) + Math.pow(position.z - cellCenterZ, 2);
        
        // If the current cell is a hole, they fall
        if (this.grid[gridY][gridX] === 0) {
            return true;
        }
        
        // If they are on a wall (grid === 1), they are safe as long as they aren't too far from center
        const maxDist = (this.cellSize / 2) + 0.5; 
        if (distToCenterSq > maxDist * maxDist) {
            return false; 
        }
        
        return false;
    }

    checkTraps(position, radius = 0.8) {
        return !!this.checkTrapsExtended(position, radius);
    }

    checkTrapsExtended(position, radius = 0.8) {
        const checkGroup = (group, isFloating = false) => {
            for (const trap of group.children) {
                if (trap.userData.active === false) continue;
                const dist = new THREE.Vector3(position.x, 0, position.z).distanceTo(new THREE.Vector3(trap.position.x, 0, trap.position.z));
                
                if (dist < radius) {
                    if (isFloating) {
                        // Floating hazards check verticality too - threshold increased to ensure ground contact
                        if (Math.abs(position.y - trap.position.y) < 1.6) return trap.userData.type || true;
                    } else {
                        // Grounded hazards
                        if (position.y < this.wallHeight + 1) return trap.userData.type || true;
                    }
                }
            }
            return null;
        };

        let result;
        if (result = checkGroup(this.traps)) return result;
        if (result = checkGroup(this.debrisGroup, true)) return result;
        if (result = checkGroup(this.explosiveGroup, true)) return result;
        if (result = checkGroup(this.movingTraps)) return result;
        if (result = checkGroup(this.flickerTraps)) return result;
        
        return null;
    }

    triggerExplosion(pos) {
        // Spawn fire and smoke particles
        const particleCount = 25;
        for (let i = 0; i < particleCount; i++) {
            const color = Math.random() > 0.4 ? 0xff4400 : 0xffaa00;
            const geo = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
            const p = new THREE.Mesh(geo, mat);
            
            p.position.copy(pos);
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = 0.5 + Math.random() * 1.5;
            
            p.userData = {
                velocity: new THREE.Vector3(
                    speed * Math.sin(phi) * Math.cos(theta),
                    speed * Math.sin(phi) * Math.sin(theta),
                    speed * Math.cos(phi)
                ),
                life: 1.0,
                decay: 0.02 + Math.random() * 0.05,
                gravity: 0.01,
                baseOpacity: 0.9,
                baseScale: 1.0
            };
            this.group.add(p);
            this.particles.push(p);
        }
        
        // Add big black smoke puffs
        for (let i = 0; i < 15; i++) {
            this.spawnSmoke(pos.clone().add(new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4,
                (Math.random() - 0.5) * 4
            )), 0x222222);
        }

        // Add Floating Debris (Wooden Splinters/Fragments)
        const debrisCount = 10;
        const woodGeo = new THREE.BoxGeometry(0.8, 0.2, 0.4);
        const woodMat = new THREE.MeshStandardMaterial({ 
            color: 0x5d4037, // Dark brown wood
            roughness: 0.9
        });
        if (this.wallTexture) woodMat.map = this.wallTexture;

        for (let i = 0; i < debrisCount; i++) {
            const p = new THREE.Mesh(woodGeo, woodMat.clone());
            p.position.copy(pos);
            p.rotation.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
            
            const theta = Math.random() * Math.PI * 2;
            const speed = 0.3 + Math.random() * 0.6;
            
            p.userData = {
                velocity: new THREE.Vector3(
                    Math.cos(theta) * speed,
                    0.2 + Math.random() * 0.4,
                    Math.sin(theta) * speed
                ),
                rotationVelocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.2,
                    (Math.random() - 0.5) * 0.2,
                    (Math.random() - 0.5) * 0.2
                ),
                life: 1.0,
                decay: 0.005 + Math.random() * 0.01, // Longer life than fire
                gravity: 0.02,
                baseOpacity: 1.0,
                baseScale: 1.0
            };
            this.group.add(p);
            this.particles.push(p);
        }
    }

    addMovingTrap(x, y) {
        // Find direction of the corridor
        let axis = 'x';
        if (this.grid[y - 1] && this.grid[y - 1][x] === 0 && this.grid[y + 1] && this.grid[y + 1][x] === 0) {
            axis = 'z';
        }

        const geo = new THREE.SphereGeometry(1.5, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
        const ball = new THREE.Mesh(geo, mat);
        ball.position.y = 1.5;
        ball.castShadow = true;

        const group = new THREE.Group();
        group.add(ball);
        group.position.set(x * this.cellSize, 0, y * this.cellSize);

        group.userData = {
            type: 'moving_trap',
            axis: axis,
            startPos: group.position.clone(),
            speed: 2 + Math.random() * 2,
            range: this.cellSize * 0.8,
            offset: Math.random() * Math.PI * 2
        };

        this.movingTraps.add(group);
    }

    addGold(x, y) {
        const goldGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16);
        const goldMat = new THREE.MeshStandardMaterial({ 
            color: 0xffd700, 
            metalness: 1.0, 
            roughness: 0.1,
            emissive: 0xffd700,
            emissiveIntensity: 0.2
        });
        const coin = new THREE.Mesh(goldGeo, goldMat);
        coin.rotation.x = Math.PI / 2;
        coin.position.set(x * this.cellSize, this.wallHeight + 1.2, y * this.cellSize);
        
        // Give each coin a random value between 1 and 5
        const value = Math.floor(Math.random() * 5) + 1;
        coin.userData = { type: 'gold', collected: false, value: value };
        this.goldGroup.add(coin);
    }

    checkGold(position, radius = 1.0) {
        for (let i = this.goldGroup.children.length - 1; i >= 0; i--) {
            const coin = this.goldGroup.children[i];
            const dist = new THREE.Vector3(position.x, position.y, position.z).distanceTo(coin.position);
            if (dist < radius) {
                const result = {
                    pos: coin.position.clone(),
                    value: coin.userData.value
                };
                this.goldGroup.remove(coin);
                return result;
            }
        }
        return null;
    }

    update(time, delta) {
        // Update local particles (water splashes, mist, smoke, debris)
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.position.add(p.userData.velocity);
            
            // Apply rotation if it exists (for debris)
            if (p.userData.rotationVelocity) {
                p.rotation.x += p.userData.rotationVelocity.x;
                p.rotation.y += p.userData.rotationVelocity.y;
                p.rotation.z += p.userData.rotationVelocity.z;
            }

            if (p.userData.gravity !== undefined) {
                p.userData.velocity.y -= p.userData.gravity;
            } else {
                p.userData.velocity.y -= 0.05; // Default gravity
            }
            p.userData.life -= p.userData.decay;
            p.material.opacity = p.userData.life * (p.userData.baseOpacity || 1);
            p.scale.setScalar(p.userData.life * (p.userData.baseScale || 1));
            if (p.userData.life <= 0) {
                this.group.remove(p);
                this.particles.splice(i, 1);
            }
        }

        // Update Sharks
        this.sharkGroup.children.forEach(group => {
            const data = group.userData;
            data.timer -= delta * 1000;

            if (data.phase === 'waiting' && data.timer <= 0) {
                data.phase = 'rising';
                data.timer = 2000; // Rise duration
                data.splashed = false; // Reset splash flag
            } else if (data.phase === 'rising') {
                const t = 1 - (data.timer / 2000);
                group.position.y = THREE.MathUtils.lerp(data.originalY, data.peakY, t);
                
                // Trigger splash when breaking surface
                if (!data.splashed && group.position.y > -5) {
                    this.spawnSplash(group.position);
                    data.splashed = true;
                }

                if (data.timer <= 0) {
                    data.phase = 'descending';
                    data.timer = 2000;
                }
            } else if (data.phase === 'descending') {
                const t = 1 - (data.timer / 2000);
                group.position.y = THREE.MathUtils.lerp(data.peakY, data.originalY, t);
                if (data.timer <= 0) {
                    data.phase = 'waiting';
                    data.timer = 5000 + Math.random() * 10000;
                }
            }
        });

        // Spin gold coins
        this.goldGroup.children.forEach(coin => {
            coin.rotation.z += 0.05;
        });

        this.movingTraps.children.forEach(trap => {
            const data = trap.userData;
            const difficultyMultiplier = 1 + (this.difficultyLevel * 0.15);
            const movement = Math.sin(time * 0.002 * data.speed * difficultyMultiplier + data.offset) * data.range;
            if (data.axis === 'x') {
                trap.position.x = data.startPos.x + movement;
            } else {
                trap.position.z = data.startPos.z + movement;
            }
        });

        // Update spike traps (appearing/disappearing)
        this.traps.children.forEach(trap => {
            const data = trap.userData;
            const difficultyMultiplier = 1 + (this.difficultyLevel * 0.2);
            const effectiveInterval = data.interval / difficultyMultiplier;
            const cycleTime = (time + data.offset) % (effectiveInterval * 2);
            data.active = cycleTime < effectiveInterval;
            trap.visible = data.active;
        });

        // Update flicker traps (appearing/disappearing)
        this.flickerTraps.children.forEach(trap => {
            const data = trap.userData;
            const difficultyMultiplier = 1 + (this.difficultyLevel * 0.2);
            const effectiveInterval = data.interval / difficultyMultiplier;
            // Cycle: active for interval, inactive for interval
            const cycleTime = (time + data.offset) % (effectiveInterval * 2);
            data.active = cycleTime < effectiveInterval;
            trap.visible = data.active;

            // Spawn smoke if it's a fire trap and active
            if (data.hazardType === 'fire' && data.active && Math.random() < 0.2) {
                this.spawnSmoke(trap.position, 0x444444); // Darker smoke for fire
            }
        });

        // Update Explosive Traps (Smoke)
        this.explosiveGroup.children.forEach(trap => {
            const data = trap.userData;
            data.smokeTimer -= delta * 1000;
            if (data.smokeTimer <= 0) {
                this.spawnSmoke(trap.position);
                data.smokeTimer = 100 + Math.random() * 200; // Smoke puff interval
            }
        });

        // Spawn Weather/Mist Particles
        if (Math.random() < 0.1) {
            this.spawnMist();
        }
    }

    spawnMist() {
        const particleCount = 2;
        const geo = new THREE.SphereGeometry(1.5, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
        
        for (let i = 0; i < particleCount; i++) {
            const p = new THREE.Mesh(geo, mat.clone());
            // Randomly position mist around the maze
            const x = (Math.random() - 0.5) * this.width * this.cellSize * 1.5;
            const z = (Math.random() - 0.5) * this.height * this.cellSize * 1.5;
            p.position.set(x, -2, z);
            
            p.userData = {
                velocity: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.02 + Math.random() * 0.05, (Math.random() - 0.5) * 0.1),
                life: 1.0,
                decay: 0.005
            };
            
            this.group.add(p);
            this.particles.push(p);
        }
    }

    updateTextures(textures) {
        this.wallTexture = textures.wallTexture;
        this.floorTexture = textures.floorTexture;
        this.spikeTexture = textures.spikeTexture;
        this.fireTexture = textures.fireTexture;
        this.barbedWireTexture = textures.barbedWireTexture;
        this.debrisTexture = textures.debrisTexture;
        this.palmTexture = textures.palmTexture;
        this.shrubTexture = textures.shrubTexture;
        this.chestTexture = textures.chestTexture;
        this.seaWavesTexture = textures.seaWavesTexture;
        this.explosiveTexture = textures.explosiveTexture;
        
        // Update base texture
        if (this.base && this.seaWavesTexture) {
            this.base.material.map = this.seaWavesTexture;
            this.base.material.needsUpdate = true;
        }
        
        // Handle Shark Assets loading late
        if (textures.sharkModel && !this.sharkModel) {
            this.sharkModel = textures.sharkModel;
            
            // Retroactively add sharks to the group now that the model is ready
            for (let y = 0; y < this.height; y++) {
                for (let x = 0; x < this.width; x++) {
                    if (this.grid[y][x] === 0 && y > this.height * 0.6) {
                        // Higher density for sharks in the goal area (40% of gaps)
                        if (Math.random() < 0.4) {
                            this.addShark(x, y);
                        }
                    }
                }
            }
        }

        // Apply wall and floor textures
        this.walls.children.forEach(mesh => {
            if (mesh.material) {
                mesh.material.map = this.wallTexture;
                mesh.material.needsUpdate = true;
            }
        });

        // Update chest texture
        this.chestGroup.children.forEach(sprite => {
            if (sprite.isSprite && sprite.material) {
                sprite.material.map = this.chestTexture;
                sprite.material.needsUpdate = true;
            }
        });

        // Apply flora textures (only shrubs remain)
        this.floraGroup.children.forEach(sprite => {
            if (sprite.isSprite && sprite.material) {
                sprite.material.map = this.shrubTexture;
                sprite.material.needsUpdate = true;
            }
        });

        // Apply trap textures (if they are sprites)
        this.traps.children.forEach(group => {
            group.children.forEach(sprite => {
                if (sprite.isSprite && sprite.material) {
                    sprite.material.map = this.spikeTexture;
                    sprite.material.needsUpdate = true;
                }
            });
        });

        this.flickerTraps.children.forEach(group => {
            group.children.forEach(sprite => {
                if (sprite.isSprite && sprite.material) {
                    const type = group.userData.hazardType;
                    sprite.material.map = type === 'fire' ? this.fireTexture : this.barbedWireTexture;
                    sprite.material.needsUpdate = true;
                }
            });
        });

        this.debrisGroup.children.forEach(group => {
            group.children.forEach(sprite => {
                if (sprite.isSprite && sprite.material) {
                    sprite.material.map = this.debrisTexture;
                    sprite.material.needsUpdate = true;
                }
            });
        });

        this.explosiveGroup.children.forEach(group => {
            group.children.forEach(sprite => {
                if (sprite.isSprite && sprite.material) {
                    sprite.material.map = this.explosiveTexture;
                    sprite.material.needsUpdate = true;
                }
            });
        });
    }

    findPath(startPos, endPos) {
        const startX = Math.round(startPos.x / this.cellSize);
        const startY = Math.round(startPos.z / this.cellSize);
        const endX = Math.round(endPos.x / this.cellSize);
        const endY = Math.round(endPos.z / this.cellSize);

        const queue = [[startX, startY, []]];
        const visited = new Set();
        visited.add(`${startX},${startY}`);

        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        while (queue.length > 0) {
            const [x, y, path] = queue.shift();

            if (x === endX && y === endY) {
                return path.concat([[x, y]]);
            }

            for (const [dx, dy] of dirs) {
                const nx = x + dx;
                const ny = y + dy;
                const key = `${nx},${ny}`;

                if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height &&
                    this.grid[ny][nx] === 1 && !visited.has(key)) { // Path is on WALLS now
                    visited.add(key);
                    queue.push([nx, ny, path.concat([[x, y]])]);
                }
            }
        }
        return null; // No path found
    }
}
