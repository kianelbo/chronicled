import cors from "cors";
import express from "express";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import groupRoutes from "./routes/groups";

const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/groups", groupRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
