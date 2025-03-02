// server.js
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'yoursecretkey';

app.post('/register-user', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json('Please fill in name, email, and password');
  }

  try {
    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    const [newUser] = await db('users')
      .insert({
        name: name.trim(),
        email: email.trim(),
        password: hashedPassword
      })
      .returning(['id', 'name', 'email']);

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    return res.json({ 
      user: { name: newUser.name, email: newUser.email },
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json('Error registering user');
  }
});

app.post('/login-user', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json('Please provide email and password');
  }

  try {
    const user = await db('users')
      .select('id', 'name', 'email', 'password')
      .where({ email: email.trim() })
      .first();

    if (!user) {
      return res.status(400).json('Email or password is incorrect');
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      return res.status(400).json('Email or password is incorrect');
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    return res.json({ 
      user: { name: user.name, email: user.email },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json('Error logging in');
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
