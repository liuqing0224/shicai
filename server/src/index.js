import { createApp } from './app.js';

const { app, config, db } = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`Resume evaluator API listening on http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
