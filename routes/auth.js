const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

// Register
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      return res.status(500).json({ error: 'Error hashing password' });
    }

    db.run(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hash],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already exists' });
          }
          return res.status(500).json({ error: 'Error creating user' });
        }

        const token = jwt.sign(
          { id: this.lastID, email: email },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        res.status(201).json({
          message: 'User created successfully',
          token: token,
          user: {
            id: this.lastID,
            name: name,
            email: email
          }
        });
      }
    );
  });
});

// Get all users (for selecting user to manage) - must be before /login to avoid conflicts
router.get('/users', authenticateToken, (req, res) => {
  console.log('GET /api/auth/users - User ID:', req.user.id);
  db.all('SELECT id, name, email, kisses FROM users ORDER BY name', (err, users) => {
    if (err) {
      console.error('Database error in /users:', err);
      return res.status(500).json({ error: 'Database error', details: err.message });
    }
    console.log('Users found:', users ? users.length : 0);
    if (users && users.length > 0) {
      console.log('Users:', users.map(u => `${u.name} (${u.email})`).join(', '));
    }
    res.json(users || []);
  });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    bcrypt.compare(password, user.password, (err, match) => {
      if (err) {
        return res.status(500).json({ error: 'Error comparing passwords' });
      }

      if (!match) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        message: 'Login successful',
        token: token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          kisses: user.kisses,
          level: user.level,
          xp: user.xp
        }
      });
    });
  });
});

module.exports = router;
