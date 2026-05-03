const { google } = require("googleapis");
const axios = require("axios");
const cron = require("node-cron");
const FormData = require("form-data");
const sharp = require("sharp");

const POST_CONFIG = {
  CRON_SCHEDULE: "0 13 * * *", // 20:00 GMT+7
  SOURCE_FOLDER_ID: process.env.DRIVE_FOLDER_ID,
  POSTED_FOLDER_ID: process.env.DRIVE_POSTED_FOLDER_ID,
  TEMPLATE_FILE_ID: process.env.DRIVE_TEMPLATE_FILE_ID,
};

// Vùng đặt ảnh khách trong template
// Template 1080x1080, ảnh chiếm 80% đầu = 0,0 đến 1080,864
const PHOTO_AREA = {
  x: 0,
  y: 0,
  width: 1080,
  height: 864,
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
    console.log("⚠️  Hết ảnh trong folder rồi!");
    return null;
  }
  return files[0];
}

async function downloadFromDrive(drive, fileId) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(response.data);
}

// ============================================================
//  GHÉP ẢNH KHÁCH VÀO TEMPLATE
// ============================================================
async function composeWithTemplate(customerPhotoBuffer, templateBuffer) {
  console.log("🎨 Đang ghép ảnh vào template...");

  // 1. Resize ảnh khách để fit vào ô PHOTO_AREA, crop ở giữa
  const resizedPhoto = await sharp(customerPhotoBuffer)
    .resize(PHOTO_AREA.width, PHOTO_AREA.height, {
      fit: "cover",
      position: "center",
    })
    .toBuffer();

  // 2. Ghép ảnh khách vào template (đè lên vùng placeholder xám)
  const composedImage = await sharp(templateBuffer)
    .composite([
      {
        input: resizedPhoto,
        top: PHOTO_AREA.y,
        left: PHOTO_AREA.x,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return composedImage;
}

// ============================================================
//  CLAUDE VIẾT CAPTION (dựa trên ảnh gốc của khách)
// ============================================================
async function generateCaption(imageBuffer, mimeType) {
  const imageBase64 = imageBuffer.toString("base64");

  const prompt = `Bạn đang giúp Cô Lan viết bài đăng Facebook cho page "Tẩy nốt ruồi gia truyền Cô Lan" — đã hoạt động hơn 10 năm tại Hà Nội và Quảng Ninh, phục vụ hàng nghìn khách.

VỀ DỊCH VỤ:
- DỊCH VỤ làm trực tiếp tại cơ sở, KHÔNG phải bán thuốc
- Cô Lan dùng bí quyết gia truyền của gia đình, áp dụng trực tiếp lên da
- Khách đến tận nơi, không có giao hàng
- Mỗi ca 15-30 phút, xong khách về luôn
- Hai cơ sở: Hà Nội (Resco, Xuân Đỉnh) và Quảng Ninh (chợ Mạo Khê)
- Đặt lịch: 0979979981

Đây là ảnh quá trình cô Lan đang làm cho khách. Hãy viết bài đăng Facebook tự nhiên, gồm:
- Mở đầu bằng lời tâm tình của cô Lan
- Mô tả ngắn về trải nghiệm khách (dựa vào ảnh)
- Nhắc phương pháp gia truyền: nhẹ nhàng, làm trực tiếp
- Nhấn mạnh: 2 cơ sở Hà Nội và Quảng Ninh
- Mời khách nhắn page hoặc gọi 0979979981
- 5-7 hashtag cuối bài

Yêu cầu:
- Giọng cô Lan: thân thiện, ấm áp
- Độ dài 100-150 chữ
- Tiếng Việt tự nhiên miền Bắc
- KHÔNG dùng từ tuyệt đối ("100%", "khỏi hoàn toàn")
- KHÔNG nhắc bán thuốc, gửi thuốc

Chỉ trả về nội dung bài đăng.`;

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
    filename: "post.jpg",
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

    // 1. Lấy ảnh khách kế tiếp
    const photo = await getNextPhoto(drive);
    if (!photo) return;
    console.log(`📸 Đang xử lý: ${photo.name}`);

    // 2. Tải ảnh khách + template
    const customerPhotoBuffer = await downloadFromDrive(drive, photo.id);
    console.log("✅ Đã tải ảnh khách");

    const templateBuffer = await downloadFromDrive(drive, POST_CONFIG.TEMPLATE_FILE_ID);
    console.log("✅ Đã tải template");

    // 3. Ghép ảnh khách vào template
    const composedImage = await composeWithTemplate(customerPhotoBuffer, templateBuffer);
    console.log("🎨 Đã ghép ảnh thành công");

    // 4. Claude viết caption (dựa trên ảnh GỐC của khách)
    console.log("✍️  Claude đang viết caption...");
    const caption = await generateCaption(customerPhotoBuffer, photo.mimeType);
    console.log(`📝 Caption:\n${caption}\n`);

    // 5. Đăng ảnh ĐÃ GHÉP lên Facebook
    const postId = await postToFacebook(composedImage, caption);
    console.log(`🎉 Đã đăng thành công! Post ID: ${postId}`);

    // 6. Chuyển ảnh khách đã dùng sang folder Đã đăng
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
