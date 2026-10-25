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
function lab(l,v){return '<div style="display:flex;flex-direction:column"><span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+esc(l)+'</span><span style="font-size:16px;line-height:26px;font-weight:700">'+esc(v)+'</span></div>'}
function slim(D,n,N){return '<div style="background:#8e1b1c;color:#fff;padding:12px 40px;display:flex;align-items:center;justify-content:space-between;gap:16px"><div style="display:flex;align-items:center;gap:8px"><svg width="24" height="24" viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M4 26V13L15 4L26 13V26Z" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="miter"/></svg><span style="font-size:16px;line-height:26px;font-weight:800">'+esc(D.complex)+' · 전용 '+esc(D.sel.a)+'㎡ 실거래가 분석리포트</span></div><span style="font-size:13px;line-height:20px;font-weight:700">'+n+' / '+N+'</span></div>'}
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
    var r=k.recent;
    if(r){var pc=(r.med-k.med)/k.med*100,ap=Math.abs(pc).toFixed(1);
      if(Math.abs(pc)<1)l2='<b>최근 가격은 1년 평균 수준입니다.</b> 최근 3개월 중간값이 1년 중간값과 거의 같습니다(차이 '+ap+'%).';
      else{var up=pc>0;l2='<b>최근 가격이 더 '+(up?'높':'낮')+'습니다.</b> 최근 3개월 중간값이 1년 중간값보다 약 '+ap+'% '+(up?'높':'낮')+(r.n<10?'지만, 최근 3개월은 '+r.n+'건뿐입니다.':'습니다('+r.n+'건 기준).')}}
    else l2='<b>최근 3개월 거래가 없습니다.</b> 최근 가격 흐름은 아래 그래프에서 확인해 주세요.';
    var meds=FL.map(function(z){return D.floors[z[0]]}).filter(function(f){return f.n>0&&f.med});
    var spread=meds.length>1?(Math.max.apply(null,meds.map(function(f){return f.med}))-Math.min.apply(null,meds.map(function(f){return f.med})))/k.med*100:0;
    var lead=meds.length<2?'층별 비교는 어렵습니다.':spread<3?'층별 차이는 크지 않습니다.':spread<8?'층별로 약간 차이가 있습니다.':'층별 차이가 뚜렷합니다.';
    l3='<b>'+lead+'</b> '+floorParts(D).join(' · ')+'.';
  }else if(D.type==='전세'){
    var rm=/^([\d.]+)%\s*(.*)$/.exec(k.ratioRaw||'');
    l2=rm?'<b>전세가율은 '+rm[1]+'%입니다.</b> 매매 중간값 대비 전세 중간값의 비율이며, 대출 등 권리관계는 반영되지 않았습니다.':'<b>전세가율 자료가 없습니다.</b> 같은 기간 매매 거래가 없어 비교하지 못했습니다.';
    var big=k.newN>=k.renewN*2;
    l3='<b>'+(big?'신규 계약이 대부분입니다.':'신규와 갱신이 비슷합니다.')+'</b> 신규 '+k.newN+'건 · 갱신 '+k.renewN+'건'+(k.renewMed==null?'(표본 부족)':'')+'. 층별 중간값은 '+floorParts(D).join(' · ')+'.';
  }else{
    var t=D.tiers||[];
    l2=t.length>1?'<b>월세는 보증금에 따라 크게 달라집니다.</b> '+t[0].lab+' '+t[0].med+', '+t[t.length-1].lab+' '+t[t.length-1].med+'입니다.':'<b>월세는 보증금과 함께 봐야 합니다.</b> 보증금이 비슷한 거래끼리 비교해 주세요.';
    l3='<b>신규 '+k.newN+'건 · 갱신 '+k.renewN+'건입니다.</b> 층별 월세 중간값은 '+floorParts(D).join(' · ')+'.';
  }
  return [l1,l2,l3];
}

