// Vercel 서버리스 함수: GET /api/geocode?addr=경기도 수원시 팔달구 매교동 123  (V-World 지오코더, 위경도 반환)
module.exports = (req, res) => require('../lib/core').respond('geocode', req, res);
