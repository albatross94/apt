// 분석리포트 양식(A4 2~3쪽)을 HTML 문자열로 만든다. 데이터 D는 index.html의 buildReportData()가 앱 상태에서 만든다.
// 양식과 렌더링 코드는 '국토교통부_실거래가_기반_분석리포트_생성기'에서 가져왔고, PDF를 읽는 부분은 쓰지 않는다.
(function () {
var CFG = { name: '한산부동산', sub: '수원센트럴아이파크자이', tel: '031-234-1234', rep: '', addr: '', reg: '' };   // 머리 문구(설정으로 바꿈)
var repLine = function () { return CFG.rep ? '대표 공인중개사 ' + CFG.rep : ''; };
var co = function () { return [CFG.name, CFG.sub, repLine(), CFG.tel].filter(Boolean).join(' · '); };
var offLine = function () { return [CFG.addr, CFG.reg ? '등록번호 ' + CFG.reg : ''].filter(Boolean).join(' · '); };
var subLine = function () { return [CFG.sub, repLine()].filter(Boolean).join(' · '); };
var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var RS=window.ReportStats;   // 금액 표기·층별 문장·범위는 API(kind=report)와 같은 report-stats.js를 쓴다
function fmt(v){return RS.won(v)}
function h2(t){return '<div style="display:flex;align-items:center;gap:8px"><span style="width:8px;height:20px;background:#8e1b1c;display:block"></span><h2 style="margin:0;font-size:20px;line-height:28px;font-weight:700">'+esc(t)+'</h2></div>'}
function lab(l,v){return '<div style="display:flex;flex-direction:column"><span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+esc(l)+'</span><span style="font-size:16px;line-height:26px;font-weight:700;word-break:keep-all">'+esc(v)+'</span></div>'}
// 2·3쪽 머리글은 항상 한 줄. 단지명(.rn-name)만 줄어든다: CSS로 한 줄 고정 + 넘치면 끝을 '…'로 줄이고(text-overflow),
// Report.fit()이 폰트가 로드된 뒤 실제 폭을 재서 글자 크기를 16→12px로 단계적으로 줄인다. 전용면적·'실거래가 분석리포트'·쪽 번호는 줄지 않는다.
function slim(D,n,N){return '<div style="background:#8e1b1c;color:#fff;padding:12px 40px;display:flex;align-items:center;justify-content:space-between;gap:16px"><div style="display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0"><svg width="24" height="24" viewBox="0 0 30 30" fill="none" aria-hidden="true" style="flex:none"><path d="M4 26V13L15 4L26 13V26Z" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="miter"/></svg><span style="display:flex;min-width:0;font-size:16px;line-height:26px;font-weight:800;white-space:nowrap"><span class="rn-name" style="flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(D.complex)+'</span><span style="flex:none;white-space:pre"> · 전용 '+esc(D.sel.a)+'㎡ 실거래가 분석리포트</span></span></div><span style="flex:none;white-space:nowrap;font-size:13px;line-height:20px;font-weight:700">'+n+' / '+N+'</span></div>'}
// root 안의 머리글 단지명을 한 줄에 맞춘다(16px부터 12px까지 1px씩 줄이고, 그래도 길면 CSS가 '…'로 줄인다). 폰트가 로드된 뒤에 불러야 폭이 정확하다.
function fit(root){
  var els=(root||document).querySelectorAll('.rn-name');
  for(var k=0;k<els.length;k++){var el=els[k];
    for(var sz=16;sz>=12;sz--){el.style.fontSize=sz+'px';if(el.scrollWidth<=el.clientWidth+0.5)break}}
}
function foot(n,N){return '<div style="margin:0 40px;padding:10px 0 16px 0;border-top:1px solid #423f3d;display:flex;justify-content:space-between;font-size:13px;line-height:20px;font-weight:500;color:#423f3d"><span style="display:flex;flex-direction:column"><span>'+esc(co())+'</span>'+(offLine()?'<span style="font-size:8px;line-height:12px">'+esc(offLine())+'</span>':'')+'</span><span>'+n+' / '+N+'</span></div>'}
var BODY='padding:16px 40px 0 40px;display:flex;flex-direction:column;gap:16px;flex:1 1 auto';
var ORD=['','가장','두 번째로','세 번째로','네 번째로','다섯 번째로','여섯 번째로','일곱 번째로','여덟 번째로','아홉 번째로'];
var FL=[['L','저층'],['M','중층'],['H','고층']];

function floorParts(D){
  return RS.floorMedParts(D.floors,function(f){return D.type==='월세'?(f.rent!=null?f.rent:null):f.med},fmt);
}
// 층별 월세 범위(월세 탭 1쪽): 2쪽 범례와 같은 값. 1건이면 값 하나, 0건이면 '거래 없음'
function floorRentParts(D){
  return RS.floorMedParts(D.floors,function(f){return f},function(f){return rngTxt(f.rLo,f.rHi)});
}
// 최저~최고 표기: 8억 7,000만~11억 9,000만원 (앞 값의 끝 '원'을 떼어 붙인다)
function rngTxt(lo,hi){return RS.rngTxt(lo,hi)}
// 층별 거래가격 구간(매매). 직거래·해제는 이미 자료에서 빠져 있다. 3건 미만이면 '표본 적음', 0건이면 '거래 없음'
function floorRangeParts(D){
  return FL.map(function(z){var f=D.floors[z[0]];
    if(!(f.n>0))return z[1]+' 거래 없음';
    if(f.n<3||f.lo==null)return z[1]+' 표본 적음('+f.n+'건)';
    return z[1]+' '+rngTxt(f.lo,f.hi)+'('+f.n+'건)'});
}
function readLines(D){
  var as=D.areas.slice().sort(function(a,b){return b.n-a.n});
  var more=as.filter(function(z){return z.n>D.sel.n});
  var rank=more.length+1;
  var tops=more.slice(0,3).map(function(z){return z.a+'㎡('+z.n+'건)'});
  var nb=D.areas.filter(function(z){return z.a!==D.sel.a&&Math.floor(+z.a)===Math.floor(+D.sel.a)})[0];
  var l1;
  if(rank===1){var nx=as.filter(function(z){return z.a!==D.sel.a}).slice(0,2).map(function(z){return z.a+'㎡('+z.n+'건)'});
    l1='<b>가장 거래가 많습니다.</b> 다음은 '+nx.join('·')+'입니다.'}
  else{l1='<b>'+ORD[Math.min(rank,9)]+' 거래가 많습니다.</b> '+tops.join('·')+' 다음'+(nb?'이고, 같은 '+Math.floor(+D.sel.a)+'㎡대 '+nb.a+'㎡는 '+nb.n+'건입니다.':'입니다.')}
  var k=D.kpi,l2,l3;
  if(D.type==='매매'){
    // 매매: 최근 가격 문장(l2)은 두지 않는다. 층별 문장은 층별 거래가격 구간(최저~최고)으로 보여 준다
    l3='<b>층별 거래가격 구간</b> '+floorRangeParts(D).join(' · ')+'.';
  }else if(D.type==='전세'){
    var rm=/^([\d.]+)%\s*(.*)$/.exec(k.ratioRaw||'');
    l2=rm?'<b>전세가율은 '+rm[1]+'%입니다.</b> 매매 중간값 대비 전세 중간값의 비율입니다('+rm[2]+'). 대출 등 권리관계는 반영되지 않았습니다.':null;   // 같은 기간 매매 거래가 없어 계산할 수 없으면 이 줄을 뺀다
    var big=k.newN>=k.renewN*2;
    l3='<b>'+(big?'신규 계약이 대부분입니다.':'신규와 갱신이 비슷합니다.')+'</b> 신규 '+k.newN+'건 · 갱신 '+k.renewN+'건'+(k.renewMed==null?'(표본 부족)':'')+'. 층별 중간값은 '+floorParts(D).join(' · ')+'.';
  }else{
    // 보증금 구간 중 월세 중간값이 있는 구간(3건 이상)끼리 비교하고, 표본이 모자라거나 거래가 없는 구간은 끝에 따로 알린다
    var tt=D.tiers||[],ok=tt.filter(function(x){return x.ok}),bad=tt.filter(function(x){return !x.ok});
    var cl=function(x){return x.lab.replace(/\s*\(.*\)\s*$/,'').replace(/ ~ /g,'~')};
    var nm=function(x){return x.lab.indexOf('보증금')===0?cl(x):'보증금 '+cl(x)};
    var badTxt=bad.map(function(x){return ' '+nm(x)+' 구간은 '+(x.n==='0건'?'거래가 없습니다.':'표본 부족입니다.')}).join('');
    l2=(ok.length>1?'<b>월세는 보증금에 따라 크게 달라집니다.</b> '+nm(ok[0])+' 월세 '+ok[0].rngS+', '+cl(ok[ok.length-1])+' '+ok[ok.length-1].rngS+'입니다.':'<b>월세는 보증금과 함께 봐야 합니다.</b> 보증금이 비슷한 거래끼리 비교해 주세요.')+badTxt;
    l3='<b>신규 '+k.newN+'건 · 갱신 '+k.renewN+'건입니다.</b> 층별 월세 범위는 '+floorRentParts(D).join(' · ')+'.';
  }
  return [l1,l2,l3].filter(Boolean);
}

/* 핵심 요약: 가로 3칸(같은 크기). 거래 건수 / 가장 낮은 값 / 가장 높은 값.
   최저·최고는 화면 '그래프에 쓴 거래 목록'과 같은 거래(매매는 직거래·해제가 이미 빠져 있음, 월세는 월세 금액 기준)이고 D.kpi.lo/hi에 담겨 온다.
   큰 금액이 칸을 넘치지 않도록 세 칸의 글자 크기는 가장 긴 값에 맞춰 같게 줄인다. */
function summary(D){
  var k=D.kpi,T=D.type,W=T==='월세',P=T==='매매'?'거래':W?'월세':'보증금';
  var ext=function(x){return x?fmt(x.v):'—'};
  var when=function(x){if(!x)return '거래 없음';
    return '계약일 '+x.date+(x.more>0?' 외 '+x.more+'건':'')+(W&&x.dep!=null?' · 보증금 '+fmt(x.dep):'')};
  var cnt=T==='매매'?'직거래·해제 제외':D.period.replace(/ /g,'');
  var vals=[ext(k.lo),ext(k.hi)],len=Math.max(vals[0].length,vals[1].length),sz=len<=7?32:len<=10?28:len<=12?25:22;
  var cell=function(l,v,s,sub){return '<div style="background:#fff;padding:14px 16px;display:flex;flex-direction:column;min-width:0"><span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+esc(l)+'</span><span style="font-size:'+s+'px;line-height:44px;font-weight:800;white-space:nowrap">'+esc(v)+'</span><span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+esc(sub)+'</span></div>'};
  var cells=[cell('거래 건수',k.n+'건',sz,cnt),cell('가장 낮은 '+(T==='매매'?'거래':P),vals[0],sz,when(k.lo)),cell('가장 높은 '+(T==='매매'?'거래':P),vals[1],sz,when(k.hi))];
  return '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:16px;align-items:stretch">'+cells.join('')+'</div>';
}

// 단지 개요 한 줄(총 세대수·동 수·주차대수). 단지 상세 자료를 못 불러왔으면 넣지 않는다
function parkLine(D){
  var k=D.park;if(!k)return '';
  var n=function(v){return (+v).toLocaleString('en-US')},tot=k.ground+k.under,parts=[];
  if(k.hh)parts.push('총 '+n(k.hh)+'세대');
  if(k.dongs)parts.push(k.dongs+'개 동');
  if(tot){var d=[];if(k.ground)d.push('지상 '+n(k.ground));if(k.under)d.push('지하 '+n(k.under));
    parts.push('주차 '+n(tot)+'대('+d.join('·')+(k.hh?', 세대당 '+(tot/k.hh).toFixed(2)+'대':'')+')')}
  return parts.length?'<span style="font-size:14px;line-height:20px;font-weight:700">'+esc(parts.join(' · '))+'</span>':'';
}

function page1(D,N){
  var meta=D.cust?[['고객',D.cust.name],['연락처',D.cust.phone],['저장일시',D.saved],['조회 기간',D.period]]:[['저장일시',D.saved],['조회 기간',D.period],['가장 최근 계약일',D.latest||'—'],['기준',D.type==='매매'?'계약일(직거래·해제 제외)':'계약일 기준']];
  var maxN=Math.max.apply(null,D.areas.map(function(z){return z.n}))||1;
  var r2=function(v){return Math.round(+v*100)/100},hhBy={},hasHh=D.park&&D.park.areas&&D.park.areas.length;
  if(hasHh)D.park.areas.forEach(function(p){hhBy[r2(p[0])]=p[1]});
  var COLS=hasHh?'158px 72px 72px 56px minmax(0,1fr)':'158px 72px 56px minmax(0,1fr)';
  var rows=D.areas.map(function(z,i){var sel=z.a===D.sel.a,last=i===D.areas.length-1,w=Math.max(z.n/maxN*100,0);
    return '<div style="display:grid;grid-template-columns:'+COLS+';column-gap:12px;align-items:center;padding:1px 0;'+(last?'':'border-bottom:1px solid #cbc8c1;')+(sel?'background:#e6d9ce;font-weight:800;':'')+'font-size:14px;line-height:22px"><span>'+esc(z.a)+'㎡'+(sel?' ◀ 이 리포트':'')+'</span><span>약 '+z.py+'평</span>'+(hasHh?'<span style="text-align:right">'+(hhBy[r2(z.a)]!=null?hhBy[r2(z.a)].toLocaleString('en-US')+'세대':'—')+'</span>':'')+'<span style="text-align:right">'+z.n+'건</span><span style="display:block;height:10px">'+(z.n?'<span style="display:block;height:10px;width:'+w.toFixed(1)+'%;'+(sel?'background:#8e1b1c':'background:#423f3d;opacity:0.6')+'"></span>':'')+'</span></div>'}).join('');
  var rl=readLines(D).map(function(t){return '<div style="font-size:14px;line-height:22px">'+t+'</div>'}).join('');
  return '<div class="pg">'+
  '<div style="background:#8e1b1c;color:#fff;padding:16px 40px;display:flex;flex-direction:column;gap:14px"><div style="display:flex;align-items:center;justify-content:space-between;gap:16px"><div style="display:flex;align-items:center;gap:8px"><svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M4 26V13L15 4L26 13V26Z" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="miter"/></svg><div style="display:flex;flex-direction:column"><span style="font-size:20px;line-height:24px;font-weight:900">'+esc(CFG.name)+'</span><span style="font-size:13px;line-height:18px;font-weight:500">'+esc(subLine())+'</span></div></div>'+(CFG.tel?'<div style="border:2px solid #fff;border-radius:999px;padding:4px 20px;font-size:20px;line-height:28px;font-weight:800">T. '+esc(CFG.tel)+'</div>':'')+'</div>'+
  '<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:13px;line-height:20px;font-weight:700">국토교통부 실거래가 공개자료 기반 분석 리포트</span><h1 style="margin:0;font-size:48px;line-height:54px;font-weight:900">'+esc(D.complex)+'</h1><span style="font-size:16px;line-height:26px;font-weight:400">'+esc(D.addr)+(D.built?' · '+esc(D.built)+'년 준공':'')+' · 전용 '+esc(D.sel.a)+'㎡ (약 '+D.sel.py+'평)</span>'+parkLine(D)+'</div></div>'+
  '<div style="'+BODY+'">'+
  '<div style="background:#fff;padding:12px 16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:16px">'+meta.map(function(z){return lab(z[0],z[1])}).join('')+'</div>'+
  '<div style="display:flex;flex-direction:column;gap:8px">'+h2('핵심 요약 · 전용 '+D.sel.a+'㎡ '+D.type)+summary(D)+'</div>'+
  '<div style="display:flex;flex-direction:column;gap:8px">'+h2('읽는 법')+'<div style="background:#fff;padding:12px 16px;display:flex;flex-direction:column;gap:4px">'+rl+'</div></div>'+
  '<div style="display:flex;flex-direction:column;gap:8px">'+h2('면적별 '+D.type+' 거래 건수')+'<div style="background:#fff;padding:8px 16px 12px 16px;display:flex;flex-direction:column"><div style="display:grid;grid-template-columns:'+COLS+';column-gap:12px;padding:4px 0;border-bottom:2px solid #202227;font-size:13px;line-height:20px;font-weight:700"><span>전용면적</span><span>평형</span>'+(hasHh?'<span style="text-align:right">세대수</span>':'')+'<span style="text-align:right">건수</span><span>거래 건수 비교 ('+maxN+'건 = 100%)</span></div>'+rows+(!hasHh&&D.park&&D.park.areasErr?'<div style="padding-top:6px;font-size:12px;line-height:18px;color:#8e1b1c">※ 전용면적별 세대수를 표시하지 못했습니다: '+esc(D.park.areasErr)+'</div>':'')+'</div></div>'+
  '</div>'+foot(1,N)+'</div>';
}

function evidence(D){
  var proc=D.proc||'원본 거래 건을 그대로 사용했고, 매매는 해제된 거래와 직거래를 통계에서 뺐습니다. 전월세 자료에는 해제·직거래 구분이 없습니다. 전세는 월세가 없는 계약, 월세는 월세가 있는 계약입니다.';
  var row=function(a,b){return '<span style="font-weight:700;color:#423f3d">'+a+'</span><span>'+esc(b)+'</span>'};
  return '<div style="background:#fff;padding:12px 24px 16px 24px;display:flex;flex-direction:column;gap:8px">'+h2('이 자료를 믿고 보실 수 있는 근거')+
  '<div style="display:grid;grid-template-columns:76px minmax(0,1fr);column-gap:12px;row-gap:2px;font-size:13px;line-height:20px">'+row('출처',D.src)+row('조회 조건',D.cond)+row('자료 기준',D.basis)+row('가공 방법',proc)+'</div>'+
  '<div style="border-top:1px solid #cbc8c1;padding-top:8px;display:flex;flex-direction:column;gap:2px;font-size:13px;line-height:20px"><span>· 평균이 아니라 중간값을 썼습니다. 한두 건의 특이한 거래에 숫자가 끌려가지 않게 하기 위해서입니다.</span><span>· 계약 후 30일 이내에 신고하는 제도라서, 최근 계약일의 거래는 아직 올라오지 않았을 수 있습니다.</span><span>· 같은 면적이라도 동, 층, 향, 수리 상태에 따라 가격이 다릅니다.</span><span>· 이 정보는 법적 효력이 없는 참고용이며, 본 자료는 제공(저장)일 기준 자체 집계로, 공식 통계와 다를 수 있습니다.</span></div></div>';
}

var RC=window.ReportCharts,mark=RC.mark,svgT=RC.svgT,svgBox=RC.svgBox,SV=RC.SV;   // 그래프 그리기는 그래프 이미지(lib/report-image.js)와 같은 report-charts.js를 쓴다
function chart(D){return RC.scatterSvg(D)}
/* 층별 거래가격 구간(매매 2쪽): 층마다 최저~최고 가로 막대와 건수. 막대 그리기는 report-charts.js */
function floorBars(D){
  var p=RC.floorBarsParts(D);
  return '<div style="background:#fff;padding:12px 24px 12px 24px;display:flex;flex-direction:column;gap:6px">'+h2('층별 거래가격 구간')+
    '<span style="font-size:12px;line-height:18px;font-weight:500;color:#423f3d">'+p.hint+'</span>'+p.svg+'</div>';
}
/* 월별 중간값과 증감률(매매·전세 2쪽): 위 = 월별 중간값 꺾은선+점, 아래 = 전월 대비 증감률 막대. 그리기·계산은 report-charts.js */
function monthBars(D,c0,cols){
  var p=RC.monthBarsParts(D,c0,cols);
  var title=function(extra){return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'+h2('월별 중간값과 증감률')+'<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+p.sub+(extra||'')+'</span></div>'};
  if(p.empty)return '<div style="background:#fff;padding:12px 24px;display:flex;flex-direction:column;gap:8px">'+title()+'<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+p.msg+'</span></div>';
  return '<div style="background:#fff;padding:12px 24px 12px 24px;display:flex;flex-direction:column;gap:8px">'+title(' <span style="font-size:11px">· '+p.axisNote+'</span>')+p.svg+
    '<span style="font-size:12px;line-height:18px;font-weight:500;color:#423f3d">'+p.hint+'</span></div>';
}

function page2(D,N,evi){
  var T=D.type,k=D.kpi;
  var legs=RC.legendItems(D).map(function(it){return '<div style="display:flex;align-items:center;gap:8px">'+SV[it.key]+'<span><b>'+it.name+'</b>'+it.rest+'</span></div>'}).join('');
  var kc=RC.kindCounts(D);
  var kind=!kc?'':'<div style="display:flex;gap:16px;font-size:13px;line-height:20px"><span style="display:flex;align-items:center;gap:6px">'+SV.F+'<b>신규</b> '+kc.nw+'건</span><span style="display:flex;align-items:center;gap:6px">'+SV.R+'<b>갱신(속이 빈 점)</b> '+kc.rn+'건</span></div>';
  var sub=RC.scatterSub(D);
  var cap=T==='월세'?'':'<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+esc(RC.scatterCap(D))+'</span>';
  var warn=T==='월세'?'<div style="background:#e6d9ce;padding:8px 12px;font-size:13px;line-height:20px;font-weight:700">'+esc(D.warn)+'</div>':'';
  var lower;
  if(T==='월세'){
    var tr=(D.tiers||[]).map(function(t,i,a){return '<div style="display:grid;grid-template-columns:minmax(0,1fr) 56px 170px;column-gap:12px;padding:4px 0;border-bottom:1px solid '+(i===a.length-1?'#202227':'#cbc8c1')+';font-size:14px;line-height:22px"><span>'+esc(t.lab)+'</span><span style="text-align:right">'+esc(t.n)+'</span><span style="text-align:right">'+esc(t.rngS)+'</span></div>'}).join('');
    lower='<div style="background:#fff;padding:12px 24px 16px 24px;display:flex;flex-direction:column;gap:8px">'+h2('보증금 구간별 월세')+'<div style="display:flex;flex-direction:column"><div style="display:grid;grid-template-columns:minmax(0,1fr) 56px 170px;column-gap:12px;padding:4px 0;border-top:2px solid #202227;border-bottom:1px solid #202227;font-size:13px;line-height:20px;font-weight:700"><span>보증금 구간</span><span style="text-align:right">건수</span><span style="text-align:right">월세 범위</span></div>'+tr+'</div></div>';
  }else{
    // 매매·전세: 월별 중간값 표와 전월 대비 줄 대신 월별 증감률 막대그래프(최근 12개월)
    var cols=D.months.length-1,c0=Math.max(0,cols-12);
    lower=monthBars(D,c0,cols);
  }
  return '<div class="pg">'+slim(D,2,N)+'<div style="'+BODY+'">'+
  '<div style="background:#fff;padding:16px 24px;display:flex;flex-direction:column;gap:8px">'+h2(T+' 그래프')+
  '<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+esc(sub)+'</span>'+warn+kind+
  '<div style="display:grid;grid-template-columns:repeat('+(T==='월세'?1:2)+',minmax(0,1fr));column-gap:16px;row-gap:4px;font-size:13px;line-height:20px">'+legs+'</div>'+chart(D)+cap+'</div>'+
  (T==='매매'?floorBars(D):'')+lower+(evi?evidence(D):'')+'</div>'+foot(2,N)+'</div>';
}

function refCard(D){
  var r=D.ref,kv=function(a,b){return '<span style="font-weight:700;color:#423f3d">'+a+'</span><span>'+esc(b)+'</span>'};
  // 실거래 범위: 저층·중층·고층 세 줄로 나눠 최저~최고(n건). 층 구간은 2쪽 층별 막대와 같다. 0건은 '거래 없음', 1~2건은 그대로 두고 '표본 적음'.
  // 월세는 지금 범위가 나타내는 값(보증금)을 그대로 층별로 나눈다.
  var rangeRows=r.floors?kv('실거래 범위'+(D.type==='월세'?'(보증금)':''),'층 구간별 최저~최고(건수)')+FL.map(function(z){var f=r.floors[z[0]];
    var v=!(f.n>0)?'거래 없음':rngTxt(f.lo,f.hi)+' ('+f.n+'건'+(f.n<3?' · 표본 적음':'')+')';
    return kv('　'+z[1]+' '+(f.rng||''),v)}).join(''):kv('실거래 범위',r.range);
  var rows=kv('비교 기준',r.basis)+(D.type==='월세'?kv('보증금 중간값',r.med)+kv('월세 중간값',r.rent||'—'):'')+rangeRows;   // 매매·전세는 실거래 중간값 줄을 두지 않는다(호가 비교 카드의 실거래 중간값은 그대로)
  return '<div style="background:#fff;padding:16px 24px;display:flex;flex-direction:column;gap:8px">'+h2('최근 6개월 실거래 기준 · '+D.type)+
  '<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">호가를 입력하지 않아 호가 비교는 넣지 않았습니다. 호가를 입력한 뒤 저장하면 이 쪽에 차액과 비율, 유사 거래 비교가 들어갑니다.</span>'+
  '<div style="display:grid;grid-template-columns:150px minmax(0,1fr);column-gap:12px;row-gap:4px;font-size:14px;line-height:22px">'+rows+'</div></div>';
}

/* 호가 비교 (매매·전세·월세). h.head/h.rows: 유사 거래 표(문자열), h.rentLine: 월세 호가와 실거래 월세 중간값의 차이(월세만) */
function page3(D,N){
  if(!D.hoga)return '<div class="pg">'+slim(D,3,N)+'<div style="'+BODY+'">'+(D.ref?refCard(D):'')+evidence(D)+'</div>'+foot(3,N)+'</div>';
  var h=D.hoga,T=D.type,PN=T==='매매'?'거래가':'보증금',nc=h.head.length;
  var g='grid-template-columns:110px repeat('+(nc-1)+',minmax(0,1fr))';
  var cell=function(t,i){return '<span'+(i?' style="text-align:right"':'')+'>'+esc(t)+'</span>'};
  var rows=h.rows.map(function(r,i){return '<div style="display:grid;'+g+';column-gap:12px;padding:3px 0;border-bottom:1px solid '+(i===h.rows.length-1?'#202227':'#cbc8c1')+';font-size:14px;line-height:22px">'+r.map(cell).join('')+'</div>'}).join('');
  var kv=function(a,b,bold){return '<span style="font-weight:700;color:#423f3d">'+a+'</span><span'+(bold?' style="font-weight:700"':'')+'>'+esc(b)+'</span>'};
  var big=(h.dsign+h.dval).length>9?28:32;
  var info=kv('입력한 호가',h.input,1)+(h.rentLine?kv('월세 호가 − 실거래 월세 중간값',h.rentLine):'')+kv('호가 출처·기준일',h.srcdate)+kv('비교 기준',h.basis)+kv('실거래 중간값',h.medMoney,1)+(h.rentMed?kv('실거래 월세 중간값',h.rentMed):'')+kv('실거래 범위',h.range)+kv('호가의 위치',h.pos);
  return '<div class="pg">'+slim(D,3,N)+'<div style="'+BODY+'">'+
  '<div style="background:#fff;padding:16px 24px;display:flex;flex-direction:column;gap:8px">'+h2('현재 호가와 실거래 비교 · '+T)+
  '<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">매물 호가는 실제 계약가격이 아닙니다. 입력한 호가를 같은 단지·전용면적의 최근 실거래와 비교했습니다. 호가 자료는 수집하지 않으며, 입력한 값은 이 화면에서만 쓰였습니다.</span>'+
  '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px"><div style="background:#dfc10e;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:8px"><div style="display:flex;flex-direction:column"><span style="font-size:13px;line-height:20px;font-weight:700">호가 − 실거래 중간값'+(T==='월세'?' (보증금)':'')+'</span><span style="font-size:'+big+'px;line-height:40px;font-weight:900">'+esc(h.dsign+h.dval)+'</span><span style="font-size:13px;line-height:20px;font-weight:500">'+esc(h.pct)+'</span></div><span style="font-size:13px;line-height:20px;font-weight:700">입력한 '+(T==='월세'?'보증금 ':'')+'호가('+esc(h.inMoney)+')가 실거래 중간값('+esc(h.medMoney)+')보다 '+(h.below?'낮음':'높음')+'</span></div>'+
  '<div style="display:grid;grid-template-columns:92px minmax(0,1fr);column-gap:12px;row-gap:4px;font-size:13px;line-height:20px;align-content:start">'+info+'</div></div>'+
  '<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d;margin-top:4px">유사 거래 '+h.rows.length+'건 ('+(h.hasFloor?'입력한 층과 가까운 순, 같은 층이면 최근순':'최근순')+') · 층·거래 시점이 다르면 가격이 달라질 수 있습니다.</span>'+
  '<div style="display:flex;flex-direction:column"><div style="display:grid;'+g+';column-gap:12px;padding:4px 0;border-top:2px solid #202227;border-bottom:1px solid #202227;font-size:13px;line-height:20px;font-weight:700">'+h.head.map(cell).join('')+'</div>'+rows+'</div>'+
  '<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">호가는 매도·임대인이 부르는 가격이고 실거래가는 실제 체결 가격입니다. 둘의 차이가 곧 적정가격이나 협상 가능 금액을 뜻하지는 않습니다.</span></div>'+
  evidence(D)+'</div>'+foot(3,N)+'</div>';
}

function needP3(D){return !!(D.hoga||D.ref||D.type==='월세')}
function build(D){var N=needP3(D)?3:2;var p=[page1(D,N),page2(D,N,N===2)];if(N===3)p.push(page3(D,N));return p}
window.Report = {
  build: build,
  fit: fit,
  setConfig: function (c) { ['name', 'sub', 'tel', 'rep', 'addr', 'reg'].forEach(function (k) { if (c && typeof c[k] === 'string') CFG[k] = c[k].trim(); }); },
  getConfig: function () { return { name: CFG.name, sub: CFG.sub, tel: CFG.tel, rep: CFG.rep, addr: CFG.addr, reg: CFG.reg }; },
};
})();
