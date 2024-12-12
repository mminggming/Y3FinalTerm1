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
const crypto = require('crypto');
const argon2 = require('argon2');

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
    res.render('login', {message: ""}); 
});

app.get('/forgot-password', (req, res) => {
    res.render('forgotpass', {message: ""}); 
});

app.get('/Register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/Register.html'));
});

app.get('/Home', (req, res) => {
    console.log("User Session:", req.session.user);  // Check user session
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public/Home.html'));
});

// Register route
const zxcvbn = require('zxcvbn');

app.post('/Register', [
    check('Name').notEmpty().withMessage('Name is required'),
    check('Surname').notEmpty().withMessage('Surname is required'),
    check('Email').isEmail().withMessage('Invalid email address'),
    check('Phone')
        .isLength({ min: 10, max: 10 }).withMessage('Phone number must be exactly 10 digits')
        .isNumeric().withMessage('Phone number must contain only numbers'),
    check('Password').notEmpty().withMessage('Password is required'),
    check('Username').notEmpty().withMessage('Username is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { Name, Surname, Email, Phone, Password, Username, Sex, Birthdate } = req.body;

        // Check if email or username already exists
        const existingUser = await prisma.register.findFirst({
            where: {
                OR: [
                    { Email: Email },
                    { Username: Username }
                ],
            },
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Email or Username already exists.' });
        }

        // Use zxcvbn to check password strength
        const passwordStrength = zxcvbn(Password);

        if (passwordStrength.score < 3) { // Score ranges from 0 to 4 (0 = weak, 4 = strong)
            return res.status(400).json({
                message: 'Password is too weak.',
                suggestions: passwordStrength.feedback.suggestions, // Provide suggestions to the user
            });
        }

        // Hash the password using Argon2
        const hashedPassword = await argon2.hash(Password);

        // Create the user in the database
        await prisma.register.create({
            data: {
                Name: Name,
                Surname: Surname,
                Sex: Sex || "Unknown",
                Birthdate: Birthdate ? new Date(Birthdate) : null,
                Email: Email,
                Phone: Phone,
                Username: Username,
                Password: hashedPassword,
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
        const user = await prisma.register.findUnique({
            where: { Username: username },
        });

        if (!user) {
            return res.render("login", {
                message: "Invalid username or password. Please register if you haven't."
            });
        }

        const isMatch = await argon2.verify(user.Password, password);

        if (!isMatch) {
            return res.render("login", {
                message: "Invalid username or password."
            });
        }

        req.session.user = user;
        res.redirect('/Home');
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'An error occurred during login.' });
    }
});

app.get('/edit_profile', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/Login');
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
// Edit profile route with Prisma
app.post('/edit_profile', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        const { Password, Birthdate, ...otherFields } = req.body;

        let updatedData = {
            ...otherFields,
            Birthdate: Birthdate ? new Date(Birthdate) : null, // Handle empty or invalid Birthdate
        };

        // If a new password is provided, hash it before updating
        if (Password && Password.trim() !== '') {
            const hashedPassword = await argon2.hash(Password);
            updatedData.Password = hashedPassword;
        }

        // Update user data in the database
        const updatedUser = await prisma.register.update({
            where: { Email: req.session.user.Email },
            data: updatedData,
        });

        // Update the session with the new user data
        req.session.user = updatedUser;

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

const nodemailer = require('nodemailer');

// Forgot password route
app.post('/forgot-password', async (req, res) => {
    const { username } = req.body;

    try {
        if (!username) {
            return res.status(400).json({ message: 'Username is required.' });
        }

        const user = await prisma.register.findUnique({
            where: { Username: username },
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const email = user.Email;

        const temporaryPassword = crypto.randomBytes(4).toString('hex');
        const hashedPassword = await argon2.hash(temporaryPassword);

        await prisma.register.update({
            where: { Username: username },
            data: { Password: hashedPassword },
        });

        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your New Temporary Password',
            html: `<p>Your new temporary password is:</p>
                   <p><strong>${temporaryPassword}</strong></p>
                   <p>Please log in and change your password immediately.</p>`,
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: 'A new temporary password has been sent to your email.' });
    } catch (error) {
        console.error('Error in forgot password route:', error);
        res.status(500).json({ message: 'An error occurred.' });
    }
});

app.get('/get-discount', async (req, res) => {
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

  app.get('/api/get-booking-history', async (req, res) => {
    try {
        const userId = req.session.userId; // สมมติว่ามี session เก็บ userId
        const bookings = await BookingCollection.find({ userId }).toArray(); // ดึงข้อมูลจาก MongoDB
        res.json(bookings);
    } catch (error) {
        console.error('Error fetching booking history:', error);
        res.status(500).json({ error: 'Failed to fetch booking history' });
    }
});

app.post('/send-receipt', async (req, res) => {
    const userId = req.session.user.id; // Assuming `id` is stored in the session after login

    try {
        // Fetch user email from the database using the user ID
        const user = await prisma.register.findUnique({
            where: { id: userId }, // Adjust based on your schema
            select: { Email: true }, // Fetch only the email field
        });

        if (!user || !user.Email) {
            return res.status(404).json({ message: 'User email not found.' });
        }

        const { Email } = user; // Extract email
        const { movie, time, location, theater, seats, totalPrice } = req.body;

        // Configure nodemailer transporter
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // Email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: Email,
            subject: 'Booking Receipt',
            html: `
                <h2>Booking Summary</h2>
                <p><strong>Movie:</strong> ${movie}</p>
                <p><strong>Time:</strong> ${time}</p>
                <p><strong>Location:</strong> ${location}</p>
                <p><strong>Theater:</strong> ${theater}</p>
                <p><strong>Seats:</strong> ${seats.join(', ')}</p>
                <p><strong>Total Price:</strong> ${totalPrice} THB</p>
                <p>Thank you for booking with us!</p>
            `,
        };

        // Send the email
        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: 'Receipt sent successfully!' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ message: 'Failed to send receipt email.' });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
