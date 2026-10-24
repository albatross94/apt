// Vercel 서버리스 함수: GET /api/gongsi/units?pnu=...&year=2026  (동·호별 공시가격)
module.exports = (req, res) => require('../../lib/core').respond('gongsi/units', req, res);
