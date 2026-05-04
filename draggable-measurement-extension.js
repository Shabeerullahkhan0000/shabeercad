/**
 * draggable-measurement-extension.js
 * 
 * Purpose: Professional CAD-grade draggable measurement handles for @x-viewer/core.
 * Usage: Add to index.html/dxf_0.html after Viewer and MeasurementPlugin initialization.
 */

class DraggableMeasurementExtension {
    constructor(viewer, measurementPlugin) {
        if (!viewer || !measurementPlugin) {
            console.error('DraggableMeasurementExtension: Viewer and MeasurementPlugin are required.');
            return;
        }

        this.viewer = viewer;
        this.measurementPlugin = measurementPlugin;
        this.allMeasurements = [];
        this.storedMeasurement = null;
        this.p1World = null;
        this.p2World = null;

        // UI State
        this.canvas = null;
        this.ctx = null;
        this.hud = null;
        this.draggingPoint = null; // 'p1' or 'p2'
        this.state = 'IDLE'; // 'IDLE', 'DRAGGING', 'COMPLETE'
        this.lastValidP1World = null;
        this.lastValidP2World = null;

        // Pointer tracking
        this.activePointers = new Map();
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.hasMovedEnough = false;

        // Config
        this.units = ['m', 'cm', 'mm', 'ft', 'ft-in'];
        this.currentUnitIndex = 0;
        this.deviceConfig = this._getDeviceConfig();

        this._init();
    }

    _getDeviceConfig() {
        const width = window.innerWidth;
        if (width < 768) {
            return { handleRadius: 24, hitRadius: 36, minDrag: 8 };
        } else if (width <= 1024) {
            return { handleRadius: 18, hitRadius: 28, minDrag: 6 };
        } else {
            return { handleRadius: 10, hitRadius: 14, minDrag: 4 };
        }
    }

    _init() {
        this._setupOverlay();
        this._setupHUD();
        this._attachEvents();
        this._setupResizeObserver();
    }

