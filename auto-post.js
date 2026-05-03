const { google } = require("googleapis");
const axios = require("axios");
const cron = require("node-cron");
const FormData = require("form-data");
const sharp = require("sharp");

const POST_CONFIG = {
  CRON_SCHEDULE: "0 13 * * *",
  SOURCE_FOLDER_ID: process.env.DRIVE_FOLDER_ID,
  POSTED_FOLDER_ID: process.env.DRIVE_POSTED_FOLDER_ID,
  TEMPLATE_FILE_ID: process.env.DRIVE_TEMPLATE_FILE_ID,
};

const PHOTO_AREA = {
  x: 0,
  y: 0,
  width: 1080,
  height: 864,
};

// ============================================================
//  CAPTION MẪU - dùng khi AI từ chối hoặc lỗi
// ============================================================
const FALLBACK_CAPTIONS = [
  `Hôm nay cô lại đón thêm một bạn khách quen ghé qua cơ sở của cô để xử lý mấy nốt ruồi, đồi mồi. Phương pháp gia truyền của nhà cô bao đời nay vẫn vậy — nhẹ nhàng, làm trực tiếp, chỉ khoảng 15-20 phút là xong, các bạn về luôn được.

Cô đang có mặt tại Hà Nội (P.803 KĐT Resco, Xuân Đỉnh) và Quảng Ninh (chợ Trung tâm Mạo Khê). Bạn nào quan tâm cứ nhắn page hoặc gọi cô qua số 0979.979.981 để được tư vấn miễn phí nhé!

#TayNotRuoi #GiaTruyenCoLan #NotRuoi #DoiMoi #TanNhang #HaNoi #QuangNinh`,

  `Các bạn ơi, hôm nay cô vừa tiễn xong một bạn khách trẻ. Bạn ấy băn khoăn mãi mới quyết định đến gặp cô, sau khi làm xong nhìn rất hài lòng 😊

Bí quyết gia truyền của nhà cô đã hơn chục năm rồi, không xâm lấn, không cần dao kéo, áp dụng trực tiếp lên da. Mỗi ca chỉ vài chục phút thôi.

Hai cơ sở của cô:
📍 Hà Nội: P.803 KĐT Resco, Xuân Đỉnh  
📍 Quảng Ninh: Chợ Trung tâm Mạo Khê

Đặt lịch trước qua page hoặc gọi 0979.979.981 các bạn nhé!

#TayNotRuoi #GiaTruyen #CoLan #LamDepGiaTruyen`,

  `Một ngày làm việc nữa của cô tại cơ sở. Bao nhiêu năm gắn bó với nghề, cô vẫn luôn tâm niệm phải tận tâm với từng người khách đến với mình.

Bí quyết gia truyền của gia đình cô là phương pháp đông y, làm nhẹ nhàng và an toàn. Khách đến cơ sở, cô làm trực tiếp, không gửi thuốc về nhà như nhiều nơi.

Bạn nào có nốt ruồi, đồi mồi, tàn nhang muốn xử lý thì cứ ghé cô hoặc nhắn page nhé. Cô có mặt cả ở Hà Nội và Quảng Ninh.

☎ 0979.979.981

#TayNotRuoi #DongYGiaTruyen #CoLan #UyTinTanTam`,
];

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

