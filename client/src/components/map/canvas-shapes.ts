/**
 * A diamond marker for Leaflet's canvas renderer.
 *
 * Thousands of points have to stay smooth, so the map's dense layers draw on
 * one canvas (L.canvas) instead of one DOM node each. Leaflet's canvas only
 * knows circles, and power plants must not read as data centers, so this adds
 * a diamond: a CircleMarker whose path is drawn as a rotated square. Hit
 * testing stays the circle's, which is close enough at these sizes.
 */
import L from "leaflet";

interface CanvasInternals {
  _drawing: boolean;
  _ctx: CanvasRenderingContext2D;
  _fillStroke(ctx: CanvasRenderingContext2D, layer: unknown): void;
}

interface CircleInternals {
  _point: { x: number; y: number };
  _radius: number;
  _empty(): boolean;
  _renderer: { _updateDiamond?(layer: unknown): void; _updateCircle(layer: unknown): void };
}

(L.Canvas as unknown as { include(methods: object): void }).include({
  _updateDiamond(this: CanvasInternals, layer: CircleInternals) {
    if (!this._drawing || layer._empty()) return;
    const p = layer._point;
    const r = Math.max(layer._radius, 1);
    const ctx = this._ctx;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - r);
    ctx.lineTo(p.x + r, p.y);
    ctx.lineTo(p.x, p.y + r);
    ctx.lineTo(p.x - r, p.y);
    ctx.closePath();
    this._fillStroke(ctx, layer);
  },
});

/** Draws as a diamond on a canvas renderer; falls back to a circle anywhere else. */
export const DiamondMarker = (L.CircleMarker as unknown as { extend(props: object): typeof L.CircleMarker }).extend({
  _updatePath(this: CircleInternals) {
    if (this._renderer._updateDiamond) this._renderer._updateDiamond(this);
    else this._renderer._updateCircle(this);
  },
});
