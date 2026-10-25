// Listening is separate from world construction so occupied-port behavior can be
// exercised without starting a game or interfering with another running server.
export function listenOptions(args = [], env = process.env) {
  const option = args.findIndex(arg => arg === '--port' || arg.startsWith('--port='));
  const argument = option < 0 ? undefined : args[option].includes('=') ? args[option].slice(7) : args[option + 1];
  const explicit = option >= 0 || env.PORT !== undefined;
  const value = option >= 0 ? argument : env.PORT ?? '8080';
  if (value === undefined || !/^\d+$/.test(String(value)) || +value > 65535) {
    throw new Error('Choose a port from 0 to 65535, for example: node server/server.js --port 8081');
  }
  return { port: +value, fallback: !explicit };
}

export async function listenWithFallback(server, { port, fallback = false, onRetry = () => {} }) {
  const last = Math.min(65535, port + (fallback ? 9 : 0));
  for (let candidate = port; candidate <= last; candidate++) {
    try {
      await new Promise((resolve, reject) => {
        const ready = () => { server.off('error', failed); resolve(); };
        const failed = error => { server.off('listening', ready); reject(error); };
        server.once('listening', ready);
        server.once('error', failed);
        server.listen(candidate);
      });
      return server.address().port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || candidate === last) throw error;
      onRetry(candidate, candidate + 1);
    }
  }
}
