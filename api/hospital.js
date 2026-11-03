// Vercel 서버리스 함수: GET /api/hospital?lawd=41115&cl=31&dgsbjt=01&name=연세  (cl·dgsbjt·name은 선택)
module.exports = (req, res) => require('../lib/core').respond('hospital', req, res);
