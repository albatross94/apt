// Vercel 서버리스 함수: GET /api/kinder  (유치원 탭 자료, 로그인 필요) — data/kinder/kinder.json 을 그대로 돌려준다
module.exports = (req, res) => require('../lib/core').respond('kinder', req, res);
