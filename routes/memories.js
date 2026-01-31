const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Created uploads directory:', uploadDir);
}
console.log('Upload directory:', uploadDir);
console.log('Upload directory exists:', fs.existsSync(uploadDir));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Created upload directory:', uploadDir);
    }
    console.log('Multer destination called, uploadDir:', uploadDir);
    console.log('Upload dir exists:', fs.existsSync(uploadDir));
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'memory-' + uniqueSuffix + path.extname(file.originalname);
    console.log('Multer filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    // Only validate if it's a file field
    if (file.fieldname === 'photo') {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Только изображения разрешены!'));
      }
    } else {
      cb(null, true);
    }
  }
});

// Get all memories for user
router.get('/', authenticateToken, (req, res) => {
  console.log('GET /api/memories - User ID:', req.user.id);
  db.all(
    'SELECT * FROM memories WHERE user_id = ? ORDER BY date DESC, created_at DESC',
    [req.user.id],
    (err, memories) => {
      if (err) {
        console.error('Database error in memories:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      console.log('Memories found:', memories ? memories.length : 0);
      res.json(memories || []);
    }
  );
});

// Add memory
router.post('/add', authenticateToken, upload.single('photo'), (req, res) => {
  console.log('POST /api/memories/add - Raw body:', req.body);
  console.log('POST /api/memories/add - Body type:', typeof req.body);
  console.log('POST /api/memories/add - Body keys:', Object.keys(req.body || {}));
  console.log('POST /api/memories/add - File:', req.file);
  
  // Multer automatically parses multipart/form-data and puts text fields in req.body
  const text = (req.body && req.body.text) ? String(req.body.text).trim() : '';
  const date = (req.body && req.body.date) ? String(req.body.date).trim() : '';
  
  let photoPath = null;
  if (req.file) {
    // Verify file was actually saved
    const filePath = req.file.path;
    const fileExists = fs.existsSync(filePath);
    console.log('File saved to:', filePath);
    console.log('File exists:', fileExists);
    console.log('File size:', fileExists ? fs.statSync(filePath).size : 'N/A');
    
    if (fileExists) {
      photoPath = `/uploads/${req.file.filename}`;
      console.log('Photo path set to:', photoPath);
    } else {
      console.error('ERROR: File was not saved!');
    }
  }

  if (!text || !date) {
    console.error('Validation failed - text:', text, 'date:', date);
    // If validation fails and file was uploaded, delete it
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    }
    return res.status(400).json({ error: 'Text and date are required' });
  }

  db.run(
    'INSERT INTO memories (user_id, text, date, photo) VALUES (?, ?, ?, ?)',
    [req.user.id, text, date, photoPath],
    function(err) {
      if (err) {
        // If database error and file was uploaded, delete it
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(500).json({ error: 'Error adding memory' });
      }
      res.status(201).json({
        message: 'Memory added',
        memory: {
          id: this.lastID,
          text: text,
          date: date,
          photo: photoPath
        }
      });
    }
  );
});

// Update memory
router.put('/:id', authenticateToken, upload.single('photo'), (req, res) => {
  const memoryId = req.params.id;
  const text = (req.body && req.body.text) ? String(req.body.text).trim() : '';
  const date = (req.body && req.body.date) ? String(req.body.date).trim() : '';
  const deletePhoto = req.body.deletePhoto === 'true';
  
  if (!text || !date) {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    }
    return res.status(400).json({ error: 'Text and date are required' });
  }

  // First, get the current memory to check ownership and get old photo path
  db.get('SELECT * FROM memories WHERE id = ? AND user_id = ?', [memoryId, req.user.id], (err, memory) => {
    if (err) {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error('Error deleting file:', unlinkErr);
        }
      }
      return res.status(500).json({ error: 'Database error' });
    }

    if (!memory) {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error('Error deleting file:', unlinkErr);
        }
      }
      return res.status(404).json({ error: 'Memory not found' });
    }

    let photoPath = memory.photo;
    
    // Handle photo update
    if (req.file) {
      // Delete old photo if exists
      if (memory.photo) {
        const oldPhotoPath = path.join(__dirname, '../public', memory.photo);
        try {
          if (fs.existsSync(oldPhotoPath)) {
            fs.unlinkSync(oldPhotoPath);
          }
        } catch (unlinkErr) {
          console.error('Error deleting old photo:', unlinkErr);
        }
      }
      photoPath = `/uploads/${req.file.filename}`;
    } else if (deletePhoto && memory.photo) {
      // Delete photo if requested
      const oldPhotoPath = path.join(__dirname, '../public', memory.photo);
      try {
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      } catch (unlinkErr) {
        console.error('Error deleting photo:', unlinkErr);
      }
      photoPath = null;
    }

    // Update memory
    db.run(
      'UPDATE memories SET text = ?, date = ?, photo = ? WHERE id = ? AND user_id = ?',
      [text, date, photoPath, memoryId, req.user.id],
      function(err) {
        if (err) {
          if (req.file) {
            try {
              fs.unlinkSync(req.file.path);
            } catch (unlinkErr) {
              console.error('Error deleting file:', unlinkErr);
            }
          }
          return res.status(500).json({ error: 'Error updating memory' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Memory not found' });
        }

        res.json({
          message: 'Memory updated',
          memory: {
            id: memoryId,
            text: text,
            date: date,
            photo: photoPath
          }
        });
      }
    );
  });
});

// Delete memory
router.delete('/:id', authenticateToken, (req, res) => {
  const memoryId = req.params.id;

  // Get memory to check ownership and get photo path
  db.get('SELECT * FROM memories WHERE id = ? AND user_id = ?', [memoryId, req.user.id], (err, memory) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!memory) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    // Delete photo file if exists
    if (memory.photo) {
      const photoPath = path.join(__dirname, '../public', memory.photo);
      try {
        if (fs.existsSync(photoPath)) {
          fs.unlinkSync(photoPath);
        }
      } catch (unlinkErr) {
        console.error('Error deleting photo file:', unlinkErr);
      }
    }

    // Delete memory from database
    db.run('DELETE FROM memories WHERE id = ? AND user_id = ?', [memoryId, req.user.id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error deleting memory' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Memory not found' });
      }

      res.json({ message: 'Memory deleted successfully' });
    });
  });
});

module.exports = router;
