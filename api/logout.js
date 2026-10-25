// Vercel 서버리스 함수: /api/logout (공용 비밀번호 로그인)
module.exports = (req, res) => require('../lib/auth').respond('logout', req, res);
