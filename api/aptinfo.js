// Vercel 서버리스 함수: GET /api/aptinfo?addr=경기도 수원시 팔달구 매교동 300  (공시가격 동·호 자료로 센 총 세대수·동 수·전용면적별 세대수)
module.exports = (req, res) => require('../lib/core').respond('aptinfo', req, res);
