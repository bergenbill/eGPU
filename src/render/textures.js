import * as THREE from 'three';

// Procedural canvas textures: shoji screens, shop curtains, vending machine fronts, signs.
const cache = new Map();

function canvasTex(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

export function shojiTex(torn = false) {
  return canvasTex('shoji' + torn, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f6f1e3';
    ctx.fillRect(0, 0, w, h);
    if (torn) {
      ctx.fillStyle = '#3b2c22';
      ctx.beginPath();
      const cx = w * 0.46;
      const cy = h * 0.55;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r = 22 + (i % 2 ? 12 : 0) + (i % 3) * 4;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = '#8a6a4c';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 3) * w, 0);
      ctx.lineTo((i / 3) * w, h);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i / 4) * h);
      ctx.lineTo(w, (i / 4) * h);
      ctx.stroke();
    }
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, w, h);
  });
}

export function norenTex(text, bg = '#2c3e66', fg = '#f5efe0') {
  return canvasTex('noren' + text + bg, 256, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 1; i < 3; i++) ctx.fillRect((i / 3) * w - 2, 20, 4, h);
    ctx.fillStyle = fg;
    ctx.font = 'bold 64px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 6);
  });
}

export function signTex(text, bg = '#f3e6c8', fg = '#3a2a1c', vertical = false) {
  return canvasTex('sign' + text + bg + vertical, vertical ? 64 : 256, vertical ? 256 : 64, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (vertical) {
      ctx.font = 'bold 44px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
      const chars = [...text];
      chars.forEach((ch, i) => ctx.fillText(ch, w / 2, 36 + i * 48));
    } else {
      ctx.font = 'bold 36px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
      ctx.fillText(text, w / 2, h / 2 + 2);
    }
  });
}

export function vendingTex(theme = 'red') {
  return canvasTex('vend' + theme, 128, 256, (ctx, w, h) => {
    ctx.fillStyle = theme === 'red' ? '#d23b2f' : '#2f6fb3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#eef3f5';
    ctx.fillRect(10, 14, w - 20, 140);
    const cols = ['#e2533d', '#f4c542', '#4f9ad6', '#6fbf73', '#f08fb0', '#8a5a3c', '#ffffff', '#3c3c3c'];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        ctx.fillStyle = cols[(r * 5 + c * 3) % cols.length];
        ctx.fillRect(16 + c * 20, 22 + r * 44, 14, 30);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(16 + c * 20, 22 + r * 44, 14, 5);
        ctx.fillStyle = '#39c26a';
        ctx.fillRect(18 + c * 20, 56 + r * 44, 10, 4);
      }
    }
    ctx.fillStyle = '#222';
    ctx.fillRect(18, 196, w - 36, 34);
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(w - 34, 164, 18, 22);
  });
}

export function paperTex(text) {
  return canvasTex('paper' + text, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#fbf7ec';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c0392b';
    ctx.font = 'bold 30px "Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
  });
}

export function newspaperTex() {
  return canvasTex('news', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#eceae2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b2b2b';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('新聞', 8, 26);
    ctx.fillStyle = '#6b6b6b';
    for (let i = 0; i < 12; i++) ctx.fillRect(8 + (i % 2) * 60, 38 + Math.floor(i / 2) * 14, 52, 6);
  });
}
