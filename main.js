const express = require('express');
const path = require('path'); // To work with file paths
const bodyParser = require('body-parser'); // To parse request bodies
const mongoose = require('mongoose'); // MongoDB integration
const bcrypt = require('bcrypt');
const session = require('express-session'); // Session handling
const { check, validationResult } = require('express-validator'); // Validation
const app = express();
const PORT = 3000;


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));


app.use(session({
    secret: 'secretKey', 
    resave: false,
    saveUninitialized: true,
}));

app.get('/', (req, res) => {
    res.redirect('/Login'); 
});


app.get('/Login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/Login.html'));
});

app.get('/Register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/Register.html'));
});

app.get('/Home', (req, res) => {
    console.log("User Session:", req.session.user); // Debugging line
    if (!req.session.user) {
        return res.redirect('/Login?alert=not-logged-in');
    }
    res.sendFile(path.join(__dirname, 'public/Home.html'));
});



const app1 = require('./ForgotPass');
app.use('/ForgotPass', app1);

const app2 = require('./Login');
app.use('/Login', app2);

const app3 = require('./Register'); 
app.use('/api/Register', app3);

const app4 = require('./Webcounter');
app.use('/Webcounter', app4);


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

//MongoDB
mongoose.connect('mongodb+srv://mminggming:mingming13@mmingg.dlq3d.mongodb.net/USERDATA')
.then(() => {
    console.log("Connected to MongoDB/USERDATA");
})
.catch(err => {
    console.error("MongoDB connection error:", err);
});

const userSchema = new mongoose.Schema({
    Name: String,
    Surname: String,
    Sex: String,
    Birthdate: Date,
    Email: { type: String, unique: true },
    Phone: String,
    Username: { type: String, unique: true },
    Password: String,
}, { collection: 'Register' });

const User = mongoose.models.User || mongoose.model('User', userSchema);


app.post('/Register', [

        check('Name').notEmpty().withMessage('Name is required'),
        check('Surname').notEmpty().withMessage('Surname is required'),
        check('Email').isEmail().withMessage('Invalid email address'),
        check('Phone')
            .isLength({ min: 10, max: 10 })
            .withMessage('Phone number must be exactly 10 digits')
            .isNumeric()
            .withMessage('Phone number must contain only numbers'),
        check('Password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters'),
        check('Username')
            .notEmpty()
            .withMessage('Username is required')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            // Check for existing email or username
            const existingUser = await User.findOne({
                $or: [{ Email: req.body.Email }, { Username: req.body.Username }],
            });

            if (existingUser) {
                return res.status(400).json({ message: "Email or Username already exists." });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(req.body.Password, 10);

            // Create a new user
            const newUser = new User({
                Name: req.body.Name,
                Surname: req.body.Surname,
                Sex: req.body.Sex,
                Birthdate: req.body.Birthdate,
                Email: req.body.Email,
                Phone: req.body.Phone,
                Username: req.body.Username,
                Password: hashedPassword,
            });

            // Save the user to the database
            await newUser.save();
            res.status(201).json({ message: "User registered successfully!" });
        } catch (error) {
            console.error("Error details:", error);

            if (error.code === 11000) {
                return res.status(400).json({ message: "Email or Username already exists." });
            } else {
                return res.status(500).json({ message: "An error occurred while registering the user." });
            }
        }
    }
);

app.post('/Login', async (req, res) => {
    const { username, password } = req.body;

    try {

        const user = await User.findOne({ Username: username });

        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        const isMatch = await bcrypt.compare(password, user.Password);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        req.session.user = user;

        res.redirect('/Home');
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred during login.' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Error in logging out.' });
        }
        res.redirect('/Login');
    });
});

const nowShowingSchema = new mongoose.Schema({
    Title: String,
    Synopsis: String,
    img: String, 
    Date: String,
}, { collection: 'NowShowing' });

const NowShowing = mongoose.models.NowShowing || mongoose.model('NowShowing', nowShowingSchema);

// Route to fetch movies from the 'NowShowing' collection
app.get('/api/nowshowing', async (req, res) => {
    try {
        const movies = await NowShowing.find(); // Fetch all movies
        res.json(movies); // Send the data as JSON
    } catch (error) {
        console.error("Error fetching NowShowing data:", error);
        res.status(500).json({ message: 'Error fetching NowShowing data' });
    }
});


app.get('/edit_profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'EditProfile.ejs'));
});