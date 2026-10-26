// Vercel 서버리스 함수: GET /api/config (카카오맵 JavaScript 키)
module.exports = (req, res) => require('../lib/core').respond('config', req, res);
