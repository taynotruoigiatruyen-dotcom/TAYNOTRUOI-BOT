const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const CONFIG = {
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "taynottruoi_secret_2024",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

// ============================================================
//  SYSTEM PROMPT — đầy đủ thông tin
// ============================================================
const SYSTEM_PROMPT = `Bạn là trợ lý AI của "Tẩy nốt ruồi gia truyền Cô Lan".

THÔNG TIN LIÊN HỆ:
- SĐT / Zalo: 0979979981 (Cô Lan)
- Địa chỉ Hà Nội: Phòng 803, khu đô thị Resco, Xuân Đỉnh, Hà Nội
- Địa chỉ Quảng Ninh: Trong chợ Trung tâm Phường Mạo Khê, Quảng Ninh
- Giờ làm việc: Linh hoạt theo lịch hẹn, cả tuần
- Hình thức: Đến trực tiếp hoặc đặt lịch hẹn trước đều được

DỊCH VỤ:
- Tẩy: nốt ruồi, đồi mồi, tàn nhang, nám má, mụn cóc, mụn cơm
- Phương pháp: chấm thuốc thảo dược gia truyền trực tiếp lên nốt
- Giá: 50.000đ – 200.000đ tuỳ kích thước và số lượng nốt
- Muốn báo giá chính xác: khách gửi ảnh qua Messenger để cô Lan xem

ƯU ĐIỂM NỔI BẬT:
- Không đau, không để lại sẹo
- Hiệu quả ngay từ lần chấm đầu tiên
- Thuốc 100% thảo dược, không hoá chất
- Kinh nghiệm hơn 10 năm, đã phục vụ hàng nghìn khách

QUY TRÌNH ĐẶT LỊCH:
1. Khách gửi ảnh nốt qua Messenger → cô Lan xem và báo giá
2. Chọn địa điểm (Hà Nội hoặc Quảng Ninh) và hẹn giờ
3. Đến đúng giờ là làm ngay, không cần chờ lâu

SAU KHI TẨY:
- Nốt sẽ đóng vảy và tự rụng sau 5-7 ngày
- Không cần kiêng cữ nhiều, tránh để nước vào vùng vừa chấm thuốc trong 24h đầu
- Nếu chưa hết hoàn toàn, cô Lan sẽ chấm thêm miễn phí

CÁCH TRẢ LỜI:
- Thân thiện, gần gũi, tiếng Việt tự nhiên như người miền Bắc
- Ngắn gọn, đúng trọng tâm (3-4 câu mỗi tin nhắn)
- KHÔNG dùng bullet point hay markdown, viết thành đoạn văn tự nhiên
- KHÔNG bịa thêm thông tin ngoài những gì đã cung cấp ở trên
- Luôn kết thúc bằng lời mời hành động: gửi ảnh, gọi điện, hoặc đặt lịch
- Xưng "bên mình" hoặc "cô Lan", gọi khách là "bạn"
- Nếu khách hỏi địa chỉ: báo cả 2 địa điểm và hỏi khách ở gần đâu hơn
- Nếu khách hỏi giá: báo khung giá 50k-200k và mời gửi ảnh để báo chính xác
- Nếu khách muốn đặt lịch: cung cấp SĐT 0979979981 hoặc hẹn trực tiếp qua Messenger`;

// ============================================================
//  LỊCH SỬ HỘI THOẠI
// ============================================================
const conversationHistory = new Map();

function getHistory(senderId) {
  return conversationHistory.get(senderId) || [];
}

function addToHistory(senderId, role, content) {
  const history = getHistory(senderId);
  history.push({ role, content });
  if (history.length > 20) history.splice(0, 2);
  conversationHistory.set(senderId, history);
}

// ============================================================
//  GỌI CLAUDE API
// ============================================================
async function askClaude(senderId, userMessage) {
  addToHistory(senderId, "user", userMessage);
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: getHistory(senderId),
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
    { recipient: { id: recipientId }, message: { text } }
  );
}

async function sendTyping(recipientId) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${CONFIG.PAGE_ACCESS_TOKEN}`,
    { recipient: { id: recipientId }, sender_action: "typing_on" }
  );
}

// ============================================================
//  WEBHOOK
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

app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.object !== "page") return res.sendStatus(404);
  res.status(200).send("EVENT_RECEIVED");

  for (const entry of body.entry) {
    const events = entry.messaging;
    if (!events) continue;
    for (const event of events) {
      const senderId = event.sender.id;
      if (!event.message?.text || event.message.is_echo) continue;
      const userText = event.message.text.trim();
      console.log(`📩 [${senderId}]: ${userText}`);
      try {
        await sendTyping(senderId);
        const reply = await askClaude(senderId, userText);
        await sendMessage(senderId, reply);
        console.log(`✉️  Bot: ${reply.substring(0, 80)}...`);
      } catch (err) {
        console.error("❌ Lỗi:", err.message);
        await sendMessage(senderId, "Xin lỗi bạn, bạn vui lòng gọi 0979979981 để được cô Lan tư vấn trực tiếp nhé! 🙏");
      }
    }
  }
});

app.get("/", (req, res) => {
  res.json({ status: "running", service: "Tẩy nốt ruồi gia truyền Cô Lan" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌿 Bot đang chạy tại port ${PORT}`);
});
