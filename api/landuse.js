// Vercel 서버리스 함수: GET /api/landuse?addr=경기도 수원시 팔달구 매교동 300  (V-World 토지이용계획: 용도지역·지구·구역 목록)
module.exports = (req, res) => require('../lib/core').respond('landuse', req, res);
