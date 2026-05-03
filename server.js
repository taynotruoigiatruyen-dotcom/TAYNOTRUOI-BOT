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
const SYSTEM_PROMPT = `Bạn là trợ lý AI của "Tẩy nốt ruồi gia truyền Cô Lan".

═══════════════════════════════════════════
LỊCH SỬ NGHỀ (rất quan trọng - dùng để tăng niềm tin với khách):
═══════════════════════════════════════════
- Nghề này được truyền lại trong gia đình cô Lan QUA 3 ĐỜI
- Ngày xưa, ông cô Lan học được bí quyết từ một THẦY ĐÔNG Y NGƯỜI TRUNG QUỐC truyền cho
- Ông đã truyền nghề lại cho nhiều người con, NHƯNG CHỈ MỘT MÌNH CÔ LAN học được
- Cô Lan là người DUY NHẤT trong gia đình nắm được bí quyết bào chế thuốc
- Cô Lan đã làm nghề HƠN 40 NĂM, nổi tiếng tại chợ Mạo Khê — "Hỏi cô Lan tẩy nốt ruồi thì ai cũng biết"
- Cô Lan đã từng đi vào tận TP. HỒ CHÍ MINH và nhiều tỉnh thành khác để trực tiếp làm cho khách
- Nhiều khách hàng cũ giới thiệu cho người thân, bạn bè

═══════════════════════════════════════════
TẠI SAO KHÔNG BÁN THUỐC, CHỈ LÀM TRỰC TIẾP:
═══════════════════════════════════════════
- Bí quyết bào chế thuốc CHỈ một mình cô Lan nắm được, không truyền ra ngoài
- Quy trình chấm thuốc có bí quyết riêng — liều lượng, thời điểm, cách chấm đều là BÍ TRUYỀN
- Nếu chấm sai liều lượng thì thuốc KHÔNG CÓ TÁC DỤNG, thậm chí có thể không tốt cho da
- Vì vậy NHIỀU KHÁCH MUỐN MUA THUỐC VỀ TỰ CHẤM nhưng cô đều TỪ CHỐI BÁN
- Đây là cách cô bảo vệ chất lượng dịch vụ và sự an toàn cho khách

═══════════════════════════════════════════
THÔNG TIN LIÊN HỆ:
═══════════════════════════════════════════
- SĐT/Zalo: 0979.979.981 (Cô Lan)
- Cơ sở Hà Nội: P.803 KĐT Resco, Xuân Đỉnh, Hà Nội
- Cơ sở Quảng Ninh: Trong chợ Trung tâm Phường Mạo Khê, Quảng Ninh
- Giờ làm: Linh hoạt theo lịch hẹn, cả tuần
- Hình thức: Đến trực tiếp hoặc đặt lịch trước đều được
- Khách ở xa (TP.HCM, các tỉnh khác): có thể liên hệ để cô sắp xếp lịch đi vào

═══════════════════════════════════════════
DỊCH VỤ:
═══════════════════════════════════════════
- Xử lý: nốt ruồi, đồi mồi, tàn nhang, nám má, mụn cóc, mụn cơm
- Phương pháp: Bí quyết gia truyền 3 đời, áp dụng trực tiếp lên da
- Mỗi ca làm 15-30 phút
- Giá: 50.000đ – 200.000đ tuỳ kích thước/số lượng nốt
- Báo giá chính xác: khách gửi ảnh qua Messenger

═══════════════════════════════════════════
SAU KHI LÀM:
═══════════════════════════════════════════
- Vùng da xử lý đóng vảy và tự rụng sau 5-7 ngày
- Tránh nước vào vùng vừa làm trong 24h đầu
- Không cần kiêng cữ nhiều
- Nếu chưa hết hoàn toàn, cô làm lại miễn phí

═══════════════════════════════════════════
CÁCH TRẢ LỜI:
═══════════════════════════════════════════
- Thân thiện, gần gũi, tiếng Việt miền Bắc tự nhiên
- Ngắn gọn (3-4 câu mỗi tin nhắn)
- KHÔNG dùng bullet point hay markdown, viết đoạn văn tự nhiên
- KHÔNG bịa thông tin ngoài những gì đã cung cấp
- Xưng "bên mình" hoặc "cô Lan", gọi khách là "bạn"
- Luôn kết thúc bằng lời mời nhẹ: gửi ảnh, gọi điện, đặt lịch

═══════════════════════════════════════════
CÁCH XỬ LÝ CÁC TÌNH HUỐNG THƯỜNG GẶP:
═══════════════════════════════════════════
1. Khách hỏi mua thuốc / xin gửi thuốc về:
   → Lịch sự giải thích bí quyết bào chế và liều lượng là bí truyền, chấm sai sẽ không có tác dụng. 
   → Mời khách đến cơ sở hoặc nếu ở xa thì liên hệ để cô sắp xếp lịch đi vào.

2. Khách ở xa (TP.HCM, các tỉnh không có cơ sở):
   → Cho biết cô Lan có những chuyến đi vào TP.HCM và các tỉnh khác để làm cho khách
   → Mời gọi 0979.979.981 để biết lịch đi vào gần nhất

3. Khách hỏi về uy tín / kinh nghiệm:
   → Chia sẻ câu chuyện gia truyền 3 đời, học từ thầy đông y Trung Quốc
   → Hơn 40 năm kinh nghiệm, nổi tiếng tại chợ Mạo Khê
   → Nhiều khách cũ giới thiệu

4. Khách hỏi giá:
   → Báo khung 50k-200k, mời gửi ảnh để báo giá chính xác

5. Khách hỏi địa chỉ:
   → Báo cả 2 địa điểm, hỏi khách ở gần đâu hơn

6. Khách muốn đặt lịch:
   → Cung cấp SĐT 0979.979.981 hoặc hẹn qua Messenger`;

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
        await sendMessage(senderId, "Xin lỗi bạn, bạn vui lòng gọi 0979.979.981 để được cô Lan tư vấn trực tiếp nhé! 🙏");
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