function wcell(l,v,sz,sub){return '<div style="background:#fff;padding:12px 16px;display:flex;flex-direction:column"><span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+esc(l)+'</span><span style="font-size:'+sz+'px;line-height:32px;font-weight:800">'+esc(v)+'</span>'+(sub?'<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+esc(sub)+'</span>':'')+'</div>'}
function ycard(l,big,bigSz,sub,bottom){return '<div style="display:flex;flex-direction:column"><span style="font-size:13px;line-height:20px;font-weight:700">'+esc(l)+'</span><span style="font-size:'+bigSz+'px;line-height:48px;font-weight:900">'+esc(big)+'</span>'+(sub?'<span style="font-size:13px;line-height:20px;font-weight:500">'+esc(sub)+'</span>':'')+'</div><span style="font-size:13px;line-height:20px;font-weight:700">'+esc(bottom)+'</span>'}

function summary(D){
  var k=D.kpi,T=D.type,yel,cells;
  if(T==='매매'){var r=k.recent;
    if(r){var df=r.med-k.med;yel=ycard('최근 3개월 중간값',fmt(r.med),40,r.n+'건 · '+r.from+' ~ '+r.to,'1년 중간값('+fmt(k.med)+')'+(df===0?'과 같음':'보다 '+fmt(Math.abs(df))+' '+(df>0?'높음':'낮음')))}
    else yel=ycard('1년 중간값',fmt(k.med),40,'','최근 3개월 거래 없음');
    cells=[wcell('거래 건수',k.n+'건',24,'해제 거래 제외'),wcell('중간값',fmt(k.med),20,'가장 가운데 거래'),wcell('가장 낮은 거래',fmt(k.min),20),wcell('가장 높은 거래',fmt(k.max),fmt(k.max).length>9?18:20)];
  }else if(T==='전세'){var rm=/^([\d.]+)%\s*(.*)$/.exec(k.ratioRaw||'');
    if(rm){var pr=rm[2].split(' · ');yel=ycard('매매 대비 전세가율',rm[1]+'%',40,pr[0],pr.length>1?pr.slice(1).join(' · '):'대출 등 권리관계는 반영되지 않은 수치')}
    else yel=ycard('전세 중간값',fmt(k.med),40,'','전세가율은 같은 기간 매매 거래가 있어야 계산됩니다');
    cells=[wcell('전세 거래 건수',k.n+'건',24,D.period.replace(/ /g,'')),wcell('전세 중간값',fmt(k.med),20,'신규·갱신 모두'),wcell('신규 계약 중간값',k.newMed!=null?fmt(k.newMed):'표본 부족',20,k.newN+'건'),wcell('갱신 계약 중간값',k.renewMed!=null?fmt(k.renewMed):'표본 부족',20,k.renewN+'건')];
  }else{
    yel=ycard('보증금 범위',k.depRange,28,'가장 낮은 ~ 가장 높은 보증금',k.allDep!=null?'중간값 보증금 '+fmt(k.allDep)+' · 월세 '+fmt(k.allRent):'');
    cells=[wcell('월세 거래 건수',k.n+'건',24,D.period.replace(/ /g,'')),wcell('신규 계약',k.newN+'건',24),wcell('갱신 계약',k.renewN+'건',24),wcell('월세 중간값',k.allRent!=null?fmt(k.allRent):'—',20,k.allDep!=null?'보증금 '+fmt(k.allDep):'')];
  }
  return '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px"><div style="background:#dfc10e;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:8px">'+yel+'</div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">'+cells.join('')+'</div></div>';
}

