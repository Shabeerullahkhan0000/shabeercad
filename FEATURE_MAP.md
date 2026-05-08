# Feature Map - ShabeerCAD Viewer

## Existing Features Inventory

### Core Features

| Feature | File | Status | Description |
|---------|------|--------|------------|
| File Upload | index.html | ✅ Complete | Drag & drop + click to upload DWG/DXF/PDF/images |
| Viewer Container | index.html | ✅ Complete | Full-screen viewer with myCanvas |
| Loading Overlay | index.html | ✅ Complete | Animated dimension line progress |
| Sample Drawings | index.html | ✅ Complete | Pre-loaded sample thumbnails |
| Recent Drawings | index.html | ✅ Complete | localStorage-based recent list |

### Measurement Features

| Feature | File | Status | Description |
|---------|------|--------|------------|
| Distance Measurement | index.html | ✅ Complete | Point-to-point distance |
| Area Measurement | index.html | ✅ Complete | Polygon area calculation |
| Draggable Handles | draggable-measurement-extension.js | ✅ Complete | Drag measurement endpoints |
| Endpoint Snapping | draggable-measurement-extension.js | ✅ Complete | Snap to measurement endpoints |
| Geometry Snapping | draggable-measurement-extension.js | ✅ Complete | Snap to CAD geometry |
| HUD Display | index.html | ✅ Complete | Real-time measurement readout |

### Navigation Features

| Feature | File | Status | Description |
|---------|------|--------|------------|
| Zoom to Extents | index.html | ✅ Complete | fit screen / zoomExtents |
| Zoom to Home | index.html | ✅ Complete | homeView() |
| Pan | index.html | ✅ Complete | Mouse drag / touch drag |
| Fullscreen | index.html | ✅ Complete | Toggle fullscreen mode |

### Comparison Features

| Feature | File | Status | Description |
|---------|------|--------|------------|
| Dual Viewport | dxf_compare_2_viewports.html | ✅ Complete | Side-by-side DXF comparison |
| Change Detection | compare/dxfComparePanel.js | ✅ Complete | Added/Removed/Modified detection |
| Change List UI | compare/dxfComparePanel.js | ✅ Complete | Collapsible change list |
| Camera Sync | dxf_compare_2_viewports.html | ✅ Complete | Sync pan/zoom between viewports |

### UI/UX Features

| Feature | File | Status | Description |
|---------|------|--------|------------|
| Floating Toolbar | index.html | ✅ Complete | Right-side vertical toolbar |
| Fit Screen Button | index.html | ✅ Complete | Toolbar zoom extents |
| Distance Button | index.html | ✅ Complete | Toolbar distance tool |
| Area Button | index.html | ✅ Complete | Toolbar area tool |
| Fullscreen Button | index.html | ✅ Complete | Toolbar fullscreen toggle |
| Back Button | index.html | ✅ Complete | Close viewer and return to dashboard |
| Upload Button | index.html | ✅ Complete | Trigger file input |

---

## Feature Interactions

### Measurement Tool Activation

```
viewerAction('distance') 
    → measurementPlugin.activate(MeasurementType.Distance)
    → draggableExtension.setMode('distance')
    → btn-distance.classList.add('active')

viewerAction('area')
    → measurementPlugin.activate(MeasurementType.Area)
    → draggableExtension.setMode('area')
    → btn-area.classList.add('active')
```

### File Loading Flow

```
openViewerWithFile(file)
    → Show loading overlay
    → Clear previous model
    → Detect file type (image vs CAD)
    → initViewer() if needed
    → viewer.loadModel(src, fileName)
    → measurementPlugin.activate(Distance)
    → Hide loading overlay
```

### Draggable Handle Interaction

```
pointerdown on handle
    → interactionMode = 'drag_vertex'
    → cameraControls.enabled = false
    → canvas.setPointerCapture()

pointermove while dragging
    → _screenToWorld(clientX, clientY)
    → _snap(point, clientX, clientY)
    → Update measurement.points[index]
    → requestRedraw()

pointerup
    → _commitToSDK()
    → cameraControls.enabled = true
    → canvas.releasePointerCapture()
```

---

## Feature Dependencies

### Measurement Tool Dependencies

```
MeasurementPlugin
    └── Depends on: Viewer2d
        └── Depends on: @x-viewer/core (CDN)

DraggableMeasurementExtension
    └── Depends on: Viewer2d, MeasurementPlugin
        └── Depends on: @x-viewer/core, @x-viewer/plugins (CDN)
```

### Comparison Tool Dependencies

```
DxfCompareHelper
    └── Depends on: Viewer2d (x2), @x-viewer/core (CDN)

DxfComparePanel
    └── Depends on: DxfCompareHelper
        └── Depends on: @x-viewer/core (CDN)
```

---

## Feature Flags / Options

### Viewer Configuration

```javascript
const viewerCfg = {
    containerId: "myCanvas",
    language: "en",
    enableSpinner: true,        // Default spinner
    enableProgressBar: true,   // Default progress
    enableLayoutBar: true,    // Layout switcher
    enableLocalCache: false  // IndexedDB cache
};
```

### Measurement Plugin Configuration

```javascript
const measureCfg = {
    language: "en",
    enableSnap: true,          // Endpoint snapping
    snapThreshold: 20,        // Screen pixels
    defaultUnit: "m",         // Meters
    showLabel: true           // Display measurements
};
```

---

## Feature Roadmap (Ideas for Future)

### Potential Improvements

1. **Angle Measurement** - Add angle tool (requires MeasurementType.Angle)
2. **Coordinate Display** - Show cursor world coordinates
3. **Text Annotations** - Add text markup tool
4. **Dimension Lines** - Auto-dimensioning
5. **Export** - Screenshot with measurements
6. **Search** - Find text in drawings
7. **Layers Panel** - Toggle layer visibility
8. **Properties Panel** - Show entity properties
