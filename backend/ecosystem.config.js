module.exports = {
  apps: [{
    name: 'sudha-wellness',
    script: './server.js',
    cwd: '/var/www/sudha/backend',
    instances: 2,
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    max_memory_restart: '256M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/sudha/error.log',
    out_file: '/var/log/sudha/out.log',
    merge_logs: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,
  }],
};
