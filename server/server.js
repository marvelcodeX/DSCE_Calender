const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./database');
const calendarsRouter = require('./routes/calendars');
const holidaysRouter = require('./routes/holidays');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from ../public
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/calendars', calendarsRouter);
app.use('/api/holidays', holidaysRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: 'connected',
  });
});

// 404 handler for unknown /api routes
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
  });
});

// Serve index.html for all other routes (SPA/front-end)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

// Initialize database and start server
db.initialize()
  .then(() => {
    app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log('🚀 Calendar Generator Server Started');
      console.log('='.repeat(50));
      console.log(`📍 Server running on: http://localhost:${PORT}`);
      console.log('📊 Database: SQLite (calendar.db)');
      console.log(
        `🔑 Google API: ${
          process.env.GOOGLE_API_KEY ? 'Configured' : 'NOT CONFIGURED'
        }`
      );
      console.log('='.repeat(50));
      console.log('📋 Available endpoints:');
      console.log('   GET  /api/health');
      console.log('   GET  /api/holidays/:year');
      console.log('   POST /api/holidays/custom');
      console.log('   GET  /api/holidays/custom/all');
      console.log('   POST /api/holidays/cache/clear');
      console.log('   GET  /api/holidays/test-google');
      console.log('   GET  /api/calendars');
      console.log('   POST /api/calendars');
      console.log('   GET  /api/calendars/:id');
      console.log('   DELETE /api/calendars/:id');
      console.log('='.repeat(50));
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  db.close();
  process.exit(0);
});

module.exports = app;