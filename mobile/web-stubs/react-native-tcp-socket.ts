/**
 * Stub for react-native-tcp-socket (Metro alias on every platform — see metro.config.js; the package is not linked on devices).
 * Covers the default-export method used by services/printer.ts: createConnection.
 * It is a synchronous factory in the real API, so the stub throws; the caller invokes it
 * inside a Promise executor, which turns the throw into a rejection.
 */

const TcpSocket = {
  createConnection(): never {
    throw new Error('unavailable_web');
  },
};

export default TcpSocket;
