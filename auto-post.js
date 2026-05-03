const { google } = require("googleapis");
const axios = require("axios");
const cron = require("node-cron");
const FormData = require("form-data");

const POST_CONFIG = {
  CRON_SCHEDULE: "0 13 * * *", // 20:00 GMT+7
  SOURCE_FOLDER_ID: process.env.DRIVE_FOLDER_ID,
  POSTED_FOLDER_ID: process.env.DRIVE_POSTED_FOLDER_ID,
};

function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function getNextPhoto(drive) {
  const response = await drive.files.list({
    q: `'${POST_CONFIG.SOURCE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 50,
    orderBy: "createdTime",
  });
  const files = response.data.files;
  if (!files || files.length === 0) {
    console.log("⚠️  Hết ảnh trong folder rồi! Upload thêm ảnh mới nhé.");
    return null;
  }
  return files[0];
}

async function downloadPhotoAsBuffer(drive, fileId) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(response.data);
}

async function generateCaption(imageBuffer, mimeType) {
  const imageBase64 = imageBuffer.toString("base64");

  const prompt = `Bạn đang giúp Cô Lan viết bài đăng Facebook cho page "Tẩy nốt ruồi gia truyền Cô Lan" — đã hoạt động hơn 10 năm tại Hà Nội và Quảng Ninh, phục vụ hàng nghìn khách.

VỀ DỊCH VỤ (rất quan trọng để hiểu đúng):
- Đây là DỊCH VỤ làm trực tiếp tại cơ sở của cô Lan, KHÔNG phải bán thuốc
- Cô Lan dùng bí quyết gia truyền của gia đình, áp dụng trực tiếp lên da khách
- Khách đến tận nơi gặp cô Lan, không có giao hàng, không gửi qua bưu điện
- Mỗi ca làm khoảng 15-30 phút, xong khách về luôn
- Hai cơ sở: Hà Nội (Resco, Xuân Đỉnh) và Quảng Ninh (chợ Mạo Khê)
- Đặt lịch qua SĐT 0979979981

Đây là ảnh quá trình cô Lan đang làm cho khách hàng thực tế. Hãy viết một bài đăng Facebook tự nhiên, gồm:
- Mở đầu bằng lời tâm tình của cô Lan
- Mô tả ngắn về trải nghiệm khách (dựa vào ảnh)
- Nhắc đến phương pháp gia truyền: nhẹ nhàng, làm trực tiếp
- Nhấn mạnh: cô làm tại Hà Nội và Quảng Ninh
- Mời khách nhắn page hoặc gọi 0979979981
- Thêm 5-7 hashtag cuối bài

Yêu cầu:
- Giọng cô Lan: thân thiện, ấm áp, như người làm nghề lâu năm
- Độ dài 100-150 chữ
- Tiếng Việt tự nhiên miền Bắc
- KHÔNG dùng từ tuyệt đối ("100%", "khỏi hoàn toàn")
- KHÔNG nhắc bán thuốc, gửi thuốc, ship hàng

Chỉ trả về nội dung bài đăng, không giải thích thêm.`;

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    },
    {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );

  return response.data.content[0].text;
}

async function postToFacebook(imageBuffer, caption) {
  const formData = new FormData();
  formData.append("source", imageBuffer, {
    filename: "photo.jpg",
    contentType: "image/jpeg",
  });
  formData.append("caption", caption);
  formData.append("access_token", process.env.PAGE_ACCESS_TOKEN);

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/me/photos`,
    formData,
    { headers: formData.getHeaders() }
  );
  return response.data.id;
}

async function moveToPosted(drive, fileId) {
  const file = await drive.files.get({ fileId, fields: "parents" });
  await drive.files.update({
    fileId,
    addParents: POST_CONFIG.POSTED_FOLDER_ID,
    removeParents: file.data.parents.join(","),
    fields: "id, parents",
  });
}

async function runAutoPost() {
  console.log("🕐 Bắt đầu auto-post...");
  try {
    const drive = getDriveClient();
    const photo = await getNextPhoto(drive);
    if (!photo) return;
    console.log(`📸 Đang xử lý: ${photo.name}`);

    const imageBuffer = await downloadPhotoAsBuffer(drive, photo.id);
    console.log("✅ Đã tải ảnh về");

    console.log("✍️  Claude đang viết caption...");
    const caption = await generateCaption(imageBuffer, photo.mimeType);
    console.log(`📝 Caption:\n${caption}\n`);

    const postId = await postToFacebook(imageBuffer, caption);
    console.log(`🎉 Đã đăng thành công! Post ID: ${postId}`);

    await moveToPosted(drive, photo.id);
    console.log("📁 Đã chuyển ảnh vào folder Đã đăng");
  } catch (err) {
    console.error("❌ Lỗi auto-post:", err.message);
    if (err.response?.data) {
      console.error("Chi tiết:", JSON.stringify(err.response.data));
    }
  }
}

function startAutoPost() {
  console.log(`📅 Auto-post đã bật — đăng lúc 20:00 mỗi ngày`);
  cron.schedule(POST_CONFIG.CRON_SCHEDULE, runAutoPost, {
    timezone: "Asia/Ho_Chi_Minh",
  });
}

module.exports = { startAutoPost, runAutoPost };
