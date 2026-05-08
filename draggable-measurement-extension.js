/**
 * draggable-measurement-extension.js
 * 
 * Professional CAD-grade draggable measurement handles for @x-viewer/core.
 */

class DraggableMeasurementExtension {
    constructor(viewer, measurementPlugin) {
        if (!viewer || !measurementPlugin) {
            console.error('DraggableMeasurementExtension: Viewer and MeasurementPlugin are required.');
            return;
        }

        this.viewer = viewer;
        this.measurementPlugin = measurementPlugin;

        // 1. Internal Store
        // Map<measurementId, { id, points, type, isActive, sdkRef }>
        this.measurements = new Map();
        
        // 2. Interaction State
        this.activeMeasurementId = null;
        this.activeHandleIndex = null;
        this.isDraggingLine = false; // New: Drag state for the whole line
        this.pointerId = null;
        this.isDragging = false;
        this.startDragPointWorld = null; // For delta calculation
        
        // 3. Snap System
        this.snapTarget = null; // { x, y, z, id, index }
        this.snapType = 'none'; // 'none' | 'handle' | 'geometry'
        this.snapLocked = false;
        this.snapThreshold = 20; // screen pixels

        // UI Layer
        this.canvas = null;
        this.ctx = null;
        this.hud = null;
        this.deviceConfig = this._getDeviceConfig();
        
        // Config
        this.units = ['m', 'cm', 'mm', 'ft', 'ft-in'];
        this.currentUnitIndex = 0;

        this._init();
    }

    _getDeviceConfig() {
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (isTouch) {
            return { handleRadius: 16, activeHandleRadius: 22, hitRadius: 44, minDrag: 8 };
        }
        return { handleRadius: 8, activeHandleRadius: 11, hitRadius: 16, minDrag: 4 };
    }

    _init() {
        this._setupOverlay();
        this._setupHUD();
        this._attachEvents();
        this._setupResizeObserver();
        this._syncWithPlugin();
    }

