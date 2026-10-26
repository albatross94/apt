// Vercel 서버리스 함수: GET /api/aptdetail?sgg=41115&dong=매교동&apt=매교역푸르지오SKVIEW  (공동주택 단지 상세정보: 세대수·주차대수·동 수 등)
module.exports = (req, res) => require('../lib/core').respond('aptdetail', req, res);
