# Known Issues - ShabeerCAD Viewer

## Technical Debt

### 1. Large Inline Scripts
**Location**: index.html (script module section)
**Issue**: 1000+ lines of JavaScript inlined in HTML
**Risk**: Maintenance, debugging, version control
**Mitigation**: Extract to separate JS files when refactoring

### 2. Tight Viewer Coupling
**Location**: draggable-measurement-extension.js + index.html
**Issue**: Extension expects specific viewer state
**Risk**: Breaking if viewer API changes
**Mitigation**: Document API dependencies

### 3. Limited Error Recovery
**Location**: File loading, coordinate conversion
**Issue**: Basic try/catch, limited recovery options
**Risk**: User-facing errors
**Mitigation**: Improve error handling incrementally

---

## Performance Bottlenecks

### 1. Full-Screen Canvas Overlay
**Location**: draggable-measurement-extension.js
**Issue**: Full-viewport canvas may impact FPS on low-end devices
**Risk**: Rendering performance on tablets/phones
**Mitigation**: Consider smaller bounding box

### 2. Rapid Resize Events
**Location**: ResizeObserver in extension
**Issue**: Fast resize can cause flicker
**Risk**: Visual artifacts during window resize
**Mitigation**: Debounce resize handler

### 3. Event Capture Overhead
**Location**: Capture-phase event listeners
**Issue**: Capturing on all pointer events
**Risk**: Delay to other systems
**Mitigation**: Check target before blocking

---

## Fragile Logic

### 1. Coordinate Conversion Null Returns
**Location**: _worldToScreen, _screenToWorld
**Issue**: Can return null silently without throwing
**Risk**: Runtime errors in rendering
**Mitigation**: Always check return values

```javascript
// Current - unsafe
const screen = this.viewer.worldToScreen(point);
this.ctx.arc(screen.x, screen.y, 10);  // May crash

// Safe pattern
const screen = this._worldToScreen(point);
if (!screen || !isFinite(screen.x)) return;
```

### 2. Camera Control Re-enable
**Location**: _onPointerUp in extension
**Issue**: Must re-enable on ALL exit paths
**Risk**: Stuck in pan-disabling mode
**Mitigation**: Enforce in try/finally

```javascript
// Current - should use finally
_onPointerUp(e) {
    this._commitToSDK();
    // If error here, controls stay disabled!
    try { ... } catch { ... }
    // Missing finally block
    controls.enabled = true;
}
```

### 3. Pointer Capture Release
**Location**: _onPointerUp
**Issue**: Touch/cancel edge cases
**Risk**: Pointer stays captured
**Mitigation**: Handle all exit paths

### 4. URL Memory Leaks
**Location**: openViewerWithFile
**Issue**: URL.createObjectURL not explicitly revoked
**Risk**: Memory grows with file loads
**Mitigation**: Revoke URLs after load

---

## Race Conditions

### 1. Double Sync Race
**Location**: _syncWithPlugin
**Issue**: Events + plugin API both fire
**Risk**: Duplicate measurements
**Mitigation**: Priority-based sync order

### 2. Resize During Drag
**Location**: ResizeObserver
**Issue**: Resize while dragging handle
**Risk**: Coordinate mismatch
**Mitigation**: Pause observer during drag

### 3. Measurement Delete During Drag
**Location**: Extension state
**Issue**: Delete measurement while dragging its handle
**Risk**: Stale reference
**Mitigation**: Check valid before update

---

## Rendering Risks

### 1. devicePixelRatio Desync
**Location**: _syncCanvasSize
**Issue**: Canvas size vs CSS size mismatch
**Risk**: Blurry or cropped overlay
**Mitigation**: Always set both dimensions

### 2. Z-Index Conflicts
**Location**: Hardcoded zIndex values
**Issue**: Other systems may use same values
**Risk**: Overlay covered/hidden
**Mitigation**: Document and coordinate

