/* 선생님들이 보는 홈페이지 */
(function () {
  'use strict';
  var TS = window.TS, $ = TS.$, h = TS.h;

  // 새 글·설문을 확인하는 간격(밀리초). 값을 키우면 호출 횟수가 줄어요.
  var POLL_MS = 15000;

  var S = null, offset = 0, cache = {}, modal = null, lastSig = '';
  var dismissed = new Set();

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
    return null;
  }
  var voterId = store('ts_voter');
  if (!voterId) {
    voterId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now().toString(36) + 'xxxx');
    store('ts_voter', voterId);
  }
  var voted = {};
  try { voted = JSON.parse(store('ts_voted') || '{}') || {}; } catch (e) { voted = {}; }

  function changed(key, val) {
    var s = JSON.stringify(val);
    if (cache[key] === s) return false;
    cache[key] = s; return true;
  }

  /* ---------- 불러오기 ---------- */
  var failedOnce = false;
  function load() {
    return TS.api('state?voter=' + encodeURIComponent(voterId)).then(function (d) {
      S = d; offset = d.now - Date.now(); failedOnce = false;
      renderAll(); syncPoll();
    }).catch(function () {
      if (!S && !failedOnce) { failedOnce = true; $('#postList').replaceChildren(h('p', { class: 'empty', text: '내용을 불러오지 못했어요. 잠시 후 새로고침해 주세요.' })); }
    });
  }

  function renderAll() {
    if (changed('site', S.site)) renderSite();
    if (changed('posts', S.posts)) { renderPosts(); renderCopy(); }
    if (changed('pins', S.pins)) renderPins();
    if (changed('qa', S.qa)) renderQA();
    if (changed('shared', S.polls.map(function (p) { return p.shared ? [p.id, p.q, p.shared] : null; }))) renderShared();
    lastSig = '';
    tick();
  }
  function updateLayout() {
    $('#heroGrid').classList.toggle('single', $('#nowCard').hidden);
  }

  /* ---------- 맨 위 소개 ---------- */
  function renderSite() {
    var s = S.site;
    document.title = s.title || '교사 연수 안내';
    $('#brandName').textContent = s.title || '연수 안내';
    $('#hEyebrow').textContent = s.eyebrow || ''; $('#hEyebrowWrap').hidden = !s.eyebrow;
    $('#hTitle').textContent = s.title || '교사 연수 안내';
    $('#hSub').textContent = s.subtitle || ''; $('#hSub').hidden = !s.subtitle;
    var facts = $('#hFacts'); facts.replaceChildren();
    [['일시', s.date, 'calendar'], ['장소', s.place, 'pin'], ['강사', s.instructor, 'user']].forEach(function (f) {
      if (f[1]) facts.append(h('li', { class: 'fact' }, TS.icon(f[2], 20), h('div', {}, h('span', { class: 'fl', text: f[0] }), h('span', { class: 'fv', text: f[1] }))));
    });
    facts.hidden = !facts.children.length;
    $('#hIntro').textContent = s.intro || ''; $('#hIntro').hidden = !s.intro;
    $('#footText').textContent = s.footer || (s.title ? s.title : '');
  }

  /* ---------- 일정·지금 카드 ---------- */
  function computeNow() {
    var items = TS.parseSched(S.site.schedule), n = new Date(), nowMin = n.getHours() * 60 + n.getMinutes(), cur = -1;
    items.forEach(function (it, i) { if (it.start != null && it.start <= nowMin) cur = i; });
    var next = -1;
    for (var i = cur + 1; i < items.length; i++) { if (items[i].start != null) { next = i; break; } }
    return { items: items, cur: cur, next: next };
  }
  function renderTimeline() {
    var n = computeNow(), ul = $('#timeline'); if (!ul) return; ul.replaceChildren();
    n.items.forEach(function (it, i) {
      ul.append(h('li', { class: i === n.cur ? 'on' : (n.cur >= 0 && i < n.cur ? 'past' : '') },
        h('span', { class: 'tm', text: it.tm }), h('span', { class: 'tx', text: it.tx }),
        i === n.cur ? h('span', { class: 'badge', text: '지금' }) : h('span')));
    });

  }
  function renderNow(hasTimer) {
    var n = computeNow(), show = n.items.length > 0 || hasTimer;
    $('#nowCard').hidden = !show;
    if (show) {
      var cur = n.cur >= 0 ? n.items[n.cur] : null;
      $('#nowTitle').textContent = cur ? cur.tx : (n.items.length ? '곧 시작해요' : '연수 진행 중');
      $('#nowWhen').textContent = cur ? cur.tm : ''; $('#nowWhen').hidden = !cur;
      var nx = n.next >= 0 ? n.items[n.next] : null;
      $('#nowNext').textContent = nx ? '다음 · ' + nx.tm + ' ' + nx.tx : ''; $('#nowNext').hidden = !nx;
    }
    updateLayout();
  }

  /* ---------- 타이머 ---------- */
  function timerLeft() {
    if (!S || !S.live.timerEnd) return null;
    var left = S.live.timerEnd - (Date.now() + offset);
    return left <= -60000 ? null : left;
  }
  function fmtLeft(ms) {
    var s = Math.ceil(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0');
  }
  function tick() {
    if (!S) return;
    var left = timerLeft(), bar = $('#timerBar'), name = S.live.timerLabel || '남은 시간';
    if (left == null) {
      bar.hidden = true; $('#nowTimer').hidden = true;
    } else {
      var done = left <= 0, val = done ? '0:00' : fmtLeft(left), lab = done ? name + ' · 시간이 끝났어요' : name;
      bar.hidden = false; bar.classList.toggle('done', done);
      $('#timerLabel').textContent = lab; $('#timerVal').textContent = val;
      $('#nowTimer').hidden = false; $('#nowTimerLabel').textContent = lab; $('#nowTimerVal').textContent = val;
    }
    var n = computeNow(), sig = n.cur + '|' + n.items.length + '|' + (left != null) + '|' + S.site.schedule;
    if (sig !== lastSig) { lastSig = sig; renderTimeline(); renderNow(left != null); }
  }

  /* ---------- 가운데 게시판 ---------- */
  var TYPE = { text: '공지', link: '링크', image: '사진', qr: 'QR' };
  var TICON = { text: 'note', link: 'link', image: 'image', qr: 'qr' };
  function renderPosts() {
    var box = $('#postList'); box.replaceChildren();
    var posts = S.posts.filter(function (p) { return p.type !== 'copy'; });
    if (!posts.length) { box.append(h('p', { class: 'empty', text: '연수가 시작되면 이곳에 안내와 링크가 올라와요.' })); return; }
    posts.forEach(function (p) { box.append(postRow(p)); });
  }
  function postRow(p) {
    var art = h('article', { class: 'post' + (p.pinned ? ' pinned' : '') });
    art.append(h('div', { class: 'pi' }, TS.icon(TICON[p.type] || 'note', 20)));
    var row = h('div', { class: 'pb' },
      h('div', { class: 'meta' }, h('span', { class: 'chip', text: TYPE[p.type] || '글' }), p.pinned ? h('span', { class: 'chip warn', text: '고정' }) : null, h('span', { text: TS.fmtTime(p.createdAt) })));
    art.append(row);
    if (p.title) row.append(h('h3', { text: p.title }));
    if (p.type === 'text') {
      if (p.body) row.append(h('p', { class: 'body' }, TS.linkify(p.body)));
    } else if (p.type === 'link' || p.type === 'qr') {
      var left = h('div', {});
      if (p.body) left.append(h('p', { class: 'body' }, TS.linkify(p.body)));
      left.append(h('p', { class: 'urlline', text: p.url }));
      left.append(h('div', { class: 'row' },
        h('a', { class: 'btn primary small', href: p.url, target: '_blank', rel: 'noopener noreferrer', text: '열기' }),
        h('button', { class: 'btn small', type: 'button', text: '주소 복사', onclick: function () { TS.copyText(p.url); } })));
      var qr = (p.type === 'qr' || p.qr) ? TS.qrNode(p.url) : null;
      row.append(qr ? h('div', { class: 'post-split' }, left, qr) : left);
    } else if (p.type === 'image') {
      var img = h('img', { class: 'photo', src: '/api/img/' + p.asset, alt: p.title || '올라온 사진', loading: 'lazy' });
      img.addEventListener('error', function () { img.replaceWith(h('p', { class: 'hint', text: '사진을 불러오지 못했어요.' })); });
      row.append(img);
      if (p.body) row.append(h('p', { class: 'body' }, TS.linkify(p.body)));
    }
    return art;
  }
  function renderShared() {
    var box = $('#sharedResults'); box.replaceChildren();
    S.polls.filter(function (p) { return p.shared; }).forEach(function (p) {
      box.append(h('div', { class: 'rescard' },
        h('div', { class: 'meta' }, h('span', { class: 'chip', text: '설문 결과' }), h('span', { text: p.shared.n + '명 응답' })),
        h('h3', { text: p.q }), TS.bars(p.opts, p.shared.counts, p.shared.n)));
    });
  }

  /* ---------- 오른쪽 아래: 복사해서 쓰세요 ---------- */
  function renderCopy() {
    var box = $('#copyList'); box.replaceChildren();
    var items = S.posts.filter(function (p) { return p.type === 'copy'; });
    $('#copyPanel').hidden = !items.length;
    items.forEach(function (p) {
      var ck = h('span', { class: 'ck' }, TS.icon('copy', 14), '누르면 복사');
      var btn = h('button', { class: 'copyitem', type: 'button' },
        h('span', { class: 'cl' }, h('span', { text: p.title || '복사용 글' }), ck),
        h('span', { class: 'ct', text: p.body }));
      btn.addEventListener('click', function () {
        TS.copyText(p.body);
        ck.replaceChildren(TS.icon('check', 14), '복사됨'); btn.classList.add('done');
        setTimeout(function () { ck.replaceChildren(TS.icon('copy', 14), '누르면 복사'); btn.classList.remove('done'); }, 1600);
      });
      box.append(btn);
    });
    updateLayout();
  }

  /* ---------- 바로가기(상시 링크) ---------- */
  function hostOf(u) { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return u; } }
  function renderPins() {
    var box = $('#pinList'); box.replaceChildren();
    if (!S.pins.length) { box.append(h('p', { class: 'empty', text: '등록된 링크가 아직 없어요.' })); return; }
    S.pins.forEach(function (p) {
      var isUrl = /^https?:\/\/\S+$/i.test(p.value);
      if (isUrl) {
        box.append(h('a', { class: 'tile', href: p.value, target: '_blank', rel: 'noopener noreferrer' },
          h('span', { class: 'ti' }, TS.icon('out', 20)), h('span', { class: 'nm', text: p.label }), h('span', { class: 'vl', text: hostOf(p.value) })));
      } else {
        var ti = h('span', { class: 'ti' }, TS.icon('copy', 20));
        var t = h('button', { class: 'tile', type: 'button', title: '누르면 복사' }, ti, h('span', { class: 'nm', text: p.label }), h('span', { class: 'vl', text: p.value }));
        t.addEventListener('click', function () {
          TS.copyText(p.value); ti.replaceChildren(TS.icon('check', 20));
          setTimeout(function () { ti.replaceChildren(TS.icon('copy', 20)); }, 1600);
        });
        box.append(t);
      }
    });
  }

  /* ---------- 질문 ---------- */
  function renderQA() {
    var box = $('#qList'); box.replaceChildren();
    S.qa.forEach(function (q) {
      var row = h('div', { class: 'qitem' }, h('div', { class: 'tx' }, h('div', { text: q.text }), h('div', { class: 'tm', text: TS.fmtTime(q.ts) })));
      if (q.mine) row.append(TS.delBtn(function () {
        TS.api('ask/delete', { method: 'POST', json: { voterId: voterId, id: q.id } }).then(load).catch(function () { TS.toast('삭제하지 못했어요'); });
      }));
      box.append(row);
    });
  }
  $('#qBtn').addEventListener('click', function () {
    var ta = $('#qText'), text = ta.value.trim();
    if (!text) return;
    var btn = $('#qBtn'); btn.disabled = true;
    TS.api('ask', { method: 'POST', json: { voterId: voterId, text: text } }).then(function () {
      ta.value = ''; TS.toast('질문을 남겼어요'); return load();
    }).catch(function (e) {
      TS.toast(e.code === 'slow_down' ? '잠시 뒤에 다시 남겨 주세요' : '질문을 남기지 못했어요');
    }).then(function () { btn.disabled = false; });
  });

  /* ---------- 설문 팝업 ---------- */
  function pendingPoll() {
    var L = S.live, cand = [];
    if (L.livePollId) cand.push({ id: L.livePollId, key: 'live:' + L.livePollId + ':' + L.liveAt });
    if (L.entryPollId) cand.push({ id: L.entryPollId, key: 'entry:' + L.entryPollId });
    for (var i = 0; i < cand.length; i++) {
      var p = S.polls.find(function (x) { return x.id === cand[i].id; });
      if (p && p.open && !voted[p.id]) return { poll: p, key: cand[i].key };
    }
    return null;
  }
  function setBanner(p) {
    $('#pollBanner').hidden = !p;
    $('#pollBtn').onclick = p ? function () { openPoll(p.poll, p.key); } : null;
  }
  function syncPoll() {
    if (modal && (modal.submitting || modal.done)) return;
    var p = pendingPoll();
    if (!p) { if (modal) closeModal(); setBanner(null); return; }
    if (modal && modal.key === p.key) { setBanner(null); return; }
    if (!dismissed.has(p.key)) { openPoll(p.poll, p.key); setBanner(null); } else setBanner(p);
  }
  function closeModal() { modal = null; $('#overlay').hidden = true; $('#sheet').replaceChildren(); }
  function dismissModal() { if (modal && modal.key) dismissed.add(modal.key); closeModal(); if (S) syncPoll(); }

  function openPoll(poll, key) {
    modal = { key: key, poll: poll, submitting: false, done: false };
    var sheet = $('#sheet'); sheet.replaceChildren();
    var sel = [], err = h('p', { class: 'err', role: 'alert' });
    var opts = h('div', { class: 'opts', role: poll.multi ? 'group' : 'radiogroup', 'aria-labelledby': 'sheetTitle' });
    poll.opts.forEach(function (o, i) {
      var inp = h('input', { type: poll.multi ? 'checkbox' : 'radio', name: 'popt', id: 'opt' + i });
      inp.addEventListener('change', function () {
        if (poll.multi) sel = inp.checked ? sel.concat([i]) : sel.filter(function (x) { return x !== i; });
        else sel = [i];
      });
      opts.append(h('label', { class: 'opt', for: 'opt' + i }, inp, h('span', { text: o })));
    });
    var submit = h('button', { class: 'btn primary', type: 'button', text: '제출', onclick: function () {
      if (!sel.length) { err.textContent = '하나 이상 선택해 주세요.'; return; }
      err.textContent = ''; submit.disabled = true; modal.submitting = true;
      TS.api('vote', { method: 'POST', json: { pollId: poll.id, voterId: voterId, choices: sel.slice().sort() } }).then(function () {
        voted[poll.id] = sel; store('ts_voted', JSON.stringify(voted));
        modal.submitting = false; modal.done = true; showDone(poll);
      }).catch(function (e) {
        modal.submitting = false; submit.disabled = false;
        err.textContent = e.code === 'closed' ? '응답이 마감된 설문이에요.' : '제출하지 못했어요. 잠시 후 다시 시도해 주세요.';
      });
    } });
    sheet.append(
      h('p', { class: 'eyebrow', text: '설문' }),
      h('h2', { id: 'sheetTitle', text: poll.q }),
      h('p', { class: 'hint', text: poll.multi ? '여러 개를 고를 수 있어요.' : '하나만 골라 주세요.' }),
      opts, err,
      h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn', type: 'button', text: '나중에', onclick: dismissModal }), submit));
    $('#overlay').hidden = false;
    var first = sheet.querySelector('input'); if (first) first.focus();
  }
  function showDone(poll) {
    var sheet = $('#sheet'); sheet.replaceChildren();
    sheet.append(h('h2', { id: 'sheetTitle', text: '응답해 주셔서 감사합니다' }));
    var p = S.polls.find(function (x) { return x.id === poll.id; });
    if (p && p.shared) sheet.append(h('p', { class: 'hint', text: p.q }), TS.bars(p.opts, p.shared.counts, p.shared.n));
    sheet.append(h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn primary', type: 'button', text: '닫기', onclick: function () { closeModal(); syncPoll(); } })));
    if (!(p && p.shared)) setTimeout(function () { if (modal && modal.done) { closeModal(); syncPoll(); } }, 1400);
  }
  $('#overlay').addEventListener('click', function (e) { if (e.target === $('#overlay') && modal) { modal.done ? closeModal() : dismissModal(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal && !modal.submitting) { modal.done ? closeModal() : dismissModal(); } });

  /* ---------- 시작 ---------- */
  load();
  setInterval(function () { if (!document.hidden) load(); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  setInterval(tick, 1000);
})();
