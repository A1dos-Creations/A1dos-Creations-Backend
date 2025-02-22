// server.js (Website)
var JavaScriptObfuscator = require('javascript-obfuscator');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser'); 
const knex = require('knex');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
require('dotenv').config();
const encryptionKey = process.env.ENCRYPTION_KEY;
const algorithm = "aes-256-cbc";

// Encrypt function
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(encryptionKey), iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted; 
}

// Decrypt function
function decrypt(encryptedText) {
    const [ivHex, encryptedData] = encryptedText.split(":");
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(encryptionKey), Buffer.from(ivHex, "hex"));
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

const db = knex({
    client: 'pg',
    connection: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    }
});

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

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

    if (!name.length || !email.length || !password.length) {
        return res.json('Fill in all fields');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10); // Ensure we await the hash

        const encryptedName = encrypt(name);
        const encryptedEmail = encrypt(email);

        db('users')
            .insert({
                name: encryptedName,
                email: encryptedEmail,
                password: hashedPassword  // Ensure we store the hashed password
            })
            .returning(["name", "email"])
            .then(data => {
                res.json({
                    name: decrypt(data[0].name),
                    email: decrypt(data[0].email)
                });
            })
            .catch(err => {
                console.error('Database error:', err);
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

    if (!email || !password) {
        return res.status(400).json('Email and password are required');
    }

    try {
        // Fetch user from database
        const user = await db.select('name', 'email', 'password')
            .from('users')
            .where({ email: email })  // Make sure you're querying correctly
            .first();

        if (!user) {
            return res.status(400).json('Email or password is incorrect');
        }

        // Log the hashed password and comparison to verify what's happening
        console.log('Stored hashed password:', user.password);
        console.log('Password from user input:', password);

        const isMatch = await bcrypt.compare(password, user.password);  // Compare input password with stored hash

        if (isMatch) {
            res.json({ name: user.name, email: user.email });
        } else {
            return res.status(400).json('Email or password is incorrect');
        }
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json('Server error');
    }
});



const PORT = 3002;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
