/* ---------- 어린이집 탭 ----------
   자료: 아이사랑 포털(보건복지부) 어린이집 정보공개 '기본정보조회(정기)' → /api/school?kind=daycare (data/daycare/daycare.json), 지도: 카카오맵
   기본은 단지 대표점 기준 직선거리 1km 안이며, 반경·유형·구·이름 필터를 둔다. 휴지(운영 중단)는 기본으로 숨긴다. */
(() => {
  const dc = { map: null, data: null, rows: [], markers: [], clusterer: null, circle: null, pop: null, loaded: false, loading: false };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const distTxt = (m) => (m < 1000 ? `약 ${Math.max(10, Math.round(m / 10) * 10).toLocaleString()}m` : `약 ${(m / 1000).toFixed(1)}km`);
  const telHref = (t) => 'tel:' + t.replace(/[^0-9+]/g, '');
  const COLOR = { 국공립: ['#2f6fd6', '#1b4a9c'], 민간: ['#e8a317', '#8a5d00'], 가정: ['#2e9d5b', '#17653a'], 직장: ['#8e44ad', '#5b2c6f'], 협동: ['#d9534f', '#8b2b28'], 기타: ['#8a8f98', '#555a62'] };
  const GROUPS = Object.keys(COLOR);
  const rest = (r) => r.st === '휴지';
  const headcount = (r) => `정원 ${r.cap.toLocaleString()}명 · 현원 ${r.cur.toLocaleString()}명`;

  function popupFor(r) {
    const d = el('div', 'hs-pop');
    d.append(el('b', '', r.n + (rest(r) ? ' (휴지: 운영 중단)' : '')));
    d.append(el('div', '', `${r.ty} · ${r.gu}`));
    d.append(el('div', '', r.a));
    d.append(el('div', '', headcount(r)));
    d.append(el('div', '', `단지 대표점에서 직선거리 ${distTxt(r.d)}`));
    if (r.t) { const a = el('a', '', '☎ ' + r.t); a.href = telHref(r.t); d.append(a); }
    return d;
  }
  function closePop() { if (dc.pop) { dc.pop.setMap(null); dc.pop = null; } }
  function openPop(i) {
    const r = dc.rows[i], m = dc.markers[i];
    if (!m) return;
    closePop();
    const w = el('div'); w.style.cssText = 'background:#fff;border:1px solid #8e1b1c;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);margin-bottom:38px';
    w.append(popupFor(r));
    dc.pop = new kakao.maps.CustomOverlay({ map: dc.map, position: m.getPosition(), content: w, yAnchor: 1, zIndex: 3 });
    if (dc.map.getLevel() > 4) dc.map.setLevel(4);   // 클러스터가 풀리는 수준까지 확대한 뒤 이동
    dc.map.panTo(m.getPosition());
    for (const li of $('dc-ul').children) li.classList.toggle('on', Number(li.dataset.i) === i);
    const on = $('dc-ul').querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  const img = (svg, w, h, ox, oy) => new kakao.maps.MarkerImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), new kakao.maps.Size(w, h), { offset: new kakao.maps.Point(ox, oy) });
  const pins = {};
  const pinImg = (g, faded) => { const k = g + (faded ? '-f' : ''); return pins[k] || (pins[k] = img(`<svg xmlns="http://www.w3.org/2000/svg" width="29" height="42" viewBox="0 0 29 42" opacity="${faded ? 0.5 : 1}"><path d="M14.5 1C7 1 1 7 1 14.5 1 24 14.5 41 14.5 41S28 24 28 14.5C28 7 22 1 14.5 1z" fill="${COLOR[g][0]}" stroke="${COLOR[g][1]}" stroke-width="1.5"/><circle cx="14.5" cy="14.5" r="5" fill="#fff"/></svg>`, 29, 42, 14, 42)); };
  const homeImg = () => img('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><rect x="2" y="2" width="18" height="18" rx="3" fill="#fff" stroke="#8e1b1c" stroke-width="2.5"/><rect x="7" y="7" width="8" height="8" fill="#8e1b1c"/></svg>', 22, 22, 11, 11);

  async function ensureMap() {
    await loadKakao();
    if (dc.map) return;
    const m = dc.data.meta, c = new kakao.maps.LatLng(m.기준점.위도, m.기준점.경도);
    dc.map = new kakao.maps.Map($('dc-box'), { center: c, level: 5 });
    kakao.maps.event.addListener(dc.map, 'click', closePop);
    new kakao.maps.Marker({ map: dc.map, position: c, title: m.기준점.이름 + ' (대표점)', image: homeImg(), zIndex: 5 });
    dc.circle = new kakao.maps.Circle({ center: c, radius: 1000, strokeWeight: 2, strokeColor: '#8e1b1c', strokeOpacity: 0.6, strokeStyle: 'dashed', fillColor: '#8e1b1c', fillOpacity: 0.05 });
    if (kakao.maps.MarkerClusterer) dc.clusterer = new kakao.maps.MarkerClusterer({ map: dc.map, averageCenter: true, minLevel: 5, gridSize: 50 });
  }

  async function draw() {
    try { await ensureMap(); } catch (e) { $('dc-note').textContent += ' 지도를 표시하지 못했습니다: ' + e.message; return; }
    closePop();
    if (dc.clusterer) dc.clusterer.clear(); else for (const m of dc.markers) m.setMap(null);
    const R = Number($('dc-r').value), c = new kakao.maps.LatLng(dc.data.meta.기준점.위도, dc.data.meta.기준점.경도), bounds = new kakao.maps.LatLngBounds(); bounds.extend(c);
    // 반경 원은 반경을 고른 때만 보이고, 반경 안의 핀이 모두 들어오도록 맞춘다
    if (R) { dc.circle.setRadius(R); dc.circle.setMap(dc.map); const b = dc.circle.getBounds(); bounds.extend(b.getSouthWest()); bounds.extend(b.getNorthEast()); } else dc.circle.setMap(null);
    dc.markers = dc.rows.map((r, i) => {
      const pos = new kakao.maps.LatLng(r.lat, r.lng);
      const m = new kakao.maps.Marker({ position: pos, title: r.n, image: pinImg(r.g, rest(r)) });
      kakao.maps.event.addListener(m, 'click', () => openPop(i));
      if (!R) bounds.extend(pos); return m;
    });
    if (dc.clusterer) dc.clusterer.addMarkers(dc.markers); else for (const m of dc.markers) m.setMap(dc.map);
    dc.map.relayout(); dc.map.setBounds(bounds);
  }

  function filtered() {
    const R = Number($('dc-r').value), ty = $('dc-ty').value, gu = $('dc-gu').value, q = $('dc-name').value.trim().replace(/\s+/g, ''), showRest = $('dc-rest').checked;
    return dc.data.rows.filter((r) => (!R || r.d <= R) && (!ty || r.g === ty) && (!gu || r.gu === gu) && (!q || r.n.replace(/\s+/g, '').includes(q)) && (showRest || !rest(r))).sort((a, b) => a.d - b.d);
  }

  async function render() {
    if (!dc.data) return;
    dc.rows = filtered();
    const R = Number($('dc-r').value), m = dc.data.meta, total = m.건수;
    const scope = R ? `단지 대표점 반경 ${R >= 1000 ? R / 1000 + 'km' : R + 'm'} 안` : '수원시 전체';
    const nRest = dc.data.rows.filter(rest).length;
    $('dc-h').textContent = `수원시 어린이집 (${scope}) — ${dc.rows.length.toLocaleString()}곳`;
    $('dc-note').textContent = `전체 ${total.toLocaleString()}곳 중 조건에 맞는 곳입니다. 단지 대표점(${m.기준점.이름}) 기준 직선거리 가까운 순이며, 목록에서 항목을 누르면 지도로 이동합니다. 겹치는 핀은 숫자로 묶어 보이고 지도를 확대하면 풀립니다.${$('dc-rest').checked ? '' : ` 휴지(운영 중단) ${nRest}곳은 숨겼습니다.`}`;
    const ul = $('dc-ul'); ul.replaceChildren();
    if (!dc.rows.length) ul.append(el('li', 'nol', '조건에 맞는 어린이집이 없습니다.'));
    dc.rows.forEach((r, i) => {
      const li = el('li'); li.dataset.i = i;
      li.append(el('span', 'nm', r.n + (rest(r) ? ' (휴지: 운영 중단)' : '')));
      li.append(el('small', '', `${r.ty} · ${r.gu} · 직선거리 ${distTxt(r.d)}`));
      li.append(el('small', '', headcount(r)));
      li.append(el('small', '', r.a));
      if (r.t) { const s = el('small'); const a = el('a', '', '☎ ' + r.t); a.href = telHref(r.t); a.onclick = (e) => e.stopPropagation(); s.append(a); li.append(s); }
      li.onclick = () => openPop(i);
      ul.append(li);
    });
    await draw();
  }

  async function load() {
    if (dc.loaded || dc.loading) return;
    dc.loading = true;
    try {
      const res = await fetch('/api/school?kind=daycare'), j = await res.json();
      if (!res.ok) throw new Error(j.error || '어린이집 정보를 불러오지 못했습니다.');
      dc.data = j; dc.loaded = true;
      $('dc-src').textContent = `출처: ${j.meta.출처}, 기준일 ${j.meta.기준일}`;
      const lg = $('dc-legend');
      for (const g of GROUPS) { const s = el('span'); const i = el('i', 'dc-dot dc-g-' + g); s.append(i, ' ' + g); lg.append(s); }
      const h = el('span'); h.append(el('i', 'dc-dot dc-home'), ' 단지 대표점'); lg.append(h, el('span', '', '점선 원: 선택한 반경'), el('span', '', '흐린 핀: 휴지'));
      await render();
    } catch (e) { $('dc-note').textContent = e.message; }
    dc.loading = false;
  }

  for (const id of ['dc-r', 'dc-ty', 'dc-gu', 'dc-rest']) $(id).onchange = () => render();
  $('dc-name').addEventListener('input', () => render());

  window.onDaycareTab = (on) => {
    if (!on) return;
    load();
    if (dc.map) { const c = dc.map.getCenter(); dc.map.relayout(); dc.map.setCenter(c); }
  };

  /* ----- 지도 전체 화면 (Esc로 돌아오기) ----- */
  function setFull(on) {
    const w = $('dc-wrap');
    if (w.classList.contains('full') === on) return;
    w.classList.toggle('full', on);
    $('dc-full').textContent = on ? '전체 화면 닫기 (Esc)' : '전체 화면';
    if (dc.map) { const c = dc.map.getCenter(); dc.map.relayout(); dc.map.setCenter(c); }
  }
  $('dc-full').onclick = () => setFull(!$('dc-wrap').classList.contains('full'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setFull(false); });
  if (!$('tab-daycare').hidden) window.onDaycareTab(true);
})();
