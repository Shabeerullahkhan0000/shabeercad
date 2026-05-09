class MobileDebugLogger {
    constructor() {
        this.enabled = window.localStorage && window.localStorage.getItem('cadMobileDebug') === '1';
        this.last = new Map();
    }

    log(scope, payload, minInterval = 180) {
        if (!this.enabled) return;
        const now = performance.now();
        const last = this.last.get(scope) || 0;
        if (now - last < minInterval) return;
        this.last.set(scope, now);
        console.debug(`[MobileCAD:${scope}]`, payload);
    }
}

class CameraController {
    constructor(viewer, logger) {
        this.viewer = viewer;
        this.logger = logger;
        this.minZoom = 0.02;
        this.maxZoom = 5000;
        this.lastFrame = 0;
        this.refresh();
    }

    refresh() {
        const manager = this.viewer && typeof this.viewer.getCameraManager === 'function'
            ? this.viewer.getCameraManager()
            : null;
        this.cameraManager = manager;
        this.controls = manager && (manager.cameraControls || manager.controls || manager._controls);
        this.camera = this.viewer && this.viewer.camera
            ? this.viewer.camera
            : manager && (manager.camera || manager._camera);
        this._configureNativeControls();
    }

    setNativeControlsEnabled(enabled) {
        this.refresh();
        if (!this.controls) return;
        this.controls.enabled = enabled;
        if (!enabled && typeof this.controls.stop === 'function') this.controls.stop();
    }

    panByPixels(dx, dy) {
        const metrics = this._cameraMetrics();
        const worldX = -dx * metrics.worldPerPixelX;
        const worldY = dy * metrics.worldPerPixelY;
        this.translateWorld(worldX, worldY);
        this.logger.log('pan', { dx: Math.round(dx), dy: Math.round(dy), worldX, worldY }, 120);
    }

    zoomAt(clientX, clientY, scale) {
        if (!scale || !isFinite(scale) || Math.abs(scale - 1) < 0.001) return;
        const camera = this.camera;
        if (!camera) return;

        const rect = this._viewerRect();
        const oldMetrics = this._cameraMetrics();
        const oldZoom = this._getZoom();
        const newZoom = this._clamp(oldZoom * scale, this.minZoom, this.maxZoom);
        if (!isFinite(newZoom) || Math.abs(newZoom - oldZoom) < 0.0001) return;

        const offsetX = clientX - (rect.left + rect.width / 2);
        const offsetY = clientY - (rect.top + rect.height / 2);

        this._setZoom(newZoom);
        const newMetrics = this._cameraMetrics();
        const focusShiftX = offsetX * (oldMetrics.worldPerPixelX - newMetrics.worldPerPixelX);
        const focusShiftY = -offsetY * (oldMetrics.worldPerPixelY - newMetrics.worldPerPixelY);
        this.translateWorld(focusShiftX, focusShiftY, false);
        this._afterCameraChange();

        this.logger.log('pinch', {
            scale: Number(scale.toFixed(4)),
            zoom: Number(newZoom.toFixed(4)),
            focusX: Math.round(offsetX),
            focusY: Math.round(offsetY)
        }, 90);
    }

    translateWorld(dx, dy, finalize = true) {
        if (!isFinite(dx) || !isFinite(dy)) return;

        if (this.controls && typeof this.controls.truck === 'function') {
            try {
                this.controls.truck(dx, dy, false);
                if (finalize) this._afterCameraChange();
                return;
            } catch (e) {}
        }

        const camera = this.camera;
        if (camera && camera.position) {
            camera.position.x += dx;
            camera.position.y += dy;
        }

        const target = this._getControlTarget();
        if (target) {
            target.x += dx;
            target.y += dy;
        }

        if (finalize) this._afterCameraChange();
    }

    requestRender() {
        this._afterCameraChange();
    }

    _configureNativeControls() {
        if (!this.controls) return;
        this.controls.enabled = false;
        if ('enablePan' in this.controls) this.controls.enablePan = false;
        if ('enableZoom' in this.controls) this.controls.enableZoom = false;
        if ('enableRotate' in this.controls) this.controls.enableRotate = false;
        if ('enableDamping' in this.controls) this.controls.enableDamping = false;
        if ('dampingFactor' in this.controls) this.controls.dampingFactor = 0;
        if ('touchDampingFactor' in this.controls) this.controls.touchDampingFactor = 0;
        if (typeof this.controls.stop === 'function') this.controls.stop();
    }

