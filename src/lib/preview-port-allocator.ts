import net from "net";

export async function findAvailablePort(startPort: number = 3100): Promise<number> {
  const isPortBusy = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          resolve(true);
        } else {
          resolve(true); // Safer to assume busy on other errors
        }
      });
      server.once("listening", () => {
        server.close(() => resolve(false));
      });
      server.listen(port, "127.0.0.1");
    });
  };

  let port = startPort;
  while (await isPortBusy(port)) {
    port++;
    if (port > 4000) throw new Error("No available ports found in range.");
  }
  return port;
}

