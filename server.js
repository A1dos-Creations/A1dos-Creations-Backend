// server.js (Website)
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser'); 
const knex = require('knex');
const { Pool } = require('pg');

const db = knex({
    client: 'pg',
    connection: {
        host: '127.0.0.1',
        user: 'postgres',
        password: 'A1dos-C25*',
        database: 'login'
    }
});

const app = express();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL // or your connection string for the 'login' DB
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

app.post('/register-user', (req, res) => {
    const { name, email, password } = req.body;

    if (!name.length || !email.length || !password.length) {
        res.json('Fill in all fields');
    } else {
        db('users').insert({
            name: name,
            email: email,
            password: password
        })
        .returning(["name", "email"])
        .then(data => {
            res.json(data[0]);
        })
        .catch(err => {
            console.error('Database error:', err);
            const errorMessage = err.detail || err.message || 'Unknown error';
            res.status(500).json(errorMessage);
        });
    }
});

app.post('/login-user', (req, res) => {
    const { email, password } = req.body;

    db.select('name', 'email')
    .from('users')
    .where({
        email: email,
        password: password
    })
    .then(data => {
        if (data.length) {
            res.json(data[0]);
        } else {
            res.json('email or password is incorrect');
        }
    })
    .catch(err => {
        console.error('Login error:', err);
        res.status(500).json('Server error');
    });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
