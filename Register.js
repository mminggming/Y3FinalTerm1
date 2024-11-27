const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { check, validationResult } = require('express-validator');
const app = express();

module.exports = app;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect('mongodb+srv://mminggming:mingming13@mmingg.dlq3d.mongodb.net/')
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch(err => {
    console.error("MongoDB connection error:", err);
  });

// Define a schema and model
const userSchema = new mongoose.Schema({
    Name: { type: String, required: true },
    Surname: { type: String, required: true },
    Sex: { type: String, required: true },
    Birthdate: { type: Date, required: true },
    Email: { type: String, required: true, unique: true },
    Phone: { type: String, required: true },
    Username: { type: String, required: true, unique: true },
    Password: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);


app.post('/Register',
    [
        // Validation middleware
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

