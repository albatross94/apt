/* ---------- 학교검색 탭 ----------
   index.html·hospital.js 뒤에 불러온다($, loadKakao 같은 전역을 쓴다).
   자료: 한국교육시설안전원(학구도·학교 위치) + 학교 기본정보. 로그인한 사용자에게만 /api/school 이 내려 준다.
   판정(좌표 → 학구)은 서버가 원본 정밀도 경계로 한다. 이 파일은 표시만 맡는다. */
(() => {
  const sc = { ready: null, schools: [], district: {}, meta: null, geo: {}, polys: {}, map: null, markers: [], pins: {}, pop: null, hl: [], pt: [], rows: [], seq: 0, zseq: 0, byId: new Map(), view: null, flat: null, cx: null, cxLv: '', dongSel: '' };
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
        sc.near = j.nearM; sc.zoneDate = j.addrZone ? j.addrZone.date : ''; sc.schools = j.schools; sc.byId = new Map(j.schools.map((x) => [x.id, x])); sc.district = j.district; sc.meta = j.meta;
        $('sc-dates').textContent = `자료 기준일: 학구도 ${j.meta.baseDate}(학구 변경일은 학구마다 표시) · 학교 위치 ${j.meta.locationDate} · 학교 기본정보 ${j.meta.infoDate}. 출처: 한국교육시설안전원, 교육부 학교기본정보. 학구도는 매년 3월·9월에 갱신됩니다. ${j.addrZone ? ` 통학구역 주소표 ${j.addrZone.date}, 기준일이 달라 차이가 날 수 있음(수원교육지원청 자료).` : ''}${j.midPlan ? ` 중학군 교차검증: 중학군 개정(안) ${j.midPlan.학년도}학년도(${j.midPlan.상태}), 출처 ${j.midPlan.출처}(파일 기준일 ${j.midPlan.파일기준일}·게시일 ${j.midPlan.게시일})${j.midPlan.통반출처 ? `, 통·반 근거: ${j.midPlan.통반출처}` : ''}.` : ''}`;
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
  // 마커 모양: 진한 원 = 소속 학교(m), 연한 점선 원 = 경계 맞은편 후보(c), 회색 원 = 가까운 학교(n)
  function svgPin(size, fill, fillOp, stroke, dash, textFill, text, fs) {
    const c = size / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${c - 2}" fill="${fill}" fill-opacity="${fillOp}" stroke="${stroke}" stroke-width="2"${dash ? ' stroke-dasharray="3 2"' : ''}/><text x="${c}" y="${c + fs / 3}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${textFill}" font-family="sans-serif">${text}</text></svg>`;
  }
  function pinImage(key, svg, size) {
    if (!sc.pins[key]) sc.pins[key] = new kakao.maps.MarkerImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), new kakao.maps.Size(size, size), { offset: new kakao.maps.Point(size / 2, size / 2) });
    return sc.pins[key];
  }
  function pinFor(lv, role) {
    const k = LVKEY[lv] || 'elem', r = role || 'm', col = COLOR[k], t = LVSHORT[lv] || '초';
    if (r === 'c') return pinImage(`${k}-c`, svgPin(30, col, 0.28, col, true, col, t, 14), 30);
    if (r === 'n') return pinImage(`${k}-n`, svgPin(26, '#9aa0a6', 0.75, '#fff', false, '#fff', t, 12), 26);
    return pinImage(`${k}-m`, svgPin(30, col, 1, '#fff', false, '#fff', t, 14), 30);
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

  /* ----- 지도 전체 화면 (Esc로 돌아오기) ----- */
  function setFull(on) {
    const w = $('sc-wrap');
    if (w.classList.contains('full') === on) return;
    w.classList.toggle('full', on);
    $('sc-full').textContent = on ? '전체 화면 닫기 (Esc)' : '전체 화면';
    if (sc.map) { const c = sc.map.getCenter(); sc.map.relayout(); sc.map.setCenter(c); }   // 크기가 바뀌면 다시 계산하고 보던 중심은 유지
  }
  $('sc-full').onclick = () => setFull(!$('sc-wrap').classList.contains('full'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setFull(false); });

  function popFor(s, role) {
    const d = el('div', 'sc-pop');
    d.append(el('b', '', s.nm), el('div', '', `${s.lv === '고등' ? '고등학교' : s.lv + '학교'} · ${s.est || '설립 정보 없음'}${s.coed ? ' · ' + s.coed : ''}`), el('div', '', s.addr));
    if (s.tel) d.append(el('div', '', s.tel));
    if (/^https?:\/\//i.test(s.url)) { const a = el('a', '', '누리집'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; d.append(a); }
    if (role === 'c') d.append(el('div', '', '경계 맞은편 후보 (판정된 학구 소속이 아닙니다)'));
    if (role === 'n') d.append(el('div', '', '가까운 학교 (직선거리 참고, 배정 학교가 아닙니다)'));
    return d;
  }
  function openPop(s, role) {
    closePop();
    const w = el('div'); w.style.cssText = 'background:#fff;border:1px solid #8e1b1c;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);margin-bottom:22px';
    w.append(popFor(s, role));
    sc.pop = new kakao.maps.CustomOverlay({ map: sc.map, position: new kakao.maps.LatLng(s.lat, s.lng), content: w, yAnchor: 1, zIndex: 20 });
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
  const ROLE_TXT = { m: '소속 학교', c: '경계 맞은편 후보', n: '가까운 학교' };
  function groupRows(items) {
    const used = new Set(), groups = [];
    items.forEach((it, i) => {
      if (used.has(i)) return;
      const g = [i]; used.add(i);
      items.forEach((t, j) => { if (!used.has(j) && km(it.s.lat, it.s.lng, t.s.lat, t.s.lng) * 1000 <= MERGE_M) { g.push(j); used.add(j); } });
      groups.push(g);
    });
    return groups;
  }
  function groupPin(n, key, role) {   // 여러 학교: 숫자가 든 원. 학교급이 모두 같으면 그 색, 섞이면 회색
    const col = COLOR[key] || '#555';
    if (role === 'm') return pinImage(`g${n}${key}m`, svgPin(38, col, 1, '#fff', false, '#fff', n, 16), 38);
    if (role === 'c') return pinImage(`g${n}${key}c`, svgPin(38, col, 0.28, col, true, col, n, 16), 38);
    return pinImage(`g${n}${key}n`, svgPin(32, '#9aa0a6', 0.75, '#fff', false, '#fff', n, 14), 32);
  }
  function openGroupPop(items) {
    closePop();
    const s0 = items[0].s;
    const w = el('div'); w.style.cssText = 'background:#fff;border:1px solid #8e1b1c;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);margin-bottom:26px';
    const d = el('div', 'sc-pop'); d.append(el('b', '', `학교 ${items.length}곳`));
    for (const it of items) {
      const s = it.s, b = el('button', '', `${s.nm} (${s.lv === '고등' ? '고' : s.lv === '초등' ? '초' : '중'})${it.role === 'c' ? ' · 후보' : ''}`);
      b.type = 'button'; b.style.cssText = 'display:block;width:100%;text-align:left;font:inherit;font-size:12px;padding:3px 0;border:0;background:none;color:#8e1b1c;cursor:pointer;text-decoration:underline';
      b.onclick = () => pickSchool(s, false, it.role);
      d.append(b);
    }
    w.append(d);
    sc.pop = new kakao.maps.CustomOverlay({ map: sc.map, position: new kakao.maps.LatLng(s0.lat, s0.lng), content: w, yAnchor: 1, zIndex: 12 });
  }
  // items: [{ s: 학교, role: 'm'|'c'|'n' }]
  function setMarkers(items, fit) {
    clear(sc.markers); closePop();
    const bounds = new kakao.maps.LatLngBounds(); let n = 0;
    for (const g of groupRows(items)) {
      const members = g.map((i) => items[i]), it = members[0], s = it.s, pos = new kakao.maps.LatLng(s.lat, s.lng);
      const role = members.some((x) => x.role === 'm') ? 'm' : members.some((x) => x.role === 'c') ? 'c' : 'n';
      const lvs = [...new Set(members.map((x) => LVKEY[x.s.lv]))];
      const z = role === 'm' ? 12 : role === 'c' ? 10 : 8;
      const m = members.length === 1
        ? new kakao.maps.Marker({ map: sc.map, position: pos, title: `${s.nm}${role === 'c' ? ' (경계 맞은편 후보)' : ''}`, image: pinFor(s.lv, role), zIndex: z })
        : new kakao.maps.Marker({ map: sc.map, position: pos, title: `학교 ${members.length}곳: ${members.map((x) => x.s.nm).join(', ')}`, image: groupPin(members.length, lvs.length === 1 ? lvs[0] : 'mix', role), zIndex: z + 1 });
      kakao.maps.event.addListener(m, 'click', () => (members.length === 1 ? pickSchool(s, false, role) : openGroupPop(members)));
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
        const e = el('div', '', p.label); e.style.cssText = `background:${p.sel ? '#8e1b1c' : '#fff'};color:${p.sel ? '#fff' : '#8e1b1c'};border-radius:2px;padding:0 4px;font-size:10px;font-weight:700;border:1.5px solid #8e1b1c;white-space:nowrap;line-height:14px;pointer-events:none`;
        sc.pt.push(new kakao.maps.CustomOverlay({ map: sc.map, position: pos, content: e, yAnchor: 0.5, zIndex: p.sel ? 3 : 2 }));
      } else sc.pt.push(new kakao.maps.Marker({ map: sc.map, position: pos, zIndex: 4, title: p.rep ? '단지 대표점' : '검색한 위치' }));
    }
  }

  /* ----- 학교 목록 ----- */
  // 학교 한 칸. o.role: 'm' 소속 학교 · 'c' 경계 맞은편 후보 · 'n' 가까운 학교, o.from 이 있으면 직선거리(참고)를 적는다
  function liFor(s0, o) {
    const s = o.from ? { ...s0, d: km(o.from.lat, o.from.lng, s0.lat, s0.lng) } : s0;
    const li = el('li', o.role === 'c' ? 'cand' : ''); li.dataset.id = s.id; li.dataset.role = o.role || 'm';
    const nm = el('span', 'nm', s.nm); nm.append(el('span', 'sc-lv', s.lv === '고등' ? '고등' : s.lv === '초등' ? '초등' : '중등'));
    li.append(nm);
    li.append(el('small', '', [s.est, s.coed].filter(Boolean).join(' · ') + (s.d != null ? ` · 직선거리 ${distTxt(s.d)} (참고)` : '')));
    li.append(el('small', '', s.addr));
    if (s.tel) li.append(el('small', '', s.tel));
    if (/^https?:\/\//i.test(s.url)) { const a = el('a', '', '누리집'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; a.onclick = (e) => e.stopPropagation(); const sm = el('small'); sm.append(a); li.append(sm); }
    li.onclick = () => pickSchool(s0, true, o.role || 'm');
    return li;
  }
  // 학교 이름·빈 검색: 학구와 상관없이 조건에 맞는 학교를 이름순으로
  function renderFlat(rows) {
    sc.view = null; sc.flat = rows;
    const ul = $('sc-ul'); ul.replaceChildren(); $('sc-near').hidden = true;
    if (!rows.length) { ul.append(el('li', 'nol', '조건에 맞는 학교가 없습니다.')); return; }
    for (const s of rows) ul.append(liFor(s, { role: 'm' }));
  }
  const byNm = (a, b) => a.nm.localeCompare(b.nm, 'ko');
  const cardsOf = (d) => d.schools.map((x) => sc.byId.get(x.id)).filter(Boolean).sort(byNm);   // 학구도 연계정보의 소속 학교 (이름순)

  // 판정 결과 L → 화면용. members: 판정된 학구와 소속 학교, cands: 경계 맞은편 후보 학구와 소속 학교
  function buildView(L, o) {
    const keys = ['elem', 'mid', 'high'].filter((k) => !o.lv || LVKEY[o.lv] === k);
    const members = [], cands = [];
    for (const k of keys) {
      for (const d of L.levels[k].inside) members.push({ k, d, schools: cardsOf(d) });
      for (const d of L.levels[k].neighbors || []) cands.push({ k, d, schools: cardsOf(d) });
    }
    const near = o.from ? nearby(o.from.lat, o.from.lng, o.lv) : [];
    return { L, lv: o.lv, basis: o.basis, basisSub: o.basisSub, from: o.from, pts: o.pts || [], members, cands, near };
  }
  function renderView(V) {
    sc.view = V; sc.flat = null;
    const ul = $('sc-ul'); ul.replaceChildren();
    const hd = (text, sub, cls) => { const li = el('li', 'sc-hd ' + (cls || '')); li.append(document.createTextNode(text)); if (sub) li.append(el('small', '', sub)); return li; };
    ul.append(hd(V.basis, V.basisSub, 'top'));
    for (const m of V.members) {
      ul.append(hd(`${LVNAME[m.k]} · ${m.d.nm}${m.d.joint ? ' (공동학구)' : ''}`, `소속 학교 ${m.schools.length}곳 · 이름순`));
      for (const s of m.schools) ul.append(liFor(s, { role: 'm', from: V.from }));
    }
    if (!V.members.length) ul.append(el('li', 'nol', '판정된 학구를 찾지 못했습니다 [확인 필요]'));
    if (V.cands.length) {
      ul.append(hd('경계 맞은편 후보 (참고)', `판정된 학구 소속이 아니며 배정 학교로 단정할 수 없습니다. ${TEL}에 확인해 주세요.`, 'top cand'));
      for (const m of V.cands) {
        ul.append(hd(`${LVNAME[m.k]} · ${m.d.nm}`, `${m.d.why === 'zone' ? `주소표(${sc.zoneDate}) 학교가 속한 구역` : `경계까지 약 ${Math.round(m.d.dist)}m`} · 소속 학교 ${m.schools.length}곳`, 'cand'));
        for (const s of m.schools) ul.append(liFor(s, { role: 'c', from: V.from }));
      }
    }
    // 보조 목록: 가까운 학교(직선거리). 접어 두고, 펼치면 지도에도 회색으로 표시한다.
    const near = $('sc-near'), nul = $('sc-near-ul'); nul.replaceChildren();
    near.hidden = !V.from;
    if (V.from) {
      nul.append(el('li', 'nol', `기준 지점에서 ${NEAR_KM}km 안 ${V.near.length}곳 · 가까운 학교가 배정 학교는 아닙니다.`));
      for (const s of V.near) nul.append(liFor(s, { role: 'n', from: V.from }));
    }
  }
  function markerItems(V) {
    const seen = new Map(), add = (s, role) => { if (!seen.has(s.id)) seen.set(s.id, { s, role }); };
    for (const m of V.members) for (const s of m.schools) add(s, 'm');
    for (const m of V.cands) for (const s of m.schools) add(s, 'c');
    if ($('sc-near').open) for (const s of V.near) add(s, 'n');
    return [...seen.values()];
  }
  async function drawZones(V) {   // 판정된 학구는 굵은 실선, 경계 맞은편 후보 학구는 가는 점선
    const my = ++sc.zseq;
    clear(sc.hl);
    try {
      for (const [list, cand] of [[V.members, false], [V.cands, true]]) {
        for (const m of list) {
          const f = (await geo(m.k)).features.find((x) => x.properties.id === m.d.id);
          if (!f || my !== sc.zseq) continue;
          sc.hl.push(...polysOf(f, cand
            ? { strokeWeight: 2, strokeColor: COLOR[m.k], strokeOpacity: 0.7, strokeStyle: 'shortdash', fillColor: COLOR[m.k], fillOpacity: 0.03 }
            : { strokeWeight: 4, strokeColor: COLOR[m.k], strokeOpacity: 1, fillColor: COLOR[m.k], fillOpacity: 0.15, zIndex: 2 }));
        }
      }
    } catch { /* 경계를 못 그려도 목록·마커는 그대로 둔다 */ }
  }
  async function redraw(V, fit, my) {
    await ensureMap();
    if (my != null && my !== sc.seq) return;
    const items = markerItems(V);
    setMarkers(items, false); setPoints(V.pts);
    if (fit) {
      const b = new kakao.maps.LatLngBounds(); let n = 0;
      for (const p of V.pts) { b.extend(new kakao.maps.LatLng(p.lat, p.lng)); n++; }
      for (const it of items) { b.extend(new kakao.maps.LatLng(it.s.lat, it.s.lng)); n++; }
      if (n) sc.map.setBounds(b);
    }
    drawZones(V);
  }
  // 학교 하나를 누르면 팝업을 연다. 학교 이름 검색에서는 그 학교가 속한 학구도 지도에 표시한다.
  async function pickSchool(s, pan, role) {
    for (const li of document.querySelectorAll('#sc-ul li[data-id], #sc-near-ul li[data-id]')) li.classList.toggle('on', li.dataset.id === s.id);
    const on = $('sc-ul').querySelector('li.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    try {
      await ensureMap();
      if (sc.view) {
        if (pan) sc.map.panTo(new kakao.maps.LatLng(s.lat, s.lng));
        openPop(s, role);
        return;
      }
      const l = LVKEY[s.lv], ids = Object.keys(sc.district).filter((d) => sc.district[d].some((x) => x.id === s.id));
      const g = await geo(l), mine = g.features.filter((f) => ids.includes(f.properties.id)).map((f) => ({ l, id: f.properties.id }));
      if (mine.length) await highlight(mine); else { clear(sc.hl); if (pan) sc.map.panTo(new kakao.maps.LatLng(s.lat, s.lng)); }
      openPop(s, role);
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
      if (Z.tempNote) box.append(el('p', 'sc-warn', Z.tempNote));
      box.append(el('p', Z.found && Z.match === false ? 'sc-warn' : 'gx-note', Z.found
        ? `수원교육지원청 통학구역 주소표(${Z.date}): ${names} — 초등 판정과 ${Z.match === false ? '다름, 기준일 차이 가능' : Z.match ? '같음' : '비교하지 못함'}. 기준일이 달라 차이가 날 수 있습니다.`
        : `수원교육지원청 통학구역 주소표(${Z.date})에서 이 주소를 찾지 못했습니다. 주소표와는 비교하지 못했습니다.`));
    }
  }

  /* ----- 단지 동별 표 (동을 누르면 그 동 기준으로 소속 학교를 보여 준다) ----- */
  function dongTable(C) {
    const t = el('table', 'gx-table'), hd = el('thead'), r0 = el('tr');
    for (const h of ['동', '초등 통학구역', '중학군', '고교구역', '상태']) r0.append(el('th', 'l', h));
    hd.append(r0); t.append(hd);
    const tb = el('tbody');
    for (const d of C.dongs) {
      const tr = el('tr'), nm = (a) => (a && a.length ? a.map((x) => x.이름).join(', ') : '[확인 필요]');
      tr.dataset.dong = d.동;
      tr.append(el('td', 'l', d.동), el('td', 'l', nm(d.초등학구)), el('td', 'l', nm(d.중학구)), el('td', 'l', nm(d.고교구역)));
      const st = el('td', 'l'); st.append(el('span', d.확인필요 ? 'sc-chk' : 'sc-ok', d.상태));
      if (d.확인필요) { st.append(el('br'), el('small', '', `${TEL}에 확인`)); st.title = (d.사유 || []).join(' / '); }
      const z = d.주소표;
      if (z && z.학교 && z.학교.length) {
        // 임시 표기 행은 같은 문구 규칙(비고)을 쓰고, 그 밖에는 일치 여부만 적는다
        st.append(el('br'), el('small', '', z.비고 ? z.비고 : `주소표(${z.기준일}) ${z.학교.join(', ')}: ${z.일치 ? '일치' : '다름, 기준일 차이 가능'}`));
      }
      // 중학군 교차검증: 수원교육지원청 2027학년도 개정(안) 표 기준 비고 (확정 아님, 상태·판정은 바꾸지 않음)
      if (d.중학군_개정안 && d.중학군_개정안.비고) st.append(el('br'), el('small', '', d.중학군_개정안.비고));
      tr.append(st);
      if (d.위도 != null) { tr.className = 'sc-pickrow'; tr.title = '누르면 이 동 기준 소속 학교를 보여 줍니다 (다시 누르면 대표점 기준)'; tr.onclick = () => selectDong(d.동); }
      tb.append(tr);
    }
    t.append(tb);
    const w = el('div', 'gx-tablewrap'); w.append(t); return w;
  }
  async function selectDong(name) {
    if (!sc.cx) return;
    sc.dongSel = sc.dongSel === name ? '' : name;
    const my = ++sc.seq;
    try { await showComplex(my); } catch (e) { $('sc-status').textContent = e.message; }
  }
  // 동을 고르지 않으면 단지 대표점(인계로 21) 기준, 고르면 그 동의 좌표 기준으로 판정·표시한다
  async function showComplex(my) {
    const C = sc.cx, d = C.dongs.find((x) => x.동 === sc.dongSel);
    const rep = C.대표점, base = d ? { lat: d.위도, lng: d.경도, dong: d.동.replace('동', ''), road: '' } : { lat: rep.위도, lng: rep.경도, dong: '', road: rep.주소 };
    const L = await get({ kind: 'locate', lat: base.lat, lng: base.lng, dong: base.dong, road: base.road });
    if (my !== sc.seq) return;
    const basis = d ? `${d.동} 기준 소속 학교` : `단지 대표점(${rep.주소.replace('경기 ', '')}) 기준 소속 학교`;
    const sub = [d ? '' : '동별로 다를 수 있습니다. 위 표에서 동을 누르면 그 동 기준으로 바뀝니다.', L.check ? `확인필요: ${L.reasons.join(' · ')}. ${TEL}에 확인해 주세요.` : ''].filter(Boolean).join(' ');
    const pts = C.dongs.filter((x) => x.위도 != null).map((x) => ({ lat: x.위도, lng: x.경도, label: x.동.replace('동', ''), sel: x.동 === sc.dongSel }));
    if (!d) pts.push({ lat: base.lat, lng: base.lng, rep: true });
    const V = buildView(L, { lv: sc.cxLv, basis, basisSub: sub, from: { lat: base.lat, lng: base.lng }, pts });
    renderView(V);
    for (const tr of document.querySelectorAll('#sc-dongs tr.sc-pickrow')) tr.classList.toggle('on', tr.dataset.dong === sc.dongSel);
    $('sc-h').textContent = `수원센트럴아이파크자이 · ${d ? d.동 : '대표점'} 기준 소속 학교${sc.cxLv ? ' · ' + $('sc-lv').selectedOptions[0].textContent : ''}`;
    $('sc-note').textContent = '진한 핀은 판정된 학구 소속 학교, 연한 점선 핀은 경계 맞은편 후보, 숫자 핀은 같은 부지의 학교 여러 곳, 흰 네모는 단지 동입니다. 학구 기준 소속 학교이며 실제 배정은 교육지원청 확인이 필요합니다. 가까운 학교(직선거리)는 목록 아래 접힌 보조 목록에 있습니다.';
    await redraw(V, true, my);
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
      const isComplex = /아이파크자이|센트럴아이파크/.test(norm(q));
      const byName = q ? byFilter.filter((s) => norm(s.nm).includes(norm(q))) : byFilter;

      $('sc-judge').replaceChildren(); $('sc-dongs').replaceChildren(); $('sc-note').textContent = '';
      $('sc-res').hidden = false; sc.cx = null; sc.dongSel = '';
      clear(sc.pt);

      if (isComplex) {
        const complex = await get({ kind: 'complex' }).catch((e) => ({ error: e.message }));
        if (my !== sc.seq) return;
        $('sc-h').textContent = `수원센트럴아이파크자이 동별 학구${cond ? ' · ' + cond : ''}`;
        const box = $('sc-dongs');
        if (complex.dongs) {
          sc.cx = complex; sc.cxLv = lv;
          const elemSet = [...new Set(complex.dongs.map((d) => (d.초등학구 || []).map((x) => x.이름).join('/')).filter(Boolean))];
          box.append(el('b', '', '동별 초등 통학구역 · 중학군 · 고교구역'));
          if (elemSet.length > 1) box.append(el('p', 'sc-warn', `동에 따라 초등 통학구역이 다릅니다 (${elemSet.join(' · ')}). 아래 표에서 해당 동을 확인해 주세요.`));
          box.append(dongTable(complex));
          const n = complex.dongs.filter((d) => d.확인필요).length;
          box.append(el('p', n ? 'sc-warn' : 'gx-note', n ? `${n}개 동은 경계에 가깝거나 좌표를 확인하지 못해 “확인필요”로 표시했습니다. ${TEL}에 확인해 주세요.` : `모든 동이 경계에서 ${complex.기준.확인필요_경계거리_m}m 넘게 떨어져 있습니다.`), el('p', 'gx-note', `학구도 기준일 ${complex.기준.학구도}. 동 위치는 카카오 지도 검색 결과이며 실제 건물 위치와 다를 수 있습니다. 참고용 안내이며 실제 배정은 ${TEL}에서 확인해 주세요.`));
          await showComplex(my);
        } else {
          box.append(el('p', 'sc-warn', `단지 동별 판정 자료를 불러오지 못했습니다 [확인 필요]. ${complex.error || ''}`));
          renderFlat([]);
        }
      } else if (byName.length || !q) {
        $('sc-h').textContent = `${guLabel}${cond ? ' · ' + cond : ''} — 학교 ${byName.length.toLocaleString()}곳`;
        renderFlat(byName);
        $('sc-note').textContent = byName.length ? `${q ? '' : '학교를 누르면 그 학교가 속한 학구가 지도에 표시됩니다. '}지도의 동그란 핀은 학교(파랑 초등·초록 중·빨강 고등), 숫자 핀은 같은 부지의 학교 여러 곳입니다.` : '';
        await ensureMap(); if (my !== sc.seq) return;
        clear(sc.hl); setMarkers(byName.map((s) => ({ s, role: 'm' })), true);
      } else {
        // 학교 이름이 아니면 단지명·주소로 보고 좌표를 구한다
        await loadKakao();
        const p = await geocode(q);
        if (my !== sc.seq) return;
        if (!p) {
          $('sc-h').textContent = `${guLabel} · “${q}” — 찾지 못했습니다`;
          $('sc-note').textContent = '학교 이름이나 수원시 안의 단지명·주소로 찾아 보세요. 주소는 도로명(예: 인계로 21)이나 지번(예: 인계동 257-2)을 쓸 수 있습니다.';
          renderFlat([]); clear(sc.markers);
        } else {
          const L = await get({ kind: 'locate', lat: p.lat, lng: p.lng, jibun: p.jibun || '', road: p.road || '' });
          if (my !== sc.seq) return;
          $('sc-h').textContent = `“${q}” 기준 소속 학교${lv ? ' · ' + $('sc-lv').selectedOptions[0].textContent : ''}`;
          renderJudge(L, `${p.label} 기준`);
          const sub = L.check ? `확인필요: ${L.reasons.join(' · ')}. ${TEL}에 확인해 주세요.` : '';
          const V = buildView(L, { lv, basis: `${p.label} 기준 소속 학교`, basisSub: sub, from: { lat: p.lat, lng: p.lng }, pts: [{ lat: p.lat, lng: p.lng }] });
          renderView(V);
          $('sc-note').textContent = '진한 핀은 판정된 학구 소속 학교, 연한 점선 핀은 경계 맞은편 후보, 숫자 핀은 같은 부지의 학교 여러 곳입니다. 가까운 학교(직선거리)는 목록 아래 접힌 보조 목록에 있으며 가까운 학교가 배정 학교는 아닙니다.';
          status.textContent = '';
          await redraw(V, true, my);
        }
      }
      status.textContent = '';
    } catch (e) {
      if (my === sc.seq) status.textContent = e.message;
    }
    if (my === sc.seq) go.disabled = false;
  }
  $('sc-near').addEventListener('toggle', () => { if (sc.view) redraw(sc.view, false, null).catch(() => {}); });

  for (const cb of document.querySelectorAll('#sc-layers input')) {
    cb.onchange = async () => { try { await toggleLayer(cb.dataset.l, cb.checked); } catch (e) { cb.checked = false; $('sc-status').textContent = '학구 경계를 불러오지 못했습니다: ' + e.message; } };
  }
  $('sc-go').onclick = search;
  $('sc-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  if (!$('tab-school').hidden) window.onSchoolTab(true);
})();
