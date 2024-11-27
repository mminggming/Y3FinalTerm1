const express = require('express');
const path = require('path'); // To work with file paths
const app = express();
const PORT = 3000;

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Redirect root URL ('/') to the login page
app.get('/', (req, res) => {
    res.redirect('/Login'); // Redirects to the login route
});

// Define routes for specific pages
app.get('/Login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/Login.html'));
});

app.get('/Register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/Register.html'));
});

app.get('/Home', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/Home.html'));
});

// Include routes from external files
const app1 = require('./ForgotPass');
app.use('/ForgotPass', app1);

const app2 = require('./Login');
app.use('/Login', app2);

const app3 = require('./Register');
app.use('/Register', app3);

const app4 = require('./Webcounter');
app.use('/Webcounter', app4);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
