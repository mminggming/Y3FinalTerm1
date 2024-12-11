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
        let user = await prisma.user.findUnique({
            where: { Email: profile.emails[0].value },
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    Name: profile.displayName,          // Set Name from the profile
                    Surname: "",                        // Optional: Set a default Surname
                    Email: profile.emails[0].value,     // Email from the profile
                    Username: profile.id,               // Use Google ID as Username
                    Password: null,                     // Set Password to null for OAuth users
                    Sex: "Unknown",                          // Optional: Default Sex to null
                    Birthdate: null,                    // Optional: Default Birthdate to null
                    Phone: "Unknown"                         // Optional: Default Phone to null
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
        const user = await prisma.user.findUnique({ where: { id } });
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
        const existingUser = await prisma.user.findFirst({
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

        await prisma.user.create({
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
            return res.status(400).json({ message: 'Invalid username' });
        }

        // Compare the provided password with the hashed Password in the database
        const isMatch = await bcrypt.compare(password, user.Password); // Match Prisma schema field "Password"

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid password' });
        }

        // Save the user in the session
        req.session.user = user;
        res.redirect('/Home');
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'An error occurred during login.' });
    }
});


// Edit profile route
app.post('/edit_profile', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login?alert=not-logged-in');
    }

    try {
        const { Birthdate, Password, ...otherFields } = req.body;
        const hashedPassword = Password ? await bcrypt.hash(Password, 10) : undefined;

        const updatedData = {
            ...otherFields,
            birthdate: Birthdate ? new Date(Birthdate) : null,
            ...(Password && { password: hashedPassword }),
        };

        const updatedUser = await prisma.user.update({
            where: { email: req.session.user.email },
            data: updatedData,
        });

        if (!updatedUser) {
            return res.status(404).send('User not found');
        }

        res.redirect('/Home');
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).send('Internal Server Error');
      });
});


app.post('/edit_profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login?alert=not-logged-in');
    }


    // แปลง Birthdate เป็นวันที่ (ถ้ามี)
    let formattedBirthdate = null;
    const {Birthdate, Password} = req.body
    if (Birthdate) {
        formattedBirthdate = new Date(Birthdate);
    }

    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(Password, salt, (err, hash) => {
            let updatedData = Object.fromEntries(
                Object.entries({
                    ...req.body,
                    Birthdate: formattedBirthdate,
                }).filter(([key]) => key !== 'Password')
            );
            

            if(Password){
                 updatedData = {
                    ...req.body,
                    Birthdate: formattedBirthdate,
                    Password: hash 
                };
            } 
       
        // ใช้ findOneAndUpdate เพื่ออัปเดตข้อมูล
        User.findOneAndUpdate(
            { Email: req.session.user.Email }, // เงื่อนไขการค้นหา
            updatedData, // ข้อมูลที่จะอัปเดต
            { new: true, runValidators: true } // ตัวเลือก: คืนค่าข้อมูลใหม่ และใช้การตรวจสอบตาม Schema
        )
        .then(updatedUser => {
            if (updatedUser) {
            
                res.redirect('/home');
            } else {
                res.status(404).send('User not found');
            }
        })
        .catch(err => {
            console.error('Error updating user:', err);
            res.status(500).send('Internal Server Error');
        });
            })
        })
   


});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