    _setupOverlay() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'drag-overlay';
        Object.assign(this.canvas.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: '1000',
            pointerEvents: 'none', // Initial state: none
            touchAction: 'none'    // CRITICAL: Block default browser touch actions
        });
        
        const container = document.getElementById('viewer-container') || document.body;
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this._syncCanvasSize();
    }

    _syncCanvasSize() {
        const viewerTarget = document.getElementById('myCanvas');
        if (!viewerTarget || !this.ctx) return;
        const rect = viewerTarget.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.style.top = `${rect.top}px`;
        this.canvas.style.left = `${rect.left}px`;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        
        this.logicalWidth = rect.width;
        this.logicalHeight = rect.height;

        this.requestRedraw();
    }

    _setupResizeObserver() {
        const viewerTarget = document.getElementById('myCanvas');
        if (!viewerTarget) return;

        this._resizeObserver = new ResizeObserver(() => {
            this._syncCanvasSize();
            this.deviceConfig = this._getDeviceConfig();
        });
        this._resizeObserver.observe(viewerTarget);
        window.addEventListener('resize', () => this._syncCanvasSize());
    }

    _setupHUD() {
        this.hud = document.getElementById('drag-hud') || document.createElement('div');
        this.hud.id = 'drag-hud';
        Object.assign(this.hud.style, {
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '16px 24px',
            color: 'white',
            fontFamily: 'SF Pro Text, system-ui, sans-serif',
            display: 'none',
            zIndex: '1001',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            userSelect: 'none',
            pointerEvents: 'auto'
        });
        
        if (!this.hud.parentElement) document.body.appendChild(this.hud);

        this.hud.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.close-btn')) {
                this._deleteActiveMeasurement();
            } else if (e.target.closest('.unit-badge')) {
                this.currentUnitIndex = (this.currentUnitIndex + 1) % this.units.length;
                this._updateHUD();
            }
        });
    }

    _attachEvents() {
        // Explicitly capture measurements
        this.sdkMeasurements = new Map();

        // Selection via ViewerEvent.MouseClick
        const clickEvent = window.ViewerEvent ? window.ViewerEvent.MouseClick : 'MouseClick';
        this._clickCb = (e) => this._onViewerClick(e);
        this.viewer.addEventListener(clickEvent, this._clickCb);

        // Store Updates via MeasurementAdd/Remove
        const addEvent = window.ViewerEvent ? window.ViewerEvent.MeasurementAdd : 'MeasurementAdd';
        const removeEvent = window.ViewerEvent ? window.ViewerEvent.MeasurementRemove : 'MeasurementRemove';
        
        const syncAdd = (e) => {
            const m = e.data || e.measurement || e.drawable || e;
            const id = m.id || m.guid || m.uuid;
            if (id && m.points) this.sdkMeasurements.set(id, m);
            this._syncWithPlugin();
        };

        const syncRemove = (e) => {
            const m = e.data || e.measurement || e.drawable || e;
            const id = m.id || m.guid || m.uuid;
            if (id) this.sdkMeasurements.delete(id);
            this._syncWithPlugin();
        };

        this._syncAddCb = syncAdd;
        this._syncRemoveCb = syncRemove;
        this.viewer.addEventListener(addEvent, this._syncAddCb);
        this.viewer.addEventListener(removeEvent, this._syncRemoveCb);
        if (this.measurementPlugin.addEventListener) {
            this.measurementPlugin.addEventListener(addEvent, this._syncAddCb);
            this.measurementPlugin.addEventListener(removeEvent, this._syncRemoveCb);
        }

        // Camera/Layout Reset
        const layoutEvent = window.ViewerEvent ? window.ViewerEvent.LayoutChange : 'LayoutChange';
        this.viewer.addEventListener(layoutEvent, () => {
            this.activeMeasurementId = null;
            this._syncWithPlugin();
        });

        this._camCb = () => this.requestRedraw();
        this.viewer.addEventListener('CameraChange', this._camCb);

        // Interaction Lock System
        this.interactionMode = 'none'; // 'none' | 'pan' | 'drag_vertex' | 'select_measurement'

        this._blockEvent = (e) => {
            if (this.hud && this.hud.contains(e.target)) return;

            // 3. Mouse up -> Release Mode
            if (['pointerup', 'mouseup', 'touchend', 'pointercancel', 'touchcancel'].includes(e.type)) {
                if (this.interactionMode === 'drag_vertex' || this.interactionMode === 'select_measurement') {
                    this._onPointerUp(e);
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    if (e.cancelable) e.preventDefault();
                }
                this.interactionMode = 'none'; // Release mode
                return true;
            }

            // 2. Mouse move -> Act based on mode
            if (['pointermove', 'mousemove', 'touchmove'].includes(e.type)) {
                if (this.interactionMode === 'drag_vertex' || this.interactionMode === 'select_measurement') {
                    this._onPointerMove(e);
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    if (e.cancelable) e.preventDefault();
                    return true;
                } else if (this.interactionMode === 'pan') {
                    // Let camera pan handle it
                    return false;
                } else {
                    this._cursorHandler(e);
                    return false;
                }
            }

            // 1. Mouse down -> Decide mode FIRST
            if (['pointerdown', 'mousedown', 'touchstart'].includes(e.type)) {
                const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
                const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
                
                // Priority 1: Endpoint Hit
                const hit = this._hitTest(clientX, clientY);
                if (hit) {
                    this.interactionMode = 'drag_vertex';
                } else {
                    // Priority 2: Measurement Body Hit
                    const lineHit = this._lineHitTest(clientX, clientY);
                    if (lineHit) {
                        this.interactionMode = 'select_measurement';
                    } else {
                        // Priority 3: Empty space -> Pan camera
                        this.interactionMode = 'pan';
                    }
                }

                if (this.interactionMode === 'drag_vertex' || this.interactionMode === 'select_measurement') {
                    const activeHit = hit || this._lineHitTest(clientX, clientY);
                    this._onPointerDown(e, activeHit);
                    
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    if (e.cancelable) e.preventDefault();
                    return true;
                } else {
                    // Mode is pan. Allow event to fall through to CAD viewer
                    this.activeMeasurementId = null;
                    this.requestRedraw();
                    this._updateHUD();
                    return false;
                }
            }
            
            // Block wheel/dblclick if dragging
            if (this.interactionMode === 'drag_vertex' || this.interactionMode === 'select_measurement') {
                e.stopImmediatePropagation();
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                return true;
            }

            return false;
        };

        const eventTypes = ['pointerdown','mousedown','touchstart','pointermove','mousemove','touchmove','pointerup','mouseup','touchend','pointercancel','touchcancel','wheel','dblclick'];
        this._boundBlockers = [];
        eventTypes.forEach(type => {
            const handler = (e) => this._blockEvent(e);
            window.addEventListener(type, handler, { capture: true, passive: false });
            this._boundBlockers.push({ type, handler });
        });

        this._cursorHandler = (e) => {
            if (this.interactionMode === 'drag_vertex' || this.interactionMode === 'select_measurement') return;
            const myCanvas = document.getElementById('myCanvas');
            if (!myCanvas) return;
            
            const clientX = e.clientX;
            const clientY = e.clientY;
            
            const hit = this._hitTest(clientX, clientY);
            const lineHit = !hit ? this._lineHitTest(clientX, clientY) : null;
            if (hit || lineHit) {
                myCanvas.style.cursor = hit ? 'crosshair' : 'move';
                this.canvas.style.pointerEvents = 'auto'; // Capture events for _blockEvent
            } else {
                myCanvas.style.cursor = '';
                this.canvas.style.pointerEvents = 'none';
            }
        };
        window.addEventListener('mousemove', this._cursorHandler, { capture: true });
    }

    destroy() {
        if (this._clickCb) this.viewer.removeEventListener('MouseClick', this._clickCb);
        const addEvent = window.ViewerEvent ? window.ViewerEvent.MeasurementAdd : 'MeasurementAdd';
        const removeEvent = window.ViewerEvent ? window.ViewerEvent.MeasurementRemove : 'MeasurementRemove';
        if (this._syncAddCb) {
            this.viewer.removeEventListener(addEvent, this._syncAddCb);
            this.viewer.removeEventListener(removeEvent, this._syncRemoveCb);
            if (this.measurementPlugin && this.measurementPlugin.removeEventListener) {
                this.measurementPlugin.removeEventListener(addEvent, this._syncAddCb);
                this.measurementPlugin.removeEventListener(removeEvent, this._syncRemoveCb);
            }
        }
        if (this._boundBlockers) {
            this._boundBlockers.forEach(({ type, handler }) => {
                window.removeEventListener(type, handler, { capture: true });
            });
        }
        if (this._cursorHandler) window.removeEventListener('mousemove', this._cursorHandler, { capture: true });
        if (this.canvas && this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
        if (this.hud && this.hud.parentElement) this.hud.parentElement.removeChild(this.hud);
        if (this._resizeObserver) this._resizeObserver.disconnect();
    }

    _syncWithPlugin() {
        let raw = [];
        
        // Use our specifically captured events first if available
        if (this.sdkMeasurements && this.sdkMeasurements.size > 0) {
            raw = Array.from(this.sdkMeasurements.values());
        }

        // Support multiple SDK patterns for fetching measurements if nothing was captured
        if (raw.length === 0) {
            if (typeof this.measurementPlugin.getMeasurements === 'function') {
                raw = this.measurementPlugin.getMeasurements();
            } else if (this.measurementPlugin.measurements && typeof this.measurementPlugin.measurements.getMeasurements === 'function') {
                raw = this.measurementPlugin.measurements.getMeasurements();
            } else if (this.measurementPlugin.getAllMeasurements) {
                raw = this.measurementPlugin.getAllMeasurements();
            } else if (this.measurementPlugin.measurements) {
                const vals = Array.isArray(this.measurementPlugin.measurements) 
                    ? this.measurementPlugin.measurements 
                    : Object.values(this.measurementPlugin.measurements);
                
                vals.forEach(val => {
                    if (val && Array.isArray(val.drawables)) raw.push(...val.drawables);
                    else if (val && Array.isArray(val.measurements)) raw.push(...val.measurements);
                    else if (val && Array.isArray(val.records)) raw.push(...val.records);
                    else raw.push(val); 
                });
            }
        }

        const newMap = new Map();
        raw.forEach(m => {
            if (!m) return;
            const points = m.points || m.vertices || m.coords || (m.data ? m.data.points || m.data.vertices || m.data.coords : null);
            if (!points || !Array.isArray(points) || points.length < 2) return;
            
            const id = m.id || m.guid || m.uuid || (m.data ? (m.data.id || m.data.guid || m.data.uuid) : null) || Math.random().toString(36).substr(2, 9);
            
            newMap.set(id, {
                id: id,
                points: points.map(p => ({ x: p.x, y: p.y, z: p.z || 0 })),
                type: (m.type || (m.data ? m.data.type : 'distance')).toString().toLowerCase(),
                sdkRef: m
            });
        });

        this.measurements = newMap;
        if (this.activeMeasurementId && !this.measurements.has(this.activeMeasurementId)) {
            this.activeMeasurementId = null;
        }

        this.requestRedraw();
        this._updateHUD();
    }

    _onViewerClick(e) {
        if (this.isDragging) return;

        const clientX = e.clientX || (e.originalEvent ? e.originalEvent.clientX : null);
        const clientY = e.clientY || (e.originalEvent ? e.originalEvent.clientY : null);
        if (clientX === null || clientY === null) return;

        const hit = this._hitTest(clientX, clientY);
        if (hit) {
            this.activeMeasurementId = hit.measurementId;
        } else {
            const lineHit = this._lineHitTest(clientX, clientY);
            if (lineHit) {
                this.activeMeasurementId = lineHit.measurementId;
            } else {
                // If we clicked empty space, we might want to deselect, 
                // but only if we're not in the middle of an SDK measurement action
                this.activeMeasurementId = null;
            }
        }
        
        this.requestRedraw();
        this._updateHUD();
    }

    _hitTest(clientX, clientY) {
        const viewerTarget = document.getElementById('myCanvas');
        if (!viewerTarget) return null;
        const rect = viewerTarget.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // Tolerance: wider for touch, slightly wider for mouse for comfort
        const tolerance = this.deviceConfig.hitRadius || 24;

        // Check active handles first
        if (this.activeMeasurementId) {
            const m = this.measurements.get(this.activeMeasurementId);
            if (m) {
                for (let i = 0; i < m.points.length; i++) {
                    const screen = this._worldToScreen(m.points[i]);
                    if (screen && Math.hypot(x - screen.x, y - screen.y) < tolerance) {
                        return { measurementId: m.id, handleIndex: i };
                    }
                }
            }
        }

        // Then check all other handles
        for (const m of this.measurements.values()) {
            if (m.id === this.activeMeasurementId) continue;
            for (let i = 0; i < m.points.length; i++) {
                const screen = this._worldToScreen(m.points[i]);
                if (screen && Math.hypot(x - screen.x, y - screen.y) < tolerance) {
                    return { measurementId: m.id, handleIndex: i };
                }
            }
        }

        return null;
    }

    _lineHitTest(clientX, clientY) {
        const viewerTarget = document.getElementById('myCanvas');
        if (!viewerTarget) return null;
        const rect = viewerTarget.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const threshold = 22; // Increased threshold for easier selection

        for (const m of this.measurements.values()) {
            const points = m.points.map(p => this._worldToScreen(p)).filter(p => !!p);
            for (let i = 0; i < points.length - 1; i++) {
                const dist = this._pointToSegmentDistance(x, y, points[i].x, points[i].y, points[i+1].x, points[i+1].y);
                if (dist < threshold) return { measurementId: m.id };
            }
            if (m.type === 'area' && points.length > 2) {
                const dist = this._pointToSegmentDistance(x, y, points[points.length-1].x, points[points.length-1].y, points[0].x, points[0].y);
                if (dist < threshold) return { measurementId: m.id };
            }
        }
        return null;
    }

    _onPointerDown(e, externalHit = null) {
        const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
        const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
        
        const hit = externalHit || this._hitTest(clientX, clientY);
        if (!hit) return;

        this.activeMeasurementId = hit.measurementId;
        this.activeHandleIndex = hit.handleIndex; // undefined if line hit
        this.isDragging = true;
        this.canvas.style.pointerEvents = 'auto'; // Stay active during drag
        this.pointerId = e.pointerId || 'mouse';
        this.snapType = 'none';
        this.snapLocked = false;

        // CRITICAL: DISABLE CAMERA CONTROLS TO PREVENT PANNING
        try {
            const cm = this.viewer.getCameraManager();
            if (cm) {
                const controls = cm.cameraControls || cm.controls || cm._controls;
                if (controls) {
                    controls.enabled = false;
                    if (typeof controls.stop === 'function') controls.stop();
                }
            }
        } catch (err) {
            console.warn('DraggableExtension: Failed to disable controls', err);
        }

        // For whole-measurement dragging, store initial state
        const m = this.measurements.get(this.activeMeasurementId);
        if (m) {
            this.dragStartWorld = this._screenToWorld(clientX, clientY);
            if (this.activeHandleIndex === undefined) {
                if (this.dragStartWorld) {
                    this.dragStartPoints = m.points.map(p => Object.assign({}, p));
                } else {
                    // Fallback if we hit the line in overlay but getHitResult missed drawing geometry
                    // We'll use the first point of the measurement as a dummy reference for depth
                    this.dragStartWorld = Object.assign({}, m.points[0]);
                    this.dragStartPoints = m.points.map(p => Object.assign({}, p));
                }
            }
        }
        
        if (e.pointerId && this.canvas.setPointerCapture) {
            this.canvas.setPointerCapture(e.pointerId);
        }
        
        document.body.style.cursor = 'grabbing';
        
        this.requestRedraw();
        this._updateHUD();
        
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.stopPropagation) e.stopPropagation();
        if (e.cancelable && e.preventDefault) e.preventDefault();
    }

    _onPointerMove(e) {
        if (!this.isDragging) return;
        if (e.pointerId && this.pointerId !== 'mouse' && e.pointerId !== this.pointerId) return;

        const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
        const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;

        const measurement = this.measurements.get(this.activeMeasurementId);
        if (!measurement) return;

        let worldPoint = this._screenToWorld(clientX, clientY);
        
        // If we lost world point (over void), we still want to drag
        // We'll perform a simplified projection or just use the last valid one? 
        // Better: use screen delta to world delta if we have a drag reference
        if (!worldPoint && this.dragStartWorld) {
            // Very simple fallback: we don't have a new world point, so we can't calculate delta.
            // In a production CAD viewer, we'd project onto a plane. 
            // For now, let's just skip this tick if we are in the void to avoid jumps.
            return;
        }

        if (this.activeHandleIndex !== undefined) {
            // 1. Single Point Drag (Handle)
            if (worldPoint) {
                const snappedPoint = this._snap(worldPoint, clientX, clientY);
                measurement.points[this.activeHandleIndex] = Object.assign({}, snappedPoint);
            }
        } else if (this.dragStartWorld && this.dragStartPoints && worldPoint) {
            // 2. Whole Measurement Drag (Line)
            const dx = worldPoint.x - this.dragStartWorld.x;
            const dy = worldPoint.y - this.dragStartWorld.y;
            const dz = worldPoint.z - this.dragStartWorld.z;
            
            measurement.points = this.dragStartPoints.map(p => ({
                x: p.x + dx,
                y: p.y + dy,
                z: p.z + dz
            }));
        }

        this.requestRedraw();
        this._updateHUD();
        
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.stopPropagation) e.stopPropagation();
        if (e.cancelable && e.preventDefault) e.preventDefault();
    }

    _onPointerUp(e) {
        if (!this.isDragging) return;
        if (e.pointerId && this.pointerId !== 'mouse' && e.pointerId !== this.pointerId) return;

        this._commitToSDK();
        
        // RE-ENABLE VIEWER NAVIGATION
        try {
            const cm = this.viewer.getCameraManager();
            if (cm) {
                const controls = cm.cameraControls || cm.controls || cm._controls;
                if (controls) controls.enabled = true;
            }
        } catch (err) {}

        this.isDragging = false;
        this.pointerId = null;
        this.activeHandleIndex = null;
        this.snapTarget = null;
        this.snapType = 'none';
        this.snapLocked = false;
        
        if (e.pointerId && this.canvas.releasePointerCapture) {
            this.canvas.releasePointerCapture(e.pointerId);
        }
        
        this.canvas.style.pointerEvents = 'none';
        document.body.style.cursor = '';
        
        this.requestRedraw();
        
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (e.stopPropagation) e.stopPropagation();
        if (e.cancelable && e.preventDefault) e.preventDefault();
    }


    _snap(point, clientX, clientY) {
        const viewerTarget = document.getElementById('myCanvas');
        const rect = viewerTarget.getBoundingClientRect();
        const cursorX = clientX - rect.left;
        const cursorY = clientY - rect.top;
        
        // 1. Check Snap Lock (Handles have higher priority lock)
        if (this.snapLocked && this.snapTarget && this.snapType === 'handle') {
            const screen = this._worldToScreen(this.snapTarget);
            if (screen) {
                const dist = Math.hypot(cursorX - screen.x, cursorY - screen.y);
                if (dist < this.snapThreshold * 2) return this.snapTarget;
            }
            this.snapLocked = false;
            this.snapTarget = null;
            this.snapType = 'none';
        }

        let nearest = null;
        let minScreenDist = this.snapThreshold;

        // 2. Priority 1: Find nearest endpoint among all measurements
        for (const m of this.measurements.values()) {
            for (let i = 0; i < m.points.length; i++) {
                if (m.id === this.activeMeasurementId && i === this.activeHandleIndex) continue;

                const screen = this._worldToScreen(m.points[i]);
                if (!screen) continue;

                const dist = Math.hypot(cursorX - screen.x, cursorY - screen.y);
                if (dist < minScreenDist) {
                    minScreenDist = dist;
                    nearest = Object.assign({}, m.points[i], { id: m.id, index: i });
                }
            }
        }

        if (nearest) {
            this.snapTarget = nearest;
            this.snapLocked = true;
            this.snapType = 'handle';
            return nearest;
        }

        // 3. Priority 2: Drawing Geometry Snap (Acknowledging the point from SDK)
        // If the SDK returned a point, we check if it's "snapped" vs free space.
        // In most CAD implementations, getHitResult returns the snapped coord if near geometry.
        const screenPoint = this._worldToScreen(point);
        if (screenPoint) {
            const distToCursor = Math.hypot(cursorX - screenPoint.x, cursorY - screenPoint.y);
            // If the SDK point is reasonably close to cursor, we consider it a geometry snap
            if (distToCursor < this.snapThreshold) {
                this.snapTarget = point;
                this.snapType = 'geometry';
                return point;
            }
        }

        this.snapTarget = null;
        this.snapType = 'none';
        return point;
    }

    _commitToSDK() {
        const m = this.measurements.get(this.activeMeasurementId);
        if (!m || !m.sdkRef) return;

        try {
            const points = m.points.map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
            
            // patterns: setData() or updateMeasurement()
            if (typeof m.sdkRef.setData === 'function') {
                m.sdkRef.setData({ points });
            } else if (typeof this.measurementPlugin.updateMeasurement === 'function') {
                this.measurementPlugin.updateMeasurement(m.id, { points });
            } else if (typeof this.measurementPlugin.setMeasurements === 'function') {
                // If setMeasurements is required, update the collection first
                const collection = Array.from(this.measurements.values()).map(item => {
                    const base = item.sdkRef.data || item.sdkRef;
                    return Object.assign({}, base, { points: item.points });
                });
                this.measurementPlugin.setMeasurements(collection);
            }
        } catch (err) {
            console.warn('DraggableExtension: Commit failed', err);
            this._syncWithPlugin();
        }
    }

    _deleteActiveMeasurement() {
        if (!this.activeMeasurementId) return;
        const m = this.measurements.get(this.activeMeasurementId);
        if (!m) return;

        try {
            if (typeof this.measurementPlugin.removeMeasurement === 'function') {
                this.measurementPlugin.removeMeasurement(m.id);
            } else if (typeof this.measurementPlugin.deleteMeasurement === 'function') {
                this.measurementPlugin.deleteMeasurement(m.id);
            }
        } catch(e) {}
        
        this.activeMeasurementId = null;
        this._syncWithPlugin();
    }

    requestRedraw() {
        if (this._redrawRequested) return;
        this._redrawRequested = true;
        requestAnimationFrame(() => {
            this._drawOverlay();
            this._redrawRequested = false;
        });
    }

    _drawOverlay() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);

        for (const m of this.measurements.values()) {
            const isActive = m.id === this.activeMeasurementId;
            const points = m.points.map(p => this._worldToScreen(p)).filter(p => !!p);
            if (points.length < 2) continue;

            const isDraggingThis = isActive && this.isDragging;

            // Draw line overlay if dragging (ghost)
            if (isDraggingThis) {
                this.ctx.beginPath();
                this.ctx.setLineDash([5, 5]);
                this.ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
                this.ctx.lineWidth = 2;
                this.ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
                if (m.type === 'area') this.ctx.closePath();
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }

            // Draw handles if active
            if (isActive) {
                points.forEach((p, idx) => {
                    const draggingThisHandle = isDraggingThis && idx === this.activeHandleIndex;
                    this._drawHandle(p, idx, draggingThisHandle);
                });
            }
        }

        // 3. Draw Snap Indicator
        if (this.isDragging && this.snapTarget) {
            const screen = this._worldToScreen(this.snapTarget);
            if (screen) {
                this.ctx.save();
                this.ctx.beginPath();
                
                if (this.snapType === 'handle') {
                    // Technical Ring for handles
                    this.ctx.arc(screen.x, screen.y, this.deviceConfig.activeHandleRadius * 1.5, 0, Math.PI * 2);
                    this.ctx.strokeStyle = '#FF9F1C';
                    this.ctx.lineWidth = 1.5;
                    this.ctx.setLineDash([4, 2]);
                    this.ctx.stroke();
                } else if (this.snapType === 'geometry') {
                    // Square box for geometry vertex snap
                    const size = 10;
                    this.ctx.rect(screen.x - size, screen.y - size, size * 2, size * 2);
                    this.ctx.strokeStyle = '#22c55e'; // Green for geometry
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                    
                    // Small crosshair
                    this.ctx.beginPath();
                    this.ctx.moveTo(screen.x - 4, screen.y);
                    this.ctx.lineTo(screen.x + 4, screen.y);
                    this.ctx.moveTo(screen.x, screen.y - 4);
                    this.ctx.lineTo(screen.x, screen.y + 4);
                    this.ctx.stroke();
                }
                
                this.ctx.restore();
            }
        }
    }

    _drawHandle(pos, index, isDragging) {
        const theme = index === 0 ? '#00E5FF' : (index === 1 ? '#FF9F1C' : '#FFFFFF');
        const r = isDragging ? this.deviceConfig.activeHandleRadius : this.deviceConfig.handleRadius;
        
        this.ctx.save();
        this.ctx.shadowBlur = isDragging ? 12 : 4;
        this.ctx.shadowColor = 'rgba(0,0,0,0.4)';
        
        // Background Circle
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        this.ctx.fillStyle = isDragging ? '#3b82f6' : 'rgba(15, 23, 42, 0.95)';
        this.ctx.fill();
        
        // Border
        this.ctx.strokeStyle = isDragging ? '#FFFFFF' : theme;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Symbol
        this.ctx.beginPath();
        if (isDragging) {
            // Plus sign
            const s = r * 0.4;
            this.ctx.moveTo(pos.x - s, pos.y);
            this.ctx.lineTo(pos.x + s, pos.y);
            this.ctx.moveTo(pos.x, pos.y - s);
            this.ctx.lineTo(pos.x, pos.y + s);
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        } else {
            // Dot
            this.ctx.arc(pos.x, pos.y, r * 0.35, 0, Math.PI * 2);
            this.ctx.fillStyle = theme;
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }

    _updateHUD() {
        if (!this.hud) return;
        const m = this.activeMeasurementId ? this.measurements.get(this.activeMeasurementId) : null;
        
        if (!m) {
            this.hud.style.display = 'none';
            return;
        }

        const unit = this.units[this.currentUnitIndex];
        const val = m.type === 'area' ? this._calculateArea(m.points) : this._calculateDistance(m.points);
        const formatted = m.type === 'area' ? this._formatArea(val, unit) : this._formatDistance(val, unit);

        this.hud.style.display = 'block';
        this.hud.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:12px; min-width:260px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:10px; font-weight:900; text-transform:uppercase; color:rgba(255,255,255,0.4); letter-spacing:0.1em;">${m.type}</span>
                        <div class="unit-badge" style="cursor:pointer; background:rgba(59,130,246,0.3); border:1px solid #3b82f6; color:#93c5fd; border-radius:6px; padding:2px 8px; font-size:10px; font-weight:bold;">${unit}</div>
                    </div>
                    <div class="close-btn" style="cursor:pointer; color:#ef4444; font-size:16px;">✕</div>
                </div>
                <div style="font-size:32px; font-weight:900; color:white; font-variant-numeric: tabular-nums; letter-spacing:-1px;">
                    ${formatted}
                </div>
                <div style="font-size:10px; color:rgba(255,255,255,0.3); display:flex; align-items:center; gap:4px;">
                    <div style="width:6px; height:6px; border-radius:50%; background:#22c55e;"></div>
                    Snapping Active
                </div>
            </div>
        `;
    }

    // Helpers
    _worldToScreen(world) {
        if (!this.viewer.worldToScreen) return null;
        try {
            const res = this.viewer.worldToScreen(world);
            if (res && isFinite(res.x) && isFinite(res.y)) return res;
        } catch(e) {}
        return null;
    }

    _screenToWorld(clientX, clientY) {
        const viewerTarget = document.getElementById('myCanvas');
        if (!viewerTarget) return null;
        const rect = viewerTarget.getBoundingClientRect();
        const coords = { 
            clientX: clientX, 
            clientY: clientY,
            x: clientX - rect.left,
            y: clientY - rect.top
        };
        try {
            if (this.viewer.getHitResult) return this.viewer.getHitResult(coords);
        } catch(e) {}
        return null;
    }

    _pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const l2 = (x2 - x1)**2 + (y2 - y1)**2;
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }

    _calculateArea(points) {
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return Math.abs(area) / 2;
    }

    _calculateDistance(points) {
        let d = 0;
        for (let i = 0; i < points.length - 1; i++) {
            d += Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
        }
        return d;
    }

    _formatArea(val, unit) {
        let scaled = val;
        let suffix = ' m²';
        if (unit === 'ft' || unit === 'ft-in') { scaled = val * 10.7639; suffix = ' sq ft'; }
        else if (unit === 'cm') { scaled = val * 10000; suffix = ' cm²'; }
        return scaled.toLocaleString(undefined, { maximumFractionDigits: 2 }) + suffix;
    }

    _formatDistance(val, unit) {
        let scaled = val;
        let suffix = ' m';
        if (unit === 'ft') { scaled = val * 3.28084; suffix = ' ft'; }
        else if (unit === 'ft-in') {
            const total = val * 39.3701;
            const feet = Math.floor(total / 12);
            const inches = Math.round(total % 12);
            return `${feet}' ${inches}"`;
        }
        else if (unit === 'cm') { scaled = val * 100; suffix = ' cm'; }
        return scaled.toFixed(2) + suffix;
    }
}

window.DraggableMeasurementExtension = DraggableMeasurementExtension;