### 3. Canvas Overflow
**Location**: Overlay canvas CSS
**Issue**: May exceed parent bounds
**Risk**: Scrolling/clipping issues
**Mitigation**: Use overflow: hidden

---

## Duplicate Logic

### 1. Measurement Type Detection
**Location**: index.html + extension
**Issue**: Duplicated type detection logic
**Risk**: Inconsistency
**Mitigation**: Use shared constants

```javascript
// Both use this pattern
let type = 1;
if (window.MeasurementType) {
    type = window.MeasurementType.Distance || 1;
}
```

### 2. Coordinate Conversion
**Location**: index.html (showHUD) vs extension
**Issue**: Duplicated distance/area calculation
**Risk**: Inconsistent results
**Mitigation**: Single utility function

---

## Unstable Systems

### 1. Event Blocking System
**Location**: draggable-measurement-extension.js
**Issue**: Uses capture-phase listeners
**Risk**: Blocks legitimate viewer events
**Mitigation**: Check target before blocking

```javascript
// Should check
_blockEvent(e) {
    // Don't block HUD clicks
    if (this.hud && this.hud.contains(e.target)) return false;
    // ...
}
```

### 2. Snap Threshold
**Location**: Snapping logic
**Issue**: Hardcoded pixel values
**Risk**: Poor UX on different DPI
**Mitigation**: Scale by devicePixelRatio

---

## Interaction Conflicts

### 1. Toolbar vs Extension
**Location**: index.html
**Issue**: Both control measurement activation
**Risk**: State mismatch
**Mitigation**: Centralize via viewerAction

### 2. Multiple Pointers
**Location**: Pointer events
**Issue**: Touch + mouse simultaneously
**Risk**: Confused state
**Mitigation**: Track pointerId

---

## State Desynchronization

### 1. Active ID Stale
**Location**: Extension state
**Issue**: activeMeasurementId references deleted measurement
**Risk**: Broken HUD, errors
**Mitigation**: Validate before use

```javascript
// Should validate
if (this.activeMeasurementId && !this.measurements.has(this.activeMeasurementId)) {
    this.activeMeasurementId = null;
}
```

### 2. Plugin vs SDK Mismatch
**Location**: MeasurementPlugin
**Issue**: Plugin internal state vs SDK state
**Risk**: Out-of-sync overlays
**Mitigation**: Always use events to sync

---

## Memory Leaks

### 1. Event Listener Accumulation
**Location**: All listeners
**Issue**: Not cleaned up on viewer destroy
**Risk**: Memory grows over time
**Mitigation**: Named callbacks + removal

```javascript
// Current - may accumulate
this.viewer.addEventListener('Event', () => {});  // Anonymous!

// Safe pattern
this._cb = () => {};
this.viewer.addEventListener('Event', this._cb);
// On cleanup:
this.viewer.removeEventListener('Event', this._cb);
```

### 2. ObjectURL Not Revoked
**Location**: openViewerWithFile
**Issue**: Created but not released
**Risk**: Memory leak
**Mitigation**: Revoke after load

---

## Browser Compatibility

### 1. ResizeObserver Support
**Location**: Extension setup
**Issue**: Older browsers lack support
**Risk**: No resize handling
**Mitigation**: Fallback to window resize

### 2. Pointer Events
**Location**: Event handling
**Issue**: Older browsers
**Risk**: No interaction
**Mitigation**: Mouse + touch fallbacks

---

## Action Items

### High Priority

1. [ ] Fix camera control re-enable in finally block
2. [ ] Add target check in event blocker
3. [ ] Revoke Object URLs after load
4. [ ] Validate activeMeasurementId before use

### Medium Priority

1. [ ] Extract inline scripts to separate files
2. [ ] Add error recovery for file loading
3. [ ] Debounce resize observer
4. [ ] Scale snap threshold by DPR

### Low Priority

1. [ ] Add unit preference to localStorage
2. [ ] Refactor duplicate distance logic
3. [ ] Add browser compatibility fallbacks
4. [ ] Document API dependencies
