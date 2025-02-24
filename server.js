// server.js (Website)
var JavaScriptObfuscator = require('javascript-obfuscator');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser'); 
const knex = require('knex');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const db = knex({
    client: 'pg',
    connection: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    },
    pool: {
        min: 2,
        max: 10, // Adjust based on your Render plan limits
        acquireTimeoutMillis: 60000 // Wait up to 60s for a connection
      }
});

const app = express();

let initialPath = path.join(__dirname, 'public');

app.use(bodyParser.json());
app.use(express.static(initialPath));

app.get('/', (req, res) => {
    res.sendFile('./index.html');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(initialPath, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(initialPath, 'register.html'));
});

app.post('/register-user', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password || !name.trim().length || !email.trim().length || !password.trim().length) {
        return res.status(400).json('Fill in all fields');
    }

    try {
        // Trim the password and other inputs to avoid extra whitespace issues
        const trimmedPassword = password.trim();
        const hashedPassword = await bcrypt.hash(trimmedPassword, 10);

        db('users')
            .insert({
                name: name.trim(),
                email: email.trim(),
                password: hashedPassword
            })
            .returning(["name", "email", "password"])
            .then(data => {
                console.log('User registered:', data[0]);
                res.json({ name: data[0].name, email: data[0].email });
            })
            .catch(err => {
                console.error('Database error during registration:', err);
                const errorMessage = err.detail || err.message || 'Unknown error';
                res.status(500).json(errorMessage);
            });

    } catch (err) {
        console.error("Error processing registration:", err);
        res.status(500).json("Server error");
    }
});

app.post('/login-user', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('Received login data:', { email, password });

    if (!email || !password) {
        return res.status(400).json('Email and password are required');
    }

    try {
        // Trim the inputs to remove any accidental whitespace
        const trimmedEmail = email.trim();
        const trimmedPassword = password.trim();

        const user = await db.select('name', 'email', 'password')
            .from('users')
            .where({ email: trimmedEmail })
            .first();

        if (!user) {
            console.log('No user found for email:', trimmedEmail);
            return res.status(400).json('Email or password is incorrect');
        }

        console.log('Stored hashed password:', user.password);
        const isMatch = await bcrypt.compare(trimmedPassword, user.password);
        console.log('Password match:', isMatch);

        if (isMatch) {
            res.json({ name: user.name, email: user.email });
        } else {
            res.status(400).json('Email or password is incorrect');
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json('Server error');
    }
});

const PORT = 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
