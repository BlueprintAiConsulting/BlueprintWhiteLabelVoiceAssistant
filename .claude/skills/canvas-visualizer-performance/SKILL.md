---
name: canvas-visualizer-performance
description: Optimization guidelines, asset preloading patterns, Retina display scaling, and memory leak prevention for 2D Canvas and WebGL visualizers.
version: 1.0.0
user-invocable: true
allowed-tools:
  - Bash(*)
---
# Canvas & WebGL Visualizer Performance Guide

This skill provides essential guidelines, boilerplate code, and optimization practices for building high-performance 2D Canvas and WebGL visualizers (e.g., siding, roofing, and painting editors).

---

## 1. High-DPI / Retina Display Scaling

By default, canvas elements look blurry on Retina/High-DPI screens because they render at CSS pixel resolution rather than physical device resolution. You **must** scale the canvas backing store.

### Scaling Pattern (2D Canvas)
```javascript
function resizeCanvasToDisplaySize(canvas, ctx) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  // Only resize and scale if the size has actually changed
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    // Set the backing store resolution (physical pixels)
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    // Set the display size (CSS pixels)
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Scale context to match the DPR
    ctx.scale(dpr, dpr);
    return true; // Canvas resized
  }
  return false;
}
```

---

## 2. Asset Preloading, Caching & Background Loading

Visualizers require switching between multiple high-resolution images (textures, masks, transparent layers). Initiating a network request on every click causes heavy UI lag.

### 2.1 Preloading & Cache Manager
Use a centralized cache manager to preload core images and store resolved `HTMLImageElement` references.

```javascript
class VisualizerImageCache {
  constructor() {
    this.cache = new Map();
  }

  // Preload an array of image URLs
  preload(urls) {
    const promises = urls.map(url => this.loadImage(url));
    return Promise.all(promises);
  }

  // Load a single image and cache it
  loadImage(url) {
    if (this.cache.has(url)) {
      return Promise.resolve(this.cache.get(url));
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // Important if using WebGL or canvas manipulation
      img.onload = () => {
        this.cache.set(url, img);
        resolve(img);
      };
      img.onerror = (err) => {
        console.error(`Failed to load visualizer asset: ${url}`, err);
        reject(err);
      };
      img.src = url;
    });
  }

  get(url) {
    return this.cache.get(url);
  }

  clear() {
    this.cache.forEach(img => {
      img.src = ''; // Force GC release of image memory
    });
    this.cache.clear();
  }
}
```

### 2.2 Background Loading Strategy
Prioritize loading the **current active layer combination** first. Once loaded and rendered, preload the alternative color/siding options asynchronously in the background.

```javascript
// Example workflow
const activeAssets = [
  'house-base.png',
  'siding-mask-red.png',
  'roof-shingles-charcoal.png'
];

// Load core assets immediately
cache.preload(activeAssets).then(() => {
  renderVisualizer();
  
  // Asynchronously load the remaining choices in the background
  const alternatives = [
    'siding-mask-green.png',
    'siding-mask-blue.png',
    'roof-shingles-brown.png'
  ];
  alternatives.forEach(url => cache.loadImage(url));
});
```

---

## 3. State Management & Layering Rules

### 3.1 Layer Ordering (Back-to-Front Rendering)
Keep your rendering declarative. Avoid drawing ad-hoc images. Always render the entire screen from a single state tree:

```javascript
function drawVisualizerState(ctx, width, height, state, cache) {
  // Clear the canvas area
  ctx.clearRect(0, 0, width, height);

  // 1. Draw background/base structure
  const baseImg = cache.get(state.baseImage);
  if (baseImg) ctx.drawImage(baseImg, 0, 0, width, height);

  // 2. Draw siding layer with color/texture
  if (state.sidingEnabled) {
    const sidingMask = cache.get(state.sidingMaskUrl);
    if (sidingMask) {
      ctx.save();
      // Apply color overlay or blend mode
      ctx.drawImage(sidingMask, 0, 0, width, height);
      ctx.fillStyle = state.sidingColor;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  // 3. Draw foreground elements (trims, overlays, widgets)
  const trimImg = cache.get(state.trimImageUrl);
  if (trimImg) ctx.drawImage(trimImg, 0, 0, width, height);
  
  // 4. Draw highlights/active edit outlines
  if (state.hoveredZone) {
    drawSelectionOutline(ctx, state.hoveredZone);
  }
}
```

### 3.2 Coordinate Conversion (Screen to Canvas Space)
When detecting clicks or drags on a canvas, translate CSS mouse positions to actual canvas coordinate space:

```javascript
function getCanvasMouseCoords(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  
  // Calculate relative position within element [0, 1]
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  // Convert to internal canvas scale
  return {
    canvasX: x * canvas.width / (window.devicePixelRatio || 1),
    canvasY: y * canvas.height / (window.devicePixelRatio || 1)
  };
}
```

---

## 4. Memory Leak Prevention

Visualizers run in single-page apps (like React/Vite) where components mount and unmount. A major memory leak can crash the browser tab.

### 4.1 Event Listeners
Always remove window resize or drag listeners when the component unmounts:

```javascript
// React Example Hook
useEffect(() => {
  const handleResize = () => resizeCanvasToDisplaySize(canvasRef.current, ctxRef.current);
  window.addEventListener('resize', handleResize);
  
  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);
```

### 4.2 Releasing Image Buffers
To prevent GPU memory leaks, nullify image elements when clean-ups occur:

```javascript
function cleanUpVisualizer(cache) {
  // Clear the image cache
  cache.clear();
  
  // If WebGL is used, dispose of shaders, programs, buffers, and textures
  if (gl) {
    const numTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    for (let unit = 0; unit < numTextureUnits; ++unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // Explicitly delete programs/shaders
    gl.deleteProgram(program);
  }
}
```
