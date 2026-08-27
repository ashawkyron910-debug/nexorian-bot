module.exports = {
  apps: [{
    name: "nexorian-bot",
    script: "./index.js",
    autorestart: true,
    watch: false,
    max_memory_restart: "300M",
    env: { NODE_ENV: "production" }
  }]
};
