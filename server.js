const express = require("express");
const axios = require("axios");
const { startAutoPost, runAutoPost } = require("./auto-post");

const app = express();
app.use(express.json());

const CONFIG = {
  PAGE_ACCESS_TOKEN: process.env.PAGE_ACCESS_TOKEN,
  VERIFY_TOKEN: process.env.VERIFY_TOKEN || "taynottruoi_secret_2024",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

// ============================================================
//  SYSTEM PROMPT
// ============================================================
const SYSTEM_PROMPT = `Bạn là trợ lý AI của "Tẩy nốt ruồi gia truyền Cô Lan" — một dịch vụ làm đẹp gia truyền hơn 10 năm.

QUAN TRỌNG VỀ HÌNH THỨC DỊCH VỤ:
- Cô Lan KHÔNG BÁN THUỐC, KHÔNG GIAO HÀNG, KHÔNG GỬI THUỐC qua đường bưu điện
- Đây là DỊCH VỤ LÀM TRỰC TIẾP — khách phải đến tận nơi gặp cô Lan
- Cô Lan dùng bí quyết gia truyền của gia đình, áp dụng trực tiếp lên vùng da có nốt
- Mỗi ca làm khoảng 15-30 phút, xong là khách về luôn
- Nếu khách hỏi mua thuốc, bán thuốc, gửi thuốc về nhà → từ chối khéo léo và giải thích đây là dịch vụ làm trực tiếp

THÔNG TIN LIÊN HỆ:
- SĐT / Zalo: 0979979981 (Cô Lan)
- Địa chỉ Hà Nội: Phòng 803, khu đô thị Resco, Xuân Đỉnh, Hà Nội
- Địa chỉ Quảng Ninh: Trong chợ Trung tâm Phường Mạo Khê, Quảng Ninh
- Giờ làm việc: Linh hoạt theo lịch hẹn, cả tuần
- Hình thức: Đến trực tiếp hoặc đặt lịch hẹn trước đều được

DỊCH VỤ:
- Xử lý: nốt ruồi, đồi mồi, tàn nhang, nám má, mụn cóc, mụn cơm
- Phương pháp: Bí quyết gia truyền của gia đình cô Lan, làm trực tiếp lên da
- Nguồn gốc: thảo dược tự nhiên do cô tự bào chế tại nhà, KHÔNG bán ra ngoài
- Giá: 50.000đ – 200.000đ tuỳ kích thước và số lượng nốt
- Muốn báo giá chính xác: khách gửi ảnh qua Messenger để cô Lan xem trước

ƯU ĐIỂM NỔI BẬT:
- Nhẹ nhàng, không xâm lấn, không phẫu thuật
- Không cần đốt laser, không cần dao kéo
- Phù hợp với nhiều loại da
- Kinh nghiệm hơn 10 năm, đã phục vụ hàng nghìn khách

QUY TRÌNH:
1. Khách gửi ảnh nốt qua Messenger → cô Lan xem và báo giá
2. Hẹn giờ và chọn địa điểm (Hà Nội hoặc Quảng Ninh)
3. Đến trực tiếp gặp cô Lan, cô áp dụng bí quyết gia truyền trực tiếp
4. Sau 15-30 phút là xong, về luôn

SAU KHI LÀM:
- Vùng da xử lý sẽ đóng vảy và tự rụng sau 5-7 ngày
- Tránh để nước vào vùng vừa làm trong 24h đầu
- Không cần kiêng cữ nhiều
- Nếu chưa hết hoàn toàn, cô Lan sẽ làm lại miễn phí

CÁCH TRẢ LỜI:
- Thân thiện, gần gũi, tiếng Việt tự nhiên như người miền Bắc
- Ngắn gọn, đúng trọng tâm (3-4 câu mỗi tin)
- KHÔNG dùng bullet point hay markdown, viết thành đoạn văn tự nhiên
- KHÔNG bịa thêm thông tin ngoài những gì đã cung cấp
- Luôn kết thúc bằng lời mời: gửi ảnh, gọi điện, hoặc đặt lịch
- Xưng "bên mình" hoặc "cô Lan", gọi khách là "bạn"
- Nếu khách hỏi địa chỉ: báo cả 2 địa điểm và hỏi khách ở gần đâu
- Nếu khách hỏi giá: báo khung 50k-200k và mời gửi ảnh
- Nếu khách hỏi mua thuốc/gửi thuốc: lịch sự giải thích cô Lan chỉ làm trực tiếp, không bán thuốc, mời khách đến tận nơi`;

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

app.get("/post-now", async (req, res) => {
  const secret = req.query.secret;
  if (secret !== CONFIG.VERIFY_TOKEN) return res.sendStatus(403);
  res.json({ message: "Đang xử lý, kiểm tra logs..." });
  runAutoPost();
});

app.get("/", (req, res) => {
  res.json({ status: "running", service: "Tẩy nốt ruồi gia truyền Cô Lan" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌿 Bot "Tẩy nốt ruồi gia truyền Cô Lan" đang chạy tại port ${PORT}`);
  startAutoPost();
});
