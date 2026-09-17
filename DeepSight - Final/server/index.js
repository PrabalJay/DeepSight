require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || "http://127.0.0.1:5001").replace(/\/$/, "");
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const JWT_SECRET = process.env.JWT_SECRET || "deepsight-local-development-secret";
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".avi", ".webm", ".mkv"]);
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173").split(",").map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "100kb" }));

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, allowedExtensions.has(extension));
  },
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const scanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fileName: { type: String, required: true, maxlength: 255 },
    mediaType: { type: String, enum: ["image", "video"], required: true },
    verdict: { type: String, enum: ["AUTHENTIC", "INCONCLUSIVE", "MANIPULATED"], required: true },
    confidenceScore: { type: Number, required: true },
    framesAnalyzed: { type: Number, required: true },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Scan = mongoose.models.Scan || mongoose.model("Scan", scanSchema);
const memoryUsers = new Map();
const memoryScans = new Map();

function mongoReady() {
  return mongoose.connection.readyState === 1;
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/deepsight";
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    console.log("MongoDB connected: scan accounts and history will persist.");
  } catch (error) {
    console.warn("MongoDB is unavailable. DeepSight will use temporary in-memory accounts and history.");
  }
}

function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(user) {
  return { id: String(user._id || user.id), name: user.name, email: user.email };
}

function createToken(user) {
  return jwt.sign({ sub: String(user._id || user.id), email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

function bearerToken(request) {
  const value = request.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

function optionalUser(request, _response, next) {
  const token = bearerToken(request);
  if (token) {
    try {
      request.user = jwt.verify(token, JWT_SECRET);
    } catch (_error) {
      request.user = null;
    }
  }
  next();
}

function requireUser(request, response, next) {
  optionalUser(request, response, () => {
    if (!request.user) {
      return response.status(401).json({ error: "Please sign in to view scan history." });
    }
    next();
  });
}

async function findUserByEmail(email) {
  if (mongoReady()) return User.findOne({ email }).lean();
  return memoryUsers.get(email) || null;
}

async function saveUser(user) {
  if (mongoReady()) {
    const document = await User.create(user);
    return document.toObject();
  }
  const id = crypto.randomUUID();
  const created = { ...user, id, _id: id };
  memoryUsers.set(created.email, created);
  return created;
}

async function saveScan(userId, scan) {
  if (mongoReady()) {
    await Scan.create({ userId, ...scan });
    return;
  }
  const records = memoryScans.get(userId) || [];
  records.unshift({ id: crypto.randomUUID(), ...scan, createdAt: new Date().toISOString() });
  memoryScans.set(userId, records.slice(0, 50));
}

app.get("/api/health", async (_request, response) => {
  let aiOnline = false;
  try {
    const aiResponse = await fetch(`${AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    aiOnline = aiResponse.ok;
  } catch (_error) {
    aiOnline = false;
  }
  response.json({ status: "ok", ai_service_online: aiOnline, database: mongoReady() ? "mongodb" : "memory" });
});

app.post("/api/auth/register", async (request, response, next) => {
  try {
    const name = String(request.body.name || "").trim();
    const email = normaliseEmail(request.body.email);
    const password = String(request.body.password || "");
    if (name.length < 2 || !email.includes("@") || password.length < 6) {
      return response.status(400).json({ error: "Enter a name, a valid email, and a password with at least 6 characters." });
    }
    if (await findUserByEmail(email)) {
      return response.status(409).json({ error: "An account with that email already exists." });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await saveUser({ name, email, passwordHash });
    response.status(201).json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    if (error && error.code === 11000) {
      return response.status(409).json({ error: "An account with that email already exists." });
    }
    next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const email = normaliseEmail(request.body.email);
    const password = String(request.body.password || "");
    const user = await findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({ error: "Email or password is incorrect." });
    }
    response.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/history", requireUser, async (request, response, next) => {
  try {
    let history;
    if (mongoReady()) {
      history = await Scan.find({ userId: request.user.sub }).sort({ createdAt: -1 }).limit(50).lean();
      history = history.map((scan) => ({
        id: String(scan._id),
        fileName: scan.fileName,
        mediaType: scan.mediaType,
        verdict: scan.verdict,
        confidenceScore: scan.confidenceScore,
        framesAnalyzed: scan.framesAnalyzed,
        createdAt: scan.createdAt,
      }));
    } else {
      history = memoryScans.get(request.user.sub) || [];
    }
    response.json({ history });
  } catch (error) {
    next(error);
  }
});

app.post("/api/analyze", optionalUser, (request, response, next) => {
  upload.single("file")(request, response, async (uploadError) => {
    if (uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE") {
      return response.status(413).json({ error: "Videos and images must be 20 MB or smaller." });
    }
    if (uploadError) return next(uploadError);
    if (!request.file) {
      return response.status(400).json({ error: "Choose a supported image or video file (20 MB maximum)." });
    }

    try {
      const form = new FormData();
      const file = new Blob([request.file.buffer], { type: request.file.mimetype || "application/octet-stream" });
      form.append("file", file, request.file.originalname);
      const aiResponse = await fetch(`${AI_SERVICE_URL}/analyze`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(120000),
      });
      const payload = await aiResponse.json().catch(() => ({ error: "The AI service returned an invalid response." }));
      if (!aiResponse.ok) return response.status(aiResponse.status).json(payload);

      if (request.user) {
        await saveScan(request.user.sub, {
          fileName: payload.file_name || request.file.originalname,
          mediaType: payload.media_type,
          verdict: payload.verdict,
          confidenceScore: payload.confidence_score,
          framesAnalyzed: payload.frames_analyzed,
        });
      }
      response.json({ ...payload, saved_to_history: Boolean(request.user) });
    } catch (error) {
      if (error.name === "TimeoutError") {
        return response.status(504).json({ error: "The analysis timed out. Try a shorter video." });
      }
      if (
        error.code === "ECONNREFUSED" ||
        error.cause?.code === "ECONNREFUSED" ||
        (error.message && error.message.includes("ECONNREFUSED"))
      ) {
        return response.status(503).json({ error: "The AI service is offline. Start ai_engine/app.py first." });
      }
      next(error);
    }
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "The server could not complete that request." });
});

connectMongo();
app.listen(PORT, "127.0.0.1", () => {
  console.log(`DeepSight API listening at http://127.0.0.1:${PORT}`);
});