    _afterCameraChange() {
        const now = performance.now();
        if (now - this.lastFrame < 6) return;
        this.lastFrame = now;

        const camera = this.camera;
        if (camera && typeof camera.updateProjectionMatrix === 'function') {
            camera.updateProjectionMatrix();
        }
        if (this.controls && typeof this.controls.update === 'function') {
            try { this.controls.update(0); } catch (e) { try { this.controls.update(); } catch (ignored) {} }
        }
        if (this.viewer) {
            const render = this.viewer.requestRender || this.viewer.render || this.viewer.redraw || this.viewer.update;
            if (typeof render === 'function') {
                try { render.call(this.viewer); } catch (e) {}
            }
        }
    }

    _setZoom(zoom) {
        if (this.controls && typeof this.controls.zoomTo === 'function') {
            try {
                this.controls.zoomTo(zoom, false);
                return;
            } catch (e) {}
        }
        if (this.camera && 'zoom' in this.camera) {
            this.camera.zoom = zoom;
        }
    }

    _getZoom() {
        if (this.camera && isFinite(this.camera.zoom)) return this.camera.zoom;
        if (this.viewer && this.viewer.camera && isFinite(this.viewer.camera.zoom)) return this.viewer.camera.zoom;
        return 1;
    }

    _getControlTarget() {
        if (!this.controls) return null;
        if (this.controls.target) return this.controls.target;
        if (this.controls._target) return this.controls._target;
        return null;
    }

    _cameraMetrics() {
        const rect = this._viewerRect();
        const camera = this.camera || {};
        const zoom = this._getZoom() || 1;
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);

        let worldWidth = width / zoom;
        let worldHeight = height / zoom;

        if (isFinite(camera.left) && isFinite(camera.right)) {
            worldWidth = Math.abs(camera.right - camera.left) / zoom;
        }
        if (isFinite(camera.top) && isFinite(camera.bottom)) {
            worldHeight = Math.abs(camera.top - camera.bottom) / zoom;
        }

        return {
            worldPerPixelX: worldWidth / width,
            worldPerPixelY: worldHeight / height
        };
    }

    _viewerRect() {
        const target = document.getElementById('myCanvas');
        return target ? target.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    }

    _clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
}

class MobileRenderer {
    constructor(container, viewer, logger) {
        this.container = container;
        this.viewer = viewer;
        this.logger = logger;
        this.invalid = false;
        this.lastFpsTime = performance.now();
        this.frames = 0;
        this.overlay = document.createElement('canvas');
        this.overlay.id = 'mobile-touch-overlay';
        Object.assign(this.overlay.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            zIndex: '1100',
            pointerEvents: 'none',
            touchAction: 'none'
        });

        this.hud = document.createElement('div');
        this.hud.id = 'mobile-touch-hud';
        Object.assign(this.hud.style, {
            position: 'absolute',
            left: '50%',
            bottom: 'calc(5.25rem + env(safe-area-inset-bottom))',
            transform: 'translateX(-50%)',
            zIndex: '1101',
            display: 'none',
            alignItems: 'center',
            gap: '0.55rem',
            maxWidth: '92vw',
            padding: '0.6rem 0.85rem',
            borderRadius: '0.95rem',
            border: '1px solid rgba(255,255,255,0.16)',
            background: 'rgba(15,23,42,0.92)',
            color: '#fff',
            boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(16px)',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            pointerEvents: 'auto',
            userSelect: 'none'
        });

