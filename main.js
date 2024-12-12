// Import necessary libraries
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { check, validationResult } = require('express-validator');
const router = express.Router();
const app = express();
const prisma = new PrismaClient();
const PORT = 3000;

// Load environment variables
dotenv.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Check database connection
async function checkDatabaseConnection() {
    try {
        await prisma.$connect();
        console.log("Connected to the database successfully");
    } catch (error) {
        console.error("Failed to connect to the database:", error);
        process.exit(1); // Exit the process if the database connection fails
    }
}

checkDatabaseConnection();

// Session middleware setup
app.use(session({
    secret: 'secretKey',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

// Google OAuth strategy setup
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await prisma.register.findUnique({
            where: { Email: profile.emails[0].value }, // Ensure 'register' matches your model
        });

        if (!user) {
            user = await prisma.register.create({
                data: {
                    Name: profile.displayName,
                    Surname: "",
                    Email: profile.emails[0].value,
                    Username: profile.id,
                    Password: null,
                    Sex: "Unknown",
                    Birthdate: null,
                    Phone: "Unknown"
                },
            });
        }

        return done(null, user);
    } catch (error) {
        return done(error);
    }
}));




passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.register.findUnique({ where: { id } });
        done(null, user);
    } catch (error) {
        done(error);
    }
});

// Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
    req.session.user = req.user;
    res.redirect('/Home');
});

// Routes
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/Login.html'));
    
});

app.get('/Register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/Register.html'));
});

app.get('/Home', (req, res) => {
    console.log("User Session:", req.session.user);  // Check user session
    if (!req.session.user) {
        return res.redirect('/login?alert=not-logged-in');
    }
    res.sendFile(path.join(__dirname, 'public/Home.html'));
});


// Register route
app.post('/Register', [
    check('Name').notEmpty().withMessage('Name is required'),
    check('Surname').notEmpty().withMessage('Surname is required'),
    check('Email').isEmail().withMessage('Invalid email address'),
    check('Phone')
        .isLength({ min: 10, max: 10 }).withMessage('Phone number must be exactly 10 digits')
        .isNumeric().withMessage('Phone number must contain only numbers'),
    check('Password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    check('Username').notEmpty().withMessage('Username is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const existingUser = await prisma.register.findFirst({
            where: {
                OR: [
                    { email: req.body.Email },
                    { username: req.body.Username }
                ],
            },
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Email or Username already exists.' });
        }

        const hashedPassword = await bcrypt.hash(req.body.Password, 10);

        await prisma.register.create({
            data: {
                name: req.body.Name,
                surname: req.body.Surname,
                sex: req.body.Sex,
                birthdate: req.body.Birthdate ? new Date(req.body.Birthdate) : null,
                email: req.body.Email,
                phone: req.body.Phone,
                username: req.body.Username,
                password: hashedPassword,
            },
        });

        res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'An error occurred while registering the user.' });
    }
});

// Login route
app.post('/Login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Find the user by Username
        const user = await prisma.register.findUnique({
            where: { Username: username }, // Match Prisma schema field "Username"
        });

        if (!user) {
            return res.redirect('/login?alert=invalid-username');
        }

        // Compare the provided password with the hashed Password in the database
        const isMatch = await bcrypt.compare(password, user.Password); // Match Prisma schema field "Password"

        if (!isMatch) {
            return res.redirect('/login?alert=invalid-password');
        }

        // Save the user in the session
        req.session.user = user;
        res.redirect('/Home');
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'An error occurred during login.' });
    }
});


app.get('/edit_profile', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login?alert=not-logged-in');
    }

    try {
        const user = await prisma.register.findUnique({
            where: { Email: req.session.user.Email }, // Match by email
        });

        if (!user) {
            return res.status(404).send('User not found');
        }

        res.render('edit_profile', { post: user });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).send('Internal Server Error');
    }
});



// Edit profile route with Prisma
app.post('/edit_profile', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login?alert=not-logged-in');
    }

    try {
        const { Birthdate, Password, ...otherFields } = req.body;
        const hashedPassword = Password ? await bcrypt.hash(Password, 10) : null;

        const updatedData = {
            ...otherFields,
            Birthdate: Birthdate ? new Date(Birthdate) : null,
            ...(hashedPassword && { Password: hashedPassword }),
        };

        const updatedUser = await prisma.register.update({
            where: { Email: req.session.user.Email },
            data: updatedData,
        });

        res.redirect('/Home');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).send('Internal Server Error');
    }
  });


// Fetch NowShowing data
app.get('/api/nowshowing', async (req, res) => {
    try {
        const movies = await prisma.nowShowing.findMany();
        res.json(movies);
    } catch (error) {
        console.error('Error fetching NowShowing data:', error);
        res.status(500).json({ message: 'Error fetching NowShowing data' });
    }
});

app.get('/movie-details/:title', async (req, res) => {
    try {
        const movie = await prisma.nowShowing.findUnique({
            where: {
                Title: req.params.title, // Assuming "Title" is the unique identifier
            },
        });

        if (!movie) {
            return res.status(404).send('Movie not found');
        }

        res.render('movie-details', { movie });
    } catch (error) {
        console.error("Error fetching movie details:", error);
        res.status(500).send('Internal Server Error');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error logging out:', err);
            return res.status(500).send('An error occurred during logout.');
        }
        res.redirect('/login');
    });
});


app.get('/get-discount', async (req, res) => {
 
    // if (!req.session.user) {
    //     return res.redirect('/login?alert=not-logged-in');
    // }

    try {
        const {code} = req.query 
        console.log('get-discount',code )
        const coupon = await prisma.coupon.findFirst({
            where: {
                coupon_code: code, // Assuming "Title" is the unique identifier
            },
        });
        console.log('coupon',coupon )
        if(coupon){
            return res.json(coupon);
        }

    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).send('Internal Server Error');
    }
  });




// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
