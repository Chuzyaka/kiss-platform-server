const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  if (req.path.startsWith('/uploads/')) {
    const fs = require('fs');
    const filePath = path.join(__dirname, '../public', req.path);
    console.log('Requested file path:', filePath);
    console.log('File exists:', fs.existsSync(filePath));
  }
  next();
});

// API Routes (must be before static files)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/balance', require('./routes/balance'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/memories', require('./routes/memories'));

// Static files (must be after API routes)
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve uploaded files with explicit path
const uploadsPath = path.join(__dirname, 'public/uploads');
console.log('Uploads path:', uploadsPath);
console.log('Uploads path exists:', require('fs').existsSync(uploadsPath));

app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    // Set proper content type for images
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    }
  }
}));

// Debug route to check uploads
app.get('/debug/uploads', (req, res) => {
  const fs = require('fs');
  try {
    if (!fs.existsSync(uploadsPath)) {
      return res.json({ error: 'Uploads directory does not exist', uploadsPath });
    }
    const files = fs.readdirSync(uploadsPath).map(file => {
      const filePath = path.join(uploadsPath, file);
      return {
        name: file,
        path: filePath,
        exists: fs.existsSync(filePath),
        size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
      };
    });
    res.json({ uploadsPath, files, directoryExists: true });
  } catch (error) {
    res.json({ error: error.message, uploadsPath });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
