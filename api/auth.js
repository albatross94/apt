// Vercel 서버리스 함수: /api/auth?kind=me|login|logout (공용 비밀번호 로그인)
// Hobby 요금제는 함수를 12개까지만 배포할 수 있어서 세 가지를 한 함수로 합쳤다.
module.exports = (req, res) => {
  const kind = new URL(req.url, 'http://localhost').searchParams.get('kind');
  if (!['me', 'login', 'logout'].includes(kind)) { res.statusCode = 404; return res.end('Not found'); }
  return require('../lib/auth').respond(kind, req, res);
};
