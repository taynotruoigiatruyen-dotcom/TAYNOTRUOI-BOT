const { google } = require("googleapis");
const axios = require("axios");
const cron = require("node-cron");

// ============================================================
//  CẤU HÌNH AUTO-POST
// ============================================================
const POST_CONFIG = {
  // Đăng lúc 20:00 mỗi ngày (múi giờ UTC+7 = 13:00 UTC)
  CRON_SCHEDULE: "0 13 * * *",

  // ID folder Google Drive chứa ảnh chưa đăng
  // Lấy từ URL: drive.google.com/drive/folders/[FOLDER_ID]
  SOURCE_FOLDER_ID: process.env.DRIVE_FOLDER_ID,

  // ID folder "Đã đăng" — ảnh sau khi đăng sẽ chuyển vào đây
  // Tạo 1 folder tên "Đã đăng" trong Drive rồi copy ID vào
  POSTED_FOLDER_ID: process.env.DRIVE_POSTED_FOLDER_ID,
};

// ============================================================
//  KẾT NỐI GOOGLE DRIVE
// ============================================================
function getDriveClient() {
  // Đọc thông tin Service Account từ environment variable
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

// ============================================================
//  LẤY 1 ẢNH CHƯA ĐĂNG TỪ DRIVE
// ============================================================
async function getNextPhoto(drive) {
  const response = await drive.files.list({
    q: `'${POST_CONFIG.SOURCE_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 50,
    orderBy: "createdTime",
  });

  const files = response.data.files;
  if (!files || files.length === 0) {
    console.log("⚠️  Không còn ảnh nào để đăng trong folder!");
    return null;
  }

  // Lấy ảnh đầu tiên (cũ nhất)
  return files[0];
}

// ============================================================
//  TẢI ẢNH VỀ DẠNG BASE64
// ============================================================
async function downloadPhotoAsBase64(drive, fileId, mimeType) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const buffer = Buffer.from(response.data);
  return buffer.toString("base64");
}

// ============================================================
//  CLAUDE XEM ẢNH VÀ VIẾT CAPTION
// ============================================================
async function generateCaption(imageBase64, mimeType) {
  const prompt = `Đây là ảnh quá trình tẩy nốt ruồi/đồi mồi/tàn nhang bằng thuốc thảo dược gia truyền của cô Lan (SĐT: 0979979981).

Hãy viết 1 bài đăng Facebook cho ảnh này với yêu cầu:
- Mở đầu thu hút, tạo tò mò hoặc đồng cảm với khách hàng
- Nhắc đến ưu điểm: không đau, không sẹo, thuốc thảo dược an toàn, hiệu quả ngay
- Kêu gọi hành động nhẹ nhàng: nhắn tin hoặc gọi 0979979981
- Thêm 5-7 hashtag phù hợp cuối bài
- Giọng văn thân thiện, chân thực, không quá quảng cáo
- Độ dài: 100-150 chữ
- Viết bằng tiếng Việt tự nhiên

Chỉ trả về nội dung bài đăng, không giải thích thêm.`;

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: prompt,
            },
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

// ============================================================
//  ĐĂNG ẢNH + CAPTION LÊN FACEBOOK PAGE
// ============================================================
async function postToFacebook(imageBase64, mimeType, caption) {
  // Bước 1: Upload ảnh lên Facebook (chưa publish)
  const imageBuffer = Buffer.from(imageBase64, "base64");

  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: mimeType });
  formData.append("source", blob, "photo.jpg");
  formData.append("caption", caption);
  formData.append("access_token", process.env.PAGE_ACCESS_TOKEN);

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/me/photos`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    }
  );

  return response.data.id;
}

// ============================================================
//  CHUYỂN ẢNH ĐÃ ĐĂNG VÀO FOLDER "ĐÃ ĐĂNG"
// ============================================================
async function moveToPosted(drive, fileId) {
  // Lấy parent hiện tại
  const file = await drive.files.get({
    fileId,
    fields: "parents",
  });

  // Chuyển folder
  await drive.files.update({
    fileId,
    addParents: POST_CONFIG.POSTED_FOLDER_ID,
    removeParents: file.data.parents.join(","),
    fields: "id, parents",
  });
}

// ============================================================
//  HÀM CHÍNH: CHẠY TOÀN BỘ QUY TRÌNH
// ============================================================
async function runAutoPost() {
  console.log("🕐 Bắt đầu auto-post...");

  try {
    const drive = getDriveClient();

    // 1. Lấy ảnh tiếp theo
    const photo = await getNextPhoto(drive);
    if (!photo) return;
    console.log(`📸 Đang xử lý ảnh: ${photo.name}`);

    // 2. Tải ảnh về
    const imageBase64 = await downloadPhotoAsBase64(drive, photo.id, photo.mimeType);
    console.log("✅ Đã tải ảnh về");

    // 3. Claude viết caption
    console.log("✍️  Claude đang viết caption...");
    const caption = await generateCaption(imageBase64, photo.mimeType);
    console.log(`📝 Caption:\n${caption}\n`);

    // 4. Đăng lên Facebook
    const postId = await postToFacebook(imageBase64, photo.mimeType, caption);
    console.log(`🎉 Đã đăng thành công! Post ID: ${postId}`);

    // 5. Chuyển ảnh vào folder "Đã đăng"
    await moveToPosted(drive, photo.id);
    console.log("📁 Đã chuyển ảnh vào folder Đã đăng");

  } catch (err) {
    console.error("❌ Lỗi auto-post:", err.message);
  }
}

// ============================================================
//  KHỞI ĐỘNG SCHEDULER
// ============================================================
function startAutoPost() {
  console.log(`📅 Auto-post đã bật — đăng lúc 20:00 mỗi ngày`);

  cron.schedule(POST_CONFIG.CRON_SCHEDULE, () => {
    runAutoPost();
  }, {
    timezone: "Asia/Ho_Chi_Minh"
  });
}

module.exports = { startAutoPost, runAutoPost };
