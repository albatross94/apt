/* ---------- 학교검색 탭 ----------
   index.html·hospital.js 뒤에 불러온다($, loadKakao 같은 전역을 쓴다).
   자료: 한국교육시설안전원(학구도·학교 위치) + 학교 기본정보. 로그인한 사용자에게만 /api/school 이 내려 준다.
   판정(좌표 → 학구)은 서버가 원본 정밀도 경계로 한다. 이 파일은 표시만 맡는다. */
(() => {
  const sc = { ready: null, schools: [], district: {}, meta: null, geo: {}, polys: {}, map: null, markers: [], pins: {}, pop: null, hl: [], pt: [], rows: [], seq: 0 };
  const LV = { elem: '초등', mid: '중', high: '고등' };                       // 학교급 이름
  const LVNAME = { elem: '초등 통학구역', mid: '중학군', high: '고교구역' };
  const COLOR = { elem: '#2b6cb0', mid: '#2e9d5b', high: '#c0392b' };
  const LVKEY = { '초등': 'elem', '중': 'mid', '고등': 'high' };
  const LVSHORT = { '초등': '초', '중': '중', '고등': '고' };
  const TEL = '수원교육지원청(031-250-1482)';
  const NEAR_KM = 1.5;      // 주변 학교 표시 반경 (직선거리)
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const km = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); };
  const distTxt = (k) => (k < 1 ? `약 ${Math.max(10, Math.round(k * 100) * 10)}m` : `약 ${k.toFixed(1)}km`);
  const get = async (params) => {
    let r;
    try { r = await fetch('/api/school?' + new URLSearchParams(params)); }
    catch { throw new Error('학교 자료를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.'); }
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error((j && j.error) || (r.status === 401 ? '로그인이 필요합니다.' : '학교 자료를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.'));
    return j;
  };

  /* ----- 자료 불러오기 (처음 탭을 열 때 한 번) ----- */
  function init() {
    if (!sc.ready) {
      sc.ready = Promise.all([get({ kind: 'schools' })]).then(([j]) => {
        sc.near = j.nearM; sc.zoneDate = j.addrZone ? j.addrZone.date : ''; sc.schools = j.schools; sc.district = j.district; sc.meta = j.meta;
        $('sc-dates').textContent = `자료 기준일: 학구도 ${j.meta.baseDate}(학구 변경일은 학구마다 표시) · 학교 위치 ${j.meta.locationDate} · 학교 기본정보 ${j.meta.infoDate}. 출처: 한국교육시설안전원, 교육부 학교기본정보. 학구도는 매년 3월·9월에 갱신됩니다. ${j.addrZone ? ` 통학구역 주소표 ${j.addrZone.date}, 기준일이 달라 차이가 날 수 있음(수원교육지원청 자료).` : ''}`;
      });
      sc.ready.catch(() => { sc.ready = null; });
    }
    return sc.ready;
  }
  window.onSchoolTab = (on) => {
    if (!on) return;
    init().catch((e) => { $('sc-status').textContent = e.message; });
    if (sc.map) { const c = sc.map.getCenter(); sc.map.relayout(); sc.map.setCenter(c); }
  };

  /* ----- 지도 ----- */
  function pinFor(lv) {   // 학교급별 색 핀
    const key = LVKEY[lv] || 'elem';
    if (!sc.pins[key]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="${COLOR[key]}" stroke="#fff" stroke-width="2"/><text x="15" y="20" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="sans-serif">${LVSHORT[lv] || '초'}</text></svg>`;
      sc.pins[key] = new kakao.maps.MarkerImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), new kakao.maps.Size(30, 30), { offset: new kakao.maps.Point(15, 15) });
    }
    return sc.pins[key];
  }
  async function ensureMap() {
    await loadKakao();
    if (!sc.map) {
      sc.map = new kakao.maps.Map($('sc-box'), { center: new kakao.maps.LatLng(37.2705, 127.0205), level: 6 });
      kakao.maps.event.addListener(sc.map, 'click', closePop);
    }
    sc.map.relayout();
  }
  function closePop() { if (sc.pop) { sc.pop.setMap(null); sc.pop = null; } }
  const clear = (arr) => { for (const o of arr.splice(0)) o.setMap(null); };

  function popFor(s) {
    const d = el('div', 'sc-pop');
    d.append(el('b', '', s.nm), el('div', '', `${s.lv === '고등' ? '고등학교' : s.lv + '학교'} · ${s.est || '설립 정보 없음'}${s.coed ? ' · ' + s.coed : ''}`), el('div', '', s.addr));
    if (s.tel) d.append(el('div', '', s.tel));
    if (/^https?:\/\//i.test(s.url)) { const a = el('a', '', '누리집'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; d.append(a); }
    return d;
  }
  function openPop(s) {
    closePop();
    const w = el('div'); w.style.cssText = 'background:#fff;border:1px solid #8e1b1c;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);margin-bottom:22px';
    w.append(popFor(s));
    sc.pop = new kakao.maps.CustomOverlay({ map: sc.map, position: new kakao.maps.LatLng(s.lat, s.lng), content: w, yAnchor: 1, zIndex: 5 });
  }

  // 학구 경계 그리기. ids 가 있으면 그 학구만(강조), 없으면 학급 전체(토글)
  async function geo(l) {
    if (!sc.geo[l]) sc.geo[l] = get({ kind: 'geo', level: l });
    try { return await sc.geo[l]; } catch (e) { sc.geo[l] = null; throw e; }
  }
  function polysOf(f, style) {
    return f.geometry.coordinates.map((poly) => new kakao.maps.Polygon({ map: sc.map, path: poly.map((ring) => ring.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng))), ...style }));
  }
  async function toggleLayer(l, on) {
    if (sc.polys[l]) { clear(sc.polys[l]); delete sc.polys[l]; }
    if (!on) return;
    await ensureMap();
    const g = await geo(l);
    sc.polys[l] = g.features.flatMap((f) => polysOf(f, { strokeWeight: 2, strokeColor: COLOR[l], strokeOpacity: .85, fillColor: COLOR[l], fillOpacity: .08 }));
  }
  async function highlight(ids) {   // [{l, id}] 학구를 굵게 표시하고 그 범위로 지도를 맞춘다
    clear(sc.hl);
    const bounds = new kakao.maps.LatLngBounds();
    for (const { l, id } of ids) {
      const f = (await geo(l)).features.find((x) => x.properties.id === id);
      if (!f) continue;
      sc.hl.push(...polysOf(f, { strokeWeight: 4, strokeColor: COLOR[l], strokeOpacity: 1, fillColor: COLOR[l], fillOpacity: .22, zIndex: 2 }));
      for (const poly of f.geometry.coordinates) for (const [lng, lat] of poly[0]) bounds.extend(new kakao.maps.LatLng(lat, lng));
    }
    if (sc.hl.length) sc.map.setBounds(bounds);
  }

  // 같은 좌표이거나 5m 이내인 학교(같은 부지의 초·중·고 등)는 마커 하나로 합쳐 "학교 N곳"으로 보여 준다
  const MERGE_M = 5;
  function groupRows(rows) {
    const used = new Set(), groups = [];
    rows.forEach((s, i) => {
      if (used.has(i)) return;
      const g = [i]; used.add(i);
      rows.forEach((t, j) => { if (!used.has(j) && km(s.lat, s.lng, t.lat, t.lng) * 1000 <= MERGE_M) { g.push(j); used.add(j); } });
      groups.push(g);
    });
    return groups;
  }
  function groupPin(n, key) {   // 여러 학교: 숫자가 든 원. 학교급이 모두 같으면 그 색, 섞이면 회색
    const k = `g${n}${key}`;
    if (!sc.pins[k]) {
      const c = COLOR[key] || '#555';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38"><circle cx="19" cy="19" r="17" fill="${c}" stroke="#fff" stroke-width="2.5"/><circle cx="19" cy="19" r="13" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 2"/><text x="19" y="24.5" text-anchor="middle" font-size="16" font-weight="700" fill="#fff" font-family="sans-serif">${n}</text></svg>`;
      sc.pins[k] = new kakao.maps.MarkerImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), new kakao.maps.Size(38, 38), { offset: new kakao.maps.Point(19, 19) });
    }
    return sc.pins[k];
  }
  function openGroupPop(idxs) {
    closePop();
    const s0 = sc.rows[idxs[0]];
    const w = el('div'); w.style.cssText = 'background:#fff;border:1px solid #8e1b1c;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);margin-bottom:26px';
    const d = el('div', 'sc-pop'); d.append(el('b', '', `학교 ${idxs.length}곳`));
    for (const i of idxs) {
      const s = sc.rows[i], b = el('button', '', `${s.nm} (${s.lv === '고등' ? '고' : s.lv === '초등' ? '초' : '중'})`);
      b.type = 'button'; b.style.cssText = 'display:block;width:100%;text-align:left;font:inherit;font-size:12px;padding:3px 0;border:0;background:none;color:#8e1b1c;cursor:pointer;text-decoration:underline';
      b.onclick = () => pick(i, false);
      d.append(b);
    }
    w.append(d);
    sc.pop = new kakao.maps.CustomOverlay({ map: sc.map, position: new kakao.maps.LatLng(s0.lat, s0.lng), content: w, yAnchor: 1, zIndex: 12 });
  }
  function setMarkers(rows, fit) {
    clear(sc.markers); closePop();
    const bounds = new kakao.maps.LatLngBounds(); let n = 0;
    for (const g of groupRows(rows)) {
      const s = rows[g[0]], pos = new kakao.maps.LatLng(s.lat, s.lng);
      const lvs = [...new Set(g.map((i) => LVKEY[rows[i].lv]))];
      const m = g.length === 1
        ? new kakao.maps.Marker({ map: sc.map, position: pos, title: s.nm, image: pinFor(s.lv), zIndex: 10 })
        : new kakao.maps.Marker({ map: sc.map, position: pos, title: `학교 ${g.length}곳: ${g.map((i) => rows[i].nm).join(', ')}`, image: groupPin(g.length, lvs.length === 1 ? lvs[0] : 'mix'), zIndex: 11 });
      kakao.maps.event.addListener(m, 'click', () => (g.length === 1 ? pick(g[0], false) : openGroupPop(g)));
      sc.markers.push(m); bounds.extend(pos); n++;
    }
    sc.map.relayout();
    if (fit && n) sc.map.setBounds(bounds);
  }
  function setPoints(pts) {   // 기준 지점(주소·동) 표시
    clear(sc.pt);
    for (const p of pts) {
      const pos = new kakao.maps.LatLng(p.lat, p.lng);
      if (p.label) {
        // 동 표시는 모서리가 각진 작은 네모(학교는 동그란 핀)라 모양으로 구분된다. 학교 마커보다 아래에 그린다.
        const e = el('div', '', p.label); e.style.cssText = 'background:#fff;color:#8e1b1c;border-radius:2px;padding:0 4px;font-size:10px;font-weight:700;border:1.5px solid #8e1b1c;white-space:nowrap;line-height:14px;pointer-events:none';
        sc.pt.push(new kakao.maps.CustomOverlay({ map: sc.map, position: pos, content: e, yAnchor: 0.5, zIndex: 2 }));
      } else sc.pt.push(new kakao.maps.Marker({ map: sc.map, position: pos, zIndex: 4 }));
    }
  }

  /* ----- 학교 목록 ----- */
  function renderList(rows, from) {   // from: {lat,lng} 있으면 직선거리 표시
    sc.rows = rows;
    const ul = $('sc-ul'); ul.replaceChildren();
    if (!rows.length) { ul.append(el('li', 'nol', '조건에 맞는 학교가 없습니다.')); return; }
    rows.forEach((s, i) => {
      const li = el('li'); li.dataset.i = i;
      const nm = el('span', 'nm', s.nm); nm.append(el('span', 'sc-lv', LVSHORT[s.lv] === '고' ? '고등' : s.lv === '초등' ? '초등' : '중등'));
      li.append(nm);
      li.append(el('small', '', [s.est, s.coed].filter(Boolean).join(' · ') + (from && s.d != null ? ` · 직선거리 ${distTxt(s.d)}` : '')));
      li.append(el('small', '', s.addr));
      if (s.tel) li.append(el('small', '', s.tel));
      if (/^https?:\/\//i.test(s.url)) { const a = el('a', '', '누리집'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.onclick = (e) => e.stopPropagation(); const sm = el('small'); sm.append(a); li.append(sm); }
      li.onclick = () => pick(i, true);
      ul.append(li);
    });
  }
  // 학교 하나를 고르면 그 학교가 속한 학구(초=통학구역, 중·고=학교군)를 지도에 표시한다
  async function pick(i, pan) {
    const s = sc.rows[i]; if (!s) return;
    for (const li of $('sc-ul').children) li.classList.toggle('on', Number(li.dataset.i) === i);
    const on = $('sc-ul').querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    try {
      await ensureMap();
      const l = LVKEY[s.lv], ids = Object.keys(sc.district).filter((d) => sc.district[d].some((x) => x.id === s.id));
      const g = await geo(l), mine = g.features.filter((f) => ids.includes(f.properties.id)).map((f) => ({ l, id: f.properties.id }));
      if (mine.length) await highlight(mine); else { clear(sc.hl); if (pan) sc.map.panTo(new kakao.maps.LatLng(s.lat, s.lng)); }
      openPop(s);
      $('sc-note').textContent = mine.length ? `${s.nm}: 지도의 굵은 선이 이 학교가 속한 ${LVNAME[l]}입니다.` : `${s.nm}: 이 학교가 속한 ${LVNAME[l]} 자료가 없습니다 [확인 필요].`;
    } catch (e) { $('sc-note').textContent = '지도를 표시하지 못했습니다: ' + e.message; }
  }

  /* ----- 판정 표시 ----- */
  function judgeTable(L) {
    const t = el('table', 'gx-table'), hd = el('thead'), r0 = el('tr');
    for (const h of ['구분', '학구', '구역 안 학교', '경계까지']) r0.append(el('th', 'l', h));
    hd.append(r0); t.append(hd);
    const tb = el('tbody');
    for (const k of ['elem', 'mid', 'high']) {
      const X = L.levels[k], tr = el('tr');
      tr.append(el('td', 'l', LVNAME[k]));
      tr.append(el('td', 'l', X.inside.map((d) => d.nm + (d.joint ? '(공동학구)' : '')).join(', ') || '[확인 필요]'));
      const names = [...new Set(X.inside.flatMap((d) => d.schools.map((s) => s.nm)))];
      tr.append(el('td', 'l', names.length > 10 ? `${names.length}개교: ${names.join(', ')}` : names.join(', ') || '-'));
      tr.append(el('td', 'l', X.near == null ? '-' : `약 ${Math.round(X.near)}m`));
      tb.append(tr);
    }
    t.append(tb);
    const w = el('div', 'gx-tablewrap'); w.append(t); return w;
  }
  function renderJudge(L, title) {
    const box = $('sc-judge'); box.replaceChildren();
    box.append(el('b', '', title), judgeTable(L));
    const s = el('p', L.check ? 'sc-warn' : 'gx-note');
    if (L.check) s.textContent = `확인필요: ${L.reasons.join(' · ')}. ${TEL}에 확인해 주세요.`;
    else s.textContent = `경계에서 ${sc.near}m 넘게 떨어져 있어 판정은 안정적입니다. 그래도 실제 배정은 관할 교육지원청에서 확인해 주세요.`;
    const upd = [...new Set(['elem', 'mid', 'high'].flatMap((k) => L.levels[k].inside.map((d) => `${d.nm} ${d.upd}`)))];
    box.append(s, el('p', 'gx-note', `학구 변경일: ${upd.join(' · ')}`));
    const Z = L.addrZone;
    if (Z) {
      const names = Z.found ? [...new Set(Z.rows.map((r) => r.school + (r.temp ? '(임시 통학구역 표기)' : '')))].join(', ') : '';
      box.append(el('p', Z.found && Z.match === false ? 'sc-warn' : 'gx-note', Z.found
        ? `수원교육지원청 통학구역 주소표(${Z.date}): ${names} — 초등 판정과 ${Z.match === false ? '다름, 기준일 차이 가능' : Z.match ? '같음' : '비교하지 못함'}. 기준일이 달라 차이가 날 수 있습니다.`
        : `수원교육지원청 통학구역 주소표(${Z.date})에서 이 주소를 찾지 못했습니다. 주소표와는 비교하지 못했습니다.`));
    }
  }

  /* ----- 단지 동별 표 ----- */
  function dongTable(C) {
    const t = el('table', 'gx-table'), hd = el('thead'), r0 = el('tr');
    for (const h of ['동', '초등 통학구역', '중학군', '고교구역', '상태']) r0.append(el('th', 'l', h));
    hd.append(r0); t.append(hd);
    const tb = el('tbody');
    for (const d of C.dongs) {
      const tr = el('tr'), nm = (a) => (a && a.length ? a.map((x) => x.이름).join(', ') : '[확인 필요]');
      tr.append(el('td', 'l', d.동), el('td', 'l', nm(d.초등학구)), el('td', 'l', nm(d.중학구)), el('td', 'l', nm(d.고교구역)));
      const st = el('td', 'l'); st.append(el('span', d.확인필요 ? 'sc-chk' : 'sc-ok', d.상태));
      if (d.확인필요) { st.append(el('br'), el('small', '', `${TEL}에 확인`)); st.title = (d.사유 || []).join(' / '); }
      const z = d.주소표;
      if (z && z.학교 && z.학교.length) {
        st.append(el('br'), el('small', '', `주소표(${z.기준일}) ${z.학교.join(', ')}${z.임시표기 ? '(임시 통학구역 표기)' : ''}: ${z.일치 ? '일치' : '다름, 기준일 차이 가능'}`));
      }
      tr.append(st);
      if (d.위도 != null) { tr.style.cursor = 'pointer'; tr.onclick = async () => { await ensureMap(); sc.map.setLevel(4); sc.map.panTo(new kakao.maps.LatLng(d.위도, d.경도)); }; }
      tb.append(tr);
    }
    t.append(tb);
    const w = el('div', 'gx-tablewrap'); w.append(t); return w;
  }

  /* ----- 주소·장소 → 좌표 (카카오 지도 SDK의 services) ----- */
  function geocode(q) {
    return new Promise((ok, no) => {
      const svc = kakao.maps.services;
      if (!svc) return no(new Error('카카오 주소 검색을 불러오지 못했습니다.'));
      const inSuwon = (r) => /수원/.test(r.address_name || r.address?.address_name || '');
      new svc.Geocoder().addressSearch(q, (res, st) => {
        const hit = st === svc.Status.OK && res.find(inSuwon);
        if (hit) return ok({ lat: Number(hit.y), lng: Number(hit.x), label: hit.road_address ? hit.road_address.address_name : hit.address_name, jibun: hit.address ? hit.address.address_name : '', road: hit.road_address ? hit.road_address.address_name : '' });
        new svc.Places().keywordSearch(q, (r2, st2) => {
          const h2 = st2 === svc.Status.OK && r2.find(inSuwon);
          ok(h2 ? { lat: Number(h2.y), lng: Number(h2.x), label: `${h2.place_name} (${h2.road_address_name || h2.address_name})`, jibun: h2.address_name || '', road: h2.road_address_name || '' } : null);
        }, { location: new kakao.maps.LatLng(37.2705, 127.0205), radius: 20000 });
      });
    });
  }

  /* ----- 검색 ----- */
  const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  function nearby(lat, lng, lv) {
    return sc.schools.filter((s) => !lv || s.lv === lv).map((s) => ({ ...s, d: km(lat, lng, s.lat, s.lng) })).filter((s) => s.d <= NEAR_KM).sort((a, b) => a.d - b.d);
  }
  async function search() {
    const my = ++sc.seq, status = $('sc-status'), go = $('sc-go');
    const q = $('sc-q').value.trim(), gu = $('sc-gu').value, lv = $('sc-lv').value;
    go.disabled = true; status.textContent = '학교를 찾는 중…';
    try {
      await init();
      if (my !== sc.seq) return;
      const guLabel = gu ? '수원시 ' + gu : '수원시', cond = [lv && $('sc-lv').selectedOptions[0].textContent, q && `“${q}”`].filter(Boolean).join(' · ');
      const byFilter = sc.schools.filter((s) => (!gu || s.addr.includes(gu)) && (!lv || s.lv === lv));
      let rows = [], from = null, title = '', judge = null, complex = null, pts = [], jtitle = '';
      const isComplex = /아이파크자이|센트럴아이파크/.test(norm(q));
      const byName = q ? byFilter.filter((s) => norm(s.nm).includes(norm(q))) : byFilter;

      $('sc-judge').replaceChildren(); $('sc-dongs').replaceChildren(); $('sc-note').textContent = '';
      $('sc-res').hidden = false;

      if (isComplex) {
        complex = await get({ kind: 'complex' }).catch((e) => ({ error: e.message }));
        const found = complex.dongs ? complex.dongs.filter((d) => d.위도 != null) : [];
        if (found.length) {
          const cx = found.reduce((a, d) => a + d.위도, 0) / found.length, cy = found.reduce((a, d) => a + d.경도, 0) / found.length;
          from = { lat: cx, lng: cy }; rows = nearby(cx, cy, lv); pts = found.map((d) => ({ lat: d.위도, lng: d.경도, label: d.동.replace('동', '') }));
        }
        title = `수원센트럴아이파크자이 동별 학구${cond ? ' · ' + cond : ''}`;
      } else if (byName.length || !q) {
        rows = byName; title = `${guLabel}${cond ? ' · ' + cond : ''} — 학교 ${rows.length.toLocaleString()}곳`;
      } else {
        // 학교 이름이 아니면 단지명·주소로 보고 좌표를 구한다
        await loadKakao();
        const p = await geocode(q);
        if (my !== sc.seq) return;
        if (!p) { rows = []; title = `${guLabel} · “${q}” — 찾지 못했습니다`; $('sc-note').textContent = '학교 이름이나 수원시 안의 단지명·주소로 찾아 보세요. 주소는 도로명(예: 인계로 21)이나 지번(예: 인계동 257-2)을 쓸 수 있습니다.'; }
        else {
          const L = await get({ kind: 'locate', lat: p.lat, lng: p.lng, jibun: p.jibun || '', road: p.road || '' });
          judge = L; jtitle = `${p.label} 기준`; from = p; rows = nearby(p.lat, p.lng, lv); pts = [{ lat: p.lat, lng: p.lng }];
          title = `“${q}” 주변 — 학구 판정과 ${NEAR_KM}km 안 학교 ${rows.length}곳`;
        }
      }
      if (my !== sc.seq) return;

      $('sc-h').textContent = title;
      if (judge) renderJudge(judge, jtitle);
      if (complex) {
        const box = $('sc-dongs');
        if (complex.dongs) {
          const elemSet = [...new Set(complex.dongs.map((d) => (d.초등학구 || []).map((x) => x.이름).join('/')).filter(Boolean))];
          box.append(el('b', '', '동별 초등 통학구역 · 중학군 · 고교구역'));
          if (elemSet.length > 1) box.append(el('p', 'sc-warn', `동에 따라 초등 통학구역이 다릅니다 (${elemSet.join(' · ')}). 아래 표에서 해당 동을 확인해 주세요.`));
          box.append(dongTable(complex));
          const n = complex.dongs.filter((d) => d.확인필요).length;
          box.append(el('p', n ? 'sc-warn' : 'gx-note', n ? `${n}개 동은 경계에 가깝거나 좌표를 확인하지 못해 “확인필요”로 표시했습니다. ${TEL}에 확인해 주세요.` : `모든 동이 경계에서 ${complex.기준.확인필요_경계거리_m}m 넘게 떨어져 있습니다.`), el('p', 'gx-note', `학구도 기준일 ${complex.기준.학구도}. 동 위치는 카카오 지도 검색 결과이며 실제 건물 위치와 다를 수 있습니다. 참고용 안내이며 실제 배정은 ${TEL}에서 확인해 주세요.`));
        } else box.append(el('p', 'sc-warn', `단지 동별 판정 자료를 불러오지 못했습니다 [확인 필요]. ${complex.error || ''}`));
      }
      renderList(rows, from);
      const dets = [];
      if (rows.length) dets.push('지도의 동그란 핀은 학교(파랑 초등·초록 중·빨강 고등), 숫자 핀은 같은 부지의 학교 여러 곳' + (pts.length ? ', 흰 네모는 단지 동' : '') + '입니다.');
      if (from) dets.push('학교 옆 숫자는 기준 지점으로부터의 직선거리입니다. 가까운 학교가 배정 학교라는 뜻은 아닙니다.');
      if (!q && rows.length) dets.push('학교를 누르면 그 학교가 속한 학구가 지도에 표시됩니다.');
      $('sc-note').textContent = $('sc-note').textContent || dets.join(' ');
      status.textContent = '';
      try {
        await ensureMap();
        if (my !== sc.seq) return;
        clear(sc.hl); setMarkers(rows, !pts.length); setPoints(pts);
        if (pts.length) { const b = new kakao.maps.LatLngBounds(); for (const p of pts) b.extend(new kakao.maps.LatLng(p.lat, p.lng)); for (const s of rows) b.extend(new kakao.maps.LatLng(s.lat, s.lng)); sc.map.setBounds(b); }
      } catch (e) { $('sc-note').textContent += ' 지도를 표시하지 못했습니다: ' + e.message; }
    } catch (e) {
      if (my === sc.seq) status.textContent = e.message;
    }
    if (my === sc.seq) go.disabled = false;
  }

  for (const cb of document.querySelectorAll('#sc-layers input')) {
    cb.onchange = async () => { try { await toggleLayer(cb.dataset.l, cb.checked); } catch (e) { cb.checked = false; $('sc-status').textContent = '학구 경계를 불러오지 못했습니다: ' + e.message; } };
  }
  $('sc-go').onclick = search;
  $('sc-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  if (!$('tab-school').hidden) window.onSchoolTab(true);
})();
