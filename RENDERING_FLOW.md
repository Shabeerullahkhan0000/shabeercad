# Rendering Flow - ShabeerCAD Viewer

## Rendering Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RENDERING PIPELINE                              │
├─────────────────────────────────────────────────────────────────────┤
│  1. File Parse    2. Geometry   3. WebGL    4. Canvas   │
│     ─────────      ────────    ──────    ────────   │
│     DXF/DWG      → Triangles  → Render  → Display   │
│     Parser                 → Buffer   → Canvas   │
├─────────────────────────────────────────────────────────────────────┤
│  Overlay Layer (Custom Extension)                                    │
│  ┌─────────────────────────────────────────────────────┐        │
│  │ Canvas Overlay → 2D Context → requestAnimationFrame   │
│  │ - Handles      → Draw circles with shadow             │
│  │ - Lines       → Set dash + stroke                │
│  │ - Snapping    → Draw indicator geometry          │
│  └─────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Render Triggers

### Primary Triggers (Viewer2d)

| Trigger | Source | Affected |
|---------|--------|---------|
| Model Load | viewer.loadModel() | Full canvas |
| Camera Move | Pan/Zoom/Orbit | Full canvas |
| Layout Switch | Layout bar | Full canvas |
| Layer Toggle | LayerManager | Partial |
| Zoom to Extents | zoomToBBox() | Full canvas |

### Secondary Triggers (Extension)

| Trigger | Source | Affected |
|---------|--------|---------|
| Measurement Add | MeasurementAdd event | Overlay |
| Measurement Remove | MeasurementRemove event | Overlay |
| Handle Drag | pointermove during drag | Overlay |
| Camera Move | CameraChange event | Overlay |
| Window Resize | ResizeObserver | Overlay size |

---

## Overlay Render Cycle

### Request Redraw Pattern

```javascript
// Use requestAnimationFrame to batch renders
requestRedraw() {
    if (this._redrawRequested) return;
    this._redrawRequested = true;
    requestAnimationFrame(() => {
        this._drawOverlay();
        this._redrawRequested = false;
    });
}
```

### Draw Sequence

```
1. clearRect(0, 0, width, height)
       ↓
2. Iterate measurements
       ↓
3. For each measurement:
   a. Draw ghost line if dragging
   b. Draw handles if active
       ↓
4. Draw snap indicator
       ↓
5. Request next frame if still dragging
```

---

## Canvas Invalidation Logic

### Size Sync

```javascript
_syncCanvasSize() {
    const viewerTarget = document.getElementById('myCanvas');
    const rect = viewerTarget.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Position
    this.canvas.style.top = rect.top + 'px';
    this.canvas.style.left = rect.left + 'px';
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    
    // Resolution
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    
    // Reset transform
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
}
```

### ResizeObserver Integration

```javascript
_setupResizeObserver() {
    const target = document.getElementById('myCanvas');
    this._resizeObserver = new ResizeObserver(() => {
        this._syncCanvasSize();
        this.requestRedraw();
    });
    this._resizeObserver.observe(target);
    
    // Also listen to window resize
    window.addEventListener('resize', () => {
        this._syncCanvasSize();
        this.requestRedraw();
    });
}
```

---

## Coordinate Transforms

### World to Screen

```javascript
_worldToScreen(worldPoint) {
    if (!this.viewer.worldToScreen) return null;
    try {
        const screen = this.viewer.worldToScreen(worldPoint);
        if (screen && isFinite(screen.x) && isFinite(screen.y)) {
            return { x: screen.x, y: screen.y };
        }
    } catch (e) {
        console.warn('worldToScreen failed:', e);
    }
    return null;
}
```

### Screen to World

```javascript
_screenToWorld(clientX, clientY) {
    const viewerTarget = document.getElementById('myCanvas');
    const rect = viewerTarget.getBoundingClientRect();
    
    const coords = {
        clientX: clientX,
        clientY: clientY,
        x: clientX - rect.left,
        y: clientY - rect.top
    };
    
    try {
        if (this.viewer.getHitResult) {
            const world = this.viewer.getHitResult(coords);
            if (world && isFinite(world.x)) {
                return world;
            }
        }
    } catch (e) {
        console.warn('screenToWorld failed:', e);
    }
    return null;
}
```

---

## Scene Synchronization

### Event-Based Sync

```
MeasurementAdd Event
    → listener callback
    → syncWithPlugin()
    → requestRedraw()

MeasurementRemove Event
    → listener callback
    → syncWithPlugin()
    → requestRedraw()

CameraChange Event
    → listener callback
    → requestRedraw()
```

### Manual Sync

```javascript
_syncWithPlugin() {
    let raw = [];
    
    // Get from captured events first
    if (this.sdkMeasurements && this.sdkMeasurements.size > 0) {
        raw = Array.from(this.sdkMeasurements.values());
    }
    
    // Fallback to plugin API
    if (raw.length === 0) {
        if (typeof this.measurementPlugin.getMeasurements === 'function') {
            raw = this.measurementPlugin.getMeasurements();
        }
    }
    
    // Transform to internal format
    const newMap = new Map();
    raw.forEach(m => {
        if (!m || !m.points) return;
        const id = m.id || m.guid || Math.random().toString(36);
        newMap.set(id, {
            id: id,
            points: m.points.map(p => ({ x: p.x, y: p.y, z: p.z || 0 })),
            type: m.type || 'distance',
            sdkRef: m
        });
    });
    
    this.measurements = newMap;
}
```

---

## DOM Synchronization

### HUD Position

```javascript
// HUD always centered at bottom
Object.assign(this.hud.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '1001'
});
```

### Loading Overlay Position

```javascript
// Full-screen overlay
Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '40'
});
```

---

## Z-Index Layering

| Layer | z-Index | Content |
|-------|----------|--------|
| Base | 0 | myCanvas (Viewer2d) |
| Image Display | 10 | image-display-container |
| Toolbar | 150 | viewer-toolbar |
| Header | 50 | viewer-header |
| HUD Layer | 100 | hud-layer |
| Overlay | 1000 | drag-overlay (canvas) |
| HUD | 1001 | drag-hud (div) |

---

## Performance Considerations

### Batch Rendering

- Use requestAnimationFrame instead of setInterval
- Skip duplicate frame requests with flag
- Clear canvas before each frame

### Resolution

- Scale by devicePixelRatio for crisp rendering
- Sync on resize events

### Visibility

- Set pointerEvents: 'none' when inactive
- Skip rendering when overlay is hidden
- Pause resizeObserver when viewer hidden
