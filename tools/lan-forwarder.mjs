import net from 'node:net';

const LISTEN_PORT = parseInt(process.env.FORWARD_PORT || '1730', 10);
const TARGET_PORT = parseInt(process.env.TARGET_PORT || '5173', 10);
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';

const server = net.createServer((clientSocket) => {
  const targetSocket = net.connect(TARGET_PORT, TARGET_HOST);
  clientSocket.pipe(targetSocket);
  targetSocket.pipe(clientSocket);

  clientSocket.on('error', () => targetSocket.destroy());
  targetSocket.on('error', () => clientSocket.destroy());
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[LAN Forwarder] Listening on 0.0.0.0:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`[LAN Forwarder] Access on mobile: http://192.168.31.113:${LISTEN_PORT}/`);
});

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
