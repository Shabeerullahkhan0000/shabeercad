class MobileDistanceOverlay {
    constructor(viewer) {
        this.viewer = viewer;
        this.enabled = false;
        this.state = 'idle';
        this.previousState = 'idle';
        this.points = [];
        this.savedMeasurement = null;
        this.dragIndex = null;
        this.pointerId = null;
        this.tapCandidate = null;
        this.lineTouchActive = false;
        this.renderTimer = null;
        this.hitRadius = 34;
        this.lineHitRadius = 24;
        this.tapSlop = 6;

        this.canvas = document.createElement('canvas');
        this.canvas.id = 'mobile-distance-overlay';
        Object.assign(this.canvas.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            zIndex: '1100',
            pointerEvents: 'none',
            touchAction: 'none'
        });

        this.hud = document.createElement('div');
        this.hud.id = 'mobile-distance-hud';
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

        const container = document.getElementById('viewer-container');
        if (container && getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        this.container = container || document.body;
        this.container.appendChild(this.canvas);
        this.container.appendChild(this.hud);
        this.ctx = this.canvas.getContext('2d');

        window.getMobileDistanceMeasurement = () => this.savedMeasurement
            ? this._copyMeasurement(this.savedMeasurement)
            : null;

        this._bindEvents();
        this._syncCanvas();
    }

    activate() {
        this.enabled = true;
        this.canvas.style.display = 'block';
        this.state = this.points.length >= 2
            ? 'completed'
            : this.points.length === 1
                ? 'pointASelected'
                : 'waitingForPointA';
        this._startRenderLoop();
        this._render();
        this._updateHUD();
    }

    deactivate() {
        this.enabled = false;
        this.state = 'idle';
        this.previousState = 'idle';
        this.dragIndex = null;
        this.pointerId = null;
        this.tapCandidate = null;
        this.lineTouchActive = false;
        this._setControlsEnabled(true);
        this._stopRenderLoop();
        this._render();
        this._updateHUD();
    }

    toggle() {
        if (this.enabled) this.deactivate();
        else this.activate();
        return this.enabled;
    }

    clear() {
        this.points = [];
        this.savedMeasurement = null;
        this.dragIndex = null;
        this.pointerId = null;
        this.tapCandidate = null;
        this.lineTouchActive = false;
        this.state = this.enabled ? 'waitingForPointA' : 'idle';
        this._setControlsEnabled(true);
        this._render();
        this._updateHUD();
    }

    _bindEvents() {
        this._onPointerDown = this._handlePointerDown.bind(this);
        this._onPointerMove = this._handlePointerMove.bind(this);
        this._onPointerUp = this._handlePointerUp.bind(this);
        this._onResize = () => {
            this._syncCanvas();
            this._render();
        };

        this.container.addEventListener('pointerdown', this._onPointerDown, { capture: true, passive: false });
        this.container.addEventListener('pointermove', this._onPointerMove, { capture: true, passive: false });
        this.container.addEventListener('pointerup', this._onPointerUp, { capture: true, passive: false });
        this.container.addEventListener('pointercancel', this._onPointerUp, { capture: true, passive: false });
        window.addEventListener('resize', this._onResize);

        this.hud.addEventListener('pointerdown', (event) => {
            const action = event.target && event.target.getAttribute('data-action');
            if (action === 'clear') this.clear();
            if (action === 'close') this.deactivate();
            this._consume(event);
        });
    }

    _handlePointerDown(event) {
        if (!this._shouldHandlePointer(event)) return;

        this._syncCanvas();
        const local = this._localPoint(event);
        const handleIndex = this._hitHandle(local.x, local.y);

        if (handleIndex !== null) {
            this.previousState = this.state;
            this.state = 'draggingEndpoint';
            this.dragIndex = handleIndex;
            this.pointerId = event.pointerId;
            this.tapCandidate = null;
            this._setControlsEnabled(false);
            this._capturePointer(event);
            this._consume(event);
            this._render();
            this._updateHUD();
            return;
        }

        if (this._hitMeasurementLine(local.x, local.y)) {
            this.pointerId = event.pointerId;
            this.lineTouchActive = true;
            this._setControlsEnabled(false);
            this._capturePointer(event);
            this._consume(event);
            return;
        }

        if (this.state === 'waitingForPointA' || this.state === 'pointASelected') {
            this.tapCandidate = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                moved: false
            };
        }
    }

    _handlePointerMove(event) {
        if (!this.enabled || event.isPrimary === false) return;

        if (this.state === 'draggingEndpoint' && event.pointerId === this.pointerId) {
            this._consume(event);
            const world = this._getWorldPoint(event);
            if (!world) return;
            this.points[this.dragIndex] = world;
            if (this.previousState === 'completed') this._saveMeasurement();
            this._render();
            this._updateHUD();
            return;
        }

        if (this.lineTouchActive && event.pointerId === this.pointerId) {
            this._consume(event);
            return;
        }

        if (this.tapCandidate && event.pointerId === this.tapCandidate.pointerId) {
            const moved = Math.hypot(
                event.clientX - this.tapCandidate.startX,
                event.clientY - this.tapCandidate.startY
            );
            if (moved > this.tapSlop) this.tapCandidate.moved = true;
        }
    }

    _handlePointerUp(event) {
        if (!this.enabled) return;

        if (this.state === 'draggingEndpoint' && event.pointerId === this.pointerId) {
            this._consume(event);
            this.state = this.previousState === 'pointASelected' ? 'pointASelected' : 'completed';
            this.previousState = this.state;
            this.dragIndex = null;
            this.pointerId = null;
            this._setControlsEnabled(true);
            this._releasePointer(event);
            if (this.state === 'completed') this._saveMeasurement();
            this._render();
            this._updateHUD();
            return;
        }

        if (this.lineTouchActive && event.pointerId === this.pointerId) {
            this._consume(event);
            this.lineTouchActive = false;
            this.pointerId = null;
            this._setControlsEnabled(true);
            this._releasePointer(event);
            return;
        }

        if (!this.tapCandidate || event.pointerId !== this.tapCandidate.pointerId) return;

        const candidate = this.tapCandidate;
        this.tapCandidate = null;
        const moved = candidate.moved || Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) > this.tapSlop;
        if (moved) return;

        const world = this._getWorldPoint(event);
        if (!world) {
            this._pulseHUD('Tap directly on the drawing');
            return;
        }

        if (this.state === 'waitingForPointA') {
            this.points = [world];
            this.savedMeasurement = null;
            this.state = 'pointASelected';
            this._render();
            this._updateHUD();
            return;
        }

        if (this.state === 'pointASelected') {
            this.points = [this.points[0], world];
            this.state = 'completed';
            this._saveMeasurement();
            this._render();
            this._updateHUD();
        }
    }

    _shouldHandlePointer(event) {
        if (!this.enabled || event.pointerType === 'mouse') return false;
        if (event.isPrimary === false) return false;
        if (!this._isInsideViewer(event)) return false;
        if (this._isUiEvent(event)) return false;
        return true;
    }

    _isUiEvent(event) {
        return !!(event.target && event.target.closest && event.target.closest(
            '#viewer-toolbar, #viewer-header, #mobile-distance-hud, button, input, select, textarea, a'
        ));
    }

    _isInsideViewer(event) {
        const target = document.getElementById('myCanvas');
        if (!target) return false;
        const rect = target.getBoundingClientRect();
        return event.clientX >= rect.left &&
            event.clientX <= rect.right &&
            event.clientY >= rect.top &&
            event.clientY <= rect.bottom;
    }

    _syncCanvas() {
        const target = document.getElementById('myCanvas');
        if (!target || !this.ctx) return;

        const rect = target.getBoundingClientRect();
        const containerRect = this.canvas.parentElement
            ? this.canvas.parentElement.getBoundingClientRect()
            : { left: 0, top: 0 };
        const dpr = window.devicePixelRatio || 1;

        this.canvas.style.left = `${rect.left - containerRect.left}px`;
        this.canvas.style.top = `${rect.top - containerRect.top}px`;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;
        this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
        this.width = rect.width;
        this.height = rect.height;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
    }

    _localPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    _hitHandle(x, y) {
        if (this.points.length < 1) return null;
        const maxIndex = this.state === 'completed' ? 1 : 0;
        for (let i = Math.min(maxIndex, this.points.length - 1); i >= 0; i--) {
            const screen = this._worldToScreen(this.points[i]);
            if (screen && Math.hypot(screen.x - x, screen.y - y) <= this.hitRadius) return i;
        }
        return null;
    }

    _hitMeasurementLine(x, y) {
        if (this.state !== 'completed' || this.points.length < 2) return false;
        const a = this._worldToScreen(this.points[0]);
        const b = this._worldToScreen(this.points[1]);
        if (!a || !b) return false;
        return this._pointToSegmentDistance(x, y, a.x, a.y, b.x, b.y) <= this.lineHitRadius;
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
        } catch (err) {
            console.warn('MobileDistanceOverlay: getHitResult failed', err);
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
            const raw = Array.isArray(result)
                ? { x: result[0], y: result[1] }
                : result;
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

    _saveMeasurement() {
        if (this.points.length < 2) return;
        this.savedMeasurement = {
            id: this.savedMeasurement ? this.savedMeasurement.id : `mobile-distance-${Date.now()}`,
            type: 'distance',
            points: this.points.map(point => ({ x: point.x, y: point.y, z: point.z || 0 })),
            distance: this._distance()
        };
    }

    _copyMeasurement(measurement) {
        return {
            id: measurement.id,
            type: measurement.type,
            distance: measurement.distance,
            points: measurement.points.map(point => ({ x: point.x, y: point.y, z: point.z || 0 }))
        };
    }

    _distance() {
        if (this.points.length < 2) return 0;
        const a = this.points[0];
        const b = this.points[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = (b.z || 0) - (a.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    _render() {
        if (!this.ctx) return;
        this._syncCanvas();
        this.ctx.clearRect(0, 0, this.width || 0, this.height || 0);
        if (!this.enabled) return;

        const screens = this.points.map(point => this._worldToScreen(point));
        const drawingCompleted = this.points.length >= 2 &&
            (this.state === 'completed' || (this.state === 'draggingEndpoint' && this.previousState === 'completed'));
        const drawingPointAOnly = this.points.length >= 1 && !drawingCompleted;

        if (drawingCompleted && screens[0] && screens[1]) {
            this._drawLine(screens[0], screens[1]);
            this._drawLabel(
                (screens[0].x + screens[1].x) / 2,
                (screens[0].y + screens[1].y) / 2 - 18,
                `${this._distance().toFixed(2)} m`
            );
            this._drawHandle(screens[0], 0);
            this._drawHandle(screens[1], 1);
            return;
        }

        if (drawingPointAOnly && screens[0]) {
            this._drawHandle(screens[0], 0);
        }
    }

    _drawLine(a, b) {
        this.ctx.save();
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.shadowColor = 'rgba(0,0,0,0.55)';
        this.ctx.shadowBlur = 8;
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        this.ctx.restore();
    }

    _drawHandle(point, index) {
        const color = index === 0 ? '#22d3ee' : '#f59e0b';
        this.ctx.save();
        this.ctx.shadowColor = 'rgba(0,0,0,0.45)';
        this.ctx.shadowBlur = 10;
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, 13, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(15,23,42,0.96)';
        this.ctx.fill();
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = color;
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.restore();
    }

    _drawLabel(x, y, text) {
        this.ctx.save();
        this.ctx.font = '800 13px system-ui, sans-serif';
        const metrics = this.ctx.measureText(text);
        const width = metrics.width + 22;
        const height = 28;
        const left = Math.max(8, Math.min((this.width || 0) - width - 8, x - width / 2));
        const top = Math.max(8, y - height / 2);

        this.ctx.beginPath();
        this._roundRect(left, top, width, height, 10);
        this.ctx.fillStyle = 'rgba(15,23,42,0.94)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(56,189,248,0.72)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, left + width / 2, top + height / 2);
        this.ctx.restore();
    }

    _roundRect(x, y, width, height, radius) {
        this.ctx.moveTo(x + radius, y);
        this.ctx.lineTo(x + width - radius, y);
        this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.ctx.lineTo(x + width, y + height - radius);
        this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.ctx.lineTo(x + radius, y + height);
        this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.ctx.lineTo(x, y + radius);
        this.ctx.quadraticCurveTo(x, y, x + radius, y);
    }

    _updateHUD() {
        if (!this.enabled) {
            this.hud.style.display = 'none';
            return;
        }

        let message = 'Tap point A';
        if (this.state === 'pointASelected') message = 'Tap point B';
        if (this.state === 'completed' || (this.state === 'draggingEndpoint' && this.previousState === 'completed')) {
            message = `${this._distance().toFixed(2)} m`;
        }
        if (this.state === 'draggingEndpoint' && this.previousState === 'pointASelected') {
            message = 'Move point A';
        }

        this.hud.style.display = 'flex';
        this.hud.innerHTML = `
            <span style="font-size:0.72rem;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;color:#93c5fd;white-space:nowrap;">Distance</span>
            <span style="font-size:1rem;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap;">${message}</span>
            <button data-action="clear" style="border:0;border-radius:0.65rem;background:rgba(255,255,255,0.1);color:white;padding:0.45rem 0.6rem;font-weight:900;">Clear</button>
            <button data-action="close" style="border:0;border-radius:0.65rem;background:rgba(239,68,68,0.18);color:#fecaca;padding:0.45rem 0.6rem;font-weight:900;">X</button>
        `;
    }

    _pulseHUD(text) {
        if (!this.enabled) return;
        this.hud.style.display = 'flex';
        this.hud.innerHTML = `<span style="font-size:0.9rem;font-weight:900;white-space:nowrap;">${text}</span>`;
        window.clearTimeout(this._hudPulseTimer);
        this._hudPulseTimer = window.setTimeout(() => this._updateHUD(), 1200);
    }

    _setControlsEnabled(enabled) {
        try {
            const manager = this.viewer && typeof this.viewer.getCameraManager === 'function'
                ? this.viewer.getCameraManager()
                : null;
            const controls = manager && (manager.cameraControls || manager.controls || manager._controls);
            if (controls) {
                controls.enabled = enabled;
                if (!enabled && typeof controls.stop === 'function') controls.stop();
            }
        } catch (e) {}
    }

    _capturePointer(event) {
        if (this.container.setPointerCapture) {
            try { this.container.setPointerCapture(event.pointerId); } catch (e) {}
        }
    }

    _releasePointer(event) {
        if (this.container.releasePointerCapture) {
            try { this.container.releasePointerCapture(event.pointerId); } catch (e) {}
        }
    }

    _pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }

    _startRenderLoop() {
        if (this.renderTimer) return;
        this.renderTimer = window.setInterval(() => this._render(), 250);
    }

    _stopRenderLoop() {
        if (this.renderTimer) window.clearInterval(this.renderTimer);
        this.renderTimer = null;
    }

    _consume(event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }
}

window.MobileDistanceOverlay = MobileDistanceOverlay;
