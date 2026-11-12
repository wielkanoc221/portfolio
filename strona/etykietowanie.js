/* Accur8Pool — demo narzędzia do etykietowania danych z sensorów.
   Przeglądarkowy odpowiednik aplikacji Dash (scripts/labeling.py):
   ta sama logika zakresów, etykiet i eksportu, wykres rysowany na canvasie. */
(function () {
  'use strict';

  var COLORS = ['#2f6db3', '#d1782a', '#3c8d4f', '#c0392b', '#7b58a6', '#8c6d46', '#c2569b', '#4f6d70', '#9a9420', '#2aa1b3'];
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    filename: null,
    header: [],       // nazwy kolumn
    rawLines: [],     // oryginalne wiersze (bez nagłówka) — do eksportu "append"
    cols: {},         // nazwa -> Float64Array (kolumny liczbowe) albo Array (tekstowe)
    numeric: {},      // nazwa -> czy kolumna jest liczbowa
    n: 0,
    selected: [],
    hidden: {},       // serie ukryte kliknięciem w legendę
    labels: [],
    currentRange: null,     // {start_x, end_x}
    currentIdxRange: null,  // {start_idx, end_idx}
    view: null              // [x0, x1] widoczny zakres osi X
  };

  // ============================================================
  // CSV
  // ============================================================

  function splitCsvLine(line) {
    if (line.indexOf('"') === -1) return line.split(',');
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parseCsv(text) {
    var lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) throw new Error('Plik CSV nie zawiera danych.');
    var header = splitCsvLine(lines[0]).map(function (h) { return h.trim(); });
    var rows = lines.slice(1);
    var n = rows.length, k = header.length;
    var raw = header.map(function () { return new Array(n); });
    for (var r = 0; r < n; r++) {
      var cells = splitCsvLine(rows[r]);
      for (var c = 0; c < k; c++) raw[c][r] = cells[c] === undefined ? '' : cells[c];
    }
    var cols = {}, numeric = {};
    header.forEach(function (name, c) {
      var arr = new Float64Array(n), isNum = true;
      for (var r = 0; r < n; r++) {
        var s = raw[c][r].trim();
        var v = s === '' ? NaN : Number(s);
        if (s !== '' && isNaN(v)) { isNum = false; break; }
        arr[r] = v;
      }
      cols[name] = isNum ? arr : raw[c];
      numeric[name] = isNum;
    });
    return { header: header, rawLines: rows, cols: cols, numeric: numeric, n: n };
  }

  function csvField(v) {
    var s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function download(text, filename) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function safeName() {
    return (state.filename || 'data.csv').replace(/\.[^.]*$/, '');
  }

  // Python: str(float) -> "3.0", str(3.5) -> "3.5"
  function pyStr(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(1) : String(v);
    return String(v);
  }

  // ============================================================
  // Dane przykładowe (syntetyczne, w formacie plików z zegarka)
  // ============================================================

  function makeDemoCsv() {
    var seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    function noise(a) { return (rnd() + rnd() + rnd() - 1.5) * a; }
    function smooth(t, a, b) { if (t <= a) return 0; if (t >= b) return 1; var u = (t - a) / (b - a); return u * u * (3 - 2 * u); }

    var HZ = 100, DURATION = 66, G = 9.81;
    var hits = [{ t: 10, f: 34 }, { t: 22.5, f: 21 }, { t: 34, f: 46 }, { t: 46.5, f: 27 }, { t: 58, f: 38 }];
    var header = ['accx', 'accy', 'accz', 'gyrx', 'gyry', 'gyrz', 'magx', 'magy', 'magz', 'linaccx', 'linaccy', 'linaccz', 'rotx', 'roty', 'rotz', 'timestamp'];
    var lines = [header.join(',')];
    var prevRoll = 0;
    for (var i = 0; i < HZ * DURATION; i++) {
      var t = i / HZ;
      var roll = 0, gyrz = 0, gyry = 0, lx = 0, ly = 0, lz = 0;
      hits.forEach(function (h) {
        var d = t - h.t;
        // przygotowanie: obrót nadgarstka do pozycji uderzenia, powrót po uderzeniu
        roll += -1.25 * smooth(d, -5.5, -3.8) * (1 - smooth(d, 2.2, 3.6));
        // przymierzenie: ruch kija w przód i w tył
        if (d > -3.4 && d < -0.35) {
          var env = Math.sin(Math.PI * (d + 3.4) / 3.05);
          gyrz += 1.1 * env * Math.sin(2 * Math.PI * 1.05 * (d + 3.4));
          lx += 0.9 * env * Math.cos(2 * Math.PI * 1.05 * (d + 3.4));
        }
        // zamach i uderzenie
        if (d > -0.35 && d < 0) gyrz += -3.2 * Math.sin(Math.PI * (d + 0.35) / 0.35);
        if (d >= 0 && d < 0.6) {
          var decay = Math.exp(-d * 18);
          lx += h.f * decay * Math.cos(2 * Math.PI * 26 * d);
          ly += 0.45 * h.f * decay * Math.sin(2 * Math.PI * 31 * d);
          lz += 0.3 * h.f * decay * Math.cos(2 * Math.PI * 22 * d + 1);
          gyrz += (h.f / 6) * Math.exp(-d * 9);
          gyry += (h.f / 14) * decay;
        }
        // okres po uderzeniu: wybrzmienie ruchu
        if (d >= 0.6 && d < 2.2) gyrz += 0.8 * Math.exp(-(d - 0.6) * 2) * Math.sin(2 * Math.PI * 1.6 * d);
      });
      // lekkie ruchy ręki między uderzeniami
      roll += 0.08 * Math.sin(t * 0.7) + 0.05 * Math.sin(t * 1.9);
      var gyrx = (roll - prevRoll) * HZ + noise(0.03);
      prevRoll = roll;
      lx += noise(0.12); ly += noise(0.12); lz += noise(0.12);
      gyry += noise(0.03); gyrz += noise(0.03);
      var gy = G * Math.sin(roll), gz = G * Math.cos(roll);
      var row = [
        lx + noise(0.05), gy + ly, gz + lz,
        gyrx, gyry, gyrz,
        -0.6 + 18 * Math.sin(roll) + noise(0.4), 12.5 + 6 * Math.cos(roll) + noise(0.4), -35 + 4 * Math.sin(t * 0.05) + noise(0.4),
        lx, ly, lz,
        Math.sin(roll / 2), 0.02 * Math.sin(t * 0.3), 0.15 + 0.01 * Math.sin(t * 0.2),
        10.05 + noise(0.04)
      ];
      lines.push(row.map(function (v) { return v.toFixed(6); }).join(','));
    }
    return lines.join('\n');
  }

  // ============================================================
  // Dane na osi X / normalizacja
  // ============================================================

  function getX() {
    var tc = $('time-column').value;
    if (tc && state.numeric[tc]) return { x: state.cols[tc], title: tc };
    if (!state._index || state._index.length !== state.n) {
      state._index = new Float64Array(state.n);
      for (var i = 0; i < state.n; i++) state._index[i] = i;
    }
    return { x: state._index, title: 'index' };
  }

  function seriesFor(col, normalize) {
    var arr = state.cols[col];
    if (!normalize) return arr;
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < arr.length; i++) { var v = arr[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!isFinite(mn) || !isFinite(mx)) return arr;
    var out = new Float64Array(arr.length);
    if (mx !== mn) for (var j = 0; j < arr.length; j++) out[j] = (arr[j] - mn) / (mx - mn);
    return out;
  }

  function extent(arr) {
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < arr.length; i++) { var v = arr[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    return [mn, mx];
  }

  // ============================================================
  // Wykres (canvas)
  // ============================================================

  var canvas = $('chart-canvas'), ctx = canvas.getContext('2d');
  var M = { l: 58, r: 14, t: 14, b: 38 };
  var drag = null, plotCache = null;

  function niceTicks(a, b, count) {
    var span = b - a;
    if (!(span > 0)) return [a];
    var step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var ticks = [];
    for (var v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return ticks;
  }

  function fmt(v) {
    var a = Math.abs(v);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(1);
    return String(Math.round(v * 1000) / 1000);
  }

  function lowerBound(x, v) { var lo = 0, hi = x.length; while (lo < hi) { var m = (lo + hi) >> 1; if (x[m] < v) lo = m + 1; else hi = m; } return lo; }

  function draw() {
    var box = canvas.parentElement.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var W = Math.max(200, box.width), H = Math.max(200, box.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var cols = state.selected.filter(function (c) { return state.numeric[c] && !state.hidden[c]; });
    var hasData = state.n > 0 && state.selected.length > 0;
    $('chart-empty').hidden = hasData;
    if (!hasData) { plotCache = null; return; }

    var X = getX(), x = X.x;
    var normalize = $('normalize-display').checked;
    var full = extent(x);
    if (!state.view) state.view = full.slice();
    var x0 = state.view[0], x1 = state.view[1];
    if (x1 <= x0) x1 = x0 + 1;
    var monotonic = state._monotonicFor === X.title ? state._monotonic : (function () {
      for (var i = 1; i < x.length; i++) if (x[i] < x[i - 1]) return (state._monotonic = false, state._monotonicFor = X.title, false);
      return (state._monotonic = true, state._monotonicFor = X.title, true);
    })();
    var i0 = 0, i1 = x.length - 1;
    if (monotonic) { i0 = Math.max(0, lowerBound(x, x0) - 1); i1 = Math.min(x.length - 1, lowerBound(x, x1) + 1); }

    var series = cols.map(function (c) { return { name: c, y: seriesFor(c, normalize), color: COLORS[state.selected.indexOf(c) % COLORS.length] }; });

    // zakres osi Y z widocznego fragmentu
    var ymin = Infinity, ymax = -Infinity;
    series.forEach(function (s) {
      for (var i = i0; i <= i1; i++) { if (x[i] < x0 || x[i] > x1) continue; var v = s.y[i]; if (v < ymin) ymin = v; if (v > ymax) ymax = v; }
    });
    if (!isFinite(ymin)) { ymin = 0; ymax = 1; }
    if (ymax === ymin) { ymin -= 1; ymax += 1; }
    var pad = (ymax - ymin) * 0.06; ymin -= pad; ymax += pad;

    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var sx = function (v) { return M.l + (v - x0) / (x1 - x0) * pw; };
    var sy = function (v) { return M.t + (ymax - v) / (ymax - ymin) * ph; };
    plotCache = { x0: x0, x1: x1, pw: pw, ph: ph, W: W, H: H, xTitle: X.title };

    // siatka i osie
    ctx.font = '11px system-ui, -apple-system, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#fff'; ctx.fillRect(M.l, M.t, pw, ph);
    ctx.strokeStyle = '#ebe7de'; ctx.lineWidth = 1; ctx.fillStyle = '#5d6058';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    niceTicks(ymin, ymax, Math.max(3, Math.floor(ph / 60))).forEach(function (v) {
      var y = Math.round(sy(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke();
      ctx.fillText(fmt(v), M.l - 8, y);
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    niceTicks(x0, x1, Math.max(3, Math.floor(pw / 90))).forEach(function (v) {
      var px = Math.round(sx(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, M.t); ctx.lineTo(px, M.t + ph); ctx.stroke();
      ctx.fillText(fmt(v), px, M.t + ph + 6);
    });
    ctx.fillText(X.title, M.l + pw / 2, H - 14);
    ctx.save(); ctx.translate(13, M.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(normalize ? 'normalized value' : 'value', 0, 0); ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();

    // zakresy etykiet
    state.labels.forEach(function (item, k) {
      var a = sx(Number(item.start_x)), b = sx(Number(item.end_x));
      if (b < M.l || a > M.l + pw) return;
      ctx.fillStyle = 'rgba(101,112,91,0.18)'; ctx.fillRect(a, M.t, Math.max(1, b - a), ph);
      ctx.strokeStyle = 'rgba(75,84,67,0.55)'; ctx.strokeRect(a + 0.5, M.t + 0.5, Math.max(1, b - a), ph - 1);
      ctx.fillStyle = '#3b4334'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(pyStr(item.label) + ' | id=' + item.id + ' | ' + item.start_idx + ':' + item.end_idx, Math.max(a, M.l) + 4, M.t + 4 + (k % 3) * 14);
    });

    // serie — przy dużej liczbie próbek rysujemy min/max na piksel
    series.forEach(function (s) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
      ctx.beginPath();
      var count = i1 - i0 + 1;
      if (count > pw * 3 && monotonic) {
        var col = -1, mn = 0, mx = 0, first = true;
        for (var i = i0; i <= i1; i++) {
          var px = Math.floor(sx(x[i])), v = s.y[i];
          if (px !== col) {
            if (col >= 0) { ctx.lineTo(col, sy(mn)); ctx.lineTo(col, sy(mx)); }
            col = px; mn = mx = v;
            if (first) { ctx.moveTo(px, sy(v)); first = false; }
          } else { if (v < mn) mn = v; if (v > mx) mx = v; }
        }
        if (col >= 0) { ctx.lineTo(col, sy(mn)); ctx.lineTo(col, sy(mx)); }
      } else {
        for (var j = i0; j <= i1; j++) { if (j === i0) ctx.moveTo(sx(x[j]), sy(s.y[j])); else ctx.lineTo(sx(x[j]), sy(s.y[j])); }
      }
      ctx.stroke();
    });

    // prostokąt zaznaczenia podczas przeciągania
    if (drag && drag.moved) {
      var dx0 = Math.min(drag.a, drag.b), dx1 = Math.max(drag.a, drag.b);
      ctx.fillStyle = 'rgba(32,33,31,0.10)'; ctx.fillRect(dx0, M.t, dx1 - dx0, ph);
      ctx.strokeStyle = 'rgba(32,33,31,0.45)'; ctx.setLineDash([4, 3]);
      ctx.strokeRect(dx0 + 0.5, M.t + 0.5, dx1 - dx0, ph - 1); ctx.setLineDash([]);
    }
    ctx.restore();
    ctx.strokeStyle = '#c9c4b8'; ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
  }

  var raf = 0;
  function redraw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }

  function pxToX(px) { return plotCache.x0 + (px - M.l) / plotCache.pw * (plotCache.x1 - plotCache.x0); }
  function localX(e) { return e.clientX - canvas.getBoundingClientRect().left; }

  // Odpowiednik relayoutData z Plotly: nowy zakres osi X po zoomie
  function setView(a, b, fromUser) {
    state.view = [Math.min(a, b), Math.max(a, b)];
    redraw();
    if (fromUser) captureRange(state.view[0], state.view[1]);
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!plotCache) return;
    var px = localX(e);
    if (px < M.l || px > M.l + plotCache.pw) return;
    drag = { a: px, b: px, moved: false, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!plotCache) return;
    var px = Math.max(M.l, Math.min(M.l + plotCache.pw, localX(e)));
    showReadout(px);
    if (!drag) return;
    drag.b = px;
    if (Math.abs(drag.b - drag.a) > 4) drag.moved = true;
    redraw();
  });
  canvas.addEventListener('pointerup', function () {
    if (!drag) return;
    var d = drag; drag = null;
    if (d.moved) setView(pxToX(d.a), pxToX(d.b), true); else redraw();
  });
  canvas.addEventListener('pointercancel', function () { drag = null; redraw(); });
  canvas.addEventListener('pointerleave', function () { if (!drag) resetReadout(); });
  canvas.addEventListener('dblclick', function () { resetZoom(); });
  canvas.addEventListener('wheel', function (e) {
    if (!plotCache) return;
    e.preventDefault();
    var px = Math.max(M.l, Math.min(M.l + plotCache.pw, localX(e)));
    var c = pxToX(px), f = e.deltaY > 0 ? 1.25 : 0.8;
    setView(c - (c - plotCache.x0) * f, c + (plotCache.x1 - c) * f, true);
  }, { passive: false });

  function resetZoom() { state.view = null; redraw(); }  // jak autorange w Plotly — nie zmienia zaznaczonego zakresu
  $('reset-zoom').addEventListener('click', resetZoom);

  var readoutDefault = $('readout').textContent;
  function resetReadout() { $('readout').textContent = readoutDefault; }
  function showReadout(px) {
    var xv = pxToX(px), X = getX().x;
    var idx = state._monotonic ? Math.min(state.n - 1, lowerBound(X, xv)) : Math.round(xv);
    var parts = [plotCache.xTitle + ' = ' + fmt(xv), 'idx ≈ ' + idx];
    state.selected.forEach(function (c) { if (state.numeric[c] && !state.hidden[c] && idx >= 0 && idx < state.n) parts.push(c + ' = ' + fmt(state.cols[c][idx])); });
    $('readout').textContent = parts.join('   ·   ');
  }

  window.addEventListener('resize', redraw);

  // ============================================================
  // Zakres z zoomu (capture_range)
  // ============================================================

  function captureRange(x0, x1) {
    if (!state.n) return;
    var x = getX().x, start = -1, end = -1;
    for (var i = 0; i < x.length; i++) if (x[i] >= x0 && x[i] <= x1) { if (start < 0) start = i; end = i; }
    if (start < 0) return;  // PreventUpdate
    state.currentRange = { start_x: x0, end_x: x1 };
    state.currentIdxRange = { start_idx: start, end_idx: end };
    $('range-info').innerHTML = 'Zaznaczony zakres X: <b>' + fmt(x0) + ' → ' + fmt(x1) + '</b><br>indeksy: <b>' + start + ' → ' + end + '</b>';
    $('range-info').classList.add('is-set');
    $('manual-start-idx').value = start;
    $('manual-end-idx').value = end;
  }

  // ============================================================
  // Etykiety (manage_labels)
  // ============================================================

  function flash(msg) { $('label-error').textContent = msg || ''; }

  $('add-label-btn').addEventListener('click', function () {
    flash('');
    if (!state.n) return flash('Najpierw załaduj dane.');
    if (!state.currentRange || !state.currentIdxRange) return flash('Najpierw zaznacz zakres — przeciągnij po wykresie.');
    var raw = $('label-input').value;
    if (raw.trim() === '') return flash('Wpisz etykietę.');
    var type = document.querySelector('input[name="label-type"]:checked').value;
    var finalLabel;
    if (type === 'number') {
      finalLabel = Number(raw.trim());
      if (!isFinite(finalLabel)) return flash('Etykieta typu number musi być liczbą.');
    } else finalLabel = raw;

    var x = getX().x, n = state.n;
    var ms = $('manual-start-idx').value, me = $('manual-end-idx').value;
    var s = ms === '' ? state.currentIdxRange.start_idx : Math.trunc(Number(ms));
    var e = me === '' ? state.currentIdxRange.end_idx : Math.trunc(Number(me));
    if (s > e) { var t = s; s = e; e = t; }
    s = Math.max(0, Math.min(s, n - 1));
    e = Math.max(0, Math.min(e, n - 1));

    state.labels.push({ id: state.labels.length + 1, label: finalLabel, start_x: x[s], end_x: x[e], start_idx: s, end_idx: e });
    labelsChanged();
  });

  $('undo-label-btn').addEventListener('click', function () { flash(''); state.labels.pop(); labelsChanged(); });
  $('clear-labels-btn').addEventListener('click', function () { flash(''); state.labels = []; labelsChanged(); });

  function labelsChanged() {
    var body = $('labels-body');
    body.textContent = '';
    if (!state.labels.length) {
      body.innerHTML = '<tr><td colspan="6" class="lab-muted">Brak etykiet.</td></tr>';
    } else {
      state.labels.forEach(function (it) {
        var tr = document.createElement('tr');
        [it.id, pyStr(it.label), fmt(it.start_x), fmt(it.end_x), it.start_idx, it.end_idx].forEach(function (v) {
          var td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    }
    redraw();
  }

  // ============================================================
  // Eksport (export_labeled_csv, export_ranges_csv)
  // ============================================================

  $('export-csv-btn').addEventListener('click', function () {
    if (!state.n) return flash('Najpierw załaduj dane.');
    var dl = $('default-label-value').value, dm = $('default-meta-value').value;
    var defLabel = dl === '' ? 'None' : dl, defMeta = dm === '' ? 'None' : dm;
    var n = state.n;
    var label = new Array(n).fill(defLabel), lid = new Array(n).fill(defMeta);
    var sidx = new Array(n).fill(defMeta), eidx = new Array(n).fill(defMeta);
    // Ostatnia dodana etykieta nadpisuje wcześniejszą na nakładającym się zakresie.
    state.labels.forEach(function (it) {
      for (var i = it.start_idx; i <= it.end_idx; i++) {
        if (i >= 0 && i < n) { label[i] = pyStr(it.label); lid[i] = String(it.id); sidx[i] = String(it.start_idx); eidx[i] = String(it.end_idx); }
      }
    });
    var mode = document.querySelector('input[name="export-mode"]:checked').value;
    var out = [];
    if (mode === 'label_only') {
      out.push('label,label_id,start_idx,end_idx');
      for (var i = 0; i < n; i++) out.push([label[i], lid[i], sidx[i], eidx[i]].map(csvField).join(','));
    } else {
      out.push(state.header.map(csvField).join(',') + ',label,label_id,start_idx,end_idx');
      for (var j = 0; j < n; j++) out.push(state.rawLines[j] + ',' + [label[j], lid[j], sidx[j], eidx[j]].map(csvField).join(','));
    }
    download(out.join('\n') + '\n', safeName() + '_labeled.csv');
  });

  $('export-ranges-btn').addEventListener('click', function () {
    if (!state.labels.length) return flash('Brak etykiet do wyeksportowania.');
    var out = ['id,label,start_x,end_x,start_idx,end_idx'];
    state.labels.forEach(function (it) {
      out.push([it.id, pyStr(it.label), it.start_x, it.end_x, it.start_idx, it.end_idx].map(csvField).join(','));
    });
    download(out.join('\n') + '\n', safeName() + '_ranges.csv');
  });

  // ============================================================
  // Ładowanie danych (handle_upload)
  // ============================================================

  function loadData(text, filename, preselect) {
    var parsed;
    try { parsed = parseCsv(text); }
    catch (err) { $('file-info').textContent = 'Błąd: ' + err.message; $('file-info').classList.add('is-error'); return; }
    state.filename = filename;
    state.header = parsed.header; state.rawLines = parsed.rawLines;
    state.cols = parsed.cols; state.numeric = parsed.numeric; state.n = parsed.n;
    state.labels = []; state.currentRange = null; state.currentIdxRange = null;
    state.view = null; state.hidden = {}; state._monotonicFor = null;
    state.selected = (preselect || []).filter(function (c) { return state.numeric[c]; });

    $('file-info').classList.remove('is-error');
    $('file-info').textContent = 'Załadowano plik: ' + filename + ' | wiersze: ' + parsed.n + ' | kolumny: ' + parsed.header.length;

    var tc = $('time-column');
    tc.innerHTML = '<option value="">— indeks próbki —</option>';
    parsed.header.forEach(function (c) { if (parsed.numeric[c]) { var o = document.createElement('option'); o.value = o.textContent = c; tc.appendChild(o); } });
    tc.disabled = false;

    var box = $('sensor-columns');
    box.textContent = '';
    parsed.header.forEach(function (c) {
      var l = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = c; cb.checked = state.selected.indexOf(c) >= 0; cb.disabled = !parsed.numeric[c];
      cb.addEventListener('change', function () {
        if (cb.checked) state.selected.push(c); else state.selected = state.selected.filter(function (s) { return s !== c; });
        delete state.hidden[c];
        renderLegend(); redraw();
      });
      l.appendChild(cb); l.appendChild(document.createTextNode(' ' + c));
      box.appendChild(l);
    });

    $('range-info').textContent = 'Zrób zoom na wykresie, żeby zaznaczyć zakres.';
    $('range-info').classList.remove('is-set');
    $('manual-start-idx').value = ''; $('manual-end-idx').value = '';
    flash('');
    renderLegend(); labelsChanged();
  }

  function renderLegend() {
    var lg = $('legend');
    lg.textContent = '';
    state.selected.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'lab-legend-item' + (state.hidden[c] ? ' is-off' : '');
      b.title = 'Kliknij, aby ukryć / pokazać serię';
      var sw = document.createElement('span'); sw.className = 'lab-swatch';
      sw.style.background = COLORS[state.selected.indexOf(c) % COLORS.length];
      b.appendChild(sw); b.appendChild(document.createTextNode(c));
      b.addEventListener('click', function () { state.hidden[c] = !state.hidden[c]; renderLegend(); redraw(); });
      lg.appendChild(b);
    });
  }

  function readFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { $('file-info').textContent = 'Obsługiwane są tylko pliki CSV'; $('file-info').classList.add('is-error'); return; }
    var r = new FileReader();
    r.onload = function () { loadData(String(r.result), file.name, []); };
    r.readAsText(file, 'utf-8');
  }

  $('upload-btn').addEventListener('click', function () { $('upload-input').click(); });
  $('upload-input').addEventListener('change', function (e) { readFile(e.target.files[0]); e.target.value = ''; });
  var zone = $('upload-zone');
  ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('is-over'); }); });
  zone.addEventListener('drop', function (e) { readFile(e.dataTransfer.files[0]); });

  function loadDemo() { loadData(makeDemoCsv(), 'demo_nagranie.csv', ['accy', 'accz', 'gyrz', 'linaccx']); }
  $('demo-btn').addEventListener('click', loadDemo);
  $('demo-btn-2').addEventListener('click', loadDemo);

  $('time-column').addEventListener('change', function () {
    state.view = null; state._monotonicFor = null;
    state.currentRange = null; state.currentIdxRange = null;
    redraw();
  });
  $('normalize-display').addEventListener('change', redraw);

  draw();
})();
