import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors());
app.use(pinoHttp());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "whatsapp-attendance-bot"
  });
});
