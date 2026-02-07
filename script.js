/**
 * GAME OF LIFE ENGINE V3
 * - Hybrid Input System (Mouse + Touch)
 * - Optimized Vignette for PC/Mobile
 * - Laptop Touchpad Smoothing
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

// Drawing / Interaction State
let isDragging = false; // Mouse Pan
let isDrawing = false;  // Mouse Draw
let drawMode = true;    // Add or Remove
let brushSize = 1; 
let lastDrawPos = null; // Interpolation

// Drag Math
let dragStartX = 0, dragStartY = 0;

// --- Initialization ---

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    
    // Initial Center
    if (offsetX === 0 && offsetY === 0) {
        offsetX = width / 2;
        offsetY = height / 2;
    }
    draw();
}
window.addEventListener('resize', resize);
resize();


// --- Logic (Tick) ---

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

    // 4. Vignette (Fix for PC & Mobile)
    // Uses hypotenuse (diagonal) to ensure corners aren't clipped, 
    // but keeps the "spotlight" focused.
    const diag = Math.sqrt(width*width + height*height);
    const radius = diag * 0.45; // Covers enough of PC screens now

    const gradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,           
        width / 2, height / 2, radius       
    );
    
    gradient.addColorStop(0, 'rgba(18, 18, 18, 0)');
    gradient.addColorStop(0.5, 'rgba(18, 18, 18, 0)'); // Inner clear area
    gradient.addColorStop(1, '#121212'); // Solid black edges

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}


// --- Animation Loop ---

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


// --- Brush & Interpolation Utilities ---

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

// --- MOUSE CONTROLS (PC) ---
// Note: Unchanged logic as requested, just robustified

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    // Detect Touchpad vs Mouse Wheel
    // Touchpads usually have small deltaY, standard mouse wheels have ~100
    // Using e.ctrlKey detects "pinch zoom" on trackpads in many browsers
    let delta = e.deltaY > 0 ? -0.1 : 0.1;

    // Smoother zoom for touchpads
    if (Math.abs(e.deltaY) < 50 && !e.ctrlKey) {
        delta = e.deltaY * -0.01; 
    }

    const newScale = Math.max(2, Math.min(200, scale * (1 + delta)));
    const gridX = (e.clientX - offsetX) / scale;
    const gridY = (e.clientY - offsetY) / scale;

    scale = newScale;
    offsetX = e.clientX - gridX * scale;
    offsetY = e.clientY - gridY * scale;
    draw();
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle Click
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


// --- TOUCH CONTROLS (MOBILE) ---
// 1 Finger: Draw
// 2 Fingers: Pan & Zoom

let lastTouchDist = 0;
let lastTouchCenter = null;
let touchMode = null; // 'draw' or 'nav'

function getTouchDistance(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

function getTouchCenter(t1, t2) {
    return {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2
    };
}

canvas.addEventListen
