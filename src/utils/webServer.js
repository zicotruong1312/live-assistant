const express = require('express');

function startWebServer() {
  const app = express();
  const DEFAULT_PORT = Number(process.env.PORT || 3000);

  app.get('/', (req, res) => {
    res.send('🤖 Statistic Bot đang hoạt động!');
  });

  app.get('/ping', (req, res) => {
    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      message: '✅ Bot Statistic đang hoạt động!'
    });
  });

  const startListen = (port, attemptsLeft = 5) => {
    const server = app.listen(port, () => {
      console.log(`🌐 Web server đang chạy trên port ${port}`);
    });

    server.on('error', (err) => {
      if (err?.code === 'EADDRINUSE' && attemptsLeft > 0) {
        console.warn(`⚠️ Port ${port} đang bận, thử port ${port + 1}...`);
        server.close(() => startListen(port + 1, attemptsLeft - 1));
        return;
      }
      console.error('❌ Web server error:', err?.message || err);
      process.exit(1);
    });
  };

  startListen(DEFAULT_PORT);
}

module.exports = startWebServer;
