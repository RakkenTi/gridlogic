import type { SimGuiOp, SimLcdScreen } from '../types';
import { computeGuiAutoColor } from '../simulator/engine';

export type LcdAspectMode = 'square' | 'wide' | 'cockpit';

const ASPECT_DIMS: Record<LcdAspectMode, { w: number; h: number }> = {
  square: { w: 512, h: 512 },
  wide: { w: 512, h: 256 },
  cockpit: { w: 512, h: 320 },
};

function hexWithAlpha(hex: string, alpha: number): string {
  const c = String(hex || '#38A3D1').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(c)) {
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return `rgba(56,163,209,${alpha})`;
}

function drawVectorIcon(
  ctx: CanvasRenderingContext2D,
  icon: string,
  cx: number,
  cy: number,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.4, size * 0.11);
  const r = size * 0.45;
  if (icon === 'energy') {
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.15, cy - r);
    ctx.lineTo(cx - r * 0.65, cy + r * 0.12);
    ctx.lineTo(cx - r * 0.05, cy + r * 0.12);
    ctx.lineTo(cx - r * 0.2, cy + r);
    ctx.lineTo(cx + r * 0.65, cy - r * 0.12);
    ctx.lineTo(cx + r * 0.05, cy - r * 0.12);
    ctx.closePath();
    ctx.fill();
  } else if (icon === 'hydrogen') {
    ctx.font = `800 ${Math.round(size * 0.72)}px var(--font-sans, sans-serif)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H2', cx, cy + 0.5);
  } else if (icon === 'oxygen') {
    ctx.font = `800 ${Math.round(size * 0.72)}px var(--font-sans, sans-serif)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('O2', cx, cy + 0.5);
  } else if (icon === 'cargo') {
    ctx.strokeRect(cx - r * 0.72, cy - r * 0.62, r * 1.44, r * 1.24);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.72, cy - r * 0.1);
    ctx.lineTo(cx + r * 0.72, cy - r * 0.1);
    ctx.stroke();
  } else if (icon === 'danger') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.85);
    ctx.lineTo(cx + r * 0.9, cy + r * 0.78);
    ctx.lineTo(cx - r * 0.9, cy + r * 0.78);
    ctx.closePath();
    ctx.stroke();
    ctx.fillRect(cx - 1.2, cy - r * 0.25, 2.4, r * 0.52);
    ctx.fillRect(cx - 1.2, cy + r * 0.38, 2.4, r * 0.2);
  } else if (icon === 'dot') {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderGuiScreenToCanvas(
  canvas: HTMLCanvasElement,
  screen: SimLcdScreen,
  aspect: LcdAspectMode = 'square'
): void {
  const { w, h } = ASPECT_DIMS[aspect];
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.scale(dpr, dpr);

  const bg = screen.bgColor || '#08111A';
  const accent = screen.frameColor || '#2B9FD9';

  // Background fill
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Optional subtle SE grid
  if (screen.showGrid) {
    ctx.strokeStyle = hexWithAlpha(accent, 0.1);
    ctx.lineWidth = 1;
    const step = 32;
    for (let gx = step; gx < w; gx += step) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = step; gy < h; gy += step) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }
  }

  // Optional outer frame border
  if (screen.showFrame) {
    ctx.strokeStyle = hexWithAlpha(accent, 0.32);
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  }

  const s = Math.max(0.58, Math.min(w, h) / 512);
  const pad = Math.max(14, w * 0.04);
  const innerW = w - pad * 2;
  let y = Math.max(10, h * 0.032);

  const ops: SimGuiOp[] = screen.guiOps ?? [];
  if (ops.length === 0) {
    ctx.fillStyle = '#8D9CAA';
    ctx.font = `600 ${Math.round(14 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add GUI widgets inside GUI Screen Canvas', w / 2, h / 2);
    ctx.restore();
    return;
  }

  const drawBar = (
    label: string,
    pct: number,
    valueText: string,
    style: 'segmented' | 'smooth' | 'compact',
    icon: string,
    fill: string
  ) => {
    const clamped = Math.max(0, Math.min(100, pct));
    if (style === 'compact') {
      const rh = 26 * s;
      const labelW = Math.min(120 * s, innerW * 0.3);
      const valW = 54 * s;
      const barX = pad + labelW;
      const barW = Math.max(40, innerW - labelW - valW);
      const barH = 12 * s;
      const barY = y + (rh - barH) * 0.5;
      let tx = pad;
      if (icon !== 'none') {
        drawVectorIcon(ctx, icon, tx + 8 * s, y + rh * 0.5, 16 * s, fill);
        tx += 20 * s;
      }
      ctx.fillStyle = '#CDDCE8';
      ctx.font = `600 ${Math.round(14 * s)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tx, y + rh * 0.5);

      ctx.fillStyle = '#182330';
      ctx.fillRect(barX, barY, barW, barH);
      const fw = barW * (clamped / 100);
      if (fw > 1) {
        ctx.fillStyle = fill;
        ctx.fillRect(barX, barY, fw, barH);
      }
      ctx.fillStyle = fill;
      ctx.font = `700 ${Math.round(14 * s)}px monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(valueText, pad + innerW, y + rh * 0.5);
      y += rh + 7 * s;
      return;
    }

    let tx = pad;
    if (icon !== 'none') {
      drawVectorIcon(ctx, icon, tx + 9 * s, y + 10 * s, 18 * s, fill);
      tx += 24 * s;
    }
    ctx.fillStyle = '#D6E0EB';
    ctx.font = `700 ${Math.round(15 * s)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, tx, y + 1);

    ctx.fillStyle = fill;
    ctx.font = `700 ${Math.round(16 * s)}px monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(valueText, pad + innerW, y);

    const barTop = y + 23 * s;
    const barH = 22 * s;
    ctx.fillStyle = '#121C28';
    ctx.fillRect(pad, barTop, innerW, barH);

    if (style === 'segmented') {
      const segs = 20;
      const gap = 3 * s;
      const ip = 3 * s;
      const segW = (innerW - ip * 2 - gap * (segs - 1)) / segs;
      const lit = Math.round((clamped / 100) * segs);
      for (let i = 0; i < segs; i++) {
        ctx.fillStyle = i < lit ? fill : '#222F3E';
        ctx.fillRect(pad + ip + i * (segW + gap), barTop + ip, segW, barH - ip * 2);
      }
    } else {
      const ip = 3 * s;
      const iw = innerW - ip * 2;
      const fw = iw * (clamped / 100);
      if (fw > 1) {
        ctx.fillStyle = fill;
        ctx.fillRect(pad + ip, barTop + ip, fw, barH - ip * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(pad + ip + Math.max(0, fw - 3 * s), barTop + ip, Math.min(3 * s, fw), barH - ip * 2);
      }
      ctx.fillStyle = 'rgba(8,17,26,0.6)';
      for (let q = 1; q <= 3; q++) {
        ctx.fillRect(pad + ip + iw * (q * 0.25), barTop + ip, 1.5, barH - ip * 2);
      }
    }

    y = barTop + barH + 12 * s;
  };

  for (const op of ops) {
    if (op.kind === 'header') {
      const hh = 44 * s;
      ctx.fillStyle = 'rgba(18, 29, 42, 0.92)';
      ctx.fillRect(pad, y, innerW, hh);
      ctx.fillStyle = op.accentColor;
      ctx.fillRect(pad, y, 5 * s, hh);
      ctx.fillStyle = hexWithAlpha(op.accentColor, 0.35);
      ctx.fillRect(pad, y + hh - 2, innerW, 2);

      ctx.fillStyle = '#ECF2F8';
      ctx.font = `800 ${Math.round(19 * s)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(op.title, pad + 14 * s, y + hh * 0.5);

      if (op.badge) {
        ctx.font = `700 ${Math.round(12.5 * s)}px monospace`;
        const bw = Math.max(76 * s, ctx.measureText(op.badge).width + 22 * s);
        const bh = 24 * s;
        const bx = pad + innerW - bw - 10 * s;
        const by = y + (hh - bh) * 0.5;
        ctx.fillStyle = hexWithAlpha(op.accentColor, 0.2);
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = op.accentColor;
        ctx.textAlign = 'center';
        ctx.fillText(op.badge, bx + bw * 0.5, by + bh * 0.5 + 0.5);
      }
      y += hh + 12 * s;
    } else if (op.kind === 'bar') {
      drawBar(op.label, op.percent, op.valueText, op.style, op.icon, op.color);
    } else if (op.kind === 'gauges') {
      const count = op.items.length;
      if (count > 0) {
        const cellW = innerW / count;
        const radius = Math.min(cellW * 0.36, 54 * s);
        const cy = y + radius + 12 * s;
        const segs = 24;
        const startDeg = 135;
        const sweepDeg = 270;

        op.items.forEach((g, idx) => {
          const cx = pad + cellW * (idx + 0.5);
          const lit = Math.round((g.percent / 100) * segs);
          for (let i = 0; i < segs; i++) {
            const deg = startDeg + (sweepDeg * i) / (segs - 1);
            const rad = (deg * Math.PI) / 180;
            const sx = cx + Math.cos(rad) * radius;
            const sy = cy + Math.sin(rad) * radius;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(rad + Math.PI * 0.5);
            ctx.fillStyle = i < lit ? g.color : '#222F3E';
            ctx.fillRect(-4.5 * s, -2.75 * s, 9 * s, 5.5 * s);
            ctx.restore();
          }
          ctx.fillStyle = '#F0F5FA';
          ctx.font = `800 ${Math.round(21 * s)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.round(g.percent)}%`, cx, cy - 2 * s);

          ctx.fillStyle = '#96AABE';
          ctx.font = `700 ${Math.round(12 * s)}px sans-serif`;
          ctx.fillText(g.label, cx, cy + radius * 0.68);
        });
        y = cy + radius + 18 * s;
      }
    } else if (op.kind === 'metrics') {
      const count = op.cards.length;
      if (count > 0) {
        const gap = 10 * s;
        const cardW = (innerW - gap * (count - 1)) / count;
        const cardH = 62 * s;
        op.cards.forEach((c, i) => {
          const cx = pad + i * (cardW + gap);
          ctx.fillStyle = 'rgba(18, 29, 42, 0.92)';
          ctx.fillRect(cx, y, cardW, cardH);
          ctx.fillStyle = op.accentColor;
          ctx.fillRect(cx, y, cardW, 3 * s);

          ctx.fillStyle = '#8EA2B6';
          ctx.font = `700 ${Math.round(11.5 * s)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(c.label, cx + cardW * 0.5, y + 10 * s);

          ctx.fillStyle = '#EEF4FA';
          ctx.font = `700 ${Math.round(18 * s)}px monospace`;
          ctx.fillText(c.value, cx + cardW * 0.5, y + 30 * s);
        });
        y += cardH + 12 * s;
      }
    } else if (op.kind === 'alert') {
      const ah = 36 * s;
      const col =
        op.severity === 'critical'
          ? '#EF4444'
          : op.severity === 'warning'
          ? '#F59E0B'
          : op.severity === 'nominal'
          ? '#22C55E'
          : '#38BDF8';
      ctx.fillStyle = hexWithAlpha(col, 0.19);
      ctx.fillRect(pad, y, innerW, ah);
      ctx.fillStyle = col;
      ctx.fillRect(pad, y, 5 * s, ah);
      const isWarn = op.severity === 'critical' || op.severity === 'warning';
      drawVectorIcon(ctx, isWarn ? 'danger' : 'dot', pad + 20 * s, y + ah * 0.5, 19 * s, col);
      ctx.fillStyle = '#F5F8FC';
      ctx.font = `700 ${Math.round(14.5 * s)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(op.message, pad + 36 * s, y + ah * 0.5);
      y += ah + 9 * s;
    } else if (op.kind === 'inventory') {
      const cargoCol = computeGuiAutoColor(op.cargoPct, 'auto_high_bad', op.accentColor);
      drawBar(
        'CARGO CAPACITY',
        op.cargoPct,
        `${Math.round(op.cargoPct)}%`,
        'segmented',
        'cargo',
        cargoCol
      );
      const rowH = 26 * s;
      op.rows.forEach((r, i) => {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(18, 28, 40, 0.88)' : 'rgba(13, 21, 31, 0.72)';
        ctx.fillRect(pad, y, innerW, rowH);
        ctx.fillStyle = hexWithAlpha(op.accentColor, 0.65);
        ctx.fillRect(pad, y + rowH - 3 * s, innerW * r.ratio, 3 * s);
        ctx.fillStyle = '#E0E8F0';
        ctx.font = `600 ${Math.round(13.5 * s)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.name.slice(0, 22), pad + 8 * s, y + rowH * 0.45);
        ctx.fillStyle = op.accentColor;
        ctx.font = `700 ${Math.round(13.5 * s)}px monospace`;
        ctx.textAlign = 'right';
        ctx.fillText(r.amountText, pad + innerW - 8 * s, y + rowH * 0.45);
        y += rowH + 4 * s;
      });
    } else if (op.kind === 'text') {
      const fs = op.size === 'heading' ? 20 * s : op.size === 'caption' ? 12 * s : 15 * s;
      ctx.fillStyle = op.color;
      ctx.font = `${op.size === 'heading' ? '700' : '600'} ${Math.round(fs)}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = op.align.toLowerCase() as CanvasTextAlign;
      const x = op.align === 'CENTER' ? w * 0.5 : op.align === 'RIGHT' ? pad + innerW : pad;
      ctx.fillText(op.text, x, y);
      y += (op.size === 'heading' ? 32 : op.size === 'caption' ? 20 : 26) * s;
    } else if (op.kind === 'divider') {
      if (!op.label) {
        ctx.fillStyle = op.color;
        ctx.fillRect(pad, y + 4 * s, innerW, 2);
        y += 12 * s;
      } else {
        ctx.fillStyle = op.color;
        ctx.font = `700 ${Math.round(11.5 * s)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(op.label, pad, y);
        const lw = Math.min(innerW * 0.55, ctx.measureText(op.label).width + 10 * s);
        ctx.fillStyle = hexWithAlpha(op.color, 0.55);
        ctx.fillRect(pad + lw, y + 6 * s, Math.max(10, innerW - lw), 2);
        y += 22 * s;
      }
    }
  }

  ctx.restore();
}