        this.container.appendChild(this.overlay);
        this.container.appendChild(this.hud);
        this.ctx = this.overlay.getContext('2d', { alpha: true });
        this.resize();
    }

    resize() {
        const target = document.getElementById('myCanvas');
        if (!target || !this.ctx) return;
        const rect = target.getBoundingClientRect();
        const parentRect = this.overlay.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.overlay.style.left = `${rect.left - parentRect.left}px`;
        this.overlay.style.top = `${rect.top - parentRect.top}px`;
        this.overlay.style.width = `${rect.width}px`;
        this.overlay.style.height = `${rect.height}px`;
        this.overlay.width = Math.max(1, Math.round(rect.width * dpr));
        this.overlay.height = Math.max(1, Math.round(rect.height * dpr));
        this.width = rect.width;
        this.height = rect.height;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.invalidate();
    }

    invalidate() {
        if (this.invalid) return;
        this.invalid = true;
        requestAnimationFrame(() => {
            const start = performance.now();
            this.invalid = false;
            this.frames += 1;
            const now = performance.now();
            if (now - this.lastFpsTime >= 1000) {
                this.logger.log('fps', { fps: this.frames, redrawMs: Number((now - this.lastFpsTime).toFixed(1)) }, 0);
                this.frames = 0;
                this.lastFpsTime = now;
            }
            if (this.onDraw) this.onDraw(this.ctx);
            this.logger.log('redraw', { ms: Number((performance.now() - start).toFixed(2)) }, 500);
        });
    }

    clear() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.width || 0, this.height || 0);
    }

    setHud(html, visible = true) {
        if (!visible) {
            this.hud.style.display = 'none';
            return;
        }
        this.hud.style.display = 'flex';
        this.hud.innerHTML = html;
    }

    destroy() {
        if (this.overlay.parentElement) this.overlay.parentElement.removeChild(this.overlay);
        if (this.hud.parentElement) this.hud.parentElement.removeChild(this.hud);
    }
}

class MeasurementInteractionLayer {
    constructor(viewer, renderer, camera, logger) {
        this.viewer = viewer;
        this.renderer = renderer;
        this.camera = camera;
        this.logger = logger;
        this.mode = 'none';
        this.state = 'idle';
        this.previousState = 'idle';
        this.points = [];
        this.savedMeasurement = null;
        this.dragIndex = null;
        this.hitRadius = 40;
        this.tapSlop = 6;
        this.lastHitCache = null;
    }

    toggleDistanceMode() {
        if (this.mode === 'distance') {
            this.deactivate();
            return false;
        }
        this.mode = 'distance';
        this.state = this.points.length >= 2
            ? 'completed'
            : this.points.length === 1
                ? 'pointASelected'
                : 'waitingForPointA';
        this.renderer.invalidate();
        this.updateHud();
        this.logger.log('measurement', { mode: this.mode, state: this.state }, 0);
        return true;
    }

    deactivate() {
        this.mode = 'none';
        this.state = 'idle';
        this.previousState = 'idle';
        this.dragIndex = null;
        this.renderer.invalidate();
        this.updateHud();
    }

    clear() {
        this.points = [];
        this.savedMeasurement = null;
        this.dragIndex = null;
        this.state = this.mode === 'distance' ? 'waitingForPointA' : 'idle';
        this.renderer.invalidate();
        this.updateHud();
    }

    wantsPointTap() {
        return this.mode === 'distance' && (this.state === 'waitingForPointA' || this.state === 'pointASelected');
    }

    hitTest(local) {
        if (this.mode !== 'distance') return null;
        const handle = this._hitHandle(local.x, local.y);
        if (handle !== null) return { type: 'measurement-handle', handleIndex: handle };
        if (this._hitLine(local.x, local.y)) return { type: 'measurement-line' };
        return null;
    }

    beginEndpointDrag(handleIndex) {
        this.previousState = this.state;
        this.state = 'draggingEndpoint';
        this.dragIndex = handleIndex;
        this.logger.log('measurement', { state: this.state, handleIndex }, 0);
        this.updateHud();
        this.renderer.invalidate();
    }

    dragEndpoint(event) {
        if (this.state !== 'draggingEndpoint' || this.dragIndex === null) return;
        const world = this._getWorldPoint(event);
        if (!world) return;
        this.points[this.dragIndex] = world;
        if (this.previousState === 'completed') this._saveMeasurement();
        this.renderer.invalidate();
        this.updateHud();
    }

    endEndpointDrag() {
        if (this.state !== 'draggingEndpoint') return;
        this.state = this.previousState === 'pointASelected' ? 'pointASelected' : 'completed';
        this.dragIndex = null;
        if (this.state === 'completed') this._saveMeasurement();
        this.logger.log('measurement', { state: this.state, saved: !!this.savedMeasurement }, 0);
        this.renderer.invalidate();
        this.updateHud();
    }

