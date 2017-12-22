module BABYLON {
    export class ArcRotateCameraPointersInput implements ICameraInput<ArcRotateCamera> {
        camera: ArcRotateCamera;

        @serialize()
        public buttons = [0, 1, 2];

        @serialize()
        public angularSensibilityX = 1000.0;

        @serialize()
        public angularSensibilityY = 1000.0;

        @serialize()
        public pinchPrecision = 12.0;

        /**
         * pinchDeltaPercentage will be used instead of pinchPrecision if different from 0. 
         * It defines the percentage of current camera.radius to use as delta when pinch zoom is used.
         */
        @serialize()
        public pinchDeltaPercentage = 0;


        @serialize()
        public panningSensibility: number = 150.0;
        public multiTouchPanning: boolean = true;

        @serialize()
        public multiTouchPanAndZoom: boolean = true;

        private _isPanClick: boolean = false;
        public pinchInwards = true;

        private points:any = {};
        private onTouchUp: (e:TouchEvent) => void;

        private _pointerInput: (p: PointerInfo, s: EventState) => void;
        private _observer: Nullable<Observer<PointerInfo>>;
        private _onMouseMove: Nullable<(e: MouseEvent) => any>;
        private _onGestureStart: Nullable<(e: PointerEvent) => void>;
        private _onGesture: Nullable<(e: MSGestureEvent) => void>;
        private _MSGestureHandler: Nullable<MSGesture>;
        private _onLostFocus: Nullable<(e: FocusEvent) => any>;
        private _onContextMenu: Nullable<(e: PointerEvent) => void>;

        public attachControl(element: HTMLElement, noPreventDefault?: boolean) {
            var engine = this.camera.getEngine();
            var cacheSoloPointer: Nullable<{ x: number, y: number, pointerId: number, type: any }>; // cache pointer object for better perf on camera rotation
            var pointA: Nullable<{ x: number, y: number, pointerId: number, type: any }> = null;
            var pointB: Nullable<{ x: number, y: number, pointerId: number, type: any }> = null;
            var previousPinchSquaredDistance = 0;
            var previousPinchDistance = 0;
            var initialDistance = 0;
            var twoFingerActivityCount = 0;
            var previousMultiTouchPanPosition: { x: number, y: number, isPaning: boolean, isPinching: boolean } = { x: 0, y: 0, isPaning: false, isPinching: false };

            this._pointerInput = (p, s) => {
                var evt = <PointerEvent>p.event;
                let isTouch = (<any>p.event).pointerType === "touch";
                
                if (engine.isInVRExclusivePointerMode) {
                    return;
                }

                if (p.type !== PointerEventTypes.POINTERMOVE && this.buttons.indexOf(evt.button) === -1) {
                    return;
                }

                let srcElement = <HTMLElement>(evt.srcElement || evt.target);

                if (p.type === PointerEventTypes.POINTERDOWN && srcElement) {

                    if (this.getSizeOfPoints() === 0) { ,
                        window.addEventListener('touchend', this.onTouchUp, true);
                        window.addEventListener('pointerup', this.onPointerUp, true);
                    }
                    var id = (evt as any).pointerId || (evt as any).identifier;
                    if (id) {
                        this.points[id] = evt;
                    }

                    try {
                        srcElement.setPointerCapture(evt.pointerId);
                    } catch (e) {
                        //Nothing to do with the error. Execution will continue.
                    }

                    // Manage panning with pan button click
                    this._isPanClick = evt.button === this.camera._panningMouseButton;

                    // manage pointers
                    cacheSoloPointer = { x: evt.clientX, y: evt.clientY, pointerId: evt.pointerId, type: evt.pointerType };
                    if (pointA === null) {
                        pointA = cacheSoloPointer;
                    }
                    else if (pointB === null) {
                        pointB = cacheSoloPointer;
                    }
                    if (!noPreventDefault) {
                        evt.preventDefault();
                        element.focus();
                    }
                }
                else if (p.type === PointerEventTypes.POINTERDOUBLETAP) {
                    this.camera.restoreState();
                }
                else if (p.type === PointerEventTypes.POINTERUP && srcElement) {
                    try {
                        srcElement.releasePointerCapture(evt.pointerId);
                    } catch (e) {
                        //Nothing to do with the error.
                    }

                    cacheSoloPointer = null;
                    previousPinchSquaredDistance = 0;
                    previousMultiTouchPanPosition.isPaning = false;
                    previousMultiTouchPanPosition.isPinching = false;
                    twoFingerActivityCount = 0;
                    initialDistance = 0;

                    if (!isTouch) {
                        pointB = null; // Mouse and pen are mono pointer
                    }

                    if (this.getSizeOfPoints() <= 1) {
                        previousPinchDistance = 0;
                    }
                    //would be better to use pointers.remove(evt.pointerId) for multitouch gestures, 
                    //but emptying completly pointers collection is required to fix a bug on iPhone : 
                    //when changing orientation while pinching camera, one pointer stay pressed forever if we don't release all pointers  
                    //will be ok to put back pointers.remove(evt.pointerId); when iPhone bug corrected
                    if (engine.badOS) {
                        pointA = pointB = null;
                    }
                    else {
                        //only remove the impacted pointer in case of multitouch allowing on most 
                        //platforms switching from rotate to zoom and pan seamlessly.
                        if (pointB && pointA && pointA.pointerId == evt.pointerId) {
                            pointA = pointB;
                            pointB = null;
                            cacheSoloPointer = { x: pointA.x, y: pointA.y, pointerId: pointA.pointerId, type: evt.pointerType };
                        }
                        else if (pointA && pointB && pointB.pointerId == evt.pointerId) {
                            pointB = null;
                            cacheSoloPointer = { x: pointA.x, y: pointA.y, pointerId: pointA.pointerId, type: evt.pointerType };
                        }
                        else {
                            pointA = pointB = null;
                        }
                    }

                    if (!noPreventDefault) {
                        evt.preventDefault();
                    }
                } else if (p.type === PointerEventTypes.POINTERMOVE) {
                    if (!noPreventDefault) {
                        evt.preventDefault();
                    }
                    // update panning Sensibility
                    var angle = 1 / Math.tan(this.camera.fov);//// this.camera.fov;
                    var distance = BABYLON.Vector3.Distance(this.camera.getTarget(), this.camera.position);
                    var _sensibility = this.camera.viewport.width * distance / 75;
                    // One button down
                    if (pointA && pointB === null && cacheSoloPointer) {
                        if (this.panningSensibility !== 0 &&
                            ((evt.ctrlKey && this.camera._useCtrlForPanning) ||
                                (!this.camera._useCtrlForPanning && this._isPanClick))) {
                            this.camera.inertialPanningX += -(evt.clientX - cacheSoloPointer.x) / this.panningSensibility * _sensibility;
                            this.camera.inertialPanningY += (evt.clientY - cacheSoloPointer.y) / this.panningSensibility * _sensibility;
                        } else {
                            var offsetX = evt.clientX - cacheSoloPointer.x;
                            var offsetY = evt.clientY - cacheSoloPointer.y;
                            this.camera.inertialAlphaOffset -= offsetX / this.angularSensibilityX;
                            this.camera.inertialBetaOffset -= offsetY / this.angularSensibilityY;
                        }

                        cacheSoloPointer.x = evt.clientX;
                        cacheSoloPointer.y = evt.clientY;
                    }

                    // Two buttons down: pinch
                    else if (pointA && pointB && pointA.pointerId) {
                        if (pointA.pointerId === pointB.pointerId) {
                            pointB = undefined;
                            return;
                        }
                        // 大于两个点的情况
                        if (this.getSizeOfPoints() > 2) {
                            var id = (evt as any).pointerId || (evt as any).identifier;
                            if (cacheSoloPointer.pointerId === id) {
                                this.camera.inertialPanningX += -(evt.clientX - cacheSoloPointer.x) / this.panningSensibility * _sensibility;
                                this.camera.inertialPanningY += (evt.clientY - cacheSoloPointer.y) / this.panningSensibility * _sensibility;
                                cacheSoloPointer.x = evt.clientX;
                                cacheSoloPointer.y = evt.clientY;
                            }
                        } else if (this.getSizeOfPoints() === 2) {
                            //if (noPreventDefault) { evt.preventDefault(); } //if pinch gesture, could be useful to force preventDefault to avoid html page scroll/zoom in some mobile browsers
                            var ed = (pointA.pointerId === evt.pointerId) ? pointA : pointB;
                            ed.x = evt.clientX;
                            ed.y = evt.clientY;
                            var direction = this.pinchInwards ? 1 : -1;
                            var distX = pointA.x - pointB.x;
                            var distY = pointA.y - pointB.y;
                            var pinchSquaredDistance = (distX * distX) + (distY * distY);
                            var pinchDistance = Math.sqrt(pinchSquaredDistance);
                            // 记录当前两根手指按下的值
                            if (previousPinchDistance === 0) {
                                previousPinchDistance = pinchSquaredDistance;
                                return;
                            }
                            /*
                            // 计算缩放因子
                            var scale = pinchDistance / previousPinchDistance;
                            var deltaRadius = (scale - 1) * previousCameraRadius;
                            // 通过deltaRadius计算inertialRadiusOffset
                            var inertia = this.camera.inertia;
                            var inertialRadiusOffset = (this.camera.radius - previousCameraRadius) * (1 - inertia) / (1 - Math.pow(inertia, 100));
                            this.camera.inertialRadiusOffset = inertialRadiusOffset;
                            */
                            if (pinchSquaredDistance !== previousPinchDistance) {
                                this.camera
                                    .inertialRadiusOffset += 0.1 * (pinchSquaredDistance - previousPinchDistance) /
                                    (this.pinchPrecision *
                                    ((this.angularSensibilityX + this.angularSensibilityY) / 2) *
                                    direction);
                                previousPinchDistance = pinchSquaredDistance;
                            }
                        } else {
                            pointA = { x: evt.clientX, y: evt.clientY, pointerId: evt.pointerId, type: evt.pointerType };
                            pointB = undefined;
                            twoFingerActivityCount++;

                            if (previousMultiTouchPanPosition.isPinching || (twoFingerActivityCount < 20 && Math.abs(pinchDistance - initialDistance) > this.camera.pinchToPanMaxDistance)) {
                                if (this.pinchDeltaPercentage) {
                                    this.camera.inertialRadiusOffset += ((pinchSquaredDistance - previousPinchSquaredDistance) * 0.001) * this.camera.radius * this.pinchDeltaPercentage;
                                } else {
                                    this.camera.inertialRadiusOffset += (pinchSquaredDistance - previousPinchSquaredDistance) /
                                        (this.pinchPrecision *
                                            ((this.angularSensibilityX + this.angularSensibilityY) / 2) *
                                            direction);
                                }
                                previousMultiTouchPanPosition.isPaning = false;
                                previousMultiTouchPanPosition.isPinching = true;
                            }
                            else {
                                if (cacheSoloPointer && cacheSoloPointer.pointerId === ed.pointerId && this.panningSensibility !== 0 && this.multiTouchPanning) {
                                    if (!previousMultiTouchPanPosition.isPaning) {
                                        previousMultiTouchPanPosition.isPaning = true;
                                        previousMultiTouchPanPosition.isPinching = false;
                                        previousMultiTouchPanPosition.x = ed.x;
                                        previousMultiTouchPanPosition.y = ed.y;
                                        return;
                                    }

                                    this.camera.inertialPanningX += -(ed.x - previousMultiTouchPanPosition.x) / (this.panningSensibility);
                                    this.camera.inertialPanningY += (ed.y - previousMultiTouchPanPosition.y) / (this.panningSensibility);
                                }
                            }

                            if (cacheSoloPointer && cacheSoloPointer.pointerId === evt.pointerId) {
                                previousMultiTouchPanPosition.x = ed.x;
                                previousMultiTouchPanPosition.y = ed.y;
                            }
                        }

                        previousPinchSquaredDistance = pinchSquaredDistance;
                    }
                }
            }

            this._observer = this.camera.getScene().onPointerObservable.add(this._pointerInput, PointerEventTypes.POINTERDOWN | PointerEventTypes.POINTERUP | PointerEventTypes.POINTERMOVE | PointerEventTypes._POINTERDOUBLETAP);

            this._onContextMenu = evt => {
                evt.preventDefault();
            };

            if (!this.camera._useCtrlForPanning) {
                element.addEventListener("contextmenu", this._onContextMenu, false);
            }

            this.onTouchUp = (evt:any)=> {
                for (var i = 0; i < evt.changedTouches.length; i ++) {
                    var e = evt.changedTouches[i];
                    var id = e.pointerId || e.identifier;
                    delete this.points[id];
                }
            };

            this.onPointerUp = (evt:any)=> {
                var id = evt.pointerId;
                delete this.points[id];
            }

            this._onLostFocus = () => {
                //this._keys = [];
                pointA = pointB = null;
                previousPinchSquaredDistance = 0;
                previousMultiTouchPanPosition.isPaning = false;
                previousMultiTouchPanPosition.isPinching = false;
                twoFingerActivityCount = 0;
                cacheSoloPointer = null;
                initialDistance = 0;
            };

            this._onMouseMove = evt => {
                if (!engine.isPointerLock) {
                    return;
                }

                var offsetX = evt.movementX || evt.mozMovementX || evt.webkitMovementX || evt.msMovementX || 0;
                var offsetY = evt.movementY || evt.mozMovementY || evt.webkitMovementY || evt.msMovementY || 0;

                this.camera.inertialAlphaOffset -= offsetX / this.angularSensibilityX;
                this.camera.inertialBetaOffset -= offsetY / this.angularSensibilityY;

                if (!noPreventDefault) {
                    evt.preventDefault();
                }
            };

            this._onGestureStart = e => {
                if (window.MSGesture === undefined) {
                    return;
                }

                if (!this._MSGestureHandler) {
                    this._MSGestureHandler = new MSGesture();
                    this._MSGestureHandler.target = element;
                }

                this._MSGestureHandler.addPointer(e.pointerId);
            };

            this._onGesture = e => {
                this.camera.radius *= e.scale;


                if (e.preventDefault) {
                    if (!noPreventDefault) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                }
            };

            element.addEventListener("mousemove", this._onMouseMove, false);
            element.addEventListener("MSPointerDown", this._onGestureStart, false);
            element.addEventListener("MSGestureChange", this._onGesture, false);

            Tools.RegisterTopRootEvents([
                { name: "blur", handler: this._onLostFocus }
            ]);
        }

        public detachControl(element: Nullable<HTMLElement>) {
            if (this._onLostFocus) {
                Tools.UnregisterTopRootEvents([
                    { name: "blur", handler: this._onLostFocus }
                ]);
            }

            if (element && this._observer) {
                this.camera.getScene().onPointerObservable.remove(this._observer);
                this._observer = null;

                if (this._onContextMenu) {
                    element.removeEventListener("contextmenu", this._onContextMenu);
                }

                if (this._onMouseMove) {
                    element.removeEventListener("mousemove", this._onMouseMove);
                }

                if (this._onGestureStart) {
                    element.removeEventListener("MSPointerDown", this._onGestureStart);
                }

                if (this._onGesture) {
                    element.removeEventListener("MSGestureChange", this._onGesture);
                }

                this._isPanClick = false;
                this.pinchInwards = true;

                this._onMouseMove = null;
                this._onGestureStart = null;
                this._onGesture = null;
                this._MSGestureHandler = null;
                this._onLostFocus = null;
                this._onContextMenu = null;
            }
        }

        private getSizeOfPoints():number {
            var count = 0;
            for (var prop in this.points) {
                count ++;
            }
            return count;
        }

        getClassName(): string {
            return "ArcRotateCameraPointersInput";
        }

        getSimpleName() {
            return "pointers";
        }
    }

    (<any>CameraInputTypes)["ArcRotateCameraPointersInput"] = ArcRotateCameraPointersInput;
}
