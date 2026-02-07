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

function draw() {
    // Reset transform and clear background
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Render Atmospheric Background Glow (Static center light)
    const bgGlow = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width);
    bgGlow.addColorStop(0, '#1a1a1a');
    bgGlow.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, width, height);

    // Calculate Viewport Clipping (Culling)
    // We only process and draw cells within these grid boundaries
    const left = Math.floor(-offsetX / scale);
    const right = Math.ceil((width - offsetX) / scale);
    const top = Math.floor(-offsetY / scale);
    const bottom = Math.ceil((height - offsetY) / scale);

    // Render Grid Lines (Visible portion only)
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#222';
    ctx.beginPath();
    for (let x = left; x <= right; x++) {
        const sx = x * scale + offsetX;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, height);
    }
    for (let y = top; y <= bottom; y++) {
        const sy = y * scale + offsetY;
        ctx.moveTo(0, sy); ctx.lineTo(width, sy);
    }
    ctx.stroke();

    // Render Live Cells
    ctx.fillStyle = '#FFFFFF';
    
    // Apply subtle glow to cells only when zoomed in (Performance optimization)
    if (scale > 10) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(255,255,255,0.3)';
    }

    for (const key of liveCells) {
        const gx = unpackX(key);
        const gy = unpackY(key);

        // Cull cells outside the visible screen area
        if (gx < left || gx > right || gy < top || gy > bottom) continue;

        const sx = gx * scale + offsetX;
        const sy = gy * scale + offsetY;

        if (scale > 5) {
            // Draw high-quality rounded rectangles when zoomed in
            ctx.beginPath();
            ctx.roundRect(sx + 1, sy + 1, scale - 2, scale - 2, 2);
            ctx.fill();
        } else {
            // Fast rectangle rendering for low zoom levels
            ctx.fillRect(sx, sy, scale, scale);
        }
    }
    ctx.shadowBlur = 0; // Clean up shadow state

    // Apply Foreground Spotlight/Vignette Effect
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = spotlightGradient;
    ctx.fillRect(0, 0, width, height);
}

// --- Main Animation Loop ---

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
