// 그래프 이미지(PNG)용 한글 글꼴 만들기. lib/fonts/ 의 파일은 Noto Sans KR(SIL OFL 1.1, OFL-LICENSE.txt)의 부분집합이다.
// 원본 글꼴(글자 약 1만 6천 개, 파일 6MB)은 resvg가 글자마다 다시 읽어 PNG 하나에 3초가 걸려서, 쓰는 글자만 남겼다.
//   common-*  : ASCII + 한글 KS X 1001 2,350자 + 자모 + 기호(㎡ ▲ ▼ 등)  → 약 0.5MB, PNG 하나 약 0.3초 (기본)
//   full-*    : 위 + 한글 음절 11,172자 전부                              → 약 2.5MB, 단지명에 드문 글자가 있을 때만 사용
// 다시 만들려면(원본 TTF는 @expo-google-fonts/noto-sans-kr 패키지의 400Regular·700Bold·900Black):
//   npm i --no-save subset-font @expo-google-fonts/noto-sans-kr && node scripts/build-report-fonts.js
const fs = require('fs');
const path = require('path');
const subsetFont = require('subset-font');
const SRC = path.join(__dirname, '..', 'node_modules', '@expo-google-fonts', 'noto-sans-kr');
const OUT = path.join(__dirname, '..', 'lib', 'fonts');
const FILES = { Regular: '400Regular/NotoSansKR_400Regular.ttf', Bold: '700Bold/NotoSansKR_700Bold.ttf', Black: '900Black/NotoSansKR_900Black.ttf' };

const dec = new TextDecoder('euc-kr');
let ks = '';
for (let hi = 0xb0; hi <= 0xc8; hi++) for (let lo = 0xa1; lo <= 0xfe; lo++) { const ch = dec.decode(new Uint8Array([hi, lo])); if (/[가-힣]/.test(ch)) ks += ch; }
let base = '';
for (let c = 0x20; c <= 0x7e; c++) base += String.fromCharCode(c);
for (let c = 0x3131; c <= 0x318e; c++) base += String.fromCodePoint(c);
base += '㎡㎞㎝㎜㏊▲▼◀▶●■□◆○△▽·•…※−–—―‘’“”\u00a0　①②③④⑤⑥⑦⑧⑨⑩';
let all = base;
for (let c = 0xac00; c <= 0xd7a3; c++) all += String.fromCodePoint(c);

(async () => {
  fs.writeFileSync(path.join(OUT, 'common-chars.txt'), base + ks);
  for (const [w, f] of Object.entries(FILES)) {
    const buf = fs.readFileSync(path.join(SRC, f));
    fs.writeFileSync(path.join(OUT, `common-NotoSansKR-${w}.ttf`), await subsetFont(buf, base + ks, { targetFormat: 'sfnt' }));
    fs.writeFileSync(path.join(OUT, `full-NotoSansKR-${w}.ttf`), await subsetFont(buf, all, { targetFormat: 'sfnt' }));
  }
  console.log('done');
})();
