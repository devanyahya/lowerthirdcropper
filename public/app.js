(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const fileInput = document.getElementById('fileInput');
  const placeholder = document.getElementById('placeholder');
  const stage = document.getElementById('stage');
  const statusEl = document.getElementById('status');

  let img = null;
  let scale = 1;
  let grid = false;
  let drag = null;
  let saved = null;

  // Rectangle defined by left/top/right/bottom in canvas coords
  let rect = { l: 0, t: 0, r: 0, b: 0 };
  let radius = 20;            // corner radius in canvas px
  const corners = { tl: true, tr: true, br: true, bl: true };
  const HANDLE = 9;

  const presets = {
    bar:    [0.05, 0.66, 0.95, 0.93],
    lower:  [0.05, 0.62, 0.62, 0.90],
    left:   [0.04, 0.70, 0.45, 0.94],
    right:  [0.55, 0.70, 0.96, 0.94],
    wide:   [0.0,  0.70, 1.0,  1.0],
    center: [0.22, 0.40, 0.78, 0.62],
  };

  function setStatus(msg, color) {
    statusEl.textContent = msg || '';
    statusEl.style.color = color || 'var(--ok)';
  }

  function applyPreset(name) {
    if (!img) return;
    const p = presets[name];
    rect = {
      l: p[0] * canvas.width,
      t: p[1] * canvas.height,
      r: p[2] * canvas.width,
      b: p[3] * canvas.height,
    };
    draw();
  }

  function fit() {
    if (!img) return;
    scale = Math.min(1, stage.clientWidth / img.width);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
  }

  function loadImage(src) {
    const i = new Image();
    i.onload = function () {
      img = i;
      placeholder.style.display = 'none';
      canvas.style.display = 'block';
      stage.style.minHeight = '0';
      fit();
      applyPreset('lower');
      setStatus('Gambar dimuat (' + img.width + '×' + img.height + ' px)');
    };
    i.onerror = function () { setStatus('Gagal memuat gambar', 'var(--danger)'); };
    i.src = src;
  }

  // Build a rounded-rect path. r is clamped so it never breaks the box.
  function buildPath(p, R, box) {
    const w = box.r - box.l;
    const h = box.b - box.t;
    const rr = Math.max(0, Math.min(R, w / 2, h / 2));
    const tl = corners.tl ? rr : 0;
    const tr = corners.tr ? rr : 0;
    const br = corners.br ? rr : 0;
    const bl = corners.bl ? rr : 0;
    p.beginPath();
    p.moveTo(box.l + tl, box.t);
    p.lineTo(box.r - tr, box.t);
    if (tr) p.arcTo(box.r, box.t, box.r, box.t + tr, tr);
    p.lineTo(box.r, box.b - br);
    if (br) p.arcTo(box.r, box.b, box.r - br, box.b, br);
    p.lineTo(box.l + bl, box.b);
    if (bl) p.arcTo(box.l, box.b, box.l, box.b - bl, bl);
    p.lineTo(box.l, box.t + tl);
    if (tl) p.arcTo(box.l, box.t, box.l + tl, box.t, tl);
    p.closePath();
  }

  function draw() {
    if (!img) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (grid) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 1;
      for (let k = 1; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(canvas.width * k / 3, 0); ctx.lineTo(canvas.width * k / 3, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, canvas.height * k / 3); ctx.lineTo(canvas.width, canvas.height * k / 3); ctx.stroke();
      }
      ctx.restore();
    }

    // dim outside the crop
    ctx.save();
    buildPath(ctx, radius, rect);
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(8,16,30,0.6)';
    ctx.fill('evenodd');
    ctx.restore();

    // outline
    ctx.save();
    buildPath(ctx, radius, rect);
    ctx.strokeStyle = '#2ec5ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // corner handles
    const hs = [
      { x: rect.l, y: rect.t }, { x: rect.r, y: rect.t },
      { x: rect.r, y: rect.b }, { x: rect.l, y: rect.b },
    ];
    hs.forEach(function (h) { drawDot(h.x, h.y, '#2ec5ff', HANDLE / 2); });
    // edge midpoints
    const mids = [
      { x: (rect.l + rect.r) / 2, y: rect.t }, { x: rect.r, y: (rect.t + rect.b) / 2 },
      { x: (rect.l + rect.r) / 2, y: rect.b }, { x: rect.l, y: (rect.t + rect.b) / 2 },
    ];
    mids.forEach(function (m) { drawDot(m.x, m.y, '#f0b428', HANDLE / 2 - 1); });
  }

  function drawDot(x, y, c, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r - 1.5, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
  }

  function getPos(e) {
    const rb = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rb.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rb.top;
    return { x: cx * (canvas.width / rb.width), y: cy * (canvas.height / rb.height) };
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function hitHandle(pos) {
    const map = {
      tl: { x: rect.l, y: rect.t }, tr: { x: rect.r, y: rect.t },
      br: { x: rect.r, y: rect.b }, bl: { x: rect.l, y: rect.b },
      mt: { x: (rect.l + rect.r) / 2, y: rect.t }, mr: { x: rect.r, y: (rect.t + rect.b) / 2 },
      mb: { x: (rect.l + rect.r) / 2, y: rect.b }, ml: { x: rect.l, y: (rect.t + rect.b) / 2 },
    };
    for (const k in map) if (dist(pos, map[k]) < HANDLE + 4) return k;
    return null;
  }

  function inside(pos) {
    return pos.x > Math.min(rect.l, rect.r) && pos.x < Math.max(rect.l, rect.r) &&
           pos.y > Math.min(rect.t, rect.b) && pos.y < Math.max(rect.t, rect.b);
  }

  function normalize() {
    if (rect.l > rect.r) { const t = rect.l; rect.l = rect.r; rect.r = t; }
    if (rect.t > rect.b) { const t = rect.t; rect.t = rect.b; rect.b = t; }
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!img) return;
    const pos = getPos(e);
    const h = hitHandle(pos);
    if (h) drag = { type: h };
    else if (inside(pos)) drag = { type: 'move', start: pos, snap: { ...rect } };
    if (drag) canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag || !img) return;
    const pos = getPos(e);
    const x = clamp(pos.x, 0, canvas.width);
    const y = clamp(pos.y, 0, canvas.height);
    switch (drag.type) {
      case 'tl': rect.l = x; rect.t = y; break;
      case 'tr': rect.r = x; rect.t = y; break;
      case 'br': rect.r = x; rect.b = y; break;
      case 'bl': rect.l = x; rect.b = y; break;
      case 'mt': rect.t = y; break;
      case 'mb': rect.b = y; break;
      case 'ml': rect.l = x; break;
      case 'mr': rect.r = x; break;
      case 'move': {
        const dx = pos.x - drag.start.x, dy = pos.y - drag.start.y;
        const w = drag.snap.r - drag.snap.l, hh = drag.snap.b - drag.snap.t;
        let nl = clamp(drag.snap.l + dx, 0, canvas.width - w);
        let nt = clamp(drag.snap.t + dy, 0, canvas.height - hh);
        rect.l = nl; rect.t = nt; rect.r = nl + w; rect.b = nt + hh;
        break;
      }
    }
    draw();
  });

  function endDrag() { if (drag) { normalize(); draw(); } drag = null; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Controls
  document.getElementById('btnUpload').onclick = function () { fileInput.click(); };
  fileInput.onchange = function () {
    const f = fileInput.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = function () { loadImage(rd.result); };
    rd.readAsDataURL(f);
  };

  const btnGrid = document.getElementById('btnGrid');
  btnGrid.onclick = function () { grid = !grid; btnGrid.classList.toggle('on', grid); draw(); };

  const radiusEl = document.getElementById('radius');
  const radiusVal = document.getElementById('radiusVal');
  radiusEl.oninput = function () {
    radius = parseInt(radiusEl.value, 10);
    radiusVal.textContent = radius;
    draw();
  };

  document.querySelectorAll('.cornerBtn').forEach(function (b) {
    b.onclick = function () {
      const c = b.dataset.c;
      corners[c] = !corners[c];
      b.classList.toggle('on', corners[c]);
      draw();
    };
  });

  document.querySelectorAll('.preset').forEach(function (b) {
    b.onclick = function () { applyPreset(b.dataset.p); };
  });

  document.getElementById('btnSave').onclick = function () {
    if (!img) { setStatus('Upload gambar dulu', 'var(--danger)'); return; }
    saved = {
      // store as ratios so it works on any image size
      l: rect.l / canvas.width, t: rect.t / canvas.height,
      r: rect.r / canvas.width, b: rect.b / canvas.height,
      radius: radius / canvas.width,
      corners: { ...corners },
    };
    try { localStorage.setItem('ltc_shape', JSON.stringify(saved)); } catch (e) {}
    setStatus('Bentuk tersimpan ✓');
  };

  document.getElementById('btnLoad').onclick = function () {
    if (!img) { setStatus('Upload gambar dulu', 'var(--danger)'); return; }
    let s = saved;
    if (!s) { try { s = JSON.parse(localStorage.getItem('ltc_shape')); } catch (e) {} }
    if (!s) { setStatus('Belum ada bentuk tersimpan', 'var(--danger)'); return; }
    rect = {
      l: s.l * canvas.width, t: s.t * canvas.height,
      r: s.r * canvas.width, b: s.b * canvas.height,
    };
    radius = Math.round(s.radius * canvas.width);
    radiusEl.value = radius; radiusVal.textContent = radius;
    Object.assign(corners, s.corners);
    document.querySelectorAll('.cornerBtn').forEach(function (b) {
      b.classList.toggle('on', corners[b.dataset.c]);
    });
    draw();
    setStatus('Bentuk dimuat ✓');
  };

  document.getElementById('btnExport').onclick = function () {
    if (!img) { setStatus('Upload gambar dulu', 'var(--danger)'); return; }
    const s = img.width / canvas.width;
    const out = document.createElement('canvas');
    out.width = img.width; out.height = img.height;
    const o = out.getContext('2d');
    const scaledRect = { l: rect.l * s, t: rect.t * s, r: rect.r * s, b: rect.b * s };
    o.save();
    buildPath(o, radius * s, scaledRect);
    o.clip();
    o.drawImage(img, 0, 0);
    o.restore();
    const a = document.createElement('a');
    a.download = 'lower-third.png';
    a.href = out.toDataURL('image/png');
    a.click();
    setStatus('PNG diunduh ✓');
  };

  window.addEventListener('resize', function () {
    if (!img) return;
    const old = { w: canvas.width, h: canvas.height };
    fit();
    const rx = canvas.width / old.w, ry = canvas.height / old.h;
    rect.l *= rx; rect.r *= rx; rect.t *= ry; rect.b *= ry;
    radius = Math.round(radius * rx);
    radiusEl.value = radius; radiusVal.textContent = radius;
    draw();
  });
})();
