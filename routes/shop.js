const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get all products
router.get('/', authenticateToken, (req, res) => {
  console.log('GET /api/shop - User ID:', req.user.id);
  db.all('SELECT * FROM products ORDER BY price ASC', (err, products) => {
    if (err) {
      console.error('Database error in shop:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    console.log('Products found:', products ? products.length : 0);
    res.json(products || []);
  });
});

// Add product (admin function)
router.post('/add', authenticateToken, (req, res) => {
  const { name, description, price } = req.body;

  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }

  if (typeof price !== 'number' || price <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' });
  }

  db.run(
    'INSERT INTO products (name, description, price) VALUES (?, ?, ?)',
    [name, description || '', price],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error adding product' });
      }
      res.status(201).json({
        message: 'Product added',
        product: {
          id: this.lastID,
          name: name,
          description: description || '',
          price: price
        }
      });
    }
  );
});

// Buy product
router.post('/buy', authenticateToken, (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  // Get product
  db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get user balance
    db.get('SELECT kisses FROM users WHERE id = ?', [req.user.id], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.kisses < product.price) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      const newBalance = user.kisses - product.price;

      // Update balance
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
            [req.user.id, 'debit', product.price, `Purchase: ${product.name}`],
            (err) => {
              if (err) {
                console.error('Error recording transaction:', err);
              }
            }
          );

          res.json({
            message: 'Product purchased successfully',
            kisses: newBalance,
            product: product
          });
        }
      );
    });
  });
});

// Delete product (must be after /buy route)
router.delete('/:id', authenticateToken, (req, res) => {
  const productId = req.params.id;

  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  db.run('DELETE FROM products WHERE id = ?', [productId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Error deleting product' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({
      message: 'Product deleted successfully'
    });
  });
});

module.exports = router;
