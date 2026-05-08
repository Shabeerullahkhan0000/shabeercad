# Architecture Documentation - ShabeerCAD Viewer

## Core Architecture

### Viewer Engine Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    index.html (Dashboard)                     │
│  ┌───────────────────────────────────────────────────────┐   │
│  │                    Viewer2d Engine                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │   │
│  │  │  Renderer   │  │   Camera   │  │   Events    │  │   │
│  │  │  (WebGL)   │  │  Manager   │  │   System    │  │   │
│  │  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │   │
│  │  │   Layers   │  │  Layouts   │  │   Plugins   │  │   │
│  │  │  Manager   │  │  Manager   │  │   Registry  │  │   │
│  │  └─────────────┘  └─────────────┘  └────────────┘  │   │
│  └───────────────────────────────────────────────────────┘   │
│                              │                              │
│  ┌──────────────────────────┼──────────────────────────┐   │
│  │           Plugins (Modular Architecture)           │   │
│  │  ┌───────────┐ ┌──────────┐ ┌───────────┐ ┌──────┐  │   │
│  │  │LocalDxf   │ │Measure-  │ │ Toolbar   │ │Layer │  │   │
│  │  │Uploader   │ │ ment     │ │ Plugin    │ │Mgr   │  │   │
│  │  └───────────┘ └──────────┘ └───────────┘ └──────┘  │   │
│  └───────────────────────────────────────────────────────┘   │
│                              │                              │
│  ┌──────────────────────────┼──────────────────────────┐   │
│  │        Custom Extensions (User Code)                 │   │
│  │  ┌─────────────────────────────────────────────┐  │   │
│  │  │     DraggableMeasurementExtension            │  │   │
│  │  │  ┌──────────┐ ┌────────┐ ┌──────────────┐  │  │   │
│  │  │  │Canvas   │ │Event   │ │  Snapping    │  │  │   │
│  │  │  │Overlay  │ │Blocker │ │   System    │  │  │   │
│  │  │  └──────────┘ └────────┘ └──────────────┘  │  │   │
│  │  └─────────────────────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Comparison Architecture

```
┌─────────────────────────────────────────────────────────────┐
│            dxf_compare_2_viewports.html                     │
│  ┌─────────────────────┐  ┌─────────────────────┐           │
│  │    myCanvas1       │  │    myCanvas2       │           │
│  │    (Viewer2d)      │  │    (Viewer2d)      │           │
│  └─────────────────────┘  └─────────────────────┘           │
│           │                         │                        │
│           └───────────┬─────────────┘                        │
│                       │                                     │
│  ┌───────────────────▼───────────────────────────┐          │
│  │            DxfCompareHelper                 │          │
│  │  - compare(src1, src2)                   │          │
│  │  - enableSyncCamera(flag)                │          │
│  │  - getChanges() → Added/Removed/Mod     │          │
│  └─────────────────────────────────────────┘          │
│                       │                                 │
│  ┌───────────────────▼───────────────────────────┐      │
│  │            DxfComparePanel                    │      │
│  │  - buildList(changes, type)                   │      │
│  │  - zoomToChange(id)                           │      │
│  └─────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer Responsibilities

### HTML Entry Points

| File | Responsibility | Ownership |
|------|---------------|-----------|
| index.html | Main dashboard, file upload, viewer container | Primary UI |
| dxf_*.html | Standalone DXF viewing | Feature test |
| dwg_*.html | Standalone DWG viewing | Feature test |
| dxf_compare_*.html | Dual viewport comparison | Feature test |
| pdf_*.html | PDF viewing | Feature test |

### Compare Module

| File | Responsibility |
|------|---------------|
| compare/dxfComparePanel.js | Change list UI, click-to-zoom |
| compare/dxfComparePanel.css | Panel styling |

### Custom Extensions

| File | Responsibility |
|------|---------------|
| draggable-measurement-extension.js | Draggable handles, snapping, HUD |

---

## Event Propagation Flow

```
User Input (Pointer/Touch)
        │
        ▼
┌───────────────────┐
│ Capture Phase     │ ← DraggableExtension blocks here
│ (true, passive:false)
└��──────────────────┘
        │
        ▼ (if not blocked)
