const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ============================================================
//  CẤU HÌNH — chỉ cần sửa phần này
// ============================================================
const CONFIG = {
  // Lấy từ Facebook Developer App (hướng dẫn trong README)
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "taynottruoi_secret_2024",

  // Lấy từ console.anthropic.com
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,

  // Thông tin dịch vụ của Cô Lan
  BUSINESS: {
    name: "Tẩy nốt ruồi gia truyền Cô Lan",
    phone: "0979979981",
    services: ["nốt ruồi", "đồi mồi", "tàn nhang", "nám má", "mụn cóc", "mụn cơm"],
    priceRange: "50.000đ – 200.000đ tuỳ kích thước và số lượng",
    method: "thuốc thảo dược gia truyền, chấm trực tiếp",
    highlights: [
      "Không đau, không để lại sẹo",
      "Hiệu quả ngay lần đầu chấm thuốc",
      "Thuốc 100% thảo dược, không hoá chất",
      "Kinh nghiệm hơn 10 năm",
      "Đã phục vụ hàng nghìn khách hàng",
    ],
  },
};

// ============================================================
//  SYSTEM PROMPT — "não" của chatbot
// ============================================================
const SYSTEM_PROMPT = `Bạn là trợ lý AI của "${CONFIG.BUSINESS.name}" (SĐT: ${CONFIG.BUSINESS.phone}).

DỊCH VỤ:
- Tẩy: ${CONFIG.BUSINESS.services.join(", ")}
- Phương pháp: ${CONFIG.BUSINESS.method}
- Giá: ${CONFIG.BUSINESS.priceRange}
- Điểm mạnh: ${CONFIG.BUSINESS.highlights.join("; ")}
- Khách gửi ảnh qua Messenger để được tư vấn cụ thể và báo giá chính xác hơn

CÁCH TRẢ LỜI:
- Thân thiện, gần gũi, tiếng Việt tự nhiên miền Bắc
- Ngắn gọn, đúng trọng tâm (tối đa 3-4 câu mỗi tin)
- Không dùng bullet point hay markdown trong tin nhắn
- Luôn kết thúc bằng lời mời nhẹ nhàng: gửi ảnh, gọi điện, hoặc hỏi thêm
- Nếu khách hỏi giá cụ thể: báo khung giá và mời gửi ảnh để báo giá chính xác
- Nếu khách muốn đặt lịch: cung cấp SĐT ${CONFIG.BUSINESS.phone}
- Xưng "bên mình" hoặc "cô Lan", gọi khách là "bạn"
- KHÔNG bịa thông tin, KHÔNG hứa hẹn quá mức
- Nếu gặp câu hỏi ngoài phạm vi dịch vụ, khéo léo dẫn về chủ đề chính`;

// ============================================================
//  LƯU LỊCH SỬ HỘI THOẠI (trong RAM, reset khi restart)
// ============================================================
const conversationHistory = new Map();
const MAX_HISTORY = 10; // Giữ 10 tin gần nhất

function getHistory(senderId) {
  return conversationHistory.get(senderId) || [];
}

function addToHistory(senderId, role, content) {
  const history = getHistory(senderId);
  history.push({ role, content });
  // Giữ lại tối đa MAX_HISTORY tin
  if (history.length > MAX_HISTORY * 2) {
    history.splice(0, 2);
  }
  conversationHistory.set(senderId, history);
}

// ============================================================
//  GỌI CLAUDE API
// ============================================================
async function askClaude(senderId, userMessage) {
  addToHistory(senderId, "user", userMessage);
  const history = getHistory(senderId);

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: history,
    },
    {
      headers: {
        "x-api-key": CONFIG.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );

  const reply = response.data.content[0].text;
  addToHistory(senderId, "assistant", reply);
  return reply;
}

// ============================================================
//  GỬI TIN NHẮN VỀ FACEBOOK
// ============================================================
async function sendMessage(recipientId, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${CONFIG.PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: recipientId },
      message: { text },
    }
  );
}

// Gửi trạng thái "đang gõ" để khách biết bot đang xử lý
async function sendTyping(recipientId) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${CONFIG.PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: recipientId },
      sender_action: "typing_on",
    }
  );
}

// ============================================================
//  WEBHOOK VERIFICATION (Facebook yêu cầu khi setup)
// ============================================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============================================================
//  NHẬN TIN NHẮN TỪ FACEBOOK
// ============================================================
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object !== "page") return res.sendStatus(404);

  // Xác nhận nhận được ngay để Facebook không gửi lại
  res.status(200).send("EVENT_RECEIVED");

  for (const entry of body.entry) {
    const events = entry.messaging;
    if (!events) continue;

    for (const event of events) {
      const senderId = event.sender.id;

      // Chỉ xử lý tin nhắn văn bản
      if (!event.message?.text) continue;

      // Bỏ qua tin nhắn do bot tự gửi
      if (event.message.is_echo) continue;

      const userText = event.message.text.trim();
      console.log(`📩 [${senderId}]: ${userText}`);

      try {
        await sendTyping(senderId);
        const reply = await askClaude(senderId, userText);
        await sendMessage(senderId, reply);
        console.log(`✉️  Bot: ${reply.substring(0, 80)}...`);
      } catch (err) {
        console.error("❌ Lỗi:", err.message);
        await sendMessage(
          senderId,
          "Xin lỗi bạn, mình đang bận chút. Bạn vui lòng gọi 0979979981 để được tư vấn trực tiếp nhé! 🙏"
        );
      }
    }
  }
});

// ============================================================
//  HEALTH CHECK — để Render biết server đang chạy
// ============================================================
app.get("/", (req, res) => {
  res.json({
    status: "running",
    service: CONFIG.BUSINESS.name,
    uptime: Math.floor(process.uptime()) + "s",
  });
});

// ============================================================
//  KHỞI ĐỘNG SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌿 Bot "${CONFIG.BUSINESS.name}" đang chạy tại port ${PORT}`);
  console.log(`📍 Webhook URL: https://YOUR_DOMAIN/webhook`);
});
