const express = require('express');
const cors = require('cors');
const app = express();

const FRONTEND = 'https://git-coni.github.io';

app.use(cors({ origin: FRONTEND }));

app.get('/api/test', (req, res) => {
  res.json({ msg: 'API 호출 성공!', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API 서버 실행 중 → http://localhost:${PORT}`));