function page1(D,N){
  var meta=D.cust?[['고객',D.cust.name],['연락처',D.cust.phone],['저장일시',D.saved],['조회 기간',D.period]]:[['저장일시',D.saved],['조회 기간',D.period],['가장 최근 계약일',D.latest||'—'],['기준',D.type==='매매'?'계약일 · 해제 제외':'계약일 기준']];
  var maxN=Math.max.apply(null,D.areas.map(function(z){return z.n}))||1;
  var rows=D.areas.map(function(z,i){var sel=z.a===D.sel.a,last=i===D.areas.length-1,w=Math.max(z.n/maxN*100,0);
    return '<div style="display:grid;grid-template-columns:158px 72px 56px minmax(0,1fr);column-gap:12px;align-items:center;padding:1px 0;'+(last?'':'border-bottom:1px solid #cbc8c1;')+(sel?'background:#e6d9ce;font-weight:800;':'')+'font-size:14px;line-height:22px"><span>'+esc(z.a)+'㎡'+(sel?' ◀ 이 리포트':'')+'</span><span>약 '+z.py+'평</span><span style="text-align:right">'+z.n+'건</span><span style="display:block;height:10px">'+(z.n?'<span style="display:block;height:10px;width:'+w.toFixed(1)+'%;'+(sel?'background:#8e1b1c':'background:#423f3d;opacity:0.6')+'"></span>':'')+'</span></div>'}).join('');
  var rl=readLines(D).map(function(t){return '<div style="font-size:14px;line-height:22px">'+t+'</div>'}).join('');
  return '<div class="pg">'+
  '<div style="background:#8e1b1c;color:#fff;padding:24px 40px;display:flex;flex-direction:column;gap:20px"><div style="display:flex;align-items:center;justify-content:space-between;gap:16px"><div style="display:flex;align-items:center;gap:8px"><svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M4 26V13L15 4L26 13V26Z" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="miter"/></svg><div style="display:flex;flex-direction:column"><span style="font-size:20px;line-height:24px;font-weight:900">'+esc(CFG.name)+'</span><span style="font-size:13px;line-height:18px;font-weight:500">'+esc(subLine())+'</span></div></div>'+(CFG.tel?'<div style="border:2px solid #fff;border-radius:999px;padding:4px 20px;font-size:20px;line-height:28px;font-weight:800">T. '+esc(CFG.tel)+'</div>':'')+'</div>'+
  '<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:13px;line-height:20px;font-weight:700">국토교통부 실거래가 공개자료 기반 분석 리포트</span><h1 style="margin:0;font-size:48px;line-height:54px;font-weight:900">'+esc(D.complex)+'</h1><span style="font-size:16px;line-height:26px;font-weight:400">'+esc(D.addr)+(D.built?' · '+esc(D.built)+'년 준공':'')+' · 전용 '+esc(D.sel.a)+'㎡ (약 '+D.sel.py+'평)</span></div></div>'+
  '<div style="'+BODY+'">'+
  '<div style="background:#fff;padding:12px 16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:16px">'+meta.map(function(z){return lab(z[0],z[1])}).join('')+'</div>'+
  '<div style="display:flex;flex-direction:column;gap:8px">'+h2('핵심 요약 · 전용 '+D.sel.a+'㎡ '+D.type)+summary(D)+'</div>'+
  '<div style="display:flex;flex-direction:column;gap:8px">'+h2('읽는 법')+'<div style="background:#fff;padding:12px 16px;display:flex;flex-direction:column;gap:4px">'+rl+'</div></div>'+
  '<div style="display:flex;flex-direction:column;gap:8px">'+h2('면적별 '+D.type+' 거래 건수')+'<div style="background:#fff;padding:8px 16px 12px 16px;display:flex;flex-direction:column"><div style="display:grid;grid-template-columns:158px 72px 56px minmax(0,1fr);column-gap:12px;padding:4px 0;border-bottom:2px solid #202227;font-size:13px;line-height:20px;font-weight:700"><span>전용면적</span><span>평형</span><span style="text-align:right">건수</span><span>거래 건수 비교 ('+maxN+'건 = 100%)</span></div>'+rows+'</div></div>'+
  '</div>'+foot(1,N)+'</div>';
}

