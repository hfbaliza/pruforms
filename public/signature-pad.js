'use strict';

/**
 * Minimal signature pad: draw with mouse, touch, or stylus (pointer events).
 * Supports Clear, Undo (stroke by stroke), and export to a trimmed PNG data URL.
 */
class SignaturePad {
  constructor(canvas, { onChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.strokes = []; // array of arrays of {x, y}
    this.current = null;
    this.onChange = onChange || (() => {});
    this.dpr = window.devicePixelRatio || 1;

    this._resize();
    this._bind();
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this._redraw();
  }

  _bind() {
    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      this.current = [pos(e)];
      this.strokes.push(this.current);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.current) return;
      e.preventDefault();
      this.current.push(pos(e));
      this._redraw();
    });
    const up = (e) => {
      if (!this.current) return;
      if (this.current.length < 2) {
        // dot: make it visible
        const p = this.current[0];
        this.current.push({ x: p.x + 0.5, y: p.y + 0.5 });
      }
      this.current = null;
      this._redraw();
      this.onChange();
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  _redraw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a5e';
    for (const stroke of this.strokes) {
      ctx.beginPath();
      stroke.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }

  clear() {
    this.strokes = [];
    this.current = null;
    this._redraw();
    this.onChange();
  }

  undo() {
    this.strokes.pop();
    this.current = null;
    this._redraw();
    this.onChange();
  }

  isEmpty() {
    return this.strokes.length === 0;
  }

  /** Export trimmed to the ink bounding box (plus padding) as PNG data URL. */
  toDataURL() {
    if (this.isEmpty()) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of this.strokes) {
      for (const p of s) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
    }
    const pad = 6;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX += pad; maxY += pad;
    const w = Math.max(10, maxX - minX);
    const h = Math.max(10, maxY - minY);
    const out = document.createElement('canvas');
    const scale = 2; // export at 2x for crisp placement in the PDF
    out.width = w * scale;
    out.height = h * scale;
    const octx = out.getContext('2d');
    octx.scale(scale, scale);
    octx.lineWidth = 2.2;
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.strokeStyle = '#1a1a5e';
    for (const stroke of this.strokes) {
      octx.beginPath();
      stroke.forEach((p, i) =>
        i ? octx.lineTo(p.x - minX, p.y - minY) : octx.moveTo(p.x - minX, p.y - minY)
      );
      octx.stroke();
    }
    return out.toDataURL('image/png');
  }
}

window.SignaturePad = SignaturePad;
