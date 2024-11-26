const express = require('express');
const app = express();
const PORT = 6000;
// ให้บริการไฟล์ static จากโฟลเดอร์ public
app.use(express.static('public'));

// รวม routes จากไฟล์1.js
const app1 = require('./ForgotPass');
app.use(app1);

// รวม routes จากไฟล์2.js
const app2 = require('./Login');
app.use(app2);

const app3 = require('./Register');
app.use(app3);

// เรียก app.listen เพียงครั้งเดียว
app.listen(6000, () => {
    console.log('Server is running on port 6000');
});
