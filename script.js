/**
 * 1. GLOBAL STATE & CONSTANTS
 * Positioned at the top to prevent initialization errors.
 */
const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

let width, height;
let isPlaying = false;
let simulationSpeed = 1;
let lastTickTime = 0;

// Optimized cache for gradients (recalculated only on resize)
const renderCache = {
    width: 0,
    height: 0,
    spotlight: null,
    vignette: null
};

// Viewport & Interaction
let scale = 20;
let offsetX = 0, offsetY = 0;
let isDragging = false, dragStartX = 0, dragStartY = 0;
let isDrawing = false, drawMode = true, brushSize = 1, lastDrawPos = null;

/** 
 * Sparse Matrix using a Set of 32-bit Integers (High Performance).
 * Packs X and Y into one number.
 */
let liveCells = new Set();

const pack = (x, y) => ((x + 0x8000) << 16) | ((y + 0x8000) & 0xFFFF);
const unpackX = (key) => (key >>> 16) - 0x8000;
const unpackY = (key) => (key & 0xFFFF) - 0x8000;

/**
 * 2. UI ELEMENTS & MENU LOGIC
 */
const introModal = document.getElementById('intro-modal');
const startBtn = document.getElementById('startBtn');
const controls = document.getElementById('controls');
const playPauseBtn = document.getElementById('playPauseBtn');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const clearBtn = document.getElementById('clearBtn');

const speedLabel = document.getElementById('speedLabel');
const speedMenu = document.getElementById('speed-menu');
const brushBtn = document.getElementById('brushBtn');
const brushMenu = document.getElementById('brush-menu');
const speedOpts = document.querySelectorAll('.speed-opt');

// Start Simulation
startBtn.addEventListener('click', () => {
    introModal.style.opacity = '0';
    setTimeout(() => {
        introModal.style.display = 'none';
        controls.style.display = 'flex';
        isPlaying = true;
    }, 400);
});

// Play / Pause
playPauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isPlaying = !isPlaying;
    iconPlay.style.display = isPlaying ? 'none' : 'block';
    iconPause.style.display = isPlaying ? 'block' : 'none';
});

// Clear All
clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    liveCells.clear();
    draw();
});

/**
 * MENU TOGGLES (Fixed to match CSS .open class)
 */
speedLabel.addEventListener('click', (e) => {
    e.stopPropagation();
    speedMenu.classList.toggle('open'); // Matches CSS
    brushMenu.classList.remove('open');
});

brushBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    brushMenu.classList.toggle('open'); // Matches CSS
    speedMenu.classList.remove('open');
});

// Close menus when clicking on the canvas
canvas.addEventListener('mousedown', () => {
    speedMenu.classList.remove('open');
    brushMenu.classList.remove('open');
});

// Speed Selection
speedOpts.forEach(opt => {
    opt.addEventListener('click', (e) => {
        e.stopPropagation();
        speedOpts.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        simulationSpeed = parseInt(opt.dataset.speed);
        speedLabel.textContent = `x${simulationSpeed} Speed`;
        speedMenu.classList.remove('open');
    });
});

// Brush Controls
const brushSlider = document.getElementById('brushSlider');
const brushInput = document.getElementById('brushInput');
const updateBrush = (val) => {
    brushSize = Math.max(1, Math.min(50, parseInt(val) || 1));
    brushSlider.value = brushSize;
    brushInput.value = brushSize;
};
brushSlider.addEventListener('input', (e) => updateBrush(e.target.value));
brushInput.addEventListener('input', (e) => updateBrush(e.target.value));

/**
 * 3. CORE ENGINE
 */
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    if (offsetX === 0) { offsetX = width / 2; offsetY = height / 2; }
    draw();
}
window.addEventListener('resize', resize);
resize();

function tick() {
    const neighborCounts = new Map();
    for (const key of liveCells) {
        const x = unpackX(key), y = unpackY(key);
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (i === 0 && j === 0) continue;
                const nKey = pack(x + i, y + j);
                neighborCounts.set(nKey, (neighborCounts.get(nKey) || 0) + 1);
            }
        }
    }
    const nextGen = new Set();
    for (const [key, count] of neighborCounts) {
        if (count === 3 || (liveCells.has(key) && count === 2)) nextGen.add(key);
    }
    liveCells = nextGen;
}

