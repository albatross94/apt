// Vercel 서버리스 함수: GET /api/trades?lawd=41115&ym=202509  (한 달 단위, 여러 달은 화면이 나눠서 요청)
module.exports = (req, res) => require('../lib/core').respond('trades', req, res);
