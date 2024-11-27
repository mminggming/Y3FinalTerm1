
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const app = express();
module.exports = app;


// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect('mongodb+srv://mminggming:mingming13@mmingg.dlq3d.mongodb.net/?retryWrites=true&w=majority&appName=mmingg', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("Connected to MongoDB");
}).catch(err => {
  console.error("MongoDB connection error:", err);
});

// Define a schema and model
const userSchema = new mongoose.Schema({
  Name: String,
  Surname: String,
  Sex: String,
  Birthdate: Date,
  Email: String,
  Phone: String,
  Username: String,
  Password: String,
});

const User = mongoose.model('User', userSchema);

// Handle registration
app.post('/Register', async (req, res) => {
  try {
    // Create a new user document
    const newUser = new User({
      Name: req.body.Name,
      Surname: req.body.Surname,
      Sex: req.body.Sex,
      Birthdate: req.body.Birthdate,
      Email: req.body.Email,
      Phone: req.body.Phone,
      Username: req.body.Username,
      Password: req.body.Password,
    });

    // Save to MongoDB
    await newUser.save();
    res.status(201).send("User registered successfully!");
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).send("An error occurred while registering the user.");
  }
});
