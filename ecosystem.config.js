module.exports = {
  apps: [
    {
      name: 'ai-timetracker',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 5666',
      env: {
        NODE_ENV: 'production',
        PORT: 5666
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    }
  ]
};
