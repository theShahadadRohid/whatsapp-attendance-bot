import "dotenv/config";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received. Shutting down server...`);

  server.close((error) => {
    if (error) {
      console.error("Error while shutting down:", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
