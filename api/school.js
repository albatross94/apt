// Vercel 서버리스 함수: GET /api/school?kind=meta|geo|schools|locate|complex|tongban|zones  (학교검색 탭 자료, 로그인 필요)
module.exports = (req, res) => require('../lib/core').respond('school', req, res);
