const canvas = document.getElementById('gridCanvas');
// 'desynchronized' reduces latency in some browsers
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

// --- Configuration & State ---
let width, height;
let isPlaying = false;
let simulationSpeed = 1;
let lastTickTime = 0;

// Viewport: Control zoom level and scroll position
let scale = 20;
let offsetX = 0, offsetY = 0;

// Input & Brush: Track mouse interactions
let isDragging = false, dragStartX = 0, dragStartY = 0;
let isDrawing = false, drawMode = true, brushSize = 1, lastDrawPos = null;

/** 
 * Sparse Matrix using a Set of 32-bit Integers.
 * Packing X and Y into one number prevents massive Garbage Collection overhead 
 * caused by string keys like "10,20".
 * Range: -32,768 to 32,767 for both X and Y.
 */
let liveCells = new Set();
let spotlightGradient = null;

/**
 * Packs two 16-bit signed integers into one 32-bit unsigned integer.
 */
const pack = (x, y) => ((x + 0x8000) << 16) | ((y + 0x8000) & 0xFFFF);
const unpackX = (key) => (key >>> 16) - 0x8000;
const unpackY = (key) => (key & 0xFFFF) - 0x8000;

// --- Setup & Resize ---

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    
    // Initial centering
    if (offsetX === 0) {
        offsetX = width / 2;
        offsetY = height / 2;
    }

    // Cache the Spotlight Gradient to avoid expensive re-calculations in the draw loop
    const radius = Math.max(width, height) * 0.7;
    spotlightGradient = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, radius);
    spotlightGradient.addColorStop(0, 'rgba(0,0,0,0)');     // Transparent center
    spotlightGradient.addColorStop(0.3, 'rgba(0,0,0,0)');   // Wide clear area
    spotlightGradient.addColorStop(0.8, 'rgba(10,10,10,0.7)'); // Gradual darkening
    spotlightGradient.addColorStop(1, '#000000');           // Pitch black at edges
    
    draw();
}

window.addEventListener('resize', resize);
resize();

// --- Simulation Logic ---

function tick() {
    const neighborCounts = new Map();
    
    // 1. Iterate through live cells and increment neighbor counts for adjacent cells
    for (const key of liveCells) {
        const x = unpackX(key);
        const y = unpackY(key);
        
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                if (i === 0 && j === 0) continue;
                const nKey = pack(x + i, y + j);
                neighborCounts.set(nKey, (neighborCounts.get(nKey) || 0) + 1);
            }
        }
    }

    // 2. Apply Conway's Game of Life rules
    const nextGen = new Set();
    for (const [key, count] of neighborCounts) {
        const isAlive = liveCells.has(key);
        if (count === 3 || (isAlive && count === 2)) {
            nextGen.add(key);
        }
    }
    liveCells = nextGen;
    draw();
}

// --- High Performance Rendering ---

/**
 * Persistent cache to avoid recreating expensive objects (gradients) 
 * every frame unless the canvas size changes.
 */
const renderCache = {
    width: 0,
    height: 0,
    spotlight: null,
    vignette: null
};