    handleTap(event) {
        if (!this.wantsPointTap()) return false;
        const world = this._getWorldPoint(event);
        if (!world) {
            this.pulse('Tap directly on the drawing');
            return true;
        }

        if (this.state === 'waitingForPointA') {
            this.points = [world];
            this.savedMeasurement = null;
            this.state = 'pointASelected';
        } else if (this.state === 'pointASelected') {
            this.points = [this.points[0], world];
            this.state = 'completed';
            this._saveMeasurement();
        }
        this.logger.log('measurement', { state: this.state, points: this.points.length }, 0);
        this.renderer.invalidate();
        this.updateHud();
        return true;
    }

    draw(ctx) {
        if (this.mode !== 'distance') return;
        const screens = this.points.map(point => this._worldToScreen(point));
        const completed = this.points.length >= 2 &&
            (this.state === 'completed' || (this.state === 'draggingEndpoint' && this.previousState === 'completed'));

        if (completed && screens[0] && screens[1]) {
            this._drawLine(ctx, screens[0], screens[1]);
            this._drawLabel(ctx, (screens[0].x + screens[1].x) / 2, (screens[0].y + screens[1].y) / 2 - 18, `${this.distance().toFixed(2)} m`);
            this._drawHandle(ctx, screens[0], 0);
            this._drawHandle(ctx, screens[1], 1);
            return;
        }

        if (screens[0]) this._drawHandle(ctx, screens[0], 0);
    }

    updateHud() {
        if (this.mode !== 'distance') {
            this.renderer.setHud('', false);
            return;
        }

        let message = 'Tap point A';
        if (this.state === 'pointASelected') message = 'Tap point B';
        if (this.state === 'completed' || (this.state === 'draggingEndpoint' && this.previousState === 'completed')) {
            message = `${this.distance().toFixed(2)} m`;
        }

        this.renderer.setHud(`
            <span style="font-size:0.72rem;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;color:#93c5fd;white-space:nowrap;">Distance</span>
            <span style="font-size:1rem;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap;">${message}</span>
            <button data-mobile-action="clear" style="border:0;border-radius:0.65rem;background:rgba(255,255,255,0.1);color:white;padding:0.45rem 0.6rem;font-weight:900;">Clear</button>
            <button data-mobile-action="close" style="border:0;border-radius:0.65rem;background:rgba(239,68,68,0.18);color:#fecaca;padding:0.45rem 0.6rem;font-weight:900;">X</button>
        `, true);
    }

    pulse(text) {
        this.renderer.setHud(`<span style="font-size:0.9rem;font-weight:900;white-space:nowrap;">${text}</span>`, true);
        clearTimeout(this.pulseTimer);
        this.pulseTimer = setTimeout(() => this.updateHud(), 1100);
    }

