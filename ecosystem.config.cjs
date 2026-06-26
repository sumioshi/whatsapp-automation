const path = require("node:path");

const root = __dirname;

/**
 * Processos gerenciados pelo pm2 — rodam sempre, reiniciam se cair, e podem
 * subir no boot (pm2 startup + pm2 save).
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "wa-collector",
      cwd: root,
      script: "dist/index.js",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 30,
      restart_delay: 3000,
    },
    {
      name: "wa-panel",
      cwd: path.join(root, "web"),
      script: path.join(root, "web", "node_modules", ".bin", "next"),
      args: "start -p 3000",
      env: { NODE_ENV: "production" },
      autorestart: true,
    },
    {
      // Serviço de transcrição "morno": modelo carrega no 1º uso e libera após ocioso.
      name: "wa-transcriber",
      cwd: root,
      script: path.join(root, "transcriber", "service.py"),
      interpreter: `${process.env.HOME}/.local/share/uv/tools/mlx-whisper/bin/python`,
      autorestart: true,
    },
    {
      // Notifica no Mac quando chega msg de cliente num chat com `alertar`.
      // Roda via tsx (importa web/lib, que não está no dist/ do coletor).
      name: "wa-notifier",
      cwd: root,
      script: path.join(root, "scripts", "notifier.ts"),
      interpreter: "node",
      interpreter_args: "--import tsx",
      env: { NODE_ENV: "production" },
      autorestart: true,
    },
  ],
};
