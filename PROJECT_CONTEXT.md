# Project Context - ShabeerCAD Viewer

## Project Overview

**Project Name**: Professional CAD Web Viewer (ShabeerCAD)
**Version**: 0.1.0
**Technology**: WebGL-based CAD viewer using @x-viewer/core SDK
**Purpose**: View 2D CAD files (DWG, DXF) and images in browser without desktop software

### Core Systems

1. **Rendering Engine**: @x-viewer/core (Viewer2d) - WebGL/Three.js based
2. **File Loader**: LocalDxfUploader - Client-side parsing
3. **Measurement System**: MeasurementPlugin - Distance, Area tools
4. **Overlay System**: DraggableMeasurementExtension - Canvas overlay handles
5. **UI System**: TailwindCSS + Lucide icons + custom toolbars
6. **Plugin System**: @x-viewer/plugins modular architecture

### Main Architecture

```
index.html (Dashboard)
├── Viewer2d + LocalDxfUploader
├── MeasurementPlugin
├── DraggableMeasurementExtension
└── HUD Overlay System

compare/dxf_compare_2_viewports.html (Comparison)
├── DxfCompareHelper (dual viewport)
├── Sync Camera System
└── DxfComparePanel (change list)
```

### Viewer Lifecycle

1. **Init**: Create Viewer2d with containerId
2. **Font Load**: setFont(SHX/TTF files)
3. **Model Load**: loadModel(src, fileName) - parses DXF/DWG
4. **Interact**: Handle events, measurements, markups
5. **Cleanup**: clear() - optional, keeps viewer ready

### Interaction Model

- **Mouse**: Click to select, drag to pan, wheel to zoom
- **Touch**: Tap to select, drag to pan, pinch to zoom
- **Measurement**: Click endpoints, drag handles for editing
- **Keyboard**: ESC to cancel, Delete to remove selected

---

## Folder Structure

```
/
├── index.html              # Main dashboard (file upload, samples, viewer)
├── dxf_*.html            # Standalone DXF viewers
├── dwg_*.html           # Standalone DWG viewers
├── dxf_compare_*.html    # Comparison viewports
├── pdf_*.html           # PDF viewers
├── cad_compare_2_files.html # 2-file comparison
├── draggable-measurement-extension.js # Custom extension
├── global.css            # Global styles
├── vite.config.js        # Build config
├── package.json         # Dependencies
│
├── compare/
│   ├── dxfComparePanel.js    # Change list UI
│   └── dxfComparePanel.css  # Panel styles
│
├── libs/
│   ├── fonts/           # SHX/TTF CAD fonts
│   ├── jsoneditor/      # JSON viewer
│   └── pdf/             # PDF.js worker
│
├── models/
│   ├── dwg/            # Sample DWG files
│   ├── dxf/            # Sample DXF files
│   └── pdf/            # Sample PDF files
│
├── images/              # UI images, thumbnails
├── iconfont/            # Custom icons
└── scripts/            # Build scripts
```

---

## Critical Files

### High-Risk Files

1. **draggable-measurement-extension.js**
   - Risk: Event capture, camera control manipulation
   - Risk: Pointer capture edge cases
   - Risk: Coordinate conversion failures

2. **index.html (script module)**
   - Risk: Large inline script with tight viewer coupling
   - Risk: Multiple event listeners

3. **compare/dxfComparePanel.js**
   - Risk: DOM manipulation, event propagation

### Core Engine Files

- @x-viewer/core (CDN) - Viewer2d, DxfCompareHelper
- @x-viewer/plugins (CDN) - MeasurementPlugin, ToolbarPlugin
- @x-viewer/ui (CDN) - UI components

### Shared Utilities

- worldToScreen / screenToWorld - Coordinate conversion
- ViewerEvent - Event type constants
- MeasurementType - Distance, Area enums

---

## Dependency Map

```
@x-viewer/core (CDN)
├── Viewer2d
│   ├── loadModel(), clear(), getBBox()
│   ├── worldToScreen(), screenToWorld()
│   ├── zoomToBBox(), homeView()
│   └── addEventListener(), removeEventListener()
│
├── ViewerEvent
│   ├── MouseClick
│   ├── MeasurementAdd, MeasurementRemove
│   ├── CameraChange
│   └── LayoutChange
│
└── DxfCompareHelper
    ├── compare()
    ├── enableSyncCamera()
    └── getChanges()

@x-viewer/plugins (CDN)
├── LocalDxfUploader
│   ├── setPdfWorker()
│   └── onSuccess callback
│
├── MeasurementPlugin
│   ├── activate(type)
│   ├── deactivate()
│   ├── getMeasurements()
│   └── measurements[Type]
│
├── ToolbarPlugin / Viewer2dToolbarPlugin
├── LayerManagerPlugin
├── ScreenshotPlugin
├── AxisGizmoPlugin
└── BottomBarPlugin

Custom Extensions
└── DraggableMeasurementExtension
    ├── Canvas overlay
    ├── Event blocking system
    ├── Snapping system (endpoint, geometry)
    ├── HUD management
    └── _commitToSDK()
```

---

## Safe Extension Rules

### How New Tools Should Be Added

1. CreateMeasurementPlugin subclass or extend existing
2. Register via viewer.addEventListener for lifecycle
3. Use MeasurementPlugin.activate(type) for tool activation
4. Add toolbar button in HTML with viewerAction()
5. Cleanup: deactivate() + removeEventListener()

### How Overlays Should Integrate

1. Use ResizeObserver for canvas sync
2. Use requestAnimationFrame for rendering (not setInterval)
3. Attach events in capture phase for blocking
4. Always disable pointerEvents when inactive
5. Cleanup: removeEventListener + remove child nodes

### How Events Should Be Cleaned up

1. Named callbacks (not anonymous)
2. Stored references for removal
3. Pointer capture release on all exit paths
4. Camera controls re-enabled on drag end
5. ResizeObserver disconnect()

### How Plugins Should Register

1. Import from @x-viewer/plugins
2. Instantiate with viewer as first param
3. Configure via options object
4. Store reference for cleanup
5. Show/hide via plugin methods

---

## Known Problems

### Technical Debt

1. **Inline script**: Complex JavaScript inline in HTML - hard to maintain
2. **Event coupling**: Tight coupling between viewer and custom extension
3. **Limited error handling**: Basic try/catch, limited recovery
4. **Memory**: URL.createObjectURL not always revoked

### Performance Risks

1. **Large canvas overlay**: Full-screen canvas may impact FPS on low-end
2. **ResizeObserver**: Rapid resize events can cause flicker
3. **Event capture**: Capture-phase listeners may delay other systems

### Fragile Logic

1. **Coordinate conversion**: Can return null silently - must check
2. **Camera control disable**: Must re-enable on ALL exit paths
3. **Pointer capture**: Touch/cancel edge cases
4. **SDK API changes**: CDN versions may break compatibility

### Rendering Risks

1. **devicePixelRatio**: Must scale canvas for crisp rendering
2. **Canvas sync**: Overlay may desync from viewer on resize
3. **Z-order**: Hardcoded zIndex values can conflict