function draw() {
    // ---------------------------------------------------------
    // 1. CACHE UPDATE: Only recalculate gradients if dimensions change
    // ---------------------------------------------------------
    if (renderCache.width !== width || renderCache.height !== height) {
        renderCache.width = width;
        renderCache.height = height;

        const centerX = width / 2;
        const centerY = height / 2;
        const maxDim = Math.max(width, height);

        // Pre-calculate Spotlight Gradient
        const spot = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxDim * 0.5);
        spot.addColorStop(0, '#1a1a1a'); // Inner light
        spot.addColorStop(1, '#0a0a0a'); // Outer dark
        renderCache.spotlight = spot;

        // Pre-calculate Vignette Gradient
        const vig = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxDim * 0.7);
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');      // Transparent center
        vig.addColorStop(0.3, 'rgba(0, 0, 0, 0)');    // Keep center clear
        vig.addColorStop(0.8, 'rgba(10, 10, 10, 0.7)'); // Fade to dark
        vig.addColorStop(1, '#000000');               // Solid black edges
        renderCache.vignette = vig;
    }

    // ---------------------------------------------------------
    // 2. BACKGROUND & SPOTLIGHT
    // ---------------------------------------------------------
    ctx.fillStyle = renderCache.spotlight;
    ctx.fillRect(0, 0, width, height);

    // ---------------------------------------------------------
    // 3. GRID LINES
    // ---------------------------------------------------------
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#252525';
    
    // Calculate visible range (clamping viewport)
    // Using bitwise '| 0' as a faster alternative to Math.floor
    const startCol = ((-offsetX) / scale) | 0;
    const endCol = (startCol + (width / scale) + 1) | 0;
    const startRow = ((-offsetY) / scale) | 0;
    const endRow = (startRow + (height / scale) + 1) | 0;

    ctx.beginPath();
    // Vertical lines
    for (let x = startCol; x <= endCol; x++) {
        const sx = ((x * scale + offsetX) | 0) + 0.5; // +0.5 prevents sub-pixel blurring
        ctx.moveTo(sx, 0); 
        ctx.lineTo(sx, height);
    }
    // Horizontal lines
    for (let y = startRow; y <= endRow; y++) {
        const sy = ((y * scale + offsetY) | 0) + 0.5;
        ctx.moveTo(0, sy); 
        ctx.lineTo(width, sy);
    }
    ctx.stroke();

    // ---------------------------------------------------------
    // 4. CELLS (BATCH RENDERING)
    // ---------------------------------------------------------
    ctx.fillStyle = '#FFFFFF';
    
    // Performance: Only apply shadow if scale is large enough to see it
    const applyShadow = scale > 10;
    if (applyShadow) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';
    }

    // Performance: Begin ONE path for all cells to minimize Draw Calls
    ctx.beginPath();
    
    const cellSize = scale - 1;
    const useRoundRect = scale > 4;

    for (const key of liveCells) {
        // High-speed parsing: indexOf/substring is faster than .split().map() 
        // because it avoids creating unnecessary temporary arrays.
        const commaIndex = key.indexOf(',');
        const gx = +key.substring(0, commaIndex); // '+' operator converts string to number
        const gy = +key.substring(commaIndex + 1);

        // Culling: Skip cells outside the current view
        if (gx < startCol || gx > endCol || gy < startRow || gy > endRow) continue;

        const screenX = (gx * scale + offsetX) | 0;
        const screenY = (gy * scale + offsetY) | 0;

        if (useRoundRect) {
            // Add rounded rect to the current path
            ctx.roundRect(screenX + 1, screenY + 1, cellSize - 1, cellSize - 1, 2);
        } else {
            // Add standard rect to the current path
            ctx.rect(screenX, screenY, cellSize, cellSize);
        }
    }
    
    // Execute drawing all cells at once
    ctx.fill();

    // Reset shadow state for subsequent operations
    if (applyShadow) {
        ctx.shadowBlur = 0;
    }

    // ---------------------------------------------------------
    // 5. VIGNETTE OVERLAY
    // ---------------------------------------------------------
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
    } else {
        // Continue drawing while paused to allow smooth Panning/Zooming
        draw();
    }
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// --- User Interaction & Brush Logic ---

function paintCircle(cx, cy) {
    const r = brushSize / 2;
    const rSq = r * r;
    const startX = Math.floor(cx - r), endX = Math.ceil(cx + r);
    const startY = Math.floor(cy - r), endY = Math.ceil(cy + r);

    for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
            // Brush shape check
            if (brushSize > 1 && (x - cx)**2 + (y - cy)**2 > rSq) continue;
            
            const key = pack(x, y);
            if (drawMode) liveCells.add(key);
            else liveCells.delete(key);
        }
    }
}

/**
 * Linear Interpolation (Bresenham-like) to prevent gaps 
 * when the user moves the mouse faster than the frame rate.
 */
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
    if (e.button === 1) { // Middle Mouse: Start Panning
        isDragging = true;
        dragStartX = e.clientX - offsetX;
        dragStartY = e.clientY - offsetY;
    } else if (e.button === 0) { // Left Mouse: Start Drawing
        isDrawing = true;
        const gx = Math.floor((e.clientX - offsetX) / scale);
        const gy = Math.floor((e.clientY - offsetY) / scale);
        
        // Pick mode: Erase if cell exists, Draw if it doesn't
        drawMode = !liveCells.has(pack(gx, gy));
        lastDrawPos = { x: gx, y: gy };
        paintCircle(gx, gy);
    }
});

window.addEventListener('mouseup', () => { 
    isDragging = false; 
    isDrawing = false; 
    lastDrawPos = null; 
});

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
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(2, Math.min(100, scale * zoomFactor));

    // Calculate mouse position relative to grid (World Space) 
    // to ensure we zoom centered on the cursor
    const worldX = (e.clientX - offsetX) / scale;
    const worldY = (e.clientY - offsetY) / scale;

    scale = newScale;
    offsetX = e.clientX - worldX * scale;
    offsetY = e.clientY - worldY * scale;
}, { passive: false });