async function composeWithTemplate(customerPhotoBuffer, templateBuffer) {
  console.log("🎨 Đang ghép ảnh vào template...");
  const resizedPhoto = await sharp(customerPhotoBuffer)
    .resize(PHOTO_AREA.width, PHOTO_AREA.height, {
      fit: "cover",
      position: "center",
    })
    .toBuffer();

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
//  KIỂM TRA CLAUDE CÓ TỪ CHỐI KHÔNG
// ============================================================
function isRefusal(text) {
  if (!text) return true;
  const lower = text.toLowerCase();
  
  // Check English refusal patterns
  const englishRefusalKeywords = [
    "i'm not able",
    "i cannot",
    "i can't",
    "i won't",
    "regulatory concern",
    "medical risk",
    "safety concerns",
    "i'd encourage them to visit",
    "licensed dermatologist",
    "i don't feel comfortable",
    "i'm unable to",
  ];

  // Check Vietnamese refusal patterns
  const vietnameseRefusalKeywords = [
    "tôi không thể",
    "tôi xin lỗi nhưng",
    "không thể giúp",
    "rất tiếc",
    "lo ngại về",
  ];

  for (const keyword of [...englishRefusalKeywords, ...vietnameseRefusalKeywords]) {
    if (lower.includes(keyword)) return true;
  }

  // Caption phải có ít nhất hashtag hoặc SĐT
  if (!text.includes("#") && !text.includes("0979")) return true;

  return false;
}

function getRandomFallbackCaption() {
  const idx = Math.floor(Math.random() * FALLBACK_CAPTIONS.length);
  return FALLBACK_CAPTIONS[idx];
}

// ============================================================
//  CLAUDE VIẾT CAPTION
// ============================================================
async function generateCaption(imageBuffer, mimeType) {
  const imageBase64 = imageBuffer.toString("base64");

  const prompt = `Bạn đang viết bài đăng Facebook cho một dịch vụ làm đẹp gia truyền tại Hà Nội và Quảng Ninh đã hoạt động hơn 10 năm.

Cô Lan là chủ cơ sở. Bài đăng để chia sẻ về công việc hàng ngày của cô — như một người nghệ nhân làm nghề lâu năm chia sẻ với khách hàng cũ.

Hãy viết bài đăng Facebook với:
- Mở đầu thân thiện kiểu "Hôm nay cô lại có một bạn khách..." hoặc "Các bạn ơi..."
- Mô tả ngắn về buổi làm việc trong ngày của cô
- Nhắc đến phương pháp truyền thống của gia đình
- Ghi rõ 2 cơ sở: Hà Nội (P.803 KĐT Resco, Xuân Đỉnh) và Quảng Ninh (chợ Mạo Khê)  
- Mời khách quan tâm nhắn page hoặc gọi 0979.979.981
- Kết thúc với 5-7 hashtag

Yêu cầu:
- Giọng văn ấm áp, gần gũi, tiếng Việt miền Bắc
- 100-150 chữ
- KHÔNG dùng từ ngữ y tế ("chữa", "khỏi", "trị")
- Chỉ chia sẻ về dịch vụ và mời gọi, không cam kết hiệu quả

Chỉ trả về nội dung bài đăng bằng tiếng Việt, không giải thích thêm, không có lời mở đầu.`;

  try {
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

    const caption = response.data.content[0].text;

    // Kiểm tra Claude có từ chối không
    if (isRefusal(caption)) {
      console.log("⚠️  Claude từ chối viết, dùng caption mẫu");
      return getRandomFallbackCaption();
    }

    return caption;
  } catch (err) {
    console.log("⚠️  Lỗi gọi Claude, dùng caption mẫu:", err.message);
    return getRandomFallbackCaption();
  }
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

    const photo = await getNextPhoto(drive);
    if (!photo) return;
    console.log(`📸 Đang xử lý: ${photo.name}`);

    const customerPhotoBuffer = await downloadFromDrive(drive, photo.id);
    console.log("✅ Đã tải ảnh khách");

    const templateBuffer = await downloadFromDrive(drive, POST_CONFIG.TEMPLATE_FILE_ID);
    console.log("✅ Đã tải template");

    const composedImage = await composeWithTemplate(customerPhotoBuffer, templateBuffer);
    console.log("🎨 Đã ghép ảnh thành công");

    console.log("✍️  Claude đang viết caption...");
    const caption = await generateCaption(customerPhotoBuffer, photo.mimeType);
    console.log(`📝 Caption:\n${caption}\n`);

    const postId = await postToFacebook(composedImage, caption);
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