    distance() {
        if (this.points.length < 2) return 0;
        const a = this.points[0];
        const b = this.points[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = (b.z || 0) - (a.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    getMeasurement() {
        if (!this.savedMeasurement) return null;
        return {
            id: this.savedMeasurement.id,
            type: 'distance',
            distance: this.savedMeasurement.distance,
            points: this.savedMeasurement.points.map(point => ({ x: point.x, y: point.y, z: point.z || 0 }))
        };
    }

    _saveMeasurement() {
        if (this.points.length < 2) return;
        this.savedMeasurement = {
            id: this.savedMeasurement ? this.savedMeasurement.id : `mobile-distance-${Date.now()}`,
            type: 'distance',
            distance: this.distance(),
            points: this.points.map(point => ({ x: point.x, y: point.y, z: point.z || 0 }))
        };
    }

    _hitHandle(x, y) {
        if (this.points.length < 1) return null;
        const max = this.state === 'completed' || this.previousState === 'completed' ? 1 : 0;
        for (let index = Math.min(max, this.points.length - 1); index >= 0; index -= 1) {
            const screen = this._worldToScreen(this.points[index]);
            if (screen && Math.hypot(screen.x - x, screen.y - y) <= this.hitRadius) return index;
        }
        return null;
    }

    _hitLine(x, y) {
        if (this.state !== 'completed' || this.points.length < 2) return false;
        const a = this._worldToScreen(this.points[0]);
        const b = this._worldToScreen(this.points[1]);
        if (!a || !b) return false;
        return this._pointToSegmentDistance(x, y, a.x, a.y, b.x, b.y) <= 24;
    }

    _getWorldPoint(event) {
        const target = document.getElementById('myCanvas');
        if (!target || !this.viewer || typeof this.viewer.getHitResult !== 'function') return null;
        const rect = target.getBoundingClientRect();
        const payload = {
            clientX: event.clientX,
            clientY: event.clientY,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
        };
        try {
            return this._extractWorldPoint(this.viewer.getHitResult(payload));
        } catch (e) {
            return null;
        }
    }

    _extractWorldPoint(result) {
        const candidates = [
            result,
            result && result.point,
            result && result.position,
            result && result.worldPoint,
            result && result.worldPosition,
            result && result.hitPoint,
            result && result.intersection,
            result && result.data && result.data.point,
            result && result.data && result.data.worldPoint
        ];
        for (const point of candidates) {
            if (point && isFinite(point.x) && isFinite(point.y)) {
                return { x: point.x, y: point.y, z: point.z || 0 };
            }
        }
        if (Array.isArray(result) && result.length >= 2 && isFinite(result[0]) && isFinite(result[1])) {
            return { x: result[0], y: result[1], z: result[2] || 0 };
        }
        return null;
    }

    _worldToScreen(world) {
        if (!this.viewer || typeof this.viewer.worldToScreen !== 'function') return null;
        try {
            const result = this.viewer.worldToScreen(world);
            const raw = Array.isArray(result) ? { x: result[0], y: result[1] } : result;
            if (!raw || !isFinite(raw.x) || !isFinite(raw.y)) return null;
            const target = document.getElementById('myCanvas');
            const rect = target && target.getBoundingClientRect();
            let x = raw.x;
            let y = raw.y;
            if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom && (x > rect.width || y > rect.height)) {
                x -= rect.left;
                y -= rect.top;
            }
            return { x, y };
        } catch (e) {
            return null;
        }
    }

    _drawLine(ctx, a, b) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }

    _drawHandle(ctx, point, index) {
        const color = index === 0 ? '#22d3ee' : '#f59e0b';
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,23,42,0.96)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }

    _drawLabel(ctx, x, y, text) {
        ctx.save();
        ctx.font = '800 13px system-ui, sans-serif';
        const metrics = ctx.measureText(text);
        const width = metrics.width + 22;
        const height = 28;
        const left = Math.max(8, Math.min((this.renderer.width || 0) - width - 8, x - width / 2));
        const top = Math.max(8, y - height / 2);
        ctx.beginPath();
        this._roundRect(ctx, left, top, width, height, 10);
        ctx.fillStyle = 'rgba(15,23,42,0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(56,189,248,0.72)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, left + width / 2, top + height / 2);
        ctx.restore();
    }

    _roundRect(ctx, x, y, width, height, radius) {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
    }

    _pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }
}

class GestureStateMachine {
    constructor(manager) {
        this.manager = manager;
        this.state = 'idle';
        this.pointers = new Map();
        this.tapCandidate = null;
        this.lastPanPoint = null;
        this.lastPinch = null;
        this.velocity = { x: 0, y: 0 };
        this.lastMoveTime = 0;
        this.inertiaFrame = null;
        this.tapSlop = 6;
    }

