import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { initDb } from "./db.js";
import { router } from "./routes.js";
import { configureSockets } from "./socket.js";

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use("/api", router);

configureSockets(server, CLIENT_ORIGIN);

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Chess API listening on port ${PORT}`);
      console.log(`Allowed client origin: ${CLIENT_ORIGIN}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database", err);
    process.exit(1);
  });
