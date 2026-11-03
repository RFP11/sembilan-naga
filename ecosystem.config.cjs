// Production under pm2: `pm2 start ecosystem.config.cjs`. Secrets stay in .env.production.
// These values win over that file, so production can't start with dev settings by accident:
// NODE_ENV=production is also what turns Dev login off.
/* global module */
module.exports = {
  apps: [
    {
      name: "dnd-app",
      cwd: "./apps/server",
      script: "dist/index.js",
      node_args: "--env-file=../../.env.production",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "4001",
        WEB_DIST: "../web/dist",
      },
    },
  ],
};