function evidence(D){
  var proc=D.proc||'원본 거래 건을 그대로 사용했고, 해제된 매매 거래만 통계에서 뺐습니다. 전월세 자료에는 해제 거래가 없습니다. 전세는 월세가 없는 계약, 월세는 월세가 있는 계약입니다.';
  var row=function(a,b){return '<span style="font-weight:700;color:#423f3d">'+a+'</span><span>'+esc(b)+'</span>'};
  return '<div style="background:#fff;padding:12px 24px 16px 24px;display:flex;flex-direction:column;gap:8px">'+h2('이 자료를 믿고 보실 수 있는 근거')+
  '<div style="display:grid;grid-template-columns:76px minmax(0,1fr);column-gap:12px;row-gap:2px;font-size:13px;line-height:20px">'+row('출처',D.src)+row('조회 조건',D.cond)+row('자료 기준',D.basis)+row('가공 방법',proc)+'</div>'+
  '<div style="border-top:1px solid #cbc8c1;padding-top:8px;display:flex;flex-direction:column;gap:2px;font-size:13px;line-height:20px"><span>· 평균이 아니라 중간값을 썼습니다. 한두 건의 특이한 거래에 숫자가 끌려가지 않게 하기 위해서입니다.</span><span>· 계약 후 30일 이내에 신고하는 제도라서, 최근 계약일의 거래는 아직 올라오지 않았을 수 있습니다.</span><span>· 같은 면적이라도 동, 층, 향, 수리 상태에 따라 가격이 다릅니다.</span><span>· 이 정보는 법적 효력이 없는 참고용이며, 외부 공개용 통계는 신고일 기준 공식통계를 써야 합니다.</span></div></div>';
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
    yt.forEach(function(v,i){var y=top+(maxY-v)/maxY*H;if(v>0)g+='<path d="M44 '+f1(y)+'H658"/>';yl+='<text x="38" y="'+f1(y+4)+'">'+v+'만</text>'});
    xt.forEach(function(v){var x=X0+v/maxX*(X1-X0);xl+='<text x="'+f1(x)+'" y="208">'+(v===0?'0':v<10000?(v/1000)+'천만':(v/10000)+'억')+'</text>'});
    var dots=D.dots.map(function(p){return mark(p.k,p.r,X0+p.x/maxX*(X1-X0),top+(maxY-Math.max(0,Math.min(maxY,p.y)))/maxY*H)}).join('');
    return svgWrap(D,'전용 '+D.sel.a+'㎡ 월세 '+D.kpi.n+'건의 보증금과 월세 분포',
      '<g stroke="#cbc8c1" stroke-width="1">'+g+'</g><path d="M44 190H658" stroke="#423f3d" stroke-width="1"/><g font-size="12" fill="#423f3d" text-anchor="end">'+yl+'</g><g font-size="12" fill="#423f3d" text-anchor="middle">'+xl+'</g>'+dots);
  }
  var X0t=50,X1t=646,tk=D.ticks,maxT=tk[0],minT=tk[tk.length-1],n=tk.length;
  var xs=function(d){return X0t+d/D.daysLast*(X1t-X0t)};
  var ys=function(p){p=Math.max(minT,Math.min(maxT,p));return top+(maxT-p)/(maxT-minT)*H};
  var g2='',yl2='';
  tk.forEach(function(t,i){var y=top+i*H/(n-1);if(i<n-1)g2+='<path d="M44 '+f1(y)+'H658"/>';yl2+='<text x="38" y="'+f1(y+4)+'">'+t.toFixed(1)+'억</text>'});
  var stp=D.months.length>30?6:D.months.length>14?3:1;var xl2=D.months.map(function(m,i){return i%stp?'':'<text x="'+f1(xs(D.starts[i]))+'" y="208">'+m+'</text>'}).join('');
  var dots2=D.dots.map(function(p){return mark(p.k,p.r,xs(p.d),ys(p.p))}).join('');
  var runs=[],cur=[];
  D.meds.forEach(function(m){if(cur.length&&m.mi!==cur[cur.length-1].mi+1){runs.push(cur);cur=[]}cur.push(m)});if(cur.length)runs.push(cur);
  var pl=runs.filter(function(r){return r.length>1}).map(function(r){return '<polyline points="'+r.map(function(m){return f1(xs(m.d))+','+f1(ys(m.p))}).join(' ')+'" fill="none" stroke="#202227" stroke-width="2"/>'}).join('');
  var mc=D.meds.map(function(m){return '<circle cx="'+f1(xs(m.d))+'" cy="'+f1(ys(m.p))+'" r="4"/>'}).join('');
  return svgWrap(D,'전용 '+D.sel.a+'㎡ '+D.type+' '+D.kpi.n+'건의 계약일별 거래 금액 산점도와 월별 중간값',
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

function page2(D,N,evi){
  var T=D.type,k=D.kpi;
  var leg=function(key,name,f){var med='';if(f.n&&T==='월세'&&f.dep!=null)med=' · 중간값 보증금 '+fmt(f.dep)+' · 월세 '+fmt(f.rent);else if(f.n&&f.med)med=' · 중간값 '+fmt(f.med);
    return '<div style="display:flex;align-items:center;gap:8px">'+SV[key]+'<span><b>'+name+'</b> '+esc(f.rng||'')+' · '+f.n+'건'+med+'</span></div>'};
  var legs=leg('L','저층',D.floors.L)+leg('M','중층',D.floors.M)+leg('H','고층',D.floors.H);
  if(T!=='월세')legs+='<div style="display:flex;align-items:center;gap:8px">'+SV.V+'<span><b>월별 중간값</b> 한 달 3건 이상일 때만 표시</span></div>';
  var rn=D.legRenew!=null?D.legRenew:k.renewN,nw=D.legNew!=null?D.legNew:k.newN;
  var kind=T==='매매'?'':'<div style="display:flex;gap:16px;font-size:13px;line-height:20px"><span style="display:flex;align-items:center;gap:6px">'+SV.F+'<b>신규</b> '+nw+'건</span><span style="display:flex;align-items:center;gap:6px">'+SV.R+'<b>갱신(속이 빈 점)</b> '+rn+'건</span></div>';
  var sub=T==='매매'?'전용 '+D.sel.a+'㎡ · '+k.n+'건 · 점 하나가 거래 한 건입니다 (계약일 · 금액)':T==='전세'?'전용 '+D.sel.a+'㎡ · '+k.n+'건 · 점 하나가 거래 한 건입니다 (계약일 · 보증금)':'전용 '+D.sel.a+'㎡ · '+k.n+'건 · 점 하나가 거래 한 건입니다 (가로 보증금 · 세로 월세)';
  var cap;
  if(T==='월세')cap='';
  else{var minT=D.ticks[D.ticks.length-1];
    cap='<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">표본 '+k.n+'건 · '+esc(ymKo(D.period))+(k.min!=null?' · 최저 '+fmt(k.min)+' · 중간값 '+fmt(k.med)+' · 최고 '+fmt(k.max):'')+'. 세로축은 0원이 아니라 '+minT.toFixed(1)+'억 원에서 시작하니 눈금의 숫자를 함께 읽어 주세요.</span>'}
  var warn=T==='월세'?'<div style="background:#e6d9ce;padding:8px 12px;font-size:13px;line-height:20px;font-weight:700">'+esc(D.warn)+'</div>':'';
  var lower;
  if(T==='월세'){
    var tr=(D.tiers||[]).map(function(t,i,a){return '<div style="display:grid;grid-template-columns:minmax(0,1fr) 56px 90px 130px;column-gap:12px;padding:4px 0;border-bottom:1px solid '+(i===a.length-1?'#202227':'#cbc8c1')+';font-size:14px;line-height:22px"><span>'+esc(t.lab)+'</span><span style="text-align:right">'+esc(t.n)+'</span><span style="text-align:right">'+esc(t.med)+'</span><span style="text-align:right">'+esc(t.rng)+'</span></div>'}).join('');
    lower='<div style="background:#fff;padding:12px 24px 16px 24px;display:flex;flex-direction:column;gap:8px">'+h2('보증금 구간별 월세')+'<div style="display:flex;flex-direction:column"><div style="display:grid;grid-template-columns:minmax(0,1fr) 56px 90px 130px;column-gap:12px;padding:4px 0;border-top:2px solid #202227;border-bottom:1px solid #202227;font-size:13px;line-height:20px;font-weight:700"><span>보증금 구간</span><span style="text-align:right">건수</span><span style="text-align:right">월세 중간값</span><span style="text-align:right">월세 범위</span></div>'+tr+'</div></div>';
  }else if(D.meds.length){
    var cols=D.months.length-1,c0=Math.max(0,cols-12),byM={},head='',vals='';D.meds.forEach(function(m){byM[m.mi]=m});
    for(var i=c0;i<cols;i++){head+='<span style="padding:4px 0;font-weight:700">'+D.months[i]+'</span>';var m=byM[i];vals+='<span>'+(m?m.p.toFixed(2):'—')+'</span>'}
    lower='<div style="background:#fff;padding:12px 24px;display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'+h2('월별 중간값')+'<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">단위 억 원 · 3건 미만인 달은 —' + (cols - c0 < cols ? ' · 최근 12개월만 표시' : '') + '</span></div>'+
    '<div style="display:grid;grid-template-columns:repeat('+(cols-c0)+',minmax(0,1fr));border-top:2px solid #202227;border-bottom:1px solid #202227;font-size:13px;line-height:20px;text-align:center">'+head+'</div>'+
    '<div style="display:grid;grid-template-columns:repeat('+(cols-c0)+',minmax(0,1fr));font-size:14px;line-height:22px;font-weight:700;text-align:center;margin-top:-8px">'+vals+'</div></div>';
  }else lower='<div style="background:#fff;padding:12px 24px;font-size:13px;line-height:20px;font-weight:500;color:#423f3d"><b>월별 중간값</b> 한 달에 3건 이상인 달이 없어 표시하지 않았습니다.</div>';
  return '<div class="pg">'+slim(D,2,N)+'<div style="'+BODY+'">'+
  '<div style="background:#fff;padding:16px 24px;display:flex;flex-direction:column;gap:8px">'+h2(T+' 그래프')+
  '<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">'+esc(sub)+'</span>'+warn+kind+
  '<div style="display:grid;grid-template-columns:repeat('+(T==='월세'?1:2)+',minmax(0,1fr));column-gap:16px;row-gap:4px;font-size:13px;line-height:20px">'+legs+'</div>'+chart(D)+cap+'</div>'+
  lower+(evi?evidence(D):'')+'</div>'+foot(2,N)+'</div>';
}

function refCard(D){
  var r=D.ref,kv=function(a,b){return '<span style="font-weight:700;color:#423f3d">'+a+'</span><span>'+esc(b)+'</span>'};
  var rows=kv('비교 기준',r.basis)+(D.type==='월세'?kv('보증금 중간값',r.med)+kv('월세 중간값',r.rent||'—'):kv('실거래 중간값',r.med))+kv('실거래 범위',r.range);
  return '<div style="background:#fff;padding:16px 24px;display:flex;flex-direction:column;gap:8px">'+h2('최근 6개월 실거래 기준 · '+D.type)+
  '<span style="font-size:13px;line-height:20px;font-weight:500;color:#423f3d">호가를 입력하지 않아 호가 비교는 넣지 않았습니다. 호가를 입력한 뒤 저장하면 이 쪽에 차액과 비율, 유사 거래 비교가 들어갑니다.</span>'+
  '<div style="display:grid;grid-template-columns:110px minmax(0,1fr);column-gap:12px;row-gap:4px;font-size:14px;line-height:22px">'+rows+'</div></div>';
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
  setConfig: function (c) { ['name', 'sub', 'tel', 'rep', 'addr', 'reg'].forEach(function (k) { if (c && typeof c[k] === 'string') CFG[k] = c[k].trim(); }); },
  getConfig: function () { return { name: CFG.name, sub: CFG.sub, tel: CFG.tel, rep: CFG.rep, addr: CFG.addr, reg: CFG.reg }; },
};
})();
