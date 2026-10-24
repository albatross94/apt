// Vercel 서버리스 함수: GET /api/gongsi/years?addr=...  (주소 → 필지번호와 공시가격 연도 목록)
module.exports = (req, res) => require('../../lib/core').respond('gongsi/years', req, res);
