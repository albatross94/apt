// Vercel 서버리스 함수: GET /api/aptfee?code=A10023717  (공용관리비: 가장 최근 공개 달의 항목별 합계)
module.exports = (req, res) => require('../lib/core').respond('aptfee', req, res);
