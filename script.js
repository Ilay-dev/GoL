/**
 * GAME OF LIFE ENGINE
 * - Optimized Canvas Rendering
 * - Infinite Grid Logic
 * - Spot-Light Vignette Effect
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

// Input
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let isDrawing = false;
let drawMode = true;

// Grid Data
let liveCells = new Set();


// --- Setup ---

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

    // 1. Scan live cells
    for (const key of liveCells) {
        const [x, y] = key.split(',').map(Number);
        addNeighbor(x-1, y-1); addNeighbor(x, y-1); addNeighbor(x+1, y-1);
        addNeighbor(x-1, y);                  addNeighbor(x+1, y);
        addNeighbor(x-1, y+1); addNeighbor(x, y+1); addNeighbor(x+1, y+1);
    }

    const nextGen = new Set();

    // 2. Determine fate
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
    // 1. Solid Background
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

    // 4. Smooth Spotlight Vignette
    // We draw a radial gradient ON TOP of everything.
    // Center is transparent, Edges are solid background color.

    const radius = Math.max(width, height) * 0.8; // Radius size
    const gradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,           // Start circle (center)
    width / 2, height / 2, radius       // End circle
    );

    // Gradient Stops:
    // 0% - 30%: Fully Transparent (Show Grid clearly)
    // 100%: Fully Background Color (Hide Grid completely)
    gradient.addColorStop(0.9, 'rgba(18, 18, 18, 0)');
    gradient.addColorStop(0.3, 'rgba(18, 18, 18, 0)');
    gradient.addColorStop(1, '#121212'); // Solid color matching BG

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}


// --- Loop ---

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


// --- Interaction ---

// Zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(2, Math.min(100, scale * (1 + delta)));

    const gridX = (e.clientX - offsetX) / scale;
    const gridY = (e.clientY - offsetY) / scale;

    scale = newScale;
    offsetX = e.clientX - gridX * scale;
    offsetY = e.clientY - gridY * scale;
    draw();
}, { passive: false });

// Mouse Actions
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle
        isDragging = true;
        dragStartX = e.clientX - offsetX;
        dragStartY = e.clientY - offsetY;
        canvas.style.cursor = 'grabbing';
    } else if (e.button === 0) { // Left
        isDrawing = true;
        handleDraw(e);
    }
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    isDrawing = false;
    canvas.style.cursor = 'crosshair';
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        offsetX = e.clientX - dragStartX;
        offsetY = e.clientY - dragStartY;
        draw();
    } else if (isDrawing) {
        handleDraw(e);
    }
});

function handleDraw(e) {
    const gx = Math.floor((e.clientX - offsetX) / scale);
    const gy = Math.floor((e.clientY - offsetY) / scale);
    const key = `${gx},${gy}`;

    if (e.type === 'mousedown') drawMode = !liveCells.has(key);

    if (drawMode) liveCells.add(key);
    else liveCells.delete(key);
    draw();
}


// --- UI Events ---

document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('intro-modal').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('intro-modal').style.display = 'none';
        document.getElementById('controls').style.display = 'flex';
        // Auto-seed
        if (liveCells.size === 0) {
            liveCells.add("0,0"); liveCells.add("1,0"); liveCells.add("2,0");
            liveCells.add("2,-1"); liveCells.add("1,-2");
            draw();
        }
    }, 300);
});

document.getElementById('playPauseBtn').addEventListener('click', () => {
    isPlaying = !isPlaying;
    document.getElementById('icon-play').style.display = isPlaying ? 'none' : 'block';
    document.getElementById('icon-pause').style.display = isPlaying ? 'block' : 'none';
    if(isPlaying) lastTickTime = performance.now();
});

document.getElementById('clearBtn').addEventListener('click', () => {
    liveCells.clear();
    draw();
});

const speedMenu = document.getElementById('speed-menu');
const speedLabel = document.getElementById('speedLabel');
speedLabel.addEventListener('click', () => speedMenu.classList.toggle('open'));

document.addEventListener('click', (e) => {
    if (!e.target.closest('.speed-container')) speedMenu.classList.remove('open');
});

document.querySelectorAll('.speed-opt').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        simulationSpeed = parseInt(btn.dataset.speed);
        speedLabel.textContent = `x${simulationSpeed} Speed`;
        speedMenu.classList.remove('open');
    });
});
