const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Terlalu banyak permintaan dari IP ini, coba lagi nanti.'
});
app.use('/api/', limiter);

// File upload setup
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Database file
const DB_FILE = path.join(__dirname, 'database.json');

// Initialize database
function initDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      posts: [],
      comments: {},
      users: {},
      likes: {},
      views: {},
      lastPostId: 0,
      lastCommentId: 0
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  }
}

// Load database
function loadDatabase() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading database:', error);
    return null;
  }
}

// Save database
function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving database:', error);
    return false;
  }
}

// Get user IP
function getUserIP(req) {
  return req.ip || req.connection.remoteAddress || 'unknown';
}

// Middleware untuk verifikasi admin
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token tidak ditemukan' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Akses ditolak' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token tidak valid' });
  }
}

// Inisialisasi database
initDatabase();

// API Routes

// 1. Login Admin
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password diperlukan' });
  }
  
  // Password admin: ilovesita
  if (password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign(
      { role: 'admin', username: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    return res.json({ 
      success: true, 
      token, 
      message: 'Login berhasil' 
    });
  }
  
  return res.status(401).json({ error: 'Password salah' });
});

// 2. Get semua postingan
app.get('/api/posts', (req, res) => {
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  // Hitung views untuk setiap post
  const postsWithStats = db.posts.map(post => {
    const postViews = db.views[post.id] || [];
    const postLikes = db.likes[post.id] || [];
    const postComments = db.comments[post.id] || [];
    
    return {
      ...post,
      views: postViews.length,
      likes: postLikes.length,
      commentsCount: postComments.length
    };
  });
  
  // Urutkan dari yang terbaru
  const sortedPosts = postsWithStats.sort((a, b) => 
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  res.json(sortedPosts);
});

// 3. Get detail postingan
app.get('/api/posts/:id', (req, res) => {
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const postId = parseInt(req.params.id);
  const post = db.posts.find(p => p.id === postId);
  
  if (!post) {
    return res.status(404).json({ error: 'Postingan tidak ditemukan' });
  }
  
  // Tambah view
  const userIP = getUserIP(req);
  if (!db.views[postId]) db.views[postId] = [];
  
  if (!db.views[postId].includes(userIP)) {
    db.views[postId].push(userIP);
    saveDatabase(db);
  }
  
  // Get comments
  const postComments = db.comments[postId] || [];
  
  // Check if user liked
  const userLiked = db.likes[postId]?.includes(userIP) || false;
  
  // Get stats
  const postViews = db.views[postId] || [];
  const postLikes = db.likes[postId] || [];
  
  const postWithDetails = {
    ...post,
    views: postViews.length,
    likes: postLikes.length,
    comments: postComments,
    userLiked: userLiked
  };
  
  res.json(postWithDetails);
});

// 4. Buat postingan baru (Admin only)
app.post('/api/posts', verifyAdmin, (req, res) => {
  const { title, description, author, language, tags, code } = req.body;
  
  if (!title || !code || !author) {
    return res.status(400).json({ error: 'Judul, kode, dan penulis diperlukan' });
  }
  
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const newPost = {
    id: ++db.lastPostId,
    title: title.trim(),
    description: (description || "Tidak ada deskripsi.").trim(),
    author: author.trim(),
    language: language || 'javascript',
    code: code.trim(),
    tags: tags ? tags.split(',').map(t => t.trim()).filter(t => t) : ['code'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  db.posts.push(newPost);
  
  if (saveDatabase(db)) {
    // Broadcast ke semua client
    io.emit('newPost', newPost);
    
    res.json({ 
      success: true, 
      message: 'Postingan berhasil dibuat', 
      post: newPost 
    });
  } else {
    res.status(500).json({ error: 'Gagal menyimpan postingan' });
  }
});

// 5. Update postingan (Admin only)
app.put('/api/posts/:id', verifyAdmin, (req, res) => {
  const postId = parseInt(req.params.id);
  const { title, description, author, language, tags, code } = req.body;
  
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const postIndex = db.posts.findIndex(p => p.id === postId);
  
  if (postIndex === -1) {
    return res.status(404).json({ error: 'Postingan tidak ditemukan' });
  }
  
  db.posts[postIndex] = {
    ...db.posts[postIndex],
    title: title ? title.trim() : db.posts[postIndex].title,
    description: description ? description.trim() : db.posts[postIndex].description,
    author: author ? author.trim() : db.posts[postIndex].author,
    language: language || db.posts[postIndex].language,
    code: code ? code.trim() : db.posts[postIndex].code,
    tags: tags ? tags.split(',').map(t => t.trim()).filter(t => t) : db.posts[postIndex].tags,
    updatedAt: new Date().toISOString()
  };
  
  if (saveDatabase(db)) {
    io.emit('updatePost', db.posts[postIndex]);
    res.json({ 
      success: true, 
      message: 'Postingan berhasil diupdate', 
      post: db.posts[postIndex] 
    });
  } else {
    res.status(500).json({ error: 'Gagal mengupdate postingan' });
  }
});

// 6. Hapus postingan (Admin only)
app.delete('/api/posts/:id', verifyAdmin, (req, res) => {
  const postId = parseInt(req.params.id);
  
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const postIndex = db.posts.findIndex(p => p.id === postId);
  
  if (postIndex === -1) {
    return res.status(404).json({ error: 'Postingan tidak ditemukan' });
  }
  
  db.posts.splice(postIndex, 1);
  delete db.comments[postId];
  delete db.likes[postId];
  delete db.views[postId];
  
  if (saveDatabase(db)) {
    io.emit('deletePost', postId);
    res.json({ 
      success: true, 
      message: 'Postingan berhasil dihapus' 
    });
  } else {
    res.status(500).json({ error: 'Gagal menghapus postingan' });
  }
});

// 7. Tambah komentar
app.post('/api/posts/:id/comments', (req, res) => {
  const postId = parseInt(req.params.id);
  const { author, text } = req.body;
  const userIP = getUserIP(req);
  
  if (!author || !text) {
    return res.status(400).json({ error: 'Nama dan komentar diperlukan' });
  }
  
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const post = db.posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).json({ error: 'Postingan tidak ditemukan' });
  }
  
  if (!db.comments[postId]) db.comments[postId] = [];
  
  const newComment = {
    id: ++db.lastCommentId,
    author: author.trim(),
    text: text.trim(),
    userIP: userIP,
    createdAt: new Date().toISOString()
  };
  
  db.comments[postId].unshift(newComment);
  
  if (saveDatabase(db)) {
    io.emit('newComment', { postId, comment: newComment });
    
    res.json({ 
      success: true, 
      message: 'Komentar berhasil ditambahkan', 
      comment: newComment 
    });
  } else {
    res.status(500).json({ error: 'Gagal menambahkan komentar' });
  }
});

// 8. Like/unlike postingan
app.post('/api/posts/:id/like', (req, res) => {
  const postId = parseInt(req.params.id);
  const userIP = getUserIP(req);
  
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const post = db.posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).json({ error: 'Postingan tidak ditemukan' });
  }
  
  if (!db.likes[postId]) db.likes[postId] = [];
  
  const likeIndex = db.likes[postId].indexOf(userIP);
  let liked = false;
  
  if (likeIndex === -1) {
    // Like
    db.likes[postId].push(userIP);
    liked = true;
  } else {
    // Unlike
    db.likes[postId].splice(likeIndex, 1);
    liked = false;
  }
  
  if (saveDatabase(db)) {
    io.emit('updateLikes', { 
      postId, 
      likes: db.likes[postId].length,
      liked 
    });
    
    res.json({ 
      success: true, 
      liked: liked,
      likes: db.likes[postId].length 
    });
  } else {
    res.status(500).json({ error: 'Gagal mengupdate like' });
  }
});

