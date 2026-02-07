document.addEventListener('DOMContentLoaded', () => {

    /**
     * GAME OF LIFE ENGINE (Desktop Optimized)
     */
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d', { alpha: false }); 
    
    // --- Config & State ---
    let width, height;
    let isPlaying = false;
    let simulationSpeed = 1; 
    let lastTickTime = 0;

    // Viewport
    let scale = 20; 
    let offsetX = 0;
    let offsetY = 0;

    // Grid Data
    let liveCells = new Set();

    // Interaction State
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let isDrawing = false;
    let drawMode = true; 
    let brushSize = 1; 
    let lastDrawPos = null;

    // --- Initialization ---

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        
        if (offsetX === 0 && offsetY === 0) {
            offsetX = width / 2;
            offsetY = height / 2;
        }
        draw();
    }
    window.addEventListener('resize', resize);
    resize();

    // --- Logic ---

    function tick() {
        const neighborCounts = new Map();
        const addNeighbor = (x, y) => {
            const key = `${x},${y}`;
            neighborCounts.set(key, (neighborCounts.get(key) || 0) + 1);
        };

        for (const key of liveCells) {
            const [x, y] = key.split(',').map(Number);
            addNeighbor(x-1, y-1); addNeighbor(x, y-1); addNeighbor(x+1, y-1);
            addNeighbor(x-1, y);                  addNeighbor(x+1, y);
            addNeighbor(x-1, y+1); addNeighbor(x, y+1); addNeighbor(x+1, y+1);
        }

        const nextGen = new Set();
        for (const [key, count] of neighborCounts) {
            const isAlive = liveCells.has(key);
            if (isAlive && (count === 2 || count === 3)) nextGen.add(key);
            else if (!isAlive && count === 3) nextGen.add(key);
        }
        liveCells = nextGen;
        draw();
    }

    // --- Rendering ---

    function draw() {
        // 1. Background
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, width, height);

        // 2. Grid Lines
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#2A2A2A'; 
        ctx.beginPath();

        const startCol = Math.floor((-offsetX) / scale);
        const endCol = startCol + (width / scale) + 1;
        const startRow = Math.floor((-offsetY) / scale);
        const endRow = startRow + (height / scale) + 1;

        for (let x = startCol; x <= endCol; x++) {
            const sx = Math.floor(x * scale + offsetX) + 0.5;
            ctx.moveTo(sx, 0); ctx.lineTo(sx, height);
        }
        for (let y = startRow; y <= endRow; y++) {
            const sy = Math.floor(y * scale + offsetY) + 0.5;
            ctx.moveTo(0, sy); ctx.lineTo(width, sy);
        }
        ctx.stroke();

        // 3. Cells
        ctx.fillStyle = '#FFFFFF';
        for (const key of liveCells) {
            const [gx, gy] = key.split(',').map(Number);
            
            if (gx < startCol || gx > endCol || gy < startRow || gy > endRow) continue;

            const screenX = gx * scale + offsetX;
            const screenY = gy * scale + offsetY;
            const size = scale - 1;

            if (scale > 4) {
                ctx.beginPath();
                ctx.roundRect(screenX + 1, screenY + 1, size -1, size -1, 2);
                ctx.fill();
            } else {
                ctx.fillRect(screenX, screenY, size, size);
            }
        }

        // 4. Vignette (Desktop Style)
        const radius = Math.max(width, height) * 0.85; 
        const gradient = ctx.createRadialGradient(
            width / 2, height / 2, 0,           
            width / 2, height / 2, radius       
        );
        gradient.addColorStop(0, 'rgba(18, 18, 18, 0)');
        gradient.addColorStop(0.3, 'rgba(18, 18, 18, 0)'); 
        gradient.addColorStop(1, '#121212'); 

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    function loop(timestamp) {
        if (isPlaying) {
            const msPerTick = 1000 / simulationSpeed;
            if (timestamp - lastTickTime >= msPerTick) {
                tick();
                lastTickTime = timestamp;
            }
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // --- Brush Logic ---

    function paintCircle(cx, cy) {
        if (brushSize === 1) {
            const key = `${cx},${cy}`;
            if (drawMode) liveCells.add(key);
            else liveCells.delete(key);
            return;
        }
        const r = brushSize / 2;
        const rSq = r * r;
        const startX = Math.floor(cx - r);
        const endX = Math.ceil(cx + r);
        const startY = Math.floor(cy - r);
        const endY = Math.ceil(cy + r);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                if ((x - cx) ** 2 + (y - cy) ** 2 <= rSq) {
                    const key = `${x},${y}`;
                    if (drawMode) liveCells.add(key);
                    else liveCells.delete(key);
                }
            }
        }
    }

    function interpolateLine(x0, y0, x1, y1) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? 1 : -1;
        const sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            paintCircle(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    // --- Interaction ---

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(2, Math.min(200, scale * (1 + delta)));

        const gridX = (e.clientX - offsetX) / scale;
        const gridY = (e.clientY - offsetY) / scale;

        scale = newScale;
        offsetX = e.clientX - gridX * scale;
        offsetY = e.clientY - gridY * scale;
        draw();
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle or Alt+Click
            isDragging = true;
            dragStartX = e.clientX - offsetX;
            dragStartY = e.clientY - offsetY;
            canvas.style.cursor = 'grabbing';
        } else if (e.button === 0) { // Left Click
            isDrawing = true;
            const gx = Math.floor((e.clientX - offsetX) / scale);
            const gy = Math.floor((e.clientY - offsetY) / scale);
            drawMode = !liveCells.has(`${gx},${gy}`);
            lastDrawPos = { x: gx, y: gy };
            paintCircle(gx, gy);
            draw();
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        isDrawing = false;
        lastDrawPos = null;
        canvas.style.cursor = 'crosshair';
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            offsetX = e.clientX - dragStartX;
            offsetY = e.clientY - dragStartY;
            draw();
        } else if (isDrawing) {
            const gx = Math.floor((e.clientX - offsetX) / scale);
            const gy = Math.floor((e.clientY - offsetY) / scale);
            
            if (lastDrawPos) interpolateLine(lastDrawPos.x, lastDrawPos.y, gx, gy);
            else paintCircle(gx, gy);
            
            lastDrawPos = { x: gx, y: gy };
            draw();
        }
    });

    // Spacebar to Play/Pause
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault(); // Stop scrolling
            togglePlay();
        }
    });

    function togglePlay() {
        isPlaying = !isPlaying;
        const playIcon = document.getElementById('icon-play');
        const pauseIcon = document.getElementById('icon-pause');
        
        if (playIcon && pauseIcon) {
            playIcon.style.display = isPlaying ? 'none' : 'block';
            pauseIcon.style.display = isPlaying ? 'block' : 'none';
        }
        
        if(isPlaying) lastTickTime = performance.now();
    }

    // --- UI Logic ---

    // Start Button
    const startBtn = document.getElementById('startBtn');
    startBtn.addEventListener('click', () => {
        document.getElementById('intro-modal').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('intro-modal').style.display = 'none';
            document.getElementById('controls').style.display = 'flex';
            if (liveCells.size === 0) {
                // Glider Seed
                const seeds = ["0,0", "1,0", "2,0", "2,-1", "1,-2"];
                seeds.forEach(s => liveCells.add(s));
                draw();
            }
        }, 300);
    });

    // Controls
    document.getElementById('playPauseBtn').addEventListener('click', togglePlay);

    document.getElementById('clearBtn').addEventListener('click', () => {
        liveCells.clear();
        draw();
    });

    // Menus
    const speedLabel = document.getElementById('speedLabel');
    const speedMenu = document.getElementById('speed-menu');
    const brushBtn = document.getElementById('brushBtn');
    const brushMenu = document.getElementById('brush-menu');

    speedLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        speedMenu.classList.toggle('open');
        brushMenu.classList.remove('open');
    });

    brushBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        brush
