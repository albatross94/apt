// 분석리포트 양식(A4 2~3쪽)을 HTML 문자열로 만든다. 데이터 D는 index.html의 buildReportData()가 앱 상태에서 만든다.
// 양식과 렌더링 코드는 '국토교통부_실거래가_기반_분석리포트_생성기'에서 가져왔고, PDF를 읽는 부분은 쓰지 않는다.
(function () {
var CFG = { name: '한산부동산', sub: '수원센트럴아이파크자이', tel: '031-234-1234', rep: '', addr: '', reg: '' };   // 머리 문구(설정으로 바꿈)
var repLine = function () { return CFG.rep ? '대표 공인중개사 ' + CFG.rep : ''; };
var co = function () { return [CFG.name, CFG.sub, repLine(), CFG.tel].filter(Boolean).join(' · '); };
var offLine = function () { return [CFG.addr, CFG.reg ? '등록번호 ' + CFG.reg : ''].filter(Boolean).join(' · '); };
var subLine = function () { return [CFG.sub, repLine()].filter(Boolean).join(' · '); };
var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
function fmt(v){var sign=v<0?'−':'';v=Math.abs(Math.round(v));var e=Math.floor(v/10000),m=v%10000;
  if(e&&m)return sign+e+'억 '+m.toLocaleString('en-US')+'만원';
  if(e)return sign+e+'억원';
  return sign+m.toLocaleString('en-US')+'만원'}
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
  return FL.map(function(z){var f=D.floors[z[0]];
    if(!(f.n>0))return z[1]+'은 거래 없음';
    var v=D.type==='월세'?(f.rent!=null?fmt(f.rent):null):(f.med!=null?fmt(f.med):null);
    return v?z[1]+' '+v+'('+f.n+'건'+(f.n<10?'·표본 적음':'')+')':z[1]+' '+f.n+'건'});
}
// 층별 월세 범위(월세 탭 1쪽): 2쪽 범례와 같은 값. 1건이면 값 하나, 0건이면 '거래 없음'
function floorRentParts(D){
  return FL.map(function(z){var f=D.floors[z[0]];
    if(!(f.n>0))return z[1]+'은 거래 없음';
    return z[1]+' '+rngTxt(f.rLo,f.rHi)+'('+f.n+'건'+(f.n<10?'·표본 적음':'')+')'});
}
// 최저~최고 표기: 8억 7,000만~11억 9,000만원 (앞 값의 끝 '원'을 떼어 붙인다)
function rngTxt(lo,hi){var a=fmt(lo);return lo===hi?a:a.replace(/원$/,'')+'~'+fmt(hi)}
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

/* 점 모양: 저층=회색 원, 중층=빨강 사각, 고층=노랑 삼각. 속이 빈 점은 갱신 계약 */
function mark(k,r,x,y){
  var f=function(v){return v.toFixed(1)};
  if(k==='L')return r?'<circle cx="'+f(x)+'" cy="'+f(y)+'" r="3" fill="#fff" stroke="#423f3d" stroke-width="1.5"/>':'<circle cx="'+f(x)+'" cy="'+f(y)+'" r="3" fill="#423f3d" fill-opacity="0.6"/>';
  if(k==='M')return r?'<rect x="'+f(x-2.3)+'" y="'+f(y-2.3)+'" width="4.6" height="4.6" fill="#fff" stroke="#ae353d" stroke-width="1.5"/>':'<rect x="'+f(x-2.6)+'" y="'+f(y-2.6)+'" width="5.2" height="5.2" fill="#ae353d"/>';
  var p='M'+f(x)+' '+f(y-4.6)+'L'+f(x+4.6)+' '+f(y+3.6)+'L'+f(x-4.6)+' '+f(y+3.6)+'Z';
  return r?'<path d="'+p+'" fill="#fff" stroke="#202227" stroke-width="1.5"/>':'<path d="'+p+'" fill="#dfc10e" stroke="#202227" stroke-width="1"/>';
}
function svgWrap(D,label,inner){return '<svg viewBox="0 0 666 218" width="666" height="218" role="img" aria-label="'+esc(label)+'" style="display:block;font-family:\'Noto Sans KR\',\'Malgun Gothic\',\'Apple SD Gothic Neo\',sans-serif">'+inner+'</svg>'}

function chart(D){
  var f1=function(v){return v.toFixed(1)},top=8,H=182;
  if(D.type==='월세'){
    var X0=52,X1=640,xt=D.xt,yt=D.yt,maxX=xt[xt.length-1],maxY=yt[0],g='',yl='',xl='';
    yt.forEach(function(v,i){var y=top+(maxY-v)/maxY*H;if(v>0)g+='<path d="M44 '+f1(y)+'H658"/>';yl+='<text x="38" y="'+f1(y+(i===0?6:i===yt.length-1?2:4))+'">'+v+'만</text>'});
    xt.forEach(function(v){var x=X0+v/maxX*(X1-X0);xl+='<text x="'+f1(x)+'" y="212">'+(v===0?'0':v<10000?(v/1000)+'천만':(v/10000)+'억')+'</text>'});
    var dots=D.dots.map(function(p){return mark(p.k,p.r,X0+p.x/maxX*(X1-X0),top+(maxY-Math.max(0,Math.min(maxY,p.y)))/maxY*H)}).join('');
    return svgWrap(D,'전용 '+D.sel.a+'㎡ 월세 '+D.kpi.n+'건의 보증금과 월세 분포',
      '<g stroke="#cbc8c1" stroke-width="1">'+g+'</g><path d="M44 190H658" stroke="#423f3d" stroke-width="1"/><g font-size="12" fill="#423f3d" text-anchor="end">'+yl+'</g><g font-size="12" fill="#423f3d" text-anchor="middle">'+xl+'</g>'+dots);
  }
  var X0t=50,X1t=646,tk=D.ticks,maxT=tk[0],minT=tk[tk.length-1],n=tk.length;
  var xs=function(d){return X0t+d/D.daysLast*(X1t-X0t)};
  var ys=function(p){p=Math.max(minT,Math.min(maxT,p));return top+(maxT-p)/(maxT-minT)*H};
  var g2='',yl2='';
  tk.forEach(function(t,i){var y=top+i*H/(n-1);if(i<n-1)g2+='<path d="M44 '+f1(y)+'H658"/>';yl2+='<text x="38" y="'+f1(y+(i===0?6:i===n-1?2:4))+'">'+t.toFixed(1)+'억</text>'});
  var stp=D.months.length>30?6:D.months.length>14?3:1;var xl2=D.months.map(function(m,i){return i%stp?'':'<text x="'+f1(xs(D.starts[i]))+'" y="212">'+m+'</text>'}).join('');
  var dots2=D.dots.map(function(p){return mark(p.k,p.r,xs(p.d),ys(p.p))}).join('');
  // 월별 중간값 선·점은 전세 그래프에만 둔다(매매는 아래 층별 구간 막대와 월별 증감률 막대로 보여 준다)
  var withMed=D.type!=='매매',runs=[],cur=[];
  if(withMed)D.meds.forEach(function(m){if(cur.length&&m.mi!==cur[cur.length-1].mi+1){runs.push(cur);cur=[]}cur.push(m)});if(cur.length)runs.push(cur);
  var pl=runs.filter(function(r){return r.length>1}).map(function(r){return '<polyline points="'+r.map(function(m){return f1(xs(m.d))+','+f1(ys(m.p))}).join(' ')+'" fill="none" stroke="#202227" stroke-width="2"/>'}).join('');
  var mc=withMed?D.meds.map(function(m){return '<circle cx="'+f1(xs(m.d))+'" cy="'+f1(ys(m.p))+'" r="4"/>'}).join(''):'';
  return svgWrap(D,'전용 '+D.sel.a+'㎡ '+D.type+' '+D.kpi.n+'건의 계약일별 거래 금액 산점도'+(withMed?'와 월별 중간값':''),
    '<g stroke="#cbc8c1" stroke-width="1">'+g2+'</g><path d="M44 190H658" stroke="#423f3d" stroke-width="1"/><g font-size="12" fill="#423f3d" text-anchor="end">'+yl2+'</g><g font-size="12" fill="#423f3d" text-anchor="middle">'+xl2+'</g>'+dots2+pl+'<g fill="#ffffff" stroke="#202227" stroke-width="2">'+mc+'</g>');
}

function ymKo(p){var m=/(\d{4})\.(\d{2}) ~ (\d{4})\.(\d{2})/.exec(p);return m?m[1]+'년 '+(+m[2])+'월 ~ '+m[3]+'년 '+(+m[4])+'월':p}
var SV={
 L:'<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="#423f3d" fill-opacity="0.6"/></svg>',
 M:'<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" fill="#ae353d"/></svg>',
 H:'<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5L12.5 12L1.5 12Z" fill="#dfc10e" stroke="#202227" stroke-width="1"/></svg>',
 V:'<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M0 7H14" stroke="#202227" stroke-width="2"/><circle cx="7" cy="7" r="3.5" fill="#fff" stroke="#202227" stroke-width="2"/></svg>',
 F:'<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="#202227"/></svg>',
 R:'<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="4" fill="#fff" stroke="#202227" stroke-width="2"/></svg>'};

var SVGF='font-family:\'Noto Sans KR\',\'Malgun Gothic\',\'Apple SD Gothic Neo\',sans-serif';
function svgBox(w,h,label,inner){return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" role="img" aria-label="'+esc(label)+'" style="display:block;'+SVGF+'">'+inner+'</svg>'}
function svgT(x,y,txt,o){o=o||{};return '<text x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" font-size="'+(o.sz||12)+'"'+(o.b?' font-weight="700"':'')+' fill="'+(o.fill||'#423f3d')+'"'+(o.anchor?' text-anchor="'+o.anchor+'"':'')+(o.halo?' stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke"':'')+'>'+esc(txt)+'</text>'}

/* 층별 거래가격 구간(매매 2쪽): 층마다 최저~최고 가로 막대와 건수. 직거래·해제는 이미 자료에서 빠져 있다(D.floors.*.lo/hi).
   3건 미만인 층은 막대 대신 '표본 적음'. 색은 점 그래프의 층 색(저층 회색·중층 빨강·고층 노랑)과 같다. */
function floorBars(D){
  var COL={L:'#423f3d',M:'#ae353d',H:'#dfc10e'};
  var rows=FL.map(function(z){var f=D.floors[z[0]];return {k:z[0],name:z[1],f:f,ok:f.n>=3&&f.lo!=null}});
  var okR=rows.filter(function(r){return r.ok});
  var W=666,BX0=124,BX1=448,RH=36,top=6,H=top+RH*3+24,x,ticks=[],t0=0,t1=1,s='';
  if(okR.length){
    var lo=Infinity,hi=-Infinity;
    okR.forEach(function(r){lo=Math.min(lo,r.f.lo/1e4);hi=Math.max(hi,r.f.hi/1e4)});
    var span=hi-lo,step=[0.1,0.2,0.5,1,2,5,10].filter(function(v){return span/v<=5})[0]||10;
    t0=Math.floor(lo/step+1e-9)*step;t1=Math.ceil(hi/step-1e-9)*step;if(t1<=t0)t1=t0+step;
    for(var q=0,nq=Math.round((t1-t0)/step);q<=nq;q++)ticks.push(+(t0+q*step).toFixed(2));
    x=function(v){return BX0+(v-t0)/(t1-t0)*(BX1-BX0)};
    ticks.forEach(function(t){s+='<path d="M'+x(t).toFixed(1)+' '+top+'V'+(top+RH*3)+'" stroke="#cbc8c1" stroke-width="1"/>'+svgT(x(t),top+RH*3+16,t.toFixed(1)+'억',{sz:11,anchor:'middle'})});
    s+='<path d="M'+BX0+' '+(top+RH*3)+'H'+BX1+'" stroke="#423f3d" stroke-width="1"/>';
  }
  rows.forEach(function(r,i){
    var cy=top+RH*i+RH/2,f=r.f;
    s+=mark(r.k,0,9,cy-7)+svgT(20,cy-1.5,r.name,{sz:14,b:1,fill:'#202227'})+svgT(20,cy+14.5,f.rng||'',{sz:10});   // 층 구간(몇 층~몇 층)은 작은 글씨
    if(r.ok){
      var x1=x(f.lo/1e4),x2=x(f.hi/1e4);
      s+='<rect x="'+x1.toFixed(1)+'" y="'+(cy-8)+'" width="'+Math.max(x2-x1,4).toFixed(1)+'" height="16" fill="'+COL[r.k]+'"'+(r.k==='L'?' fill-opacity="0.6"':'')+(r.k==='H'?' stroke="#202227" stroke-width="1"':'')+'/>'+
        svgT(W,cy+5,rngTxt(f.lo,f.hi)+' ('+f.n+'건)',{sz:13,b:1,anchor:'end',fill:'#202227'});
    }else{
      s+=svgT(BX0+4,cy+5,f.n>0?'표본 적음':'거래 없음',{sz:13})+(f.n>0?svgT(W,cy+5,'('+f.n+'건)',{sz:13,anchor:'end'}):'');
    }
  });
  return '<div style="background:#fff;padding:12px 24px 12px 24px;display:flex;flex-direction:column;gap:6px">'+h2('층별 거래가격 구간')+
    '<span style="font-size:12px;line-height:18px;font-weight:500;color:#423f3d">막대는 최저~최고 · 3건 미만인 층은 \'표본 적음\' · 층 구간·색은 위 점 그래프와 같음</span>'+
    svgBox(W,H,'전용 '+D.sel.a+'㎡ 층별 거래가격 구간(최저~최고)',s)+'</div>';
}

/* 월별 증감률 막대그래프(매매·전세 2쪽). 앱 monthlyChange와 같은 규칙: 3건 이상인 달(D.meds)끼리만 비교하고,
   바로 앞 달이 비어 있으면 중간값이 있는 가장 가까운 앞 달과 비교하며 'N개월 전'을 작게 덧붙인다. 비교 간격이 4개월 이상이면 막대 없이 '간격 큼'.
   첫 표시 달의 비교 대상이 표시 구간(최근 12개월) 밖에 있어도 그 값을 쓴다. 계산은 억 단위 원값으로 하고 표시만 소수 첫째 자리. */
function chgMap(D){
  var byM={},prev=null;
  D.meds.slice().sort(function(a,b){return a.mi-b.mi}).forEach(function(m){
    if(prev)byM[m.mi]={pc:(m.p-prev.p)/prev.p*100,gap:m.mi-prev.mi};
    prev=m});
  return byM;
}
/* 월별 중간값과 증감률(매매·전세 2쪽): 위 = 월별 중간값 꺾은선+점, 아래 = 전월 대비 증감률 막대. 월 축(가로)을 공유한다.
   값은 D.meds(한 달 3건 이상인 달만): 3건 미만인 달은 점이 없고 선도 끊는다. 막대는 chgMap(앱 monthlyChange와 같은 규칙).
   중간값 세로축은 0이 아니라 값 범위에 맞추고 시작값을 작은 글씨로 알린다. */
function monthBars(D,c0,cols){
  var byM=chgMap(D),n=cols-c0,W=666,H=236,ML=44,i,any=false,pos=0,neg=0;
  var aT=24,aB=92,pT=114,pB=180,labY=215,gapY=231;   // 위 패널(꺾은선) 24~92, 아래 패널(막대) 114~180
  var medBy={};D.meds.forEach(function(m){medBy[m.mi]=m});
  var vals=[];
  for(i=c0;i<cols;i++){var c=byM[i];if(c){any=true;if(c.gap<4){pos=Math.max(pos,c.pc);neg=Math.max(neg,-c.pc)}}if(medBy[i])vals.push(medBy[i].p)}
  var title=function(extra){return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'+h2('월별 중간값과 증감률')+'<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">3건 이상인 달끼리'+(cols-c0<cols?' · 최근 12개월':'')+(extra||'')+'</span></div>'};
  if(!any||vals.length<2)return '<div style="background:#fff;padding:12px 24px;display:flex;flex-direction:column;gap:8px">'+title()+'<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">한 달에 3건 이상인 달이 둘 이상 없어 중간값 추이와 증감률을 그리지 않았습니다.</span></div>';
  // 중간값 세로축: 값 범위에 맞춘 눈금(억 원)
  var vmin=Math.min.apply(null,vals),vmax=Math.max.apply(null,vals),span=vmax-vmin;
  var step=[0.1,0.2,0.5,1,2,5,10].filter(function(v){return span/v<=3})[0]||10;
  var lo=Math.floor(vmin/step+1e-9)*step,hi=Math.ceil(vmax/step-1e-9)*step;if(hi<=lo)hi=lo+step;
  var yv=function(v){return aB-(v-lo)/(hi-lo)*(aB-aT)};
  var cw=(W-ML)/n,bw=Math.min(30,cw*0.56),cx=function(j){return ML+(j+0.5)*cw},s='';
  // 위 패널: 눈금선·눈금 라벨
  for(var q=0,nq=Math.round((hi-lo)/step);q<=nq;q++){var tv=lo+q*step;
    s+='<path d="M'+ML+' '+yv(tv).toFixed(1)+'H'+W+'" stroke="#cbc8c1" stroke-width="1"/>'+svgT(ML-6,yv(tv)+4,tv.toFixed(1)+'억',{sz:11,anchor:'end'})}
  // 꺾은선: 이어진 달끼리만 잇고(3건 미만인 달에서 끊음), 점마다 위에 중간값
  var runs=[],cur=[],lab=[];
  for(i=c0;i<cols;i++){var m=medBy[i];
    if(m){cur.push({j:i-c0,x:cx(i-c0),y:yv(m.p),p:m.p})}
    else if(cur.length){runs.push(cur);cur=[]}}
  if(cur.length)runs.push(cur);
  runs.forEach(function(r){if(r.length>1)s+='<polyline points="'+r.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1)}).join(' ')+'" fill="none" stroke="#202227" stroke-width="2.2" stroke-linejoin="round"/>'});
  var all=[].concat.apply([],runs),r2=function(v){return (Math.round(v*100+1e-7)/100).toFixed(2)};
  all.forEach(function(p,k){
    s+='<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3.5" fill="#fff" stroke="#202227" stroke-width="2"/>';
    var txt=r2(p.p)+'억',ly=p.y-8,prev=lab[lab.length-1];
    // 이웃 라벨과 가로로 겹치면 아래쪽에 표시해 간격을 둔다
    if(prev&&Math.abs(p.x-prev.x)<txt.length*5.6+4&&prev.above)ly=p.y+16;
    lab.push({x:p.x,above:ly<p.y});
    s+=svgT(p.x,ly,txt,{sz:10,anchor:'middle',fill:'#202227',halo:1,b:1});
  });
  // 아래 패널: 증감률 막대
  var total=Math.max(pos+neg,1),unit=(pB-pT)/total,y0=pT+pos*unit;
  s+='<path d="M'+ML+' '+y0.toFixed(1)+'H'+W+'" stroke="#423f3d" stroke-width="1"/>'+svgT(ML-6,y0+4,'0%',{sz:11,anchor:'end'});
  for(i=c0;i<cols;i++){
    var j=i-c0,x=cx(j),cc=byM[i];
    s+=svgT(x,labY,D.months[i],{sz:12,anchor:'middle'});
    if(!cc)continue;
    if(cc.gap>=4){s+=svgT(x,y0-6,'간격 큼',{sz:11,anchor:'middle',fill:'#6b6560'})}
    else{
      var up=cc.pc>0,dn=cc.pc<0,col=up?'#c0392b':dn?'#1f5fa8':'#423f3d',h=Math.abs(cc.pc)*unit;
      if(cc.pc!==0)h=Math.max(h,1.5);
      s+='<rect x="'+(x-bw/2).toFixed(1)+'" y="'+(cc.pc>=0?y0-h:y0).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+col+'"/>'+
        svgT(x,cc.pc>=0?y0-h-4:y0+h+13,(up?'▲':dn?'▼':'')+Math.abs(cc.pc).toFixed(1)+'%',{sz:12,b:1,anchor:'middle',fill:col});
    }
    if(cc.gap>1)s+=svgT(x,gapY,cc.gap+'개월 전',{sz:10,anchor:'middle'});
  }
  return '<div style="background:#fff;padding:12px 24px 12px 24px;display:flex;flex-direction:column;gap:8px">'+title(' <span style="font-size:11px">· 중간값 세로축은 0이 아니라 '+lo.toFixed(1)+'억부터</span>')+
    svgBox(W,H,'전용 '+D.sel.a+'㎡ 월별 중간값 꺾은선과 증감률 막대그래프',s)+
    '<span style="font-size:12px;line-height:18px;font-weight:500;color:#423f3d">위: 월별 중간값 · 아래: 증감률(붉은 ▲ 상승, 파란 ▼ 하락) · 앞 달이 비면 \'N개월 전\' · 4개월 이상 떨어지면 \'간격 큼\'</span></div>';
}