// 9. Download postingan
app.get('/api/posts/:id/download', (req, res) => {
  const postId = parseInt(req.params.id);
  
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const post = db.posts.find(p => p.id === postId);
  if (!post) {
    return res.status(404).json({ error: 'Postingan tidak ditemukan' });
  }
  
  // Get file extension
  const extensions = {
    javascript: 'js',
    python: 'py',
    java: 'java',
    php: 'php',
    html: 'html',
    cpp: 'cpp',
    csharp: 'cs'
  };
  
  const ext = extensions[post.language] || 'txt';
  const filename = `${post.title.replace(/\s+/g, '_')}.${ext}`;
  
  // Set headers untuk download
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/plain');
  
  res.send(post.code);
});

// 10. Get komentar untuk postingan
app.get('/api/posts/:id/comments', (req, res) => {
  const postId = parseInt(req.params.id);
  
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const comments = db.comments[postId] || [];
  res.json(comments);
});

// 11. Upload file (Admin only)
app.post('/api/upload', verifyAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Tidak ada file yang diupload' });
  }
  
  const fileInfo = {
    originalname: req.file.originalname,
    filename: req.file.filename,
    path: req.file.path,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedAt: new Date().toISOString()
  };
  
  res.json({
    success: true,
    message: 'File berhasil diupload',
    file: fileInfo
  });
});

// 12. Hapus semua postingan (Admin only)
app.delete('/api/posts', verifyAdmin, (req, res) => {
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const postCount = db.posts.length;
  
  // Reset database
  db.posts = [];
  db.comments = {};
  db.likes = {};
  db.views = {};
  db.lastPostId = 0;
  db.lastCommentId = 0;
  
  if (saveDatabase(db)) {
    io.emit('clearAllPosts');
    res.json({ 
      success: true, 
      message: `Semua ${postCount} postingan berhasil dihapus` 
    });
  } else {
    res.status(500).json({ error: 'Gagal menghapus semua postingan' });
  }
});

// 13. Export data (Admin only)
app.get('/api/export', verifyAdmin, (req, res) => {
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const exportData = {
    posts: db.posts,
    comments: db.comments,
    likes: db.likes,
    views: db.views,
    exportedAt: new Date().toISOString(),
    totalPosts: db.posts.length,
    totalComments: Object.values(db.comments).reduce((sum, arr) => sum + arr.length, 0),
    totalLikes: Object.values(db.likes).reduce((sum, arr) => sum + arr.length, 0),
    totalViews: Object.values(db.views).reduce((sum, arr) => sum + arr.length, 0)
  };
  
  res.setHeader('Content-Disposition', 'attachment; filename="satriacodeshare-export.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(exportData, null, 2));
});

// 14. Statistik
app.get('/api/stats', (req, res) => {
  const db = loadDatabase();
  if (!db) return res.status(500).json({ error: 'Database error' });
  
  const stats = {
    totalPosts: db.posts.length,
    totalComments: Object.values(db.comments).reduce((sum, arr) => sum + arr.length, 0),
    totalLikes: Object.values(db.likes).reduce((sum, arr) => sum + arr.length, 0),
    totalViews: Object.values(db.views).reduce((sum, arr) => sum + arr.length, 0),
    mostPopularLanguage: db.posts.reduce((acc, post) => {
      acc[post.language] = (acc[post.language] || 0) + 1;
      return acc;
    }, {}),
    recentPosts: db.posts
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
  };
  
  res.json(stats);
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
  
  socket.on('joinPost', (postId) => {
    socket.join(`post_${postId}`);
  });
  
  socket.on('leavePost', (postId) => {
    socket.leave(`post_${postId}`);
  });
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
  console.log(`Admin password: ${process.env.ADMIN_PASSWORD}`);
});