const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

module.exports = {
  apps: [
    {
      name: 'holoscout',
      cwd: ROOT,
      script: path.join(__dirname, 'scout-runner.cjs'),
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 5000,
      kill_timeout: 10000,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development',
        HOLOMESH_WORKER_NAME: process.env.HOLOMESH_WORKER_NAME || 'holoscout',
      },
    },
  ],
};
