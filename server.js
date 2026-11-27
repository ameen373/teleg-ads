import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { Collections, db, logSecurityEvent, upsertTelegramUser } from "./models.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// التحقق المشفر من بيانات تيليجرام (HMAC-SHA256) لضمان عدم تزوير الهوية
function verifyTelegramWebAppData(initData) {
  if (!initData || !process.env.BOT_TOKEN) return null;
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    if (!hash) return null;

    urlParams.delete("hash");
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${key}=${val}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(process.env.BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (calculatedHash !== hash) return null;

    const userRaw = urlParams.get("user");
    return userRaw ? JSON.parse(userRaw) : null;
  } catch {
    return null;
  }
}

// Middleware لاستخراج المستخدم بشكل آمن
const telegramAuthMiddleware = asyncHandler(async (req, res, next) => {
  const initData = req.headers["x-telegram-init-data"];
  const verifiedUser = verifyTelegramWebAppData(initData);

  if (!verifiedUser) {
    await logSecurityEvent("UNVERIFIED_ACCESS_ATTEMPT", { ip: req.ip, path: req.path });
    return res.status(401).json({ error: "Unauthorized Telegram session" });
  }

  req.tgUser = verifiedUser;
  req.isOwner = String(verifiedUser.id) === String(process.env.ADMIN_TELEGRAM_ID);
  next();
});

// Middleware حصري للمالك فقط
const ownerOnlyMiddleware = asyncHandler(async (req, res, next) => {
  if (!req.isOwner) {
    await logSecurityEvent("ADMIN_BREACH_ATTEMPT", {
      userId: req.tgUser?.id,
      username: req.tgUser?.username
    });
    return res.status(403).json({ error: "Forbidden: Owner access only" });
  }
  next();
});

// مزامنة بيانات المستخدم (بدون إرجاع ID أو Username للواجهة)
app.post(
  "/api/auth/sync",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    await upsertTelegramUser(req.tgUser);
    res.json({
      success: true,
      isOwner: req.isOwner,
      officialChannel: process.env.OFFICIAL_CHANNEL_URL || "https://t.me/TelegaAdsOfficial",
      botUsername: process.env.BOT_USERNAME || "TelegaAdsBot"
    });
  })
);

// القنوات
app.get(
  "/api/channels",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await db
      .collection(Collections.CHANNELS)
      .where("ownerId", "==", String(req.tgUser.id))
      .get();
    const channels = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ channels });
  })
);

app.post(
  "/api/channels",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "Channel username required" });

    const cleanUsername = username.startsWith("@") ? username : `@${username}`;
    const docRef = await db.collection(Collections.CHANNELS).add({
      ownerId: String(req.tgUser.id),
      username: cleanUsername,
      title: cleanUsername,
      subscribers: 0,
      status: "Pending Verification",
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, id: docRef.id });
  })
);

// الحملات الترويجية
app.get(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const snap = await db
      .collection(Collections.CAMPAIGNS)
      .where("advertiserId", "==", String(req.tgUser.id))
      .get();
    const campaigns = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ campaigns });
  })
);

app.post(
  "/api/campaigns",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { title, content, budget } = req.body;
    if (!title || !content || !budget || Number(budget) <= 0) {
      return res.status(400).json({ error: "Invalid campaign parameters" });
    }

    const docRef = await db.collection(Collections.CAMPAIGNS).add({
      advertiserId: String(req.tgUser.id),
      title: String(title).slice(0, 100),
      content: String(content).slice(0, 1000),
      budget: Number(budget),
      status: "Active",
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, id: docRef.id });
  })
);

// الدعم الفني المباشر
app.post(
  "/api/support",
  telegramAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    await db.collection(Collections.TICKETS).add({
      userId: String(req.tgUser.id),
      username: req.tgUser.username || "",
      message: String(message).slice(0, 2000),
      status: "open",
      createdAt: new Date().toISOString()
    });

    res.json({ success: true });
  })
);

// مسارات الإدارة الحصرية للمالك فقط
app.get(
  "/api/admin/stats",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const [usersSnap, channelsSnap, campaignsSnap] = await Promise.all([
      db.collection(Collections.USERS).count().get(),
      db.collection(Collections.CHANNELS).count().get(),
      db.collection(Collections.CAMPAIGNS).count().get()
    ]);

    res.json({
      totalUsers: usersSnap.data().count,
      totalChannels: channelsSnap.data().count,
      activeCampaigns: campaignsSnap.data().count,
      totalVolume: 0
    });
  })
);

app.post(
  "/api/admin/broadcast",
  telegramAuthMiddleware,
  ownerOnlyMiddleware,
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Broadcast message required" });

    await logSecurityEvent("ADMIN_BROADCAST_SENT", {
      adminId: req.tgUser.id,
      preview: String(message).slice(0, 80)
    });

    res.json({ success: true });
  })
);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, _next) => {
  console.error("[Server Error]:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Telega.ads server running securely on port ${PORT}`);
});
