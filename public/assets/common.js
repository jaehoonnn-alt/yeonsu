/* 홈페이지와 관리자 화면이 함께 쓰는 도구 모음 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(function (kid) {
        if (kid == null || kid === false) return;
        el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
      });
    }
    return el;
  }

  var toastT;
  function toast(msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2400);
  }

  function copyText(text) {
    var done = function () { toast('복사했어요'); };
    var legacy = function () {
      try {
        var ta = h('textarea', { class: 'sr-copy', readonly: true }); ta.value = text;
        document.body.append(ta); ta.select();
        var ok = document.execCommand('copy'); ta.remove();
        if (ok) return done();
      } catch (e) {}
      toast('복사하지 못했어요. 글을 길게 눌러 복사해 주세요');
    };
    try { navigator.clipboard.writeText(text).then(done, legacy); } catch (e) { legacy(); }
  }

  function fmtTime(ts) {
    var d = new Date(ts), n = new Date();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return d.toDateString() === n.toDateString() ? hm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }

  function normUrl(u) {
    u = (u || '').trim();
    if (/^https?:\/\/\S+$/i.test(u)) return u;
    if (/^[\w-]+(\.[\w-]+)+([\/?#]\S*)?$/.test(u)) return 'https://' + u;
    return '';
  }

  function linkify(text) {
    var out = [], re = /https?:\/\/[^\s<>"']+/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      var url = m[0].replace(/[).,;!?]+$/, ''), trail = m[0].slice(url.length);
      out.push(h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }));
      if (trail) out.push(trail);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function qrNode(text) {
    if (!window.qrcode) return null;
    try {
      var q = window.qrcode(0, 'M'); q.addData(text); q.make();
      var n = q.getModuleCount(), m = 2, d = '';
      for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + (c + m) + ',' + (r + m) + 'h1v1h-1z';
      var s = n + m * 2, wrap = document.createElement('div');
      wrap.innerHTML = '<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" shape-rendering="crispEdges" role="img" aria-label="QR 코드"><rect width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
      return wrap.firstChild;
    } catch (e) { return null; }
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    var init = { method: opts.method || 'GET', headers: headers };
    if (opts.json !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.json); }
    if (opts.body !== undefined) init.body = opts.body;
    return fetch('/api/' + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || ('http_' + r.status)); e.status = r.status; e.code = d.error; throw e; }
        return d;
      });
    });
  }

  function delBtn(onGo, label) {
    label = label || '삭제';
    var armed = false, t;
    var b = h('button', { class: 'btn small danger', type: 'button', text: label, onclick: function () {
      if (!armed) {
        armed = true; b.textContent = '한 번 더 누르면 삭제'; b.classList.add('armed');
        t = setTimeout(function () { armed = false; b.textContent = label; b.classList.remove('armed'); }, 3000);
        return;
      }
      clearTimeout(t); onGo();
    } });
    return b;
  }

  function bars(opts, counts, n) {
    var box = h('div', { class: 'bars' });
    opts.forEach(function (o, i) {
      var c = counts[i] || 0, pct = n ? Math.round(c / n * 100) : 0;
      var fill = h('div', { class: 'fill' }); fill.style.width = pct + '%';
      box.append(h('div', { class: 'bar' },
        h('div', { class: 'lab' }, h('span', { text: o }), h('b', { text: c + '명 · ' + pct + '%' })),
        h('div', { class: 'track' }, fill)));
    });
    return box;
  }

  function parseSched(text) {
    return (text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = l.match(/^(\d{1,2})[:：](\d{2})(?:\s*[~\-–]\s*(\d{1,2}[:：]\d{2}))?\s*(.*)$/);
      if (!m) return { tm: '', tx: l, start: null };
      return { tm: m[1] + ':' + m[2] + (m[3] ? '–' + m[3].replace('：', ':') : ''), tx: m[4], start: (+m[1]) * 60 + (+m[2]) };
    });
  }

  function prepImage(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (s === 1 && file.size < 2.5 * 1024 * 1024) return file;
      var c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      var type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      return new Promise(function (res) { c.toBlob(function (b) { res(b || file); }, type, 0.85); });
    }, function () { return file; });
  }

  var ICONS = {
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"/>',
    out: '<path d="M7 17 17 7M7 7h10v10"/>',
    note: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>'
  };
  function icon(name, size) {
    size = size || 20;
    var w = document.createElement('span');
    w.innerHTML = '<svg class="ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
    return w.firstChild;
  }
  document.querySelectorAll('[data-ic]').forEach(function (el) { el.append(icon(el.dataset.ic, 18)); });

  window.TS = { icon: icon, $: $, h: h, toast: toast, copyText: copyText, fmtTime: fmtTime, normUrl: normUrl, linkify: linkify, qrNode: qrNode, api: api, delBtn: delBtn, bars: bars, parseSched: parseSched, prepImage: prepImage };
})();