    pointerDown(event) {
        this.cancelInertia();
        this.pointers.set(event.pointerId, this._point(event));
        this.manager.capturePointer(event.pointerId);

        const local = this.manager.localPoint(event);
        const hit = this.manager.measurement.hitTest(local);
        if (hit && hit.type === 'measurement-handle') {
            this.state = 'draggingEndpoint';
            this.manager.lockNavigation(true);
            this.manager.measurement.beginEndpointDrag(hit.handleIndex);
            this.manager.debugState(this.state);
            return 'capture';
        }

        if (hit && hit.type === 'measurement-line') {
            this.state = 'measurementLocked';
            this.manager.lockNavigation(true);
            this.manager.debugState(this.state);
            return 'capture';
        }

        if (this.pointers.size >= 2) {
            this.state = 'pinching';
            this.manager.lockNavigation(true);
            this.lastPinch = this._pinchInfo();
            this.manager.debugState(this.state);
            return 'capture';
        }

        this.state = 'pendingPan';
        this.tapCandidate = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false
        };
        this.lastPanPoint = this._point(event);
        this.lastMoveTime = performance.now();
        this.velocity = { x: 0, y: 0 };
        this.manager.debugState(this.state);
        return 'capture';
    }

    pointerMove(event) {
        if (!this.pointers.has(event.pointerId)) return 'ignore';
        this.pointers.set(event.pointerId, this._point(event));

        if (this.state === 'draggingEndpoint') {
            this.manager.measurement.dragEndpoint(event);
            return 'capture';
        }

        if (this.state === 'measurementLocked') return 'capture';

        if (this.pointers.size >= 2) {
            if (this.state !== 'pinching') {
                this.state = 'pinching';
                this.lastPinch = this._pinchInfo();
                this.manager.lockNavigation(true);
                this.manager.debugState(this.state);
            }
            return this._handlePinch();
        }

        if (this.state === 'pendingPan' || this.state === 'panning') {
            return this._handlePan(event);
        }

        return 'capture';
    }

    pointerUp(event) {
        if (!this.pointers.has(event.pointerId) && event.pointerId !== (this.tapCandidate && this.tapCandidate.id)) {
            return 'ignore';
        }

        if (this.state === 'draggingEndpoint') {
            this.manager.measurement.endEndpointDrag();
            this.manager.lockNavigation(false);
            this._deletePointer(event.pointerId);
            this.state = 'idle';
            this.manager.debugState(this.state);
            return 'capture';
        }

        if (this.state === 'measurementLocked') {
            this._deletePointer(event.pointerId);
            this.state = 'idle';
            this.manager.lockNavigation(false);
            this.manager.debugState(this.state);
            return 'capture';
        }

        const wasPinching = this.state === 'pinching';
        const wasPanning = this.state === 'panning';
        const tapCandidate = this.tapCandidate;
        this._deletePointer(event.pointerId);

        if (this.pointers.size >= 2) {
            this.state = 'pinching';
            this.lastPinch = this._pinchInfo();
            return 'capture';
        }

        if (this.pointers.size === 1) {
            this.state = 'pendingPan';
            const remaining = Array.from(this.pointers.values())[0];
            this.lastPanPoint = remaining;
            this.lastMoveTime = performance.now();
            this.tapCandidate = null;
            return 'capture';
        }

        if (!wasPinching && tapCandidate && event.pointerId === tapCandidate.id) {
            const moved = tapCandidate.moved || Math.hypot(event.clientX - tapCandidate.startX, event.clientY - tapCandidate.startY) > this.tapSlop;
            if (!moved && this.manager.measurement.wantsPointTap()) {
                this.manager.measurement.handleTap(event);
            } else if (wasPanning) {
                this.startInertia();
            }
        } else if (wasPanning) {
            this.startInertia();
        }

        this.state = 'idle';
        this.tapCandidate = null;
        this.manager.lockNavigation(false);
        this.manager.debugState(this.state);
        return 'capture';
    }

    cancel() {
        this.cancelInertia();
        this.pointers.clear();
        this.tapCandidate = null;
        this.lastPanPoint = null;
        this.lastPinch = null;
        this.state = 'idle';
        this.manager.lockNavigation(false);
        this.manager.debugState(this.state);
    }

    _handlePan(event) {
        const current = this._point(event);
        const last = this.lastPanPoint || current;
        const movedFromStart = this.tapCandidate
            ? Math.hypot(event.clientX - this.tapCandidate.startX, event.clientY - this.tapCandidate.startY)
            : 0;

        if (this.state === 'pendingPan' && movedFromStart > this.tapSlop) {
            this.state = 'panning';
            this.manager.lockNavigation(true);
            if (this.tapCandidate) this.tapCandidate.moved = true;
            this.manager.debugState(this.state);
        }

        if (this.state === 'panning') {
            const now = performance.now();
            const dt = Math.max(8, now - this.lastMoveTime);
            const dx = current.x - last.x;
            const dy = current.y - last.y;
            this.velocity.x = this.velocity.x * 0.72 + (dx / dt) * 0.28;
            this.velocity.y = this.velocity.y * 0.72 + (dy / dt) * 0.28;
            this.manager.camera.panByPixels(dx, dy);
            this.manager.renderer.invalidate();
            this.manager.logger.log('velocity', {
                x: Number((this.velocity.x * 1000).toFixed(1)),
                y: Number((this.velocity.y * 1000).toFixed(1))
            }, 150);
        }

        this.lastPanPoint = current;
        this.lastMoveTime = performance.now();
        return 'capture';
    }

    _handlePinch() {
        const current = this._pinchInfo();
        const last = this.lastPinch || current;
        if (!current || !last || last.distance <= 0) return 'capture';

        const scale = current.distance / last.distance;
        this.manager.camera.zoomAt(current.center.x, current.center.y, scale);
        this.manager.camera.panByPixels(current.center.x - last.center.x, current.center.y - last.center.y);
        this.manager.renderer.invalidate();
        this.lastPinch = current;
        this.velocity = { x: 0, y: 0 };
        return 'capture';
    }

    startInertia() {
        const startVelocity = {
            x: this.velocity.x * 16,
            y: this.velocity.y * 16
        };
        if (Math.hypot(startVelocity.x, startVelocity.y) < 0.25) return;

        let vx = startVelocity.x;
        let vy = startVelocity.y;
        const step = () => {
            vx *= 0.92;
            vy *= 0.92;
            if (Math.hypot(vx, vy) < 0.08) {
                this.inertiaFrame = null;
                return;
            }
            this.manager.camera.panByPixels(vx, vy);
            this.manager.renderer.invalidate();
            this.inertiaFrame = requestAnimationFrame(step);
        };
        this.inertiaFrame = requestAnimationFrame(step);
    }

    cancelInertia() {
        if (this.inertiaFrame) cancelAnimationFrame(this.inertiaFrame);
        this.inertiaFrame = null;
    }

    _pinchInfo() {
        const values = Array.from(this.pointers.values());
        if (values.length < 2) return null;
        const a = values[0];
        const b = values[1];
        return {
            center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
        };
    }

    _point(event) {
        return { x: event.clientX, y: event.clientY, time: performance.now() };
    }

    _deletePointer(pointerId) {
        this.pointers.delete(pointerId);
    }
}

