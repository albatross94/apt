/* ---------- 유치원 탭 ----------
   자료: 한국교육학술정보원 유치원 공시정보(유치원알리미) → /api/kinder (data/kinder/kinder.json), 지도: 카카오맵
   수원시 전체 유치원을 단지 대표점 기준 직선거리 가까운 순으로 보여 주고, 구·설립구분·이름·1km 안 필터를 둔다. */
(() => {
  const kd = { map: null, data: null, rows: [], markers: [], clusterer: null, home: null, circle: null, pop: null, loaded: false, loading: false, fit: true };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const distTxt = (m) => (m < 1000 ? `약 ${Math.max(10, Math.round(m / 10) * 10).toLocaleString()}m` : `약 ${(m / 1000).toFixed(1)}km`);
  const fmtDate = (s) => String(s || '').replace(/-/g, '.');
  const telHref = (t) => 'tel:' + t.replace(/[^0-9+]/g, '');
  const COLOR = { 공립: ['#2f6fd6', '#1b4a9c'], 사립: ['#e8a317', '#8a5d00'] };

  function popupFor(r) {
    const d = el('div', 'hs-pop');
    d.append(el('b', '', r.n));
    d.append(el('div', '', `${r.est} · ${r.gu}`));
    d.append(el('div', '', r.a));
    d.append(el('div', '', `단지 대표점에서 직선거리 ${distTxt(r.d)}`));
    if (r.h) d.append(el('div', '', '운영시간 ' + r.h));
    if (r.t) { const a = el('a', '', '☎ ' + r.t); a.href = telHref(r.t); d.append(a); }
    const u = /^https?:\/\//i.test(r.u) ? r.u : (r.u ? 'http://' + r.u : '');
    if (/^https?:\/\/[^\s]+$/i.test(u)) { d.append(document.createTextNode(' ')); const a = el('a', '', '누리집'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; d.append(a); }
    return d;
  }
  function closePop() { if (kd.pop) { kd.pop.setMap(null); kd.pop = null; } }
  function openPop(i) {
    const r = kd.rows[i], m = kd.markers[i];
    if (!m) return;
    closePop();
    const w = el('div'); w.style.cssText = 'background:#fff;border:1px solid #8e1b1c;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);margin-bottom:38px';
    w.append(popupFor(r));
    kd.pop = new kakao.maps.CustomOverlay({ map: kd.map, position: m.getPosition(), content: w, yAnchor: 1, zIndex: 3 });
    // 클러스터 안에 묶여 있으면 풀리도록 확대한 뒤 그 핀으로 이동한다
    if (kd.map.getLevel() > 4) kd.map.setLevel(4);
    kd.map.panTo(m.getPosition());
    for (const li of $('kd-ul').children) li.classList.toggle('on', Number(li.dataset.i) === i);
    const on = $('kd-ul').querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  const img = (svg, w, h, ox, oy) => new kakao.maps.MarkerImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), new kakao.maps.Size(w, h), { offset: new kakao.maps.Point(ox, oy) });
  const pins = {};
  const pinImg = (kind) => pins[kind] || (pins[kind] = img(`<svg xmlns="http://www.w3.org/2000/svg" width="29" height="42" viewBox="0 0 29 42"><path d="M14.5 1C7 1 1 7 1 14.5 1 24 14.5 41 14.5 41S28 24 28 14.5C28 7 22 1 14.5 1z" fill="${COLOR[kind][0]}" stroke="${COLOR[kind][1]}" stroke-width="1.5"/><circle cx="14.5" cy="14.5" r="5" fill="#fff"/></svg>`, 29, 42, 14, 42));
  const homeImg = () => img('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><rect x="2" y="2" width="18" height="18" rx="3" fill="#fff" stroke="#8e1b1c" stroke-width="2.5"/><rect x="7" y="7" width="8" height="8" fill="#8e1b1c"/></svg>', 22, 22, 11, 11);

  async function ensureMap() {
    await loadKakao();
    const m = kd.data.meta, c = new kakao.maps.LatLng(m.기준점.위도, m.기준점.경도);
    if (kd.map) return;
    kd.map = new kakao.maps.Map($('kd-box'), { center: c, level: 5 });
    kakao.maps.event.addListener(kd.map, 'click', closePop);
    kd.home = new kakao.maps.Marker({ map: kd.map, position: c, title: m.기준점.이름 + ' (대표점)', image: homeImg(), zIndex: 5 });
    kd.circle = new kakao.maps.Circle({ map: kd.map, center: c, radius: m.반경_m, strokeWeight: 2, strokeColor: '#8e1b1c', strokeOpacity: 0.6, strokeStyle: 'dashed', fillColor: '#8e1b1c', fillOpacity: 0.05 });
    if (kakao.maps.MarkerClusterer) kd.clusterer = new kakao.maps.MarkerClusterer({ map: kd.map, averageCenter: true, minLevel: 5, gridSize: 50 });
  }

  async function draw(fit) {
    try { await ensureMap(); } catch (e) { $('kd-note').textContent += ' 지도를 표시하지 못했습니다: ' + e.message; return; }
    closePop();
    if (kd.clusterer) kd.clusterer.clear(); else for (const m of kd.markers) m.setMap(null);
    const c = new kakao.maps.LatLng(kd.data.meta.기준점.위도, kd.data.meta.기준점.경도), bounds = new kakao.maps.LatLngBounds(); bounds.extend(c);
    kd.markers = kd.rows.map((r, i) => {
      const pos = new kakao.maps.LatLng(r.lat, r.lng);
      const m = new kakao.maps.Marker({ position: pos, title: r.n, image: pinImg(r.kind) });
      kakao.maps.event.addListener(m, 'click', () => openPop(i));
      bounds.extend(pos); return m;
    });
    if (kd.clusterer) kd.clusterer.addMarkers(kd.markers); else for (const m of kd.markers) m.setMap(kd.map);
    kd.map.relayout();
    if (fit) kd.map.setBounds(bounds);
  }

  function filtered() {
    const gu = $('kd-gu').value, kind = $('kd-kind').value, q = $('kd-name').value.trim().replace(/\s+/g, ''), near = $('kd-near').checked, R = kd.data.meta.반경_m;
    return kd.data.rows.filter((r) => (!gu || r.gu === gu) && (!kind || r.kind === kind) && (!q || r.n.replace(/\s+/g, '').includes(q)) && (!near || r.d <= R)).sort((a, b) => a.d - b.d);
  }

  async function render(fit) {
    if (!kd.data) return;
    kd.rows = filtered();
    const m = kd.data.meta, n = kd.data.rows.length, pub = kd.rows.filter((r) => r.kind === '공립').length;
    $('kd-h').textContent = `수원시 유치원 — ${kd.rows.length.toLocaleString()}곳`;
    $('kd-note').textContent = `전체 ${n.toLocaleString()}곳 중 조건에 맞는 곳입니다(공립 ${pub}곳, 사립 ${kd.rows.length - pub}곳). 단지 대표점(${m.기준점.이름}) 기준 직선거리 가까운 순이며, 목록에서 항목을 누르면 지도로 이동합니다. 겹치는 핀은 숫자로 묶어 보이고 지도를 확대하면 풀립니다.`;
    const ul = $('kd-ul'); ul.replaceChildren();
    if (!kd.rows.length) ul.append(el('li', 'nol', '조건에 맞는 유치원이 없습니다.'));
    kd.rows.forEach((r, i) => {
      const li = el('li'); li.dataset.i = i;
      li.append(el('span', 'nm', r.n));
      li.append(el('small', '', `${r.est} · ${r.gu} · 직선거리 ${distTxt(r.d)}`));
      li.append(el('small', '', r.a));
      if (r.t) { const s = el('small'); const a = el('a', '', '☎ ' + r.t); a.href = telHref(r.t); a.onclick = (e) => e.stopPropagation(); s.append(a); li.append(s); }
      li.onclick = () => openPop(i);
      ul.append(li);
    });
    await draw(fit);
  }

  async function load() {
    if (kd.loaded || kd.loading) return;
    kd.loading = true;
    try {
      const res = await fetch('/api/kinder'), j = await res.json();
      if (!res.ok) throw new Error(j.error || '유치원 정보를 불러오지 못했습니다.');
      kd.data = j; kd.loaded = true;
      $('kd-src').textContent = `출처: ${j.meta.출처}, 수집일 ${fmtDate(j.meta.수집일)}.`;
      await render(true);
    } catch (e) { $('kd-note').textContent = e.message; }
    kd.loading = false;
  }

  for (const id of ['kd-gu', 'kd-kind', 'kd-near']) $(id).onchange = () => render(true);
  $('kd-name').addEventListener('input', () => render(true));

  window.onKinderTab = (on) => {
    if (!on) return;
    load();
    if (kd.map) { const c = kd.map.getCenter(); kd.map.relayout(); kd.map.setCenter(c); }
  };

  /* ----- 지도 전체 화면 (Esc로 돌아오기) ----- */
  function setFull(on) {
    const w = $('kd-wrap');
    if (w.classList.contains('full') === on) return;
    w.classList.toggle('full', on);
    $('kd-full').textContent = on ? '전체 화면 닫기 (Esc)' : '전체 화면';
    if (kd.map) { const c = kd.map.getCenter(); kd.map.relayout(); kd.map.setCenter(c); }
  }
  $('kd-full').onclick = () => setFull(!$('kd-wrap').classList.contains('full'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setFull(false); });
  if (!$('tab-kinder').hidden) window.onKinderTab(true);
})();