    destroy() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }

        if (this.canvas) {
            this.canvas.removeEventListener('pointerdown', this._boundPointerDown);
            this.canvas.remove();
        }

        if (this.hud) {
            this.hud.remove();
        }

        window.removeEventListener('pointermove', this._boundPointerMove, { capture: true });
        window.removeEventListener('pointerup', this._boundPointerUp, { capture: true });
        window.removeEventListener('pointercancel', this._boundPointerUp, { capture: true });
        window.removeEventListener('resize', this._boundResize);

        const addEvents = ['MeasurementAdd', 'measurementadd', 'AddMeasurement', 'addmeasurement'];
        if (window.ViewerEvent && window.ViewerEvent.MeasurementAdd) addEvents.push(window.ViewerEvent.MeasurementAdd);
        addEvents.forEach(ev => {
            if (this.viewer && this.viewer.removeEventListener) this.viewer.removeEventListener(ev, this._boundHandleMeasurement);
            if (this.measurementPlugin && this.measurementPlugin.removeEventListener) {
                this.measurementPlugin.removeEventListener(ev, this._boundHandleMeasurement);
            }
        });

        const camEvents = ['CameraChange', 'camerachange'];
        if (window.ViewerEvent && window.ViewerEvent.CameraChange) camEvents.push(window.ViewerEvent.CameraChange);
        camEvents.forEach(ev => {
            if (this.viewer && this.viewer.removeEventListener) this.viewer.removeEventListener(ev, this._boundRedrawOnCamera);
        });
        
        const myCanvas = document.getElementById('myCanvas');
        if (myCanvas) {
            myCanvas.removeEventListener('pointerdown', this._boundMyCanvasPointerDown, true);
        }
    }

    _setupOverlay() {
        this.canvas = document.getElementById('drag-overlay');
        if (this.canvas) {
            this.canvas.remove();
        }
        
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'drag-overlay';
        Object.assign(this.canvas.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: '1000',
            pointerEvents: 'none',
            imageRendering: 'crisp-edges'
        });
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this._syncCanvasSize();
    }

    _syncCanvasSize() {
        const viewerTarget = document.getElementById('myCanvas');
        if (!viewerTarget || !this.ctx) return;
        const rect = viewerTarget.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0 || !isFinite(rect.width) || !isFinite(rect.height)) return;
        
        const dpr = Math.max(1, window.devicePixelRatio || 1);

        this.canvas.style.top = `${rect.top}px`;
        this.canvas.style.left = `${rect.left}px`;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        const maxWidth = 4096;
        const maxHeight = 4096;
        
        const width = Math.min(maxWidth, rect.width * dpr);
        const height = Math.min(maxHeight, rect.height * dpr);

        this.logicalWidth = rect.width;
        this.logicalHeight = rect.height;

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }
        
        // Reset transform before scaling to avoid accumulation
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        const scaleX = Math.min(maxWidth / (rect.width || 1), dpr);
        const scaleY = Math.min(maxHeight / (rect.height || 1), dpr);
        
        if (isFinite(scaleX) && isFinite(scaleY) && scaleX > 0 && scaleY > 0) {
            this.ctx.scale(scaleX, scaleY);
        }
        
        this._redrawHandles();
    }

    _setupResizeObserver() {
        const viewerTarget = document.getElementById('myCanvas');
        if (!viewerTarget) return;

        let resizeTask = null;
        this._resizeObserver = new ResizeObserver(() => {
            if (resizeTask) cancelAnimationFrame(resizeTask);
            resizeTask = requestAnimationFrame(() => {
                this._syncCanvasSize();
                this.deviceConfig = this._getDeviceConfig();
            });
        });
        this._resizeObserver.observe(viewerTarget);
        
        this._boundResize = () => {
            if (resizeTask) cancelAnimationFrame(resizeTask);
            resizeTask = requestAnimationFrame(() => {
                this._syncCanvasSize();
                this.deviceConfig = this._getDeviceConfig();
            });
        };
        window.addEventListener('resize', this._boundResize);
    }

    _setupHUD() {
        this.hud = document.getElementById('drag-hud');
        if (!this.hud) {
            this.hud = document.createElement('div');
            this.hud.id = 'drag-hud';
            document.body.appendChild(this.hud);
        }
        
        Object.assign(this.hud.style, {
            position: 'fixed',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '12px 20px',
            color: 'white',
            fontFamily: 'SF Mono, Menlo, monospace',
            fontSize: '14px',
            display: 'none',
            flexDirection: 'column',
            gap: '6px',
            zIndex: '1001',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            userSelect: 'none',
            transition: 'opacity 0.2s ease-out'
        });

        this.hud.addEventListener('mousedown', (e) => {
            const isBadge = e.target.closest('.unit-badge');
            if (isBadge) {
                this.currentUnitIndex = (this.currentUnitIndex + 1) % this.units.length;
                this._updateHUDContent();
            } else {
                const val = this.hud.querySelector('.main-value')?.textContent;
                if (val) {
                    navigator.clipboard.writeText(val).then(() => {
                        const originalColor = this.hud.style.color;
                        this.hud.style.color = '#00E5FF';
                        setTimeout(() => this.hud.style.color = originalColor, 500);
                    });
                }
            }
        });
        document.body.appendChild(this.hud);
    }

    _attachEvents() {
        // SDK Measurement Event Interception
        this._boundHandleMeasurement = (e) => {
            const data = e.detail || e.measurement || e;
            const type = data.type || (data.data?.type);
            const points = data.points || (data.data?.points);

            if (type === 'distance' && points && Array.isArray(points) && points.length >= 2) {
                this.storedMeasurement = data.data || data;
                this.p1World = { x: points[0].x, y: points[0].y, z: points[0].z || 0 };
                this.p2World = { x: points[1].x, y: points[1].y, z: points[1].z || 0 };
                this.state = 'COMPLETE';
                
                // Track all measurements to prevent wiping
                if (typeof this.measurementPlugin.getMeasurements === 'function') {
                    this.allMeasurements = this.measurementPlugin.getMeasurements();
                } else if (Array.isArray(this.measurementPlugin.measurements)) {
                    this.allMeasurements = [...this.measurementPlugin.measurements];
                }

                this.hud.style.display = 'flex';
                this.hud.style.opacity = '1';
                this._redrawHandles();
                this._updateHUDContent();
            }
        };

        // Support various event names and targets (Viewer or Plugin)
        const addEvents = ['MeasurementAdd', 'measurementadd', 'AddMeasurement', 'addmeasurement'];
        if (window.ViewerEvent && window.ViewerEvent.MeasurementAdd) addEvents.push(window.ViewerEvent.MeasurementAdd);
        
        addEvents.forEach(ev => {
            this.viewer.addEventListener(ev, this._boundHandleMeasurement);
            if (this.measurementPlugin.addEventListener) {
                this.measurementPlugin.addEventListener(ev, this._boundHandleMeasurement);
            }
        });

        // Camera Sync
        this._boundRedrawOnCamera = () => {
            if (this.state !== 'IDLE') this._redrawHandles();
        };
        const camEvents = ['CameraChange', 'camerachange'];
        if (window.ViewerEvent && window.ViewerEvent.CameraChange) camEvents.push(window.ViewerEvent.CameraChange);
        camEvents.forEach(ev => this.viewer.addEventListener(ev, this._boundRedrawOnCamera));

        // Pointer Events
        this._boundPointerDown = (e) => this._onPointerDown(e);
        this._boundPointerMove = (e) => this._onPointerMove(e);
        this._boundPointerUp = (e) => this._onPointerUp(e);

        this.canvas.addEventListener('pointerdown', this._boundPointerDown);
        window.addEventListener('pointermove', this._boundPointerMove, { capture: true });
        window.addEventListener('pointerup', this._boundPointerUp, { capture: true });
        window.addEventListener('pointercancel', this._boundPointerUp, { capture: true });

        // Ensure canvas can capture clicks when it should
        this._boundMyCanvasPointerDown = (e) => {
            if (this.state === 'IDLE') return;
            const hit = this._hitTest(e);
            if (hit) {
                this.canvas.style.pointerEvents = 'auto';
                const newEvent = new PointerEvent('pointerdown', e);
                this.canvas.dispatchEvent(newEvent);
            }
        };
        const myCanvas = document.getElementById('myCanvas');
        if (myCanvas) {
            myCanvas.addEventListener('pointerdown', this._boundMyCanvasPointerDown, true);
        }
    }

    _redrawHandles() {
        if (!this.ctx || this.state === 'IDLE') return;
        
        // Use logical dimensions for clearing if available, otherwise fallback
        const w = this.logicalWidth || (this.canvas.width / (window.devicePixelRatio || 1));
        const h = this.logicalHeight || (this.canvas.height / (window.devicePixelRatio || 1));
        
        if (isFinite(w) && isFinite(h) && w > 0 && h > 0) {
            this.ctx.clearRect(0, 0, w, h);
        }

        const s1 = this._worldToScreen(this.p1World);
        const s2 = this._worldToScreen(this.p2World);

        if (!s1 || !s2) return;

        // Main line (optional, since SDK draws it, but good for visual continuity during drag)
        if (this.state === 'DRAGGING') {
            this.ctx.beginPath();
            this.ctx.moveTo(s1.x, s1.y);
            this.ctx.lineTo(s2.x, s2.y);
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        this._drawHandle(s1, '#00E5FF', this.draggingPoint === 'p1');
        this._drawHandle(s2, '#FF9F1C', this.draggingPoint === 'p2');
    }

    _drawHandle(pos, color, active) {
        if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return;
        const r = active ? this.deviceConfig.handleRadius * 1.4 : this.deviceConfig.handleRadius;
        if (!isFinite(r) || r <= 0) return;
        
        this.ctx.save();
        this.ctx.shadowBlur = active ? 20 : 8;
        this.ctx.shadowColor = color;
        
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, r - (active ? 4 : 2), 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = active ? 3 : 2;
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    _worldToScreen(worldPoint) {
        if (!worldPoint || !isFinite(worldPoint.x) || !isFinite(worldPoint.y)) return null;
        
        // 1. SDK Primary
        if (typeof this.viewer.worldToScreen === 'function') {
            try {
                const res = this.viewer.worldToScreen(worldPoint);
                if (res && isFinite(res.x) && isFinite(res.y)) return this._clampToScreen(res);
            } catch(err) {}
        }

        // 2. Fallback Three.js
        if (window.THREE && this.viewer.camera) {
            try {
                const v = new window.THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z || 0);
                v.project(this.viewer.camera);
                
                const viewerTarget = document.getElementById('myCanvas');
                const rect = viewerTarget ? viewerTarget.getBoundingClientRect() : null;
                
                if (rect && rect.width > 0 && rect.height > 0) {
                    return this._clampToScreen({
                        x: (v.x + 1) * rect.width / 2,
                        y: (-v.y + 1) * rect.height / 2
                    });
                }
            } catch(err) {}
        }
        
        // 3. Last Ditch
        if (typeof this.viewer.modelToClient === 'function') {
            try {
                const res = this.viewer.modelToClient(worldPoint);
                if (res && isFinite(res.x) && isFinite(res.y)) return this._clampToScreen(res);
            } catch(err) {}
        }

        return null;
    }

    _clampToScreen(pos) {
        if (!pos) return { x: 0, y: 0 };
        const viewerTarget = document.getElementById('myCanvas');
        if (!viewerTarget) return { x: pos.x || 0, y: pos.y || 0 };
        const rect = viewerTarget.getBoundingClientRect();
        
        const x = isFinite(pos.x) ? pos.x : 0;
        const y = isFinite(pos.y) ? pos.y : 0;
        const w = (rect && isFinite(rect.width) && rect.width > 0) ? rect.width : 1;
        const h = (rect && isFinite(rect.height) && rect.height > 0) ? rect.height : 1;

        return {
            x: Math.max(0, Math.min(w, x)),
            y: Math.max(0, Math.min(h, y))
        };
    }

    _hitTest(e) {
        if (!this.p1World || !this.p2World) return null;
        
        const rect = document.getElementById('myCanvas').getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const s1 = this._worldToScreen(this.p1World);
        const s2 = this._worldToScreen(this.p2World);

        if (s1 && Math.hypot(mouseX - s1.x, mouseY - s1.y) < this.deviceConfig.hitRadius) return 'p1';
        if (s2 && Math.hypot(mouseX - s2.x, mouseY - s2.y) < this.deviceConfig.hitRadius) return 'p2';
        
        return null;
    }

    _onPointerDown(e) {
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Pinch Cancel
        if (this.activePointers.size > 1) {
            this._cancelDrag();
            return;
        }

        const hit = this._hitTest(e);
        if (hit) {
            this.draggingPoint = hit;
            this.state = 'DRAGGING';
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.hasMovedEnough = false;
        this.lastValidP1World = this.p1World ? { ...this.p1World } : null;
        this.lastValidP2World = this.p2World ? { ...this.p2World } : null;
            
            this.canvas.setPointerCapture(e.pointerId);
            this.canvas.style.pointerEvents = 'auto';
            document.body.style.cursor = 'grabbing';
            e.stopPropagation();
            e.preventDefault();
        }
    }

    _onPointerMove(e) {
        if (this.state !== 'DRAGGING' && this.state !== 'IDLE') {
            const hit = this._hitTest(e);
            document.body.style.cursor = hit ? 'grab' : '';
            return;
        }

        if (this.state !== 'DRAGGING') return;

        if (!this.hasMovedEnough) {
            const dist = Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY);
            if (dist > this.deviceConfig.minDrag) {
                this.hasMovedEnough = true;
            } else {
                return;
            }
        }

        // Determine hit result from SDK
        let hitResult = null;
        try {
            // Some versions take (x,y), some take the event object
            hitResult = this.viewer.getHitResult(e);
        } catch(err) {}

        if (hitResult && isFinite(hitResult.x) && isFinite(hitResult.y)) {
            if (this.draggingPoint === 'p1') {
                this.p1World = { x: hitResult.x, y: hitResult.y, z: hitResult.z || 0 };
            } else {
                this.p2World = { x: hitResult.x, y: hitResult.y, z: hitResult.z || 0 };
            }

            this._redrawHandles();
            this._updateHUDContent();
            e.stopPropagation();
            e.preventDefault();
        }
    }

    _onPointerUp(e) {
        this.activePointers.delete(e.pointerId);

        if (this.state === 'DRAGGING') {
            this.canvas.releasePointerCapture(e.pointerId);
            this.canvas.style.pointerEvents = 'none';
            this._syncToSDK();
            this.state = 'COMPLETE';
            this.draggingPoint = null;
            document.body.style.cursor = '';
            e.stopPropagation();
        }
    }

    _cancelDrag() {
        if (this.state === 'DRAGGING') {
            this.p1World = this.lastValidP1World;
            this.p2World = this.lastValidP2World;
            this.state = 'COMPLETE';
            this.draggingPoint = null;
            this.canvas.style.pointerEvents = 'none';
            document.body.style.cursor = '';
            this._redrawHandles();
            this._updateHUDContent();
        }
    }

    deactivate() {
        this.state = 'IDLE';
        this.storedMeasurement = null;
        this.p1World = null;
        this.p2World = null;
        if (this.hud) this.hud.style.display = 'none';
        if (this.canvas) {
            this.canvas.style.pointerEvents = 'none';
            this._redrawHandles();
        }
    }

    _syncToSDK() {
        if (!this.storedMeasurement) return;

        try {
            // Immutable modification
            const updated = {
                ...this.storedMeasurement,
                points: [this.p1World, this.p2World]
            };

            // Update local registry
            const idx = this.allMeasurements.findIndex(m => m === this.storedMeasurement);
            if (idx !== -1) {
                this.allMeasurements[idx] = updated;
            } else {
                // Remove any with same type/points if identity lost
                this.allMeasurements = this.allMeasurements.filter(m => m !== this.storedMeasurement);
                this.allMeasurements.push(updated);
            }
            this.storedMeasurement = updated;

            // Re-inject
            if (typeof this.measurementPlugin.setMeasurements === 'function') {
                this.measurementPlugin.setMeasurements(this.allMeasurements);
            } else if (this.measurementPlugin.clear && this.measurementPlugin.addMeasurement) {
                this.measurementPlugin.clear();
                this.allMeasurements.forEach(m => this.measurementPlugin.addMeasurement(m));
            }
        } catch(err) {
            console.error('DraggableMeasurementExtension: SDK Sync Error', err);
        }

        requestAnimationFrame(() => this._redrawHandles());
    }

    _updateHUDContent() {
        if (!this.p1World || !this.p2World) return;

        const dx = (this.p1World.x || 0) - (this.p2World.x || 0);
        const dy = (this.p1World.y || 0) - (this.p2World.y || 0);
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        const unit = this.units[this.currentUnitIndex];
        const formatted = this._formatDistance(dist, unit);

        // Safely format sub-values
        const fDx = isFinite(dx) ? dx.toFixed(3) : '0.000';
        const fDy = isFinite(dy) ? dy.toFixed(3) : '0.000';
        const fAngle = isFinite(angle) ? angle.toFixed(1) : '0.0';

        this.hud.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:10px; font-weight:bold; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1px;">Measurement</div>
                <div class="unit-badge" style="cursor:pointer; background:#3b82f6; color:white; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:bold; transition:all 0.1s hover:scale(1.05)">${unit}</div>
            </div>
            <div class="main-value" style="font-size:20px; font-weight:900; color:#00E5FF; line-height:1.2; margin:2px 0;">${formatted}</div>
            <div style="display:flex; gap:12px; font-size:11px; color:rgba(255,255,255,0.7); font-weight:500;">
                <div style="display:flex; align-items:center; gap:3px;">
                    <span style="color:rgba(255,255,255,0.3)">ΔX</span> ${fDx}
                </div>
                <div style="display:flex; align-items:center; gap:3px;">
                    <span style="color:rgba(255,255,255,0.3)">ΔY</span> ${fDy}
                </div>
                <div style="display:flex; align-items:center; gap:3px;">
                    <span style="color:rgba(255,255,255,0.3)">∠</span> ${fAngle}°
                </div>
            </div>
        `;
    }

    _formatDistance(val, unit) {
        try {
            if (!isFinite(val)) return '0.00 ' + unit;
            switch(unit) {
                case 'cm': {
                    const scaled = val * 100;
                    return isFinite(scaled) ? scaled.toFixed(2) : '0.00';
                }
                case 'mm': {
                    const scaled = val * 1000;
                    return isFinite(scaled) ? scaled.toFixed(1) : '0.0';
                }
                case 'ft': {
                    const scaled = val * 3.28084;
                    return isFinite(scaled) ? scaled.toFixed(3) : '0.000';
                }
                case 'ft-in': {
                    const totalInches = val * 39.3701;
                    if (!isFinite(totalInches)) return '0\' 0"';
                    const feet = Math.floor(Math.max(0, totalInches) / 12);
                    const inches = Math.round(Math.max(0, totalInches) % 12);
                    return `${feet}' ${inches}"`;
                }
                default: return val.toFixed(3);
            }
        } catch(e) {
            return '0.000';
        }
    }
}

window.DraggableMeasurementExtension = DraggableMeasurementExtension;