┌───────────────────┐
│ Viewer2d Engine   │
│ - hit detection   │
│ - camera controls │
│ - tool handling   │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ MeasurementPlugin│ ← Distance, Area tools
│ - activate()      │
│ - getMeasurements()│
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Custom Extension │
│ - overlay draw    │
│ - HUD update     │
│ - commit to SDK  │
└───────────────────┘
```

---

## Plugin Registration Pattern

```javascript
// Correct pattern
const plugin = new MeasurementPlugin(viewer, { language });
viewer.addEventListener(ViewerEvent.MeasurementAdd, callback);
viewer.addEventListener(ViewerEvent.MeasurementRemove, callback);

// Cleanup pattern
function destroy() {
    viewer.removeEventListener(ViewerEvent.MeasurementAdd, callback);
    viewer.removeEventListener(ViewerEvent.MeasurementRemove, callback);
    if (plugin && typeof plugin.destroy === 'function') {
        plugin.destroy();
    }
}
```

---

## Overlay Integration Pattern

```javascript
// Correct canvas overlay pattern
class CustomOverlay {
    constructor(viewer) {
        this.viewer = viewer;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this._setupOverlay();
        this._setupResizeObserver();
    }

    _setupOverlay() {
        const container = document.getElementById('myCanvas');
        Object.assign(this.canvas.style, {
            position: 'absolute',
            top: '0', left: '0',
            width: '100%', height: '100%',
            zIndex: '1000',
            pointerEvents: 'none'  // Critical: none when inactive
        });
        container.appendChild(this.canvas);
    }

    _setupResizeObserver() {
        const target = document.getElementById('myCanvas');
        this._resizeObserver = new ResizeObserver(() => {
            this._syncCanvasSize();
            this.requestRedraw();
        });
        this._resizeObserver.observe(target);
    }

    _syncCanvasSize() {
        const rect = target.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
    }

    requestRedraw() {
        if (this._redrawRequested) return;
        this._redrawRequested = true;
        requestAnimationFrame(() => {
            this._drawOverlay();
            this._redrawRequested = false;
        });
    }

    destroy() {
        this._resizeObserver.disconnect();
        this.canvas.remove();
    }
}
```

---

## Tightly Coupled Systems

### Viewer ↔ Extension Coupling

| Coupling Point | Risk Level | Mitigation |
|----------------|------------|------------|
| Camera controls enabled/disabled | HIGH | Re-enable on ALL exit paths |
| Event capture phase | HIGH | Release on pointerup/touchend |
| Coordinate conversion | MEDIUM | Check for null returns |
| Measurement sync | MEDIUM | Debounce or use events |

### Shared State

| State | Source | Dependencies |
|-------|--------|--------------|
| activeMeasurementId | DraggableExtension | measurementPlugin.getMeasurements() |
| snapTarget | DraggableExtension | Viewer2d.getHitResult() |
| camera position | Viewer2d | CameraChange event |

---

## Fragile Systems

### 1. Event Blocking System

**Risk**: Can block legitimate viewer events if not careful

```javascript
// Current implementation uses capture phase
window.addEventListener(type, handler, { capture: true, passive: false });

// Problems:
// - Must check e.target.closest() to avoid blocking HUD
// - Must re-enable camera controls
// - Must release pointer capture
```

### 2. Coordinate Conversion

**Risk**: Can return null or invalid values silently

```javascript
// Unsafe pattern
const screen = this.viewer.worldToScreen(point);
this.ctx.arc(screen.x, screen.y, 10); // May crash if screen is null

// Safe pattern
const screen = this._worldToScreen(point);
if (!screen || !isFinite(screen.x)) return;
this.ctx.arc(screen.x, screen.y, 10);
```

### 3. Camera Control Toggle

**Risk**: Must re-enable on every exit path

```javascript
// Current: Called in _onPointerDown
const controls = cameraManager.cameraControls;
controls.enabled = false;

// Must re-enable in:
// - _onPointerUp
// - Any error handler
// - Window blur/close events
```

---

## Reusable Systems

### 1. Canvas Overlay Base

Pattern for creating additional overlays:
- Create canvas element
- Sync size with ResizeObserver
- Render via requestAnimationFrame
- Toggle pointerEvents

### 2. Event Listener Cleanup

Pattern for preventing memory leaks:
```javascript
// Store references
this._callbacks = new Map();

// During setup
this._cb = () => {};
this.viewer.addEventListener('Event', this._cb);
this._callbacks.set('Event', this._cb);

// During cleanup
this._callbacks.forEach((cb, event) => {
    this.viewer.removeEventListener(event, cb);
});
```

### 3. HUD Template

Pattern for consistent HUD styling:
```javascript
`<div style="
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    padding: 16px 24px;
    color: white;
    font-family: system-ui, sans-serif;
    z-index: 1001;
">${content}</div>`
