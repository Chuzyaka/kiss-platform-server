const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get balance
router.get('/', authenticateToken, (req, res) => {
  db.get(
    'SELECT kisses, level, xp FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({
        kisses: user.kisses,
        level: user.level,
        xp: user.xp
      });
    }
  );
});

// Change balance
router.post('/change', authenticateToken, (req, res) => {
  const { amount, description } = req.body;

  if (typeof amount !== 'number') {
    return res.status(400).json({ error: 'Amount must be a number' });
  }

  db.get('SELECT kisses FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newBalance = user.kisses + amount;
    if (newBalance < 0) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    db.run(
      'UPDATE users SET kisses = ? WHERE id = ?',
      [newBalance, req.user.id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Error updating balance' });
        }

        // Record transaction
        db.run(
          'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
          [req.user.id, amount > 0 ? 'credit' : 'debit', Math.abs(amount), description || 'Balance change'],
          (err) => {
            if (err) {
              console.error('Error recording transaction:', err);
            }
          }
        );

        res.json({
          message: 'Balance updated',
          kisses: newBalance
        });
      }
    );
  });
});

// Change balance for another user
router.post('/change-other', authenticateToken, (req, res) => {
  const { userId, amount, description } = req.body;

  if (!userId || typeof amount !== 'number') {
    return res.status(400).json({ error: 'User ID and amount are required' });
  }

  // Get target user
  db.get('SELECT id, name, kisses FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newBalance = user.kisses + amount;
    if (newBalance < 0) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    db.run(
      'UPDATE users SET kisses = ? WHERE id = ?',
      [newBalance, userId],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Error updating balance' });
        }

        // Record transaction
        const transactionDesc = description || 
          (amount > 0 ? `Received from user ${req.user.id}` : `Deducted by user ${req.user.id}`);
        
        db.run(
          'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
          [userId, amount > 0 ? 'credit' : 'debit', Math.abs(amount), transactionDesc],
          (err) => {
            if (err) {
              console.error('Error recording transaction:', err);
            }
          }
        );

        res.json({
          message: 'Balance updated',
          user: {
            id: user.id,
            name: user.name,
            kisses: newBalance
          }
        });
      }
    );
  });
});

module.exports = router;