function page2(D,N,evi){
  var T=D.type,k=D.kpi;
  var leg=function(key,name,f){var med='';
    if(T==='월세'){
      // 월세: 층별 보증금·월세 범위(1건이면 그 값 하나, 0건이면 거래 없음)
      var wr=!f.n?' · 거래 없음':f.dLo==null?'':' · 보증금 '+rngTxt(f.dLo,f.dHi)+' · 월세 '+rngTxt(f.rLo,f.rHi);
      return '<div style="display:flex;align-items:center;gap:8px">'+SV[key]+'<span><b>'+name+'</b>'+(f.n?' '+f.n+'건':'')+wr+'</span></div>'}
    if(f.n&&f.med&&T!=='매매')med=' · 중간값 '+fmt(f.med);
    return '<div style="display:flex;align-items:center;gap:8px">'+SV[key]+'<span><b>'+name+'</b> '+esc(f.rng||'')+' · '+f.n+'건'+med+'</span></div>'};
  var legs=leg('L','저층',D.floors.L)+leg('M','중층',D.floors.M)+leg('H','고층',D.floors.H);
  if(T==='전세')legs+='<div style="display:flex;align-items:center;gap:8px">'+SV.V+'<span><b>월별 중간값</b> 한 달 3건 이상일 때만 표시</span></div>';
  var rn=D.legRenew!=null?D.legRenew:k.renewN,nw=D.legNew!=null?D.legNew:k.newN;
  var kind=T==='매매'?'':'<div style="display:flex;gap:16px;font-size:13px;line-height:20px"><span style="display:flex;align-items:center;gap:6px">'+SV.F+'<b>신규</b> '+nw+'건</span><span style="display:flex;align-items:center;gap:6px">'+SV.R+'<b>갱신(속이 빈 점)</b> '+rn+'건</span></div>';
  var sub=T==='매매'?'전용 '+D.sel.a+'㎡ · '+k.n+'건 · 점 하나가 거래 한 건입니다 (계약일 · 금액)':T==='전세'?'전용 '+D.sel.a+'㎡ · '+k.n+'건 · 점 하나가 거래 한 건입니다 (계약일 · 보증금)':'전용 '+D.sel.a+'㎡ · '+k.n+'건 · 점 하나가 거래 한 건입니다 (가로 보증금 · 세로 월세)';
  var cap;
  if(T==='월세')cap='';
  else{var minT=D.ticks[D.ticks.length-1];
    cap='<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">표본 '+k.n+'건 · '+esc(ymKo(D.period))+(k.lo&&k.hi?' · 최저 '+fmt(k.lo.v)+(T==='매매'?'':' · 중간값 '+fmt(k.med))+' · 최고 '+fmt(k.hi.v):'')+'. 세로축은 0원이 아니라 '+minT.toFixed(1)+'억 원에서 시작하니 눈금의 숫자를 함께 읽어 주세요.</span>'}
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
