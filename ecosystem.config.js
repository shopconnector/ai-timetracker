module.exports = {
  apps: [
    {
      name: 'ai-timetracker',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3021',
      env: {
        NODE_ENV: 'production',
        PORT: 3021
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    }
  ]
};
