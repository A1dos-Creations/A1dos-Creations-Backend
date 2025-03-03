require('dotenv').config();
const cors = require('cors');
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

app.use(cors({
    origin: ['chrome-extension://bilnakhjjjkhhhdlcajijkodkhmanfbg', 'https://a1dos-login.onrender.com', 'https://a1dos-creations.com', 'chrome-extension://pafdkffolelojifgeepmjjofdendeojf'],
    credentials: true
  }));

const JWT_SECRET = process.env.JWT_SECRET;

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
      { expiresIn: '2d' }
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

app.post('/verify-token', (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ valid: false, message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true, user: decoded });
  } catch (err) {
    return res.status(401).json({ valid: false, message: 'Invalid or expired token' });
  }
});

app.post('/tasks', authenticateUser, async (req, res) => {
    const { name, description, dueDate, completed } = req.body;
  
    if (!name || !dueDate) return res.status(400).json({ message: "Task name and due date required" });
  
    try {
      const [task] = await db('tasks').insert({
        user_id: req.user.id,
        name,
        description,
        due_date: dueDate,
        completed,
        synced: true
      }).returning('*');
  
      res.json(task);
    } catch (error) {
      console.error("Task creation error:", error);
      res.status(500).json({ message: "Error saving task" });
    }
  });
  
  app.get('/tasks', authenticateUser, async (req, res) => {
    try {
      const tasks = await db('tasks').where({ user_id: req.user.id });
      res.json(tasks);
    } catch (error) {
      console.error("Task fetch error:", error);
      res.status(500).json({ message: "Error retrieving tasks" });
    }
  });
  
  app.delete('/tasks/:id', authenticateUser, async (req, res) => {
    try {
      await db('tasks').where({ id: req.params.id, user_id: req.user.id }).del();
      res.json({ message: "Task deleted" });
    } catch (error) {
      console.error("Task delete error:", error);
      res.status(500).json({ message: "Error deleting task" });
    }
  });
  
  app.patch('/tasks/:id', authenticateUser, async (req, res) => {
    try {
      await db('tasks').where({ id: req.params.id, user_id: req.user.id }).update({ completed: req.body.completed });
      res.json({ message: "Task updated" });
    } catch (error) {
      console.error("Task update error:", error);
      res.status(500).json({ message: "Error updating task" });
    }
  });

  app.post('/sync-tasks', authenticateUser, async (req, res) => {
    const { tasks } = req.body;
  
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ message: "No tasks to sync" });
    }
  
    try {
      const insertedTasks = await db('tasks')
        .insert(tasks.map(task => ({
          user_id: req.user.id,
          name: task.name,
          description: task.description,
          due_date: task.dueDate,
          completed: task.completed,
          synced: true
        })))
        .returning('*');
  
      res.json({ message: "Tasks synced", tasks: insertedTasks });
    } catch (error) {
      console.error("Sync tasks error:", error);
      res.status(500).json({ message: "Error syncing tasks" });
    }
  });
  

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
