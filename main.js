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
const nodemailer = require('nodemailer');


const app = express();
const PORT = 3000;

// Load environment variables
dotenv.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

app.set("views", path.join(__dirname, "views"));
app.set('view engine', 'ejs')

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
        res.redirect('/login');
    });
});

// Now Showing Schema
const nowShowingSchema = new mongoose.Schema({
    Title: String,
    Synopsis: String,
    img: String,
    Date: String,
    Type: String,
    Time: String
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

// Edit Profile Route (Ensure you're sending EJS properly)
app.get('/edit_profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login?alert=not-logged-in');
    }

    User.findOne({ Email: req.session.user.Email })
      .then(user => {


        let formattedBirthdate = '';
          if (user.Birthdate) {
            const birthdate = new Date(user.Birthdate);
            const year = birthdate.getFullYear();
            const month = String(birthdate.getMonth() + 1).padStart(2, '0');
            const day = String(birthdate.getDate()).padStart(2, '0');
            formattedBirthdate = `${year}-${month}-${day}`;
          }

         

        if (user) {
          console.log(user);
          // แก้ไขบรรทัดนี้
          res.render('edit_profile', { post: { ...user.toObject(), Birthdate: formattedBirthdate } });
        } else {
          console.log('User not found');
          res.status(404).send('User not found');
        }
      })
      .catch(err => {
        console.error(err);
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


// Send Email
/* ---------- config สำหรับ gmail ---------- */
function sendmail(toemail, subject, html) {
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        service: 'gmail',  
        auth: {
            user: 'nitiporn.sir@gmail.com',   // your email
            //pass: 'Sittichai7749!'  // your email password
             pass: 'gfbb tphr nwyh riiw'    // for app password
        }
    });
    
    // send mail with defined transport object
    let mailOptions = {
        from: '"COSCI - Test mail" <coscidigital@gmail.com>',  // sender address
        to: toemail,    // list of receivers
        subject: subject,   // Subject line
        // text: textMail
        html: html     // html mail body
    };
  
    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.send('เกิดข้อผิดพลาด ไม่สามารถส่งอีเมลได้ โปรดลองใหม่ภายหลัง');
        }
        else {
            // console.log('INFO EMAIL:', info);
            console.log("send email successful");
        }
    });
  }

app.get("/forgot-password", function(request, response) {
    response.render("forgotpass.ejs", { message: ''});
});
  
app.post("/forgot-password", function(req, res) {
var user_buasri     = req.body.username;
console.log(user_buasri);

if (user_buasri) {
    User.findOne({ Username: user_buasri })
    .then(user => {

      if (user) {
        console.log(user);
        let randomPass = Math.random().toString(36).substring(2, 10);

        var emails = user.Email;
        var subject = "รหัสผ่านของคุณมีการเปลี่ยนแปลง";
        var html = "สวัสดี คุณ " + user.Username + "<br><br>" +
            "&nbsp;&nbsp;รหัสผ่านเว็บไซต์ NodeLoginX ของคุณมีการเปลี่ยนแปลงตามที่คุณร้องขอ<br>" + 
            "รหัสผ่านใหม่ของคุณ คือ &nbsp;" + randomPass + "<br>" +
            "ให้ใช้รหัสผ่านนี้ในการเข้าสู่ระบบ และคุณสามารถเปลี่ยนแปลงรหัสผ่านของคุณได้หลังจากเข้าสู่ระบบแล้ว" + "<br><br><br>ขอบคุณ<br>NodeLoginX";
        console.log('sendmail')
        sendmail(emails, subject, html);
        console.log(emails);

        // Update Password
        bcrypt.genSalt(10, function(err, salt) {
            bcrypt.hash(randomPass, salt, function(err, hash) {

                User.findOneAndUpdate(
                    { Email: user.Email }, // เงื่อนไขการค้นหา
                    {Password: hash}, // ข้อมูลที่จะอัปเดต
                    { new: true, runValidators: true } // ตัวเลือก: คืนค่าข้อมูลใหม่ และใช้การตรวจสอบตาม Schema
                )
                .then(updatedUser => {
                    if (updatedUser) {
                    
                        res.redirect("/login");
                    } else {
                        res.status(404).send('User not found');
                    }
                })
                .catch(err => {
                    console.error('Error updating user:', err);
                    res.status(500).send('Internal Server Error');
                });
           
            });
        });
      

      } else {
        console.log('User not found');
        res.status(404).send('User not found');
      }
    })
    .catch(err => {
      console.error(err);
      res.status(500).send('Internal Server Error');
    });
}
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
