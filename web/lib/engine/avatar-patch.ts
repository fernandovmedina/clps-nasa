const SLATE = '#141413';
const IVORY = '#FAF9F5';
const CLAY = '#D97757';
const TAU = Math.PI * 2;

const STARS: [number, number, number][] = [[118, 150, 2.6], [162, 112, 2], [356, 128, 2.4], [326, 170, 1.8], [398, 214, 2.2], [112, 318, 2], [150, 388, 2.4], [404, 330, 1.8]];

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function textOnArc(ctx: CanvasRenderingContext2D, text: string, radius: number, centerAngle: number, size: number, spacing: number, bottom: boolean) {
  ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const widths = [...text].map((ch) => (ctx.measureText(ch)?.width ?? size * 0.7) + spacing);
  const span = widths.reduce((a, b) => a + b, 0) / radius;
  let angle = centerAngle + (bottom ? span / 2 : -span / 2);
  [...text].forEach((ch, i) => {
    const half = widths[i] / radius / 2;
    angle += bottom ? -half : half;
    ctx.save();
    ctx.translate(256 + radius * Math.cos(angle), 256 + radius * Math.sin(angle));
    ctx.rotate(angle + (bottom ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle += bottom ? -half : half;
  });
}

/**
 * Draws the mission patch (a 512 x 512 design, scaled to the canvas): slate disc, embroidered ivory border,
 * the name on top, a crescent Moon and a clay descent arc ending in a lander. Returns false if there is no 2D context.
 */
export function drawPatch(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.save();
  ctx.scale(canvas.width / 512, canvas.height / 512);
  ctx.beginPath();
  ctx.arc(256, 256, 256, 0, TAU);
  ctx.clip();
  ctx.fillStyle = SLATE;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = IVORY;
  for (const [x, y, r] of STARS) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(236, 278, 96, 0, TAU);
  ctx.fill();
  ctx.fillStyle = SLATE;
  ctx.beginPath();
  ctx.arc(276, 250, 84, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = IVORY;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(262, 400);
  ctx.lineTo(404, 400);
  ctx.stroke();

  ctx.strokeStyle = CLAY;
  ctx.lineWidth = 8;
  ctx.setLineDash([18, 13]);
  ctx.beginPath();
  ctx.moveTo(424, 196);
  ctx.quadraticCurveTo(456, 300, 344, 362);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = CLAY;
  ctx.beginPath();
  ctx.moveTo(332, 372);
  ctx.lineTo(362, 360);
  ctx.lineTo(342, 340);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = IVORY;
  ctx.beginPath();
  ctx.moveTo(322, 386);
  ctx.lineTo(366, 386);
  ctx.lineTo(360, 370);
  ctx.lineTo(328, 370);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = IVORY;
  ctx.beginPath();
  ctx.moveTo(328, 370);
  ctx.lineTo(314, 399);
  ctx.moveTo(360, 370);
  ctx.lineTo(374, 399);
  ctx.stroke();

  ctx.fillStyle = IVORY;
  textOnArc(ctx, 'TOUCHDOWN', 158, -Math.PI / 2, 54, 4, false);
  ctx.fillStyle = CLAY;
  textOnArc(ctx, 'SOUTH POLE', 192, Math.PI / 2, 24, 5, true);

  const random = seeded(7);
  ctx.lineCap = 'butt';
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU;
    ctx.strokeStyle = i % 2 ? IVORY : '#E6E3D8';
    ctx.lineWidth = 5.4;
    ctx.beginPath();
    ctx.moveTo(256 + 226 * Math.cos(a), 256 + 226 * Math.sin(a));
    ctx.lineTo(256 + 254 * Math.cos(a + 0.05), 256 + 254 * Math.sin(a + 0.05));
    ctx.stroke();
  }
  ctx.strokeStyle = CLAY;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 256, 214, 0, TAU);
  ctx.stroke();

  ctx.lineWidth = 1;
  for (let i = 0; i < 700; i++) {
    const x = random() * 512, y = random() * 512, a = random() * Math.PI;
    ctx.strokeStyle = random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 7 * Math.cos(a), y + 7 * Math.sin(a));
    ctx.stroke();
  }
  ctx.restore();
  return true;
}
