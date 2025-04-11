require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const registerRoutes = require('./register');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from current directory
app.use(express.static(__dirname, {
  extensions: ['html'],
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.set('Content-Type', 'text/html');
    }
  }
}));

// Middleware to parse JSON
app.use(express.json());

// Logger for debugging incoming requests
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

// Serve index.html when root URL is visited
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Register user-related routes
app.use('/', registerRoutes);

// Explicit route for donate.html
app.get('/donate.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'donate.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Connect to the database and start the server
db.connectDB()
  .then(() => {
    console.log('✅ Database connected successfully');
    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to connect to database:', err);
    process.exit(1);
  });

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('\n🛑 Shutting down server...');
  try {
    await db.disconnectDB();
    console.log('✅ Database disconnected');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
