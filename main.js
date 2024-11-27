const express = require('express');
const path = require('path'); // To work with file paths
const bodyParser = require('body-parser'); // To parse request bodies
const mongoose = require('mongoose'); // MongoDB integration
const bcrypt = require('bcrypt');
const { check, validationResult } = require('express-validator'); // Validation
const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

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

const app3 = require('./Register'); // Dynamic logic for registration
app.use('/api/Register', app3); // Use '/api/Register' for dynamic registration logic

const app4 = require('./Webcounter');
app.use('/Webcounter', app4);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Connect to MongoDB
mongoose.connect('mongodb+srv://mminggming:mingming13@mmingg.dlq3d.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("Connected to MongoDB");
}).catch(err => {
    console.error("MongoDB connection error:", err);
});

// Define User schema and model (avoid overwriting)
const userSchema = new mongoose.Schema({
    Name: String,
    Surname: String,
    Sex: String,
    Birthdate: Date,
    Email: { type: String, unique: true },
    Phone: String,
    Username: { type: String, unique: true },
    Password: String,
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

// Handle registration route with validation
app.post('/Register',
    [
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
        // Handle validation errors
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

            // Handle potential MongoDB validation errors (e.g., unique constraint violations)
            if (error.code === 11000) {
                return res.status(400).json({ message: "Email or Username already exists." });
            } else {
                return res.status(500).json({ message: "An error occurred while registering the user." });
            }
        }
    }
);