function draw() {
    // Gradient Caching
    if (renderCache.width !== width || renderCache.height !== height) {
        renderCache.width = width; renderCache.height = height;
        const cx = width / 2, cy = height / 2, maxDim = Math.max(width, height);
        const spot = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDim * 0.5);
        spot.addColorStop(0, '#1a1a1a'); spot.addColorStop(1, '#0a0a0a');
        renderCache.spotlight = spot;
        const vig = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDim * 0.7);
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)'); vig.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(0.8, 'rgba(10, 10, 10, 0.7)'); vig.addColorStop(1, '#000000');
        renderCache.vignette = vig;
    }

    ctx.fillStyle = renderCache.spotlight;
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.lineWidth = 1; ctx.strokeStyle = '#252525';
    const startCol = Math.floor(-offsetX / scale), endCol = startCol + Math.ceil(width / scale);
    const startRow = Math.floor(-offsetY / scale), endRow = startRow + Math.ceil(height / scale);

    ctx.beginPath();
    for (let x = startCol; x <= endCol; x++) {
        const sx = (x * scale + offsetX) | 0;
        ctx.moveTo(sx + 0.5, 0); ctx.lineTo(sx + 0.5, height);
    }
    for (let y = startRow; y <= endRow; y++) {
        const sy = (y * scale + offsetY) | 0;
        ctx.moveTo(0, sy + 0.5); ctx.lineTo(width, sy + 0.5);
    }
    ctx.stroke();

    // Cells
    ctx.fillStyle = '#FFFFFF';
    const applyShadow = scale > 10;
    if (applyShadow) { ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(255, 255, 255, 0.2)'; }

    ctx.beginPath();
    const cellSize = scale - 1, useRoundRect = scale > 4;
    for (const key of liveCells) {
        const gx = unpackX(key), gy = unpackY(key);
        if (gx < startCol || gx > endCol || gy < startRow || gy > endRow) continue;
        const sx = (gx * scale + offsetX) | 0, sy = (gy * scale + offsetY) | 0;
        if (useRoundRect) ctx.roundRect(sx + 1, sy + 1, cellSize - 1, cellSize - 1, 2);
        else ctx.rect(sx, sy, cellSize, cellSize);
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = renderCache.vignette;
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
    draw();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/**
 * 4. INTERACTION LOGIC
 */
function paintCircle(cx, cy) {
    const r = (brushSize - 1) / 2;
    const rSq = r * r;
    for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++) {
        for (let y = Math.round(cy - r); y <= Math.round(cy + r); y++) {
            if (brushSize > 1 && (x - cx)**2 + (y - cy)**2 > rSq) continue;
            const key = pack(x, y);
            if (drawMode) liveCells.add(key); else liveCells.delete(key);
        }
    }
}

function interpolateLine(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
        paintCircle(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
}

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isDragging = true;
        dragStartX = e.clientX - offsetX;
        dragStartY = e.clientY - offsetY;
    } else if (e.button === 0) {
        isDrawing = true;
        const gx = Math.floor((e.clientX - offsetX) / scale);
        const gy = Math.floor((e.clientY - offsetY) / scale);
        drawMode = !liveCells.has(pack(gx, gy));
        lastDrawPos = { x: gx, y: gy };
        paintCircle(gx, gy);
    }
});

window.addEventListener('mouseup', () => { isDragging = false; isDrawing = false; lastDrawPos = null; });

canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        offsetX = e.clientX - dragStartX;
        offsetY = e.clientY - dragStartY;
    } else if (isDrawing) {
        const gx = Math.floor((e.clientX - offsetX) / scale);
        const gy = Math.floor((e.clientY - offsetY) / scale);
        if (lastDrawPos) interpolateLine(lastDrawPos.x, lastDrawPos.y, gx, gy);
        else paintCircle(gx, gy);
        lastDrawPos = { x: gx, y: gy };
    }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoom = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(2, Math.min(100, scale * zoom));
    const worldX = (e.clientX - offsetX) / scale, worldY = (e.clientY - offsetY) / scale;
    scale = newScale;
    offsetX = e.clientX - worldX * scale; offsetY = e.clientY - worldY * scale;
}, { passive: false });
