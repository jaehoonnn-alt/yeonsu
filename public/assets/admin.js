/* 관리자 화면 */
(function () {
  'use strict';
  var TS = window.TS, $ = TS.$, h = TS.h;
  var pw = '', D = null, composerType = 'text', settingsFilled = false;

  try { pw = sessionStorage.getItem('ts_pw') || ''; } catch (e) {}

  function call(action, payload) {
    return TS.api('admin', { method: 'POST', headers: { 'x-admin-password': pw }, json: Object.assign({ action: action }, payload || {}) });
  }
  function authFail(e) {
    if (e && e.status === 401) { logout(); $('#loginErr').textContent = '비밀번호가 맞지 않아요.'; return true; }
    return false;
  }
  function fail(e) {
    if (authFail(e)) return;
    var m = { too_many: '더 이상 추가할 수 없어요.', bad_url: '주소는 https:// 로 시작해야 해요.', no_poll: '이미 없는 설문이에요.' };
    TS.toast(m[e && e.code] || '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  function act(action, payload, okMsg) {
    return call(action, payload).then(function () { if (okMsg) TS.toast(okMsg); return refresh(); }).catch(fail);
  }

  /* ---------- 로그인 ---------- */
  function showDash(on) { $('#loginView').hidden = on; $('#dash').hidden = !on; }
  function logout() {
    pw = ''; D = null; settingsFilled = false;
    try { sessionStorage.removeItem('ts_pw'); } catch (e) {}
    showDash(false);
  }
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var typed = $('#pw').value; if (!typed) return;
    $('#loginErr').textContent = '';
    pw = typed;
    call('load').then(function (d) {
      try { sessionStorage.setItem('ts_pw', pw); } catch (e2) {}
      $('#pw').value = ''; D = d; showDash(true); showTab(); renderAll();
    }).catch(function (e2) {
      pw = '';
      $('#loginErr').textContent = e2.status === 503 ? '서버에 ADMIN_PASSWORD가 아직 설정되지 않았어요. 넷리파이 환경 변수를 확인해 주세요.'
        : e2.status === 401 ? '비밀번호가 맞지 않아요.' : '연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
    });
  });
  $('#logout').addEventListener('click', logout);

  function refresh() {
    return call('load').then(function (d) { D = d; renderAll(); });
  }

  /* ---------- 탭 ---------- */
  var TABS = ['posts', 'links', 'polls', 'timer', 'questions', 'settings'];
  function showTab() {
    var t = location.hash.slice(1);
    if (TABS.indexOf(t) < 0) t = 'posts';
    TABS.forEach(function (n) { $('#pane-' + n).hidden = n !== t; });
    document.querySelectorAll('.tabs a').forEach(function (a) { if (a.dataset.tab === t) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  window.addEventListener('hashchange', showTab);

  function renderAll() {
    renderPosts(); renderPins(); renderPolls(); renderTimer(); renderQA();
    if (!settingsFilled) {
      settingsFilled = true;
      var s = D.state.site;
      $('#setEyebrow').value = s.eyebrow || ''; $('#setTitle').value = s.title || ''; $('#setSub').value = s.subtitle || '';
      $('#setDate').value = s.date || ''; $('#setPlace').value = s.place || ''; $('#setInstructor').value = s.instructor || '';
      $('#setIntro').value = s.intro || ''; $('#setSched').value = s.schedule || ''; $('#setFooter').value = s.footer || '';
    }
  }

  /* ---------- 게시글 ---------- */
  var TYPE = { text: '공지', link: '링크', copy: '복사', image: '사진', qr: 'QR' };
  var LABELS = {
    text: { t: '제목 (선택)', b: '내용', url: false, file: false, qr: false, body: true },
    link: { t: '링크 이름', b: '설명 (선택)', url: true, file: false, qr: true, body: true },
    copy: { t: '제목 (예: 오늘 사용할 주소)', b: '복사할 내용', url: false, file: false, qr: false, body: true },
    image: { t: '사진 설명 (선택)', b: '메모 (선택)', url: false, file: true, qr: false, body: true },
    qr: { t: 'QR 이름', b: '', url: true, file: false, qr: false, body: false }
  };
  var HINTS = {
    text: '가운데 게시판에 글자로 나타나요. 글 속의 주소는 자동으로 링크가 돼요.',
    link: '가운데 게시판에 링크 카드로 나타나요. QR을 함께 보여줄 수도 있어요.',
    copy: '오른쪽 아래 "복사해서 쓰세요" 칸에 나타나요. 선생님이 누르면 바로 복사돼요.',
    image: '가운데 게시판에 사진으로 나타나요.',
    qr: '가운데 게시판에 QR 코드로 나타나요.'
  };
  function setType(t) {
    composerType = t; var L = LABELS[t];
    $('#typeHint').textContent = HINTS[t];
    document.querySelectorAll('#typeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.type === t ? 'true' : 'false'); });
    $('#lTitle').textContent = L.t; $('#lBody').textContent = L.b;
    $('#fUrl').hidden = !L.url; $('#fFile').hidden = !L.file; $('#fQr').hidden = !L.qr; $('#fBody').hidden = !L.body;
    $('#postErr').textContent = '';
  }
  document.querySelectorAll('#typeSeg button').forEach(function (b) { b.addEventListener('click', function () { setType(b.dataset.type); }); });

  function renderPosts() {
    var box = $('#postList'); box.replaceChildren();
    var posts = D.state.posts.slice().sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt; });
    if (!posts.length) { box.append(h('p', { class: 'empty', text: '아직 올린 글이 없어요. 위에서 첫 글을 올려 보세요.' })); return; }
    posts.forEach(function (p) {
      var card = h('article', { class: 'card' + (p.pinned ? ' pinned' : '') },
        h('div', { class: 'card-head' }, h('span', { class: 'chip', text: TYPE[p.type] || '글' }), p.pinned ? h('span', { class: 'chip warn', text: '고정' }) : null, h('span', { text: TS.fmtTime(p.createdAt) })));
      if (p.title) card.append(h('h3', { text: p.title }));
      if (p.type === 'image') {
        var img = h('img', { class: 'photo', src: '/api/img/' + p.asset, alt: p.title || '올린 사진', loading: 'lazy' });
        card.append(img);
      } else if (p.type === 'qr' || (p.type === 'link' && p.qr)) {
        var q = TS.qrNode(p.url); if (q) card.append(q);
      }
      if (p.body) card.append(h('p', { class: p.type === 'copy' ? 'copybox' : 'body' }, p.body.length > 160 ? p.body.slice(0, 160) + '…' : p.body));
      if (p.url) card.append(h('p', { class: 'urlline', text: p.url }));
      card.append(h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', text: p.pinned ? '고정 해제' : '고정', onclick: function () { act('pinPost', { id: p.id, pinned: !p.pinned }); } }),
        TS.delBtn(function () { act('deletePost', { id: p.id }, '삭제했어요'); })));
      box.append(card);
    });
  }

  $('#postBtn').addEventListener('click', function () {
    var err = $('#postErr'); err.textContent = '';
    var t = composerType, L = LABELS[t];
    var payload = { type: t, title: $('#cTitle').value.trim(), body: $('#cBody').value.trim(), url: '', qr: $('#cQr').checked, pinned: $('#cPinned').checked };
    if (L.url) {
      payload.url = TS.normUrl($('#cUrl').value);
      if (!payload.url) { err.textContent = '주소를 https:// 로 시작하는 형식으로 적어 주세요.'; return; }
    }
    if (t === 'copy' && !payload.body) { err.textContent = '복사할 내용을 적어 주세요.'; return; }
    if (t === 'text' && !payload.body && !payload.title) { err.textContent = '제목이나 내용을 적어 주세요.'; return; }
    var btn = $('#postBtn'); btn.disabled = true;
    var go = Promise.resolve();
    if (t === 'image') {
      var f = $('#cFile').files[0];
      if (!f) { err.textContent = '사진을 선택해 주세요.'; btn.disabled = false; return; }
      if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { err.textContent = 'JPG, PNG, GIF, WebP 사진만 올릴 수 있어요.'; btn.disabled = false; return; }
      go = TS.prepImage(f).then(function (blob) {
        return TS.api('admin-upload', { method: 'POST', headers: { 'x-admin-password': pw, 'content-type': blob.type }, body: blob });
      }).then(function (r) { payload.asset = r.id; });
    }
    go.then(function () { return call('addPost', payload); }).then(function () {
      ['#cTitle', '#cBody', '#cUrl', '#cFile'].forEach(function (s) { $(s).value = ''; });
      $('#cQr').checked = false; $('#cPinned').checked = false;
      TS.toast('올렸어요'); return refresh();
    }).catch(function (e) {
      if (authFail(e)) return;
      err.textContent = e.code === 'too_large' ? '사진이 너무 커요(4MB 이하).' : e.code === 'bad_url' ? '주소 형식이 맞지 않아요.' : '올리지 못했어요. 잠시 후 다시 시도해 주세요.';
    }).then(function () { btn.disabled = false; });
  });

  /* ---------- 링크·주소 ---------- */
  function renderPins() {
    var box = $('#pinList'); box.replaceChildren();
    if (!D.state.pins.length) { box.append(h('p', { class: 'empty', text: '아직 등록한 링크가 없어요.' })); return; }
    D.state.pins.forEach(function (p) {
      box.append(h('div', { class: 'rowitem' },
        h('div', { class: 'l' }, h('div', { class: 'nm', text: p.label }), h('div', { class: 'vl', text: p.value })),
        TS.delBtn(function () { act('deletePin', { id: p.id }, '삭제했어요'); })));
    });
  }
  $('#pinBtn').addEventListener('click', function () {
    var err = $('#pinErr'); err.textContent = '';
    var label = $('#pLabel').value.trim(), value = $('#pValue').value.trim();
    if (!label || !value) { err.textContent = '이름과 내용을 모두 적어 주세요.'; return; }
    call('addPin', { label: label, value: value }).then(function () {
      $('#pLabel').value = ''; $('#pValue').value = ''; TS.toast('추가했어요'); return refresh();
    }).catch(function (e) { if (!authFail(e)) err.textContent = '추가하지 못했어요.'; });
  });

  /* ---------- 설문 ---------- */
  function renderPolls() {
    var box = $('#pollAdminList'); box.replaceChildren();
    var L = D.state.live, polls = D.state.polls.slice().reverse();
    if (!polls.length) { box.append(h('p', { class: 'empty', text: '만든 설문이 없어요. 위에서 질문과 선택지를 적어 추가해 보세요.' })); return; }
    polls.forEach(function (p) {
      var r = D.results[p.id] || { counts: p.opts.map(function () { return 0; }), n: 0 };
      var isEntry = L.entryPollId === p.id, isLive = L.livePollId === p.id, open = p.open !== false;
      var card = h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          isEntry ? h('span', { class: 'chip', text: '입장 설문' }) : null,
          isLive ? h('span', { class: 'chip warn', text: '지금 진행 중' }) : null,
          p.shared ? h('span', { class: 'chip', text: '결과 공개 중' }) : null,
          !open ? h('span', { class: 'chip warn', text: '마감' }) : null,
          h('span', { text: r.n + '명 응답' })),
        h('h3', { text: p.q }), TS.bars(p.opts, r.counts, r.n));
      card.append(h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', text: isEntry ? '입장 설문 해제' : '입장 설문으로', onclick: function () { act('setEntry', { id: isEntry ? null : p.id }, isEntry ? '해제했어요' : '입장 설문으로 지정했어요'); } }),
        h('button', { class: 'btn small primary', type: 'button', text: isLive ? '띄우기 종료' : '지금 띄우기', onclick: function () { act('setLive', { id: isLive ? null : p.id }, isLive ? '종료했어요' : '선생님 화면에 설문을 띄웠어요'); } }),
        h('button', { class: 'btn small', type: 'button', text: p.shared ? '공개 결과 갱신' : '결과 공개', onclick: function () { act('setShared', { id: p.id, on: true }, '결과를 공개했어요'); } }),
        p.shared ? h('button', { class: 'btn small', type: 'button', text: '결과 비공개', onclick: function () { act('setShared', { id: p.id, on: false }); } }) : null,
        h('button', { class: 'btn small', type: 'button', text: open ? '응답 마감' : '응답 다시 받기', onclick: function () { act('setOpen', { id: p.id, open: !open }); } }),
        TS.delBtn(function () { act('deletePoll', { id: p.id }, '삭제했어요'); })));
      box.append(card);
    });
  }
  $('#pollBtn').addEventListener('click', function () {
    var err = $('#pollErr'); err.textContent = '';
    var q = $('#sQ').value.trim(), opts = $('#sOpts').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!q) { err.textContent = '질문을 적어 주세요.'; return; }
    if (opts.length < 2 || opts.length > 10) { err.textContent = '선택지는 2~10개로 적어 주세요.'; return; }
    call('addPoll', { q: q, opts: opts, multi: $('#sMulti').checked }).then(function () {
      $('#sQ').value = ''; $('#sOpts').value = ''; $('#sMulti').checked = false; TS.toast('설문을 추가했어요'); return refresh();
    }).catch(function (e) { if (!authFail(e)) err.textContent = '추가하지 못했어요.'; });
  });

  /* ---------- 타이머 ---------- */
  function renderTimer() {
    var L = D.state.live, left = L.timerEnd ? L.timerEnd - D.now : null;
    $('#tStatus').textContent = left != null && left > 0
      ? '진행 중' + (L.timerLabel ? ' · ' + L.timerLabel : '') + ' · 약 ' + Math.ceil(left / 60000) + '분 남았어요'
      : '실행 중인 타이머가 없어요.';
  }
  $('#tStart').addEventListener('click', function () {
    act('startTimer', { minutes: parseInt($('#tMin').value, 10) || 10, label: $('#tLabel').value.trim() }, '타이머를 시작했어요');
  });
  $('#tStop').addEventListener('click', function () { act('stopTimer', {}, '끝냈어요'); });

  /* ---------- 질문 ---------- */
  function renderQA() {
    var box = $('#qList'); box.replaceChildren();
    if (!D.qa.length) { box.append(h('p', { class: 'empty', text: '아직 남겨진 질문이 없어요.' })); return; }
    D.qa.forEach(function (q) {
      box.append(h('div', { class: 'qitem' }, h('div', { class: 'tx' }, h('div', { text: q.text }), h('div', { class: 'tm', text: TS.fmtTime(q.ts) })),
        TS.delBtn(function () { act('deleteAsk', { id: q.id }, '삭제했어요'); })));
    });
  }

  /* ---------- 설정 ---------- */
  $('#siteBtn').addEventListener('click', function () {
    var site = { eyebrow: $('#setEyebrow').value, title: $('#setTitle').value, subtitle: $('#setSub').value, date: $('#setDate').value, place: $('#setPlace').value,
      instructor: $('#setInstructor').value, intro: $('#setIntro').value, schedule: $('#setSched').value, footer: $('#setFooter').value };
    call('saveSite', { site: site }).then(function () { $('#siteErr').textContent = ''; TS.toast('저장했어요'); return refresh(); })
      .catch(function (e) { if (!authFail(e)) $('#siteErr').textContent = '저장하지 못했어요.'; });
  });

  /* ---------- 시작 ---------- */
  setType('text');
  if (pw) {
    call('load').then(function (d) { D = d; showDash(true); showTab(); renderAll(); }).catch(function () { logout(); });
  }
  // 설문·질문 화면을 보는 동안 10초마다 새로 가져와요
  setInterval(function () {
    if (!D || document.hidden) return;
    var t = location.hash.slice(1);
    if (t === 'polls' || t === 'questions') refresh().catch(function (e) { authFail(e); });
  }, 10000);
})();