class TouchInteractionManager {
    constructor(viewer, options = {}) {
        this.viewer = viewer;
        this.logger = options.logger || new MobileDebugLogger();
        this.container = options.container || document.getElementById('viewer-container') || document.body;
        this.target = options.target || document.getElementById('myCanvas') || this.container;
        this.navLocked = false;

        if (this.container !== document.body && getComputedStyle(this.container).position === 'static') {
            this.container.style.position = 'relative';
        }

        this.camera = new CameraController(viewer, this.logger);
        this.renderer = new MobileRenderer(this.container, viewer, this.logger);
        this.measurement = new MeasurementInteractionLayer(viewer, this.renderer, this.camera, this.logger);
        this.gestures = new GestureStateMachine(this);
        this.renderer.onDraw = (ctx) => {
            this.renderer.clear();
            this.measurement.draw(ctx);
        };

        this._bind();
        this.applyMobileCss();
        this.camera.setNativeControlsEnabled(false);
        window.getMobileDistanceMeasurement = () => this.measurement.getMeasurement();
    }

    destroy() {
        this.gestures.cancel();
        this.camera.setNativeControlsEnabled(true);
        this._unbind();
        this.renderer.destroy();
    }

    refresh() {
        this.camera.refresh();
        this.renderer.resize();
        this.renderer.invalidate();
    }

    toggleDistanceMode() {
        this.stopSdkMeasurement();
        const active = this.measurement.toggleDistanceMode();
        this.renderer.invalidate();
        return active;
    }

    deactivateDistanceMode() {
        this.measurement.deactivate();
        this.renderer.invalidate();
    }

    clearDistance() {
        this.measurement.clear();
    }

    reset() {
        this.gestures.cancel();
        this.deactivateDistanceMode();
        this.clearDistance();
        this.camera.setNativeControlsEnabled(false);
    }

    stopSdkMeasurement() {
        const plugin = window.measurementPlugin;
        if (plugin && typeof plugin.deactivate === 'function') {
            try { plugin.deactivate(); } catch (e) {}
        }
        if (window.draggableExtension && typeof window.draggableExtension.deactivate === 'function') {
            try { window.draggableExtension.deactivate(); } catch (e) {}
        }
    }

