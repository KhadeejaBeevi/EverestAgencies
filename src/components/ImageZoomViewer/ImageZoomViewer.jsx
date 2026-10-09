import React, { useEffect, useRef, useState } from "react";
import "./ImageZoomViewer.css";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// Full-screen image viewer with pinch, double-tap, mouse-wheel and button zoom.
// The app viewport disables browser pinch-zoom, so zooming is handled here.
const ImageZoomViewer = ({ src, alt = "Preview", onClose }) => {

    const stageRef = useRef(null);
    const pointers = useRef(new Map());
    const gesture = useRef(null);
    const lastTap = useRef({ time: 0, x: 0, y: 0 });
    const view = useRef({ scale: 1, x: 0, y: 0 });

    const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });

    const applyView = (scale, x, y) => {

        const stage = stageRef.current;

        const w = stage ? stage.clientWidth : 0;
        const h = stage ? stage.clientHeight : 0;

        const s = clamp(scale, MIN_SCALE, MAX_SCALE);

        // Keep the image covering the stage edges while zoomed
        const next = {
            scale: s,
            x: clamp(x, w * (1 - s), 0),
            y: clamp(y, h * (1 - s), 0),
        };

        view.current = next;
        setTransform(next);

    };

    // Zoom so that the stage point (px, py) stays in place
    const zoomAt = (newScale, px, py) => {

        const { scale, x, y } = view.current;

        const s = clamp(newScale, MIN_SCALE, MAX_SCALE);

        const cx = (px - x) / scale;
        const cy = (py - y) / scale;

        applyView(s, px - cx * s, py - cy * s);

    };

    const zoomCenter = (factor) => {

        const stage = stageRef.current;

        if (!stage) return;

        zoomAt(view.current.scale * factor, stage.clientWidth / 2, stage.clientHeight / 2);

    };

    const reset = () => applyView(1, 0, 0);

    const localPoint = (e) => {

        const rect = stageRef.current.getBoundingClientRect();

        return { x: e.clientX - rect.left, y: e.clientY - rect.top };

    };

    const startGesture = () => {

        const pts = [...pointers.current.values()];

        if (pts.length >= 2) {

            const [a, b] = pts;

            gesture.current = {
                type: "pinch",
                dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
                midX: (a.x + b.x) / 2,
                midY: (a.y + b.y) / 2,
                ...view.current,
            };

        } else if (pts.length === 1) {

            gesture.current = {
                type: "pan",
                startX: pts[0].x,
                startY: pts[0].y,
                moved: false,
                ...view.current,
            };

        } else {

            gesture.current = null;

        }

    };

    const handlePointerDown = (e) => {

        try {

            e.currentTarget.setPointerCapture(e.pointerId);

        } catch {

            // Capture is optional; gestures still work without it

        }

        pointers.current.set(e.pointerId, localPoint(e));

        startGesture();

    };

    const handlePointerMove = (e) => {

        if (!pointers.current.has(e.pointerId)) return;

        pointers.current.set(e.pointerId, localPoint(e));

        const g = gesture.current;

        if (!g) return;

        const pts = [...pointers.current.values()];

        if (g.type === "pinch" && pts.length >= 2) {

            const [a, b] = pts;

            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;

            const s = clamp(g.scale * (dist / g.dist), MIN_SCALE, MAX_SCALE);

            const cx = (g.midX - g.x) / g.scale;
            const cy = (g.midY - g.y) / g.scale;

            applyView(s, midX - cx * s, midY - cy * s);

        } else if (g.type === "pan" && pts.length === 1) {

            const dx = pts[0].x - g.startX;
            const dy = pts[0].y - g.startY;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) g.moved = true;

            if (g.scale > 1) {

                applyView(g.scale, g.x + dx, g.y + dy);

            }

        }

    };

    const handlePointerUp = (e) => {

        if (!pointers.current.has(e.pointerId)) return;

        const point = localPoint(e);

        const g = gesture.current;

        const wasTap = g && g.type === "pan" && !g.moved && pointers.current.size === 1;

        pointers.current.delete(e.pointerId);

        if (wasTap) {

            const now = Date.now();

            const prev = lastTap.current;

            const isDoubleTap =
                now - prev.time < 300 &&
                Math.hypot(point.x - prev.x, point.y - prev.y) < 30;

            if (isDoubleTap) {

                if (view.current.scale > 1) {

                    reset();

                } else {

                    zoomAt(DOUBLE_TAP_SCALE, point.x, point.y);

                }

                lastTap.current = { time: 0, x: 0, y: 0 };

            } else {

                lastTap.current = { time: now, ...point };

            }

        }

        // Continue with remaining finger(s) from their current position
        startGesture();

    };

    useEffect(() => {

        const stage = stageRef.current;

        if (!stage) return;

        // Non-passive so the page itself does not scroll while zooming
        const handleWheel = (e) => {

            e.preventDefault();

            const rect = stage.getBoundingClientRect();

            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;

            zoomAt(view.current.scale * factor, e.clientX - rect.left, e.clientY - rect.top);

        };

        stage.addEventListener("wheel", handleWheel, { passive: false });

        return () => stage.removeEventListener("wheel", handleWheel);

    }, []);

    useEffect(() => {

        const handleKey = (e) => {

            if (e.key === "Escape") onClose();

        };

        window.addEventListener("keydown", handleKey);

        const prevOverflow = document.body.style.overflow;

        document.body.style.overflow = "hidden";

        return () => {

            window.removeEventListener("keydown", handleKey);

            document.body.style.overflow = prevOverflow;

        };

    }, [onClose]);

    // New image always opens un-zoomed
    useEffect(() => {

        reset();

    }, [src]);

    const isZoomed = transform.scale > 1;

    return (

        <div className="izv-overlay">

            <button className="izv-close" onClick={onClose} aria-label="Close">

                ✕

            </button>

            <div
                ref={stageRef}
                className={`izv-stage ${isZoomed ? "izv-zoomed" : ""}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >

                <div
                    className="izv-content"
                    style={{
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    }}
                >

                    <img src={src} alt={alt} className="izv-img" draggable={false} />

                </div>

            </div>

            <div className="izv-toolbar">

                <button onClick={() => zoomCenter(1 / 1.5)} disabled={!isZoomed} aria-label="Zoom out">

                    −

                </button>

                <span className="izv-level">{Math.round(transform.scale * 100)}%</span>

                <button onClick={() => zoomCenter(1.5)} disabled={transform.scale >= MAX_SCALE} aria-label="Zoom in">

                    +

                </button>

                <button className="izv-reset" onClick={reset} disabled={!isZoomed}>

                    Reset

                </button>

            </div>

            <div className="izv-hint">Pinch or double-tap to zoom · drag to move</div>

        </div>

    );

};

export default ImageZoomViewer;
