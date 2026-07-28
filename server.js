require('./src/config/env');
const { app } = require('./src/app');
const { initDatabase } = require('./src/config/database');

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const FALLBACK_PORT = 4000;

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Estoque Facil rodando em http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && port === 3000) {
      console.warn('A porta 3000 esta ocupada. Iniciando na porta 4000...');
      startServer(FALLBACK_PORT);
      return;
    }

    console.error(`Erro ao iniciar o servidor na porta ${port}:`, error);
    process.exit(1);
  });
}

initDatabase()
  .then(() => {
    startServer(DEFAULT_PORT);
  })
  .catch((error) => {
    console.error('Erro ao inicializar o banco de dados:', error);
    process.exit(1);
  });
