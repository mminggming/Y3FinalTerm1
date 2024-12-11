const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const dotenv = require('dotenv');
const { check, validationResult } = require('express-validator');
const router = express.Router();
const app = express();
const PORT = 3000;

// Load environment variables
dotenv.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

app.set('views', path.join(__dirname, 'views'));  // กำหนดโฟลเดอร์ที่เก็บไฟล์ EJS
app.set('view engine', 'ejs');  // ใช้ EJS เป็น view engine


// Session middleware setup
app.use(session({
    secret: 'secretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }  // Set secure: true if using HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

// MongoDB Connection
mongoose.connect('mongodb+srv://mminggming:mingming13@mmingg.dlq3d.mongodb.net/USERDATA')
.then(() => {
    console.log("Connected to MongoDB/USERDATA");
})
.catch(err => {
    console.error("MongoDB connection error:", err);
});

// User Schema (Google and local login support)
const userSchema = new mongoose.Schema({
    Name: String,
    Surname: String,
    Sex: String,
    Birthdate: Date,
    Email: { type: String, unique: true },
    Phone: String,
    Username: { type: String, unique: true },
    Password: String,  // Only used for local authentication
    googleId: String,  // Google ID for OAuth users
}, { collection: 'Register' });

const User = mongoose.model('User', userSchema);

// Google OAuth strategy setup
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/callback', // Adjust for production
  },
  async function(accessToken, refreshToken, profile, done) {
    let user = await User.findOne({ Email: profile.emails[0].value });

    if (!user) {
        user = new User({
            Name: profile.displayName,
            Email: profile.emails[0].value,
            Username: profile.id,  // Use Google ID as the username
        });

        await user.save();
    }

    return done(null, user);
  }
));

// Serialize and deserialize user
passport.serializeUser(function(user, done) {
  done(null, user._id);  // Store the user ID in the session
});

passport.deserializeUser(async function(id, done) {
  const user = await User.findById(id);  // Retrieve user from DB using ID
  done(null, user);
});

// Google login route
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    req.session.user = req.user;  // Store user data in session after login
    res.redirect('/Home');
  }
);

// Login Route (Support for both Google and local login)
app.post('/Login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Check if login is via Google OAuth
        const googleUser = await User.findOne({ googleId: username });
        if (googleUser) {
            req.session.user = googleUser;  // Store user data in session
            return res.redirect('/Home');
        }

        // Check for local login with username/password
        const user = await User.findOne({ Username: username });

        if (!user) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        const isMatch = await bcrypt.compare(password, user.Password);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        req.session.user = user;  // Store user data in session
        res.redirect('/Home');
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred during login.' });
    }
});

// Routes
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
    console.log("User Session:", req.session.user);  // Check user session
    if (!req.session.user) {
        return res.redirect('/Login?alert=not-logged-in');
    }
    res.sendFile(path.join(__dirname, 'public/Home.html'));
});

// Register Route
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
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const existingUser = await User.findOne({
            $or: [{ Email: req.body.Email }, { Username: req.body.Username }],
        });

        if (existingUser) {
            return res.status(400).json({ message: "Email or Username already exists." });
        }

        const hashedPassword = await bcrypt.hash(req.body.Password, 10);

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
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Error in logging out.' });
        }
        res.redirect('/Login');
    });
});

// // Now Showing Schema
// const nowShowingSchema = new mongoose.Schema({
//     Title: String,
//     Synopsis: String,
//     img: String,
//     Date: String,
//     Type: String,
//     Time: String
// }, { collection: 'NowShowing' });

// const NowShowing = mongoose.model('NowShowing', nowShowingSchema);

const nowShowingSchema = new mongoose.Schema({
    Title: String,
    Synopsis: String,
    img: String,
    Date: String,
    Type: String,
    Time: String,
    Rate: Number,  // Rating of the movie
    Video: String  // Trailer video URL
}, { collection: 'NowShowing' });

const NowShowing = mongoose.model('NowShowing', nowShowingSchema);

// Route to fetch movies from 'NowShowing'
app.get('/api/nowshowing', async (req, res) => {
    try {
        const movies = await NowShowing.find();
        res.json(movies);
    } catch (error) {
        console.error("Error fetching NowShowing data:", error);
        res.status(500).json({ message: 'Error fetching NowShowing data' });
    }
});

app.get('/movie-details/:title', async (req, res) => {
    try {
        const movie = await NowShowing.findOne({ Title: req.params.title });
        if (!movie) {
            return res.status(404).send('Movie not found');
        }
        res.render('movie-details', { movie });
    } catch (error) {
        console.error("Error fetching movie details:", error);
        res.status(500).send('Internal Server Error');
    }
});



// Edit Profile Route (Ensure you're sending EJS properly)
app.get('/edit_profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/Login?alert=not-logged-in');
    }
    res.sendFile(path.join(__dirname, 'public/EditProfile.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
