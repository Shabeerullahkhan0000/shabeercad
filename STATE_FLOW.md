# State Flow - ShabeerCAD Viewer

## State Overview

| State Type | Source | Persistence | Key Properties |
|------------|--------|------------|--------------|
| Viewer State | Viewer2d instance | Session | model, camera, layout |
| Measurement State | MeasurementPlugin | Session | measurements[type] |
| Interaction State | DraggableExtension | Session | activeId, dragging, snap |
| Persistent State | localStorage | Permanent | recent_drawings |
| UI State | DOM elements | Session | visibility, classes |

---

## Source of Truth

### Viewer State (In-Memory)

```javascript
// Created via new Viewer2d(config)
const viewer = new Viewer2d({
    containerId: "myCanvas",
    language: "en",
    enableSpinner: false,
    enableProgressBar: false,
    enableLayoutBar: false,
    enableLocalCache: false
});

// Internal state is managed by the SDK
viewer.model      // Current model reference
viewer.camera    // Camera position/zoom
viewer.layout    // Current layout
```

### Measurement Plugin State (In-Memory)

```javascript
// Created once per viewer
const plugin = new MeasurementPlugin(viewer, { language });

// Measurements stored per type
plugin.measurements[MeasurementType.Distance]  // Array of distance measurements
plugin.measurements[MeasurementType.Area]        // Array of area measurements

// Access via getMeasurements()
plugin.getMeasurements()  // Returns all measurements
```

---

## Temporary Interaction State

### Extension State (DraggableExtension)

```javascript
// Internal store
this.measurements = new Map();
// Map<measurementId, { id, points, type, isActive, sdkRef }>

// Interaction state
this.activeMeasurementId = null;       // Currently selected measurement
this.activeHandleIndex = null;          // Currently dragging handle index
this.isDragging = false;              // Drag in progress flag
this.pointerId = null;                 // Active pointer ID

// Snap state
this.snapTarget = null;    // Current snap point { x, y, z, id, index }
this.snapType = 'none'; // 'none' | 'handle' | 'geometry'
this.snapLocked = false; // Snap lock flag
```

### Camera Control State

```javascript
// Camera controls are disabled during drag
const controls = cameraManager.cameraControls;
controls.enabled = false;  // During drag
controls.enabled = true;   // Default / after drag ends
```

---

## Persistent State

### Recent Drawings (localStorage)

```javascript
// Key: 'recent_drawings'
// Value: JSON array of drawing IDs
// Format: ["dwg0", "dwg1", "dxf0"]

// Read
const recent = JSON.parse(localStorage.getItem('recent_drawings') || '[]');  // ["dwg0", "dwg1"]

// Write
function addToRecent(id) {
    let recent = JSON.parse(localStorage.getItem('recent_drawings') || '[]');
    recent = recent.filter(item => item !== id);
    recent.unshift(id);
    recent = recent.slice(0, 8);  // Max 8 items
    localStorage.setItem('recent_drawings', JSON.stringify(recent));
}
```

### Unit Preference (Not Implemented - Future)

```javascript
// Could be added
localStorage.setItem('measurement_unit', 'm');  // m, cm, mm, ft, ft-in
```

---

## Reactive Updates

### Event-Driven Reactivity

```
User Action
    ↓
SDK Event (MeasurementAdd, MeasurementRemove, CameraChange)
    ↓
Event Listener Callback
    ↓
State Mutation (this.measurements.set/delete)
    ↓
requestRedraw()
    ↓
_drawOverlay()
    ↓
Canvas Update
```

### Listeners Attached

```javascript
// Measurement events
this.viewer.addEventListener('MeasurementAdd', this._syncAddCb);
this.viewer.addEventListener('MeasurementRemove', this._syncRemoveCb);

// Camera events
this.viewer.addEventListener('CameraChange', this._camCb);

// Click events
this.viewer.addEventListener('MouseClick', this._clickCb);
```

---

## Mutation Flow

### Measurement Update Flow

```
Handle Drag
    ↓
_worldToScreen() + _screenToWorld()
    ↓
Update this.measurements.get(id).points[index]
    ↓
requestRedraw() → canvas update
    ↓
_commitToSDK()
    ↓
measurementPlugin.updateMeasurement(id, { points })
    ↓
SDK updates internal state
```

### Measurement Create Flow

```
User clicks points in viewer
    ↓
MeasurementPlugin creates measurement
    ↓
MeasurementAdd event fires
    ↓
_syncAddCb() captures event
    ↓
this.sdkMeasurements.set(id, measurement)
    ↓
_syncWithPlugin() syncs to this.measurements
    ↓
requestRedraw() → draws handles
```

### Measurement Delete Flow

```
User clicks close in HUD
    ↓
_deleteActiveMeasurement()
    ↓
measurementPlugin.removeMeasurement(id)
    ↓
MeasurementRemove event fires
    ↓
_syncRemoveCb() captures event
    ↓
this.sdkMeasurements.delete(id)
    ↓
_syncWithPlugin() removes from this.measurements
    ↓
requestRedraw() → clears handles
```

---

## Event Propagation

### Viewer Events

| Event | Data | Listeners |
|--------|------|---------|
| MeasurementAdd | { id, points, type, distance, area } | Extension, UI |
| MeasurementRemove | { id } | Extension |
| CameraChange | { position, target, zoom } | Extension |
| LayoutChange | { layout } | Extension |
| MouseClick | { clientX, clientY } | Extension |

### Extension Events (Internal)

```javascript
// Custom events for UI
this.distMeasure.addEventListener('firstpointpicked', () => { ... });
this.distMeasure.addEventListener('update', () => { ... });
this.distMeasure.addEventListener('complete', () => { ... });
```

---

## State Desynchronization Risks

### Risk 1: SDK vs Extension Mismatch

**Problem**: Extension state may not match SDK state

**Mitigation**: 
- Always sync via events first
- Fallback to plugin API if events missed
- Debounced sync on camera movement

### Risk 2: Double Sync

**Problem**: Measurements synced twice (SDK event + plugin API)

**Mitigation**:
- Use sdkMeasurements map for captured events
- Only fallback to plugin API if map empty
- Clear on model unload

### Risk 3: Null Coordinate

**Problem**: worldToScreen returns null silently

**Mitigation**:
```javascript
const screen = this._worldToScreen(point);
if (!screen || !isFinite(screen.x)) return;
```

### Risk 4: Stale Handles

**Problem**: Handles remain after measurement deleted

**Mitigation**:
- Check if activeMeasurementId still exists in this.measurements
- Clear activeId if measurement removed
- Always call requestRedraw() after state change
