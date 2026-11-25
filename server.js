require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// مسار صحة الخادم الأساسي
app.get('/api/health', function (req, res) {
  res.json({ status: 'ok' });
});

// إعادة توجيه أي مسار لواجهة التطبيق المصغر
app.get('*', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, function () {
  console.log('Server running on port ' + PORT);
});