    lockNavigation(locked) {
        this.navLocked = locked;
        this.logger.log('nav-lock', { locked }, 0);
    }

    capturePointer(pointerId) {
        if (!this.container.setPointerCapture) return;
        try { this.container.setPointerCapture(pointerId); } catch (e) {}
    }

    releasePointer(pointerId) {
        if (!this.container.releasePointerCapture) return;
        try { this.container.releasePointerCapture(pointerId); } catch (e) {}
    }

    localPoint(event) {
        const rect = this.target.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    debugState(state) {
        this.logger.log('state', {
            state,
            pointers: this.gestures ? this.gestures.pointers.size : 0,
            measurement: this.measurement.state
        }, 0);
    }

    applyMobileCss() {
        const nodes = [document.documentElement, document.body, this.container, this.target];
        nodes.forEach(node => {
            if (!node || !node.style) return;
            node.style.touchAction = 'none';
            node.style.overscrollBehavior = 'none';
            node.style.webkitUserSelect = 'none';
            node.style.userSelect = 'none';
            node.style.webkitTouchCallout = 'none';
        });
        document.documentElement.classList.add('mobile-touch-managed');
        document.body.classList.add('mobile-touch-managed');
    }

    _bind() {
        this.onPointerDown = (event) => this._handlePointer('pointerDown', event);
        this.onPointerMove = (event) => this._handlePointer('pointerMove', event);
        this.onPointerUp = (event) => this._handlePointer('pointerUp', event);
        this.onPointerCancel = (event) => this._handlePointer('pointerUp', event);
        this.onResize = () => this.refresh();
        this.onHudPointerDown = (event) => {
            const action = event.target && event.target.getAttribute('data-mobile-action');
            if (action === 'clear') this.clearDistance();
            if (action === 'close') this.deactivateDistanceMode();
            this._consume(event);
        };

        this.container.addEventListener('pointerdown', this.onPointerDown, { capture: true, passive: false });
        this.container.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: false });
        this.container.addEventListener('pointerup', this.onPointerUp, { capture: true, passive: false });
        this.container.addEventListener('pointercancel', this.onPointerCancel, { capture: true, passive: false });
        this.renderer.hud.addEventListener('pointerdown', this.onHudPointerDown, { passive: false });
        window.addEventListener('resize', this.onResize, { passive: true });
        if (this.viewer && typeof this.viewer.addEventListener === 'function') {
            this.onCameraChange = () => this.renderer.invalidate();
            try { this.viewer.addEventListener('CameraChange', this.onCameraChange); } catch (e) {}
        }
    }

    _unbind() {
        this.container.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
        this.container.removeEventListener('pointermove', this.onPointerMove, { capture: true });
        this.container.removeEventListener('pointerup', this.onPointerUp, { capture: true });
        this.container.removeEventListener('pointercancel', this.onPointerCancel, { capture: true });
        this.renderer.hud.removeEventListener('pointerdown', this.onHudPointerDown);
        window.removeEventListener('resize', this.onResize);
        if (this.viewer && this.onCameraChange && typeof this.viewer.removeEventListener === 'function') {
            try { this.viewer.removeEventListener('CameraChange', this.onCameraChange); } catch (e) {}
        }
    }

    _handlePointer(method, event) {
        if (!this._shouldOwnEvent(event)) return;
        const result = this.gestures[method](event);
        if (result === 'capture') {
            if (method === 'pointerUp') this.releasePointer(event.pointerId);
            this._consume(event);
        }
    }

    _shouldOwnEvent(event) {
        if (event.pointerType === 'mouse') return false;
        const activePointer = this.gestures && this.gestures.pointers.has(event.pointerId);
        if (activePointer) return true;
        if (this._isUiEvent(event)) return false;
        if (!this._isInsideTarget(event)) return false;
        return true;
    }

    _isUiEvent(event) {
        return !!(event.target && event.target.closest && event.target.closest(
            '#viewer-toolbar, #viewer-header, #mobile-touch-hud, button, input, select, textarea, a'
        ));
    }

    _isInsideTarget(event) {
        const rect = this.target.getBoundingClientRect();
        return event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;
    }

    _consume(event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }
}

window.TouchInteractionManager = TouchInteractionManager;
