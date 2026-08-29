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

  let rect = { l: 0, t: 0, r: 0, b: 0 };
  let radius = 20;
  const corners = { tl: true, tr: true, br: true, bl: true };
  const HANDLE = 9;

  const shadow = { on: false, x: 0, y: 12, blur: 30, op: 55, color: '#000000' };
  const outline = { on: false, w: 6, color: '#ff3b30', pos: 'outer' };

  // Pudar bertahap: pekat di pangkal, menipis ke arah yang dipilih sampai hilang.
  const fade = { on: false, dir: 'up', start: 0, end: 100, curve: 'smooth' };
  // Band selebar penuh di bagian bawah gambar, dalam persen tinggi gambar.
  const band = { h: 25, off: 0 };

  const exportCfg = {
    canvas: '1920x1080',   // 'WxH' | 'source' | 'trim' | 'custom'
    customW: 1920,
    customH: 1080,
    position: 'bottom',    // 'bottom' | 'center' | 'original'
    fit: 'fit',            // 'fit' | 'none'
    margin: 0,
  };

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

  function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
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
    // Muat ke panggung pada kedua sumbu. Sebelumnya hanya lebar yang dihitung,
    // sehingga gambar potret meluber jauh ke bawah layar.
    const cs = getComputedStyle(stage);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = Math.max(80, stage.clientWidth - padX);
    const availH = Math.max(80, stage.clientHeight - padY);
    scale = Math.min(1, availW / img.width, availH / img.height);
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
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
    ctx.fillStyle = 'rgba(14,20,30,0.55)';
    ctx.fill('evenodd');
    ctx.restore();

    // Pudar dan garis tepi digambar lewat jalur yang sama persis dengan ekspor,
    // jadi tebal dan letaknya di layar memang seperti yang akan keluar.
    paintShape(
      ctx, radius, rect,
      function () { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); },
      outline.on && outline.w > 0 ? outline : null,
      fade.on
    );

    // editor outline
    ctx.save();
    buildPath(ctx, radius, rect);
    ctx.strokeStyle = '#FF5A1F';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.restore();

    const hs = [
      { x: rect.l, y: rect.t }, { x: rect.r, y: rect.t },
      { x: rect.r, y: rect.b }, { x: rect.l, y: rect.b },
    ];
    hs.forEach(function (h) { drawDot(h.x, h.y, '#FF5A1F', HANDLE / 2); });
    const mids = [
      { x: (rect.l + rect.r) / 2, y: rect.t }, { x: rect.r, y: (rect.t + rect.b) / 2 },
      { x: (rect.l + rect.r) / 2, y: rect.b }, { x: rect.l, y: (rect.t + rect.b) / 2 },
    ];
    mids.forEach(function (m) { drawDot(m.x, m.y, '#16202E', HANDLE / 2 - 1); });

    updateExportInfo();
  }

  // Mengecat isi bentuk beserta pudarnya, lalu garis tepinya. Satu-satunya
  // tempat urutan itu ditulis, sehingga pratinjau tidak bisa menyimpang
  // dari hasil ekspor. `repaint` menggambar ulang sumber di dalam bentuk.
  function paintShape(c, R, box, repaint, ol, fd) {
    const bx = Math.min(box.l, box.r), by = Math.min(box.t, box.b);
    const bw = Math.abs(box.r - box.l), bh = Math.abs(box.b - box.t);

    function fillBody() {
      c.save();
      buildPath(c, R, box);
      c.clip();
      repaint();
      if (fd) {
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = fadeGradient(c, box);
        c.fillRect(bx, by, bw, bh);
      }
      c.restore();
    }

    fillBody();
    if (!ol || !ol.on || !(ol.w > 0)) return;

    c.save();
    c.setLineDash([]);
    c.strokeStyle = ol.color;
    if (ol.pos === 'inner') {
      // Digambar dua kali lebar lalu dipotong, menyisakan tebal penuh di dalam.
      buildPath(c, R, box);
      c.clip();
      buildPath(c, R, box);
      c.lineWidth = ol.w * 2;
      c.stroke();
    } else if (ol.pos === 'outer') {
      buildPath(c, R, box);
      c.lineWidth = ol.w * 2;
      c.stroke();
      c.globalCompositeOperation = 'destination-out';
      buildPath(c, R, box);
      c.fillStyle = '#000';
      c.fill();
      c.globalCompositeOperation = 'source-over';
      fillBody();
    } else {
      buildPath(c, R, box);
      c.lineWidth = ol.w;
      c.stroke();
    }
    c.restore();
  }

  // Gradien alfa sepanjang sumbu pudar. Nilai warna dipakai sebagai
  // "seberapa banyak dihapus": 0 = utuh, 1 = hilang sepenuhnya.
  function fadeGradient(c, box) {
    const l = Math.min(box.l, box.r), r = Math.max(box.l, box.r);
    const t = Math.min(box.t, box.b), b = Math.max(box.t, box.b);
    let x0, y0, x1, y1;
    if (fade.dir === 'down')       { x0 = l; y0 = t; x1 = l; y1 = b; }
    else if (fade.dir === 'left')  { x0 = r; y0 = t; x1 = l; y1 = t; }
    else if (fade.dir === 'right') { x0 = l; y0 = t; x1 = r; y1 = t; }
    else                           { x0 = l; y0 = b; x1 = l; y1 = t; }

    const g = c.createLinearGradient(x0, y0, x1, y1);
    const a = Math.min(fade.start, fade.end) / 100;
    const z = Math.max(fade.start, fade.end) / 100;

    g.addColorStop(0, 'rgba(0,0,0,0)');
    if (a > 0) g.addColorStop(a, 'rgba(0,0,0,0)');
    if (z > a) {
      if (fade.curve === 'smooth') {
        for (let i = 1; i < 8; i++) {
          const u = i / 8;
          const e = u * u * (3 - 2 * u);
          g.addColorStop(a + (z - a) * u, 'rgba(0,0,0,' + e.toFixed(4) + ')');
        }
      }
      g.addColorStop(z, 'rgba(0,0,0,1)');
    } else {
      g.addColorStop(Math.min(1, a + 0.0001), 'rgba(0,0,0,1)');
    }
    if (z < 1) g.addColorStop(1, 'rgba(0,0,0,1)');
    return g;
  }

  function drawDot(x, y, c, r) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r - 1.5, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    ctx.restore();
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

  document.getElementById('btnUpload').onclick = function () { fileInput.click(); };
  const btnUpload2 = document.getElementById('btnUpload2');
  if (btnUpload2) btnUpload2.onclick = function () { fileInput.click(); };

  fileInput.onchange = function () {
    const f = fileInput.files[0]; if (!f) return;
    const nameEl = document.getElementById('fileName');
    if (nameEl) nameEl.textContent = f.name;
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

  // Shadow controls
  const btnShadow = document.getElementById('btnShadow');
  const shadowControls = document.getElementById('shadowControls');
  btnShadow.onclick = function () {
    shadow.on = !shadow.on;
    btnShadow.classList.toggle('on', shadow.on);
    btnShadow.setAttribute('aria-checked', String(shadow.on));
    syncFxState();
    shadowControls.style.display = shadow.on ? 'flex' : 'none';
    draw();
  };
  function bindSlider(id, valId, key, obj, suffix) {
    const el = document.getElementById(id);
    const v = document.getElementById(valId);
    el.oninput = function () {
      obj[key] = parseInt(el.value, 10);
      v.textContent = el.value + (suffix || '');
      draw();
    };
  }
  bindSlider('shX', 'shXVal', 'x', shadow);
  bindSlider('shY', 'shYVal', 'y', shadow);
  bindSlider('shBlur', 'shBlurVal', 'blur', shadow);
  bindSlider('shOp', 'shOpVal', 'op', shadow, '%');
  document.getElementById('shColor').oninput = function () { shadow.color = this.value; draw(); };

  // Outline controls
  const btnOutline = document.getElementById('btnOutline');
  const outlineControls = document.getElementById('outlineControls');
  btnOutline.onclick = function () {
    outline.on = !outline.on;
    btnOutline.classList.toggle('on', outline.on);
    btnOutline.setAttribute('aria-checked', String(outline.on));
    syncFxState();
    outlineControls.style.display = outline.on ? 'flex' : 'none';
    draw();
  };
  bindSlider('olW', 'olWVal', 'w', outline);
  document.getElementById('olColor').oninput = function () { outline.color = this.value; draw(); };
  document.querySelectorAll('.olPos').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('.olPos').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      outline.pos = b.dataset.pos;
      draw();
    };
  });

  // ---------- Kontrol fade & kanvas ekspor ----------

  function refresh() { if (img) draw(); else updateExportInfo(); }

  // Rel kiri menukar kelompok kendali; hanya satu yang tampak sekaligus,
  // supaya panel tidak lagi jadi dinding penuh penggeser.
  const tabBtns = document.querySelectorAll('.tabBtn');
  tabBtns.forEach(function (b) {
    b.onclick = function () {
      tabBtns.forEach(function (x) { x.classList.remove('on'); });
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      const t = document.getElementById('tab-' + b.dataset.tab);
      if (t) t.classList.add('on');
    };
  });

  function railDot(tab, on) {
    const b = document.querySelector('.tabBtn[data-tab="' + tab + '"]');
    if (b) b.classList.toggle('active-fx', on);
  }

  // Kartu efek yang menyala dan titik di rel: keadaan hidup/mati terbaca
  // tanpa perlu membuka kelompoknya satu per satu.
  function syncFxState() {
    const card = function (id, on) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('live', on);
    };
    card('fadeCard', fade.on);
    card('shadowCard', shadow.on);
    card('outlineCard', outline.on);
    railDot('fade', fade.on);
    railDot('efek', shadow.on || outline.on);
  }

  // Sekelompok tombol yang berperilaku seperti radio: satu aktif, sisanya mati.
  function radioGroup(selector, attr, onPick) {
    const els = document.querySelectorAll(selector);
    els.forEach(function (b) {
      b.onclick = function () {
        els.forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        onPick(b.dataset[attr]);
      };
    });
  }

  function pct(el, valEl, obj, key, after) {
    el.oninput = function () {
      obj[key] = parseInt(el.value, 10);
      valEl.textContent = el.value + '%';
      if (after) after();
      refresh();
    };
  }

  const btnFade = document.getElementById('btnFade');
  const fadeControls = document.getElementById('fadeControls');
  btnFade.onclick = function () {
    fade.on = !fade.on;
    btnFade.classList.toggle('on', fade.on);
    btnFade.setAttribute('aria-checked', String(fade.on));
    syncFxState();
    fadeControls.style.display = fade.on ? 'flex' : 'none';
    refresh();
  };

  radioGroup('.fdir', 'dir', function (v) { fade.dir = v; refresh(); });
  radioGroup('.fcrv', 'crv', function (v) { fade.curve = v; refresh(); });

  const fdStart = document.getElementById('fdStart');
  const fdEnd = document.getElementById('fdEnd');
  pct(fdStart, document.getElementById('fdStartVal'), fade, 'start');
  pct(fdEnd, document.getElementById('fdEndVal'), fade, 'end');

  // Menata ulang kotak jadi band selebar penuh di bagian bawah gambar.
  function applyBand() {
    if (!img) return;
    const h = canvas.height * (band.h / 100);
    const off = canvas.height * (band.off / 100);
    rect = {
      l: 0,
      r: canvas.width,
      b: Math.max(0, canvas.height - off),
      t: Math.max(0, canvas.height - off - h),
    };
    draw();
  }

  pct(document.getElementById('bandH'), document.getElementById('bandHVal'), band, 'h', applyBand);
  pct(document.getElementById('bandOff'), document.getElementById('bandOffVal'), band, 'off', applyBand);

  document.getElementById('btnFadePreset').onclick = function () {
    if (!img) { setStatus('Upload gambar dulu', 'var(--danger)'); return; }
    fade.on = true;
    fade.dir = 'up';
    btnFade.classList.add('on');
    fadeControls.style.display = 'flex';
    document.querySelectorAll('.fdir').forEach(function (x) { x.classList.toggle('on', x.dataset.dir === 'up'); });
    btnFade.setAttribute('aria-checked', 'true');
    syncFxState();
    radius = 0;
    radiusEl.value = 0; radiusVal.textContent = '0';
    applyBand();
    setStatus('Band bawah dipasang — tinggi ' + band.h + '% gambar, memudar ke atas');
  };

  const mgLabel = document.getElementById('mgLabel');
  const customSize = document.getElementById('customSize');

  function syncExportUI() {
    customSize.style.display = exportCfg.canvas === 'custom' ? 'flex' : 'none';
    mgLabel.textContent = exportCfg.position === 'bottom' && exportCfg.canvas !== 'trim'
      ? 'Jarak bawah' : 'Margin';
    // Posisi tidak berlaku saat kanvas dipaskan ke bentuk; bentuknya sudah pasti di tengah.
    document.querySelectorAll('.pos').forEach(function (b) {
      b.disabled = exportCfg.canvas === 'trim';
      b.style.opacity = exportCfg.canvas === 'trim' ? '.45' : '';
    });
  }

  radioGroup('.cv', 'cv', function (v) { exportCfg.canvas = v; syncExportUI(); refresh(); });
  radioGroup('.pos', 'pos', function (v) { exportCfg.position = v; syncExportUI(); refresh(); });
  radioGroup('.fitm', 'fit', function (v) { exportCfg.fit = v; refresh(); });

  document.getElementById('cw').oninput = function () { exportCfg.customW = parseInt(this.value, 10); refresh(); };
  document.getElementById('ch').oninput = function () { exportCfg.customH = parseInt(this.value, 10); refresh(); };

  const mg = document.getElementById('mg');
  const mgVal = document.getElementById('mgVal');
  mg.oninput = function () {
    exportCfg.margin = parseInt(mg.value, 10);
    mgVal.textContent = mg.value;
    refresh();
  };

  syncExportUI();
  syncFxState();
  updateExportInfo();

  document.getElementById('btnSave').onclick = function () {
    if (!img) { setStatus('Upload gambar dulu', 'var(--danger)'); return; }
    saved = {
      l: rect.l / canvas.width, t: rect.t / canvas.height,
      r: rect.r / canvas.width, b: rect.b / canvas.height,
      radius: radius / canvas.width,
      corners: { ...corners },
      shadow: { ...shadow },
      outline: { ...outline },
      fade: { ...fade },
      band: { ...band },
      exportCfg: { ...exportCfg },
    };
    try { localStorage.setItem('ltc_shape', JSON.stringify(saved)); } catch (e) {}
    setStatus('Bentuk tersimpan');
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
    if (s.shadow) {
      Object.assign(shadow, s.shadow);
      btnShadow.classList.toggle('on', shadow.on);
      shadowControls.style.display = shadow.on ? 'flex' : 'none';
      document.getElementById('shX').value = shadow.x; document.getElementById('shXVal').textContent = shadow.x;
      document.getElementById('shY').value = shadow.y; document.getElementById('shYVal').textContent = shadow.y;
      document.getElementById('shBlur').value = shadow.blur; document.getElementById('shBlurVal').textContent = shadow.blur;
      document.getElementById('shOp').value = shadow.op; document.getElementById('shOpVal').textContent = shadow.op + '%';
      document.getElementById('shColor').value = shadow.color;
    }
    if (s.outline) {
      Object.assign(outline, s.outline);
      btnOutline.classList.toggle('on', outline.on);
      outlineControls.style.display = outline.on ? 'flex' : 'none';
      document.getElementById('olW').value = outline.w; document.getElementById('olWVal').textContent = outline.w;
      document.getElementById('olColor').value = outline.color;
      document.querySelectorAll('.olPos').forEach(function (x) { x.classList.toggle('on', x.dataset.pos === outline.pos); });
    }
    if (s.fade) {
      Object.assign(fade, s.fade);
      btnFade.classList.toggle('on', fade.on);
      fadeControls.style.display = fade.on ? 'flex' : 'none';
      fdStart.value = fade.start; document.getElementById('fdStartVal').textContent = fade.start + '%';
      fdEnd.value = fade.end; document.getElementById('fdEndVal').textContent = fade.end + '%';
      document.querySelectorAll('.fdir').forEach(function (x) { x.classList.toggle('on', x.dataset.dir === fade.dir); });
      document.querySelectorAll('.fcrv').forEach(function (x) { x.classList.toggle('on', x.dataset.crv === fade.curve); });
    }
    if (s.band) {
      Object.assign(band, s.band);
      document.getElementById('bandH').value = band.h;
      document.getElementById('bandHVal').textContent = band.h + '%';
      document.getElementById('bandOff').value = band.off;
      document.getElementById('bandOffVal').textContent = band.off + '%';
    }
    if (s.exportCfg) {
      Object.assign(exportCfg, s.exportCfg);
      document.querySelectorAll('.cv').forEach(function (x) { x.classList.toggle('on', x.dataset.cv === exportCfg.canvas); });
      document.querySelectorAll('.pos').forEach(function (x) { x.classList.toggle('on', x.dataset.pos === exportCfg.position); });
      document.querySelectorAll('.fitm').forEach(function (x) { x.classList.toggle('on', x.dataset.fit === exportCfg.fit); });
      document.getElementById('cw').value = exportCfg.customW;
      document.getElementById('ch').value = exportCfg.customH;
      mg.value = exportCfg.margin; mgVal.textContent = exportCfg.margin;
      syncExportUI();
    }
    syncFxState();
    draw();
    setStatus('Bentuk dimuat');
  };

  // ================= Ekspor =================
  // Semua ukuran di fungsi-fungsi ini memakai piksel gambar asli, bukan
  // piksel pratinjau, supaya hasilnya tidak bergantung pada lebar jendela.

  function nativeGeometry() {
    const s = img.width / canvas.width;
    const nr = {
      l: Math.min(rect.l, rect.r) * s, r: Math.max(rect.l, rect.r) * s,
      t: Math.min(rect.t, rect.b) * s, b: Math.max(rect.t, rect.b) * s,
    };
    const sh = shadow.on
      ? { on: true, x: shadow.x * s, y: shadow.y * s, blur: shadow.blur * s, op: shadow.op, color: shadow.color }
      : null;
    const ol = outline.on && outline.w > 0
      ? { on: true, w: outline.w * s, color: outline.color, pos: outline.pos }
      : null;

    // Kotak pembatas ikut menghitung ruang yang dipakai shadow dan outline luar.
    // Tanpa ini, efeknya menempel ke tepi kanvas begitu bentuknya dipusatkan.
    const bbox = { l: nr.l, t: nr.t, r: nr.r, b: nr.b };
    if (sh) {
      bbox.l = Math.min(bbox.l, nr.l + sh.x - sh.blur);
      bbox.r = Math.max(bbox.r, nr.r + sh.x + sh.blur);
      bbox.t = Math.min(bbox.t, nr.t + sh.y - sh.blur);
      bbox.b = Math.max(bbox.b, nr.b + sh.y + sh.blur);
    }
    if (ol) {
      const ext = ol.pos === 'outer' ? ol.w : (ol.pos === 'center' ? ol.w / 2 : 0);
      bbox.l = Math.min(bbox.l, nr.l - ext);
      bbox.r = Math.max(bbox.r, nr.r + ext);
      bbox.t = Math.min(bbox.t, nr.t - ext);
      bbox.b = Math.max(bbox.b, nr.b + ext);
    }
    return { s, nr, nR: radius * s, sh, ol, bbox };
  }

  function targetSize(g) {
    if (exportCfg.canvas === 'source') return { w: img.width, h: img.height };
    if (exportCfg.canvas === 'custom') {
      return {
        w: clamp(Math.round(exportCfg.customW) || 1, 16, 16384),
        h: clamp(Math.round(exportCfg.customH) || 1, 16, 16384),
      };
    }
    if (exportCfg.canvas === 'trim') {
      const m = exportCfg.margin;
      return {
        w: Math.max(16, Math.ceil(g.bbox.r - g.bbox.l + m * 2)),
        h: Math.max(16, Math.ceil(g.bbox.b - g.bbox.t + m * 2)),
      };
    }
    const p = exportCfg.canvas.split('x');
    return { w: parseInt(p[0], 10), h: parseInt(p[1], 10) };
  }

  // Satu sumber kebenaran untuk ukuran, skala, dan pergeseran — dipakai
  // bersama oleh panel info dan proses ekspor supaya angkanya selalu sama.
  function exportPlan() {
    const g = nativeGeometry();
    const size = targetSize(g);
    const m = exportCfg.margin;
    const bw = g.bbox.r - g.bbox.l;
    const bh = g.bbox.b - g.bbox.t;
    const cx = (g.bbox.l + g.bbox.r) / 2;
    const cy = (g.bbox.t + g.bbox.b) / 2;

    let k = 1, tx = 0, ty = 0;

    if (exportCfg.canvas === 'trim') {
      tx = m - g.bbox.l;
      ty = m - g.bbox.t;
    } else if (exportCfg.position === 'original') {
      // Seluruh frame dipetakan ke kanvas, bentuk tetap di tempat aslinya.
      if (exportCfg.fit === 'fit') k = Math.min(1, size.w / img.width, size.h / img.height);
      tx = (size.w - img.width * k) / 2;
      ty = (size.h - img.height * k) / 2;
    } else if (exportCfg.position === 'bottom') {
      // Tengah secara mendatar, menempel ke bawah dengan jarak sebesar margin.
      if (exportCfg.fit === 'fit') {
        k = Math.min(1, size.w / bw, Math.max(1, size.h - m) / bh);
      }
      tx = size.w / 2 - cx * k;
      ty = (size.h - m) - g.bbox.b * k;
    } else {
      if (exportCfg.fit === 'fit') {
        k = Math.min(1, Math.max(1, size.w - m * 2) / bw, Math.max(1, size.h - m * 2) / bh);
      }
      tx = size.w / 2 - cx * k;
      ty = size.h / 2 - cy * k;
    }

    const placed = {
      l: g.bbox.l * k + tx, t: g.bbox.t * k + ty,
      r: g.bbox.r * k + tx, b: g.bbox.b * k + ty,
    };
    const clipped = placed.l < -0.5 || placed.t < -0.5 ||
                    placed.r > size.w + 0.5 || placed.b > size.h + 0.5;

    return { g, size, k, tx, ty, clipped, bw, bh, placed };
  }

  function updateExportInfo() {
    const el = document.getElementById('exInfo');
    if (!el) return;
    if (!img) { el.textContent = 'Belum ada gambar.'; el.style.color = 'var(--muted)'; return; }
    const p = exportPlan();
    const bits = [
      'Kanvas ' + p.size.w + '×' + p.size.h,
      'bentuk ' + Math.round(p.bw * p.k) + '×' + Math.round(p.bh * p.k),
      'skala ' + Math.round(p.k * 1000) / 10 + '%',
    ];
    if (p.clipped) bits.push('bentuk melebihi kanvas — akan terpotong');
    el.textContent = bits.join('   ·   ');
    el.style.color = p.clipped ? 'var(--danger)' : 'var(--muted)';
  }

  function exportName(size) {
    const where = exportCfg.canvas === 'trim' ? 'pas'
      : exportCfg.position === 'bottom' ? 'tengah-bawah'
      : exportCfg.position === 'center' ? 'tengah'
      : 'asli';
    return 'lower-third-' + size.w + 'x' + size.h + '-' + where + '.png';
  }

  document.getElementById('btnExport').onclick = function () {
    if (!img) { setStatus('Upload gambar dulu', 'var(--danger)'); return; }
    const plan = exportPlan();
    const g = plan.g, k = plan.k, tx = plan.tx, ty = plan.ty, size = plan.size;

    const out = document.createElement('canvas');
    out.width = size.w;
    out.height = size.h;
    const o = out.getContext('2d');

    const base = document.createElement('canvas');
    base.width = img.width; base.height = img.height;
    base.getContext('2d').drawImage(img, 0, 0);

    // Koordinat dihitung langsung ke ruang kanvas keluaran, bukan lewat
    // transform kanvas: shadowOffset dan shadowBlur tidak ikut transform
    // secara konsisten di semua peramban.
    const box = {
      l: g.nr.l * k + tx, t: g.nr.t * k + ty,
      r: g.nr.r * k + tx, b: g.nr.b * k + ty,
    };
    const sh = g.sh ? { on: true, x: g.sh.x * k, y: g.sh.y * k, blur: g.sh.blur * k, op: g.sh.op, color: g.sh.color } : null;
    const ol = g.ol ? { on: true, w: g.ol.w * k, color: g.ol.color, pos: g.ol.pos } : null;
    const imgRect = { x: tx, y: ty, w: img.width * k, h: img.height * k };

    renderCompositeExport(o, box, g.nR * k, base, imgRect, ol, sh);

    const a = document.createElement('a');
    a.download = exportName(size);
    a.href = out.toDataURL('image/png');
    a.click();

    setStatus('PNG diunduh — ' + size.w + '×' + size.h +
      (k !== 1 ? ' pada skala ' + (Math.round(k * 1000) / 10) + '%' : '') +
      (plan.clipped ? ' · sebagian terpotong' : ''),
      plan.clipped ? 'var(--danger)' : 'var(--ok)');
  };

  function renderCompositeExport(c, box, R, srcImg, ir, lw, sh) {
    if (sh && sh.on) {
      c.save();
      c.shadowColor = hexToRgba(sh.color, sh.op / 100);
      c.shadowBlur = sh.blur;
      c.shadowOffsetX = sh.x;
      c.shadowOffsetY = sh.y;
      buildPath(c, R, box);
      c.fillStyle = 'rgba(0,0,0,1)';
      c.fill();
      c.restore();
    }
    paintShape(c, R, box, function () { c.drawImage(srcImg, ir.x, ir.y, ir.w, ir.h); }, lw, fade.on);
  }

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
