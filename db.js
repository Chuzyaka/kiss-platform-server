const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'db.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initTables();
  }
});

function initTables() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    kisses INTEGER DEFAULT 100,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating users table:', err.message);
    } else {
      console.log('Users table ready');
    }
  });

  // Transactions table
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating transactions table:', err.message);
    } else {
      console.log('Transactions table ready');
    }
  });

  // Products table
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating products table:', err.message);
    } else {
      console.log('Products table ready');
      initDefaultProducts();
    }
  });

  // Memories table
  db.run(`CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    date TEXT NOT NULL,
    photo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`, (err) => {
    if (err) {
      console.error('Error creating memories table:', err.message);
    } else {
      console.log('Memories table ready');
      // Add photo column if it doesn't exist (for existing databases)
      db.run(`ALTER TABLE memories ADD COLUMN photo TEXT`, (alterErr) => {
        if (alterErr && !alterErr.message.includes('duplicate column')) {
          console.error('Error adding photo column:', alterErr.message);
        }
      });
    }
  });
}

function initDefaultProducts() {
  db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
    if (err) {
      console.error('Error checking products:', err.message);
      return;
    }
    if (row.count === 0) {
      const defaultProducts = [
        { name: 'Романтический ужин', description: 'Ужин при свечах', price: 50 },
        { name: 'Прогулка в парке', description: 'Совместная прогулка', price: 30 },
        { name: 'Подарок-сюрприз', description: 'Небольшой подарок', price: 100 },
        { name: 'Кино вечер', description: 'Просмотр фильма вместе', price: 40 },
        { name: 'Завтрак в постель', description: 'Вкусный завтрак', price: 60 }
      ];
      
      const stmt = db.prepare('INSERT INTO products (name, description, price) VALUES (?, ?, ?)');
      defaultProducts.forEach(product => {
        stmt.run(product.name, product.description, product.price);
      });
      stmt.finalize();
      console.log('Default products created');
    }
  });
}

module.exports = db;
