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
//  (Đa dạng theo các chủ đề khác nhau để page không bị nhàm)
// ============================================================
const FALLBACK_CAPTIONS = [
  // Chủ đề 1: Câu chuyện gia truyền
  `Các bạn ơi, hôm nay cô lại có một bạn khách ghé qua cơ sở. Nghề này cô theo từ hồi còn trẻ, học từ bà nội — bà ngày xưa lại được học từ một thầy đông y người Trung Quốc truyền cho ông cô. Đến giờ đã hơn 40 năm rồi, cứ thế mà gắn bó.

Bí quyết bào chế thuốc trong nhà cô chỉ một mình cô nắm được, chấm thuốc cũng có liều lượng riêng — đó là lý do cô không bán thuốc ra ngoài. Khách muốn làm thì đến cơ sở, cô làm trực tiếp.

📍 Hà Nội: P.803 KĐT Resco, Xuân Đỉnh
📍 Quảng Ninh: Chợ Trung tâm Mạo Khê
☎ 0979.979.981

#TayNotRuoi #GiaTruyen3Doi #CoLanMaoKhe #DongYGiaTruyen #HaNoi #QuangNinh`,

  // Chủ đề 2: Khách quen, được giới thiệu
  `Hôm nay cô đón thêm một bạn khách mới - bạn ấy được người quen giới thiệu đến cô. Bao năm làm nghề, niềm vui lớn nhất của cô là khách cũ tin tưởng giới thiệu cho người thân, bạn bè 😊

Nhiều bạn ở xa cũng nhắn cô xin mua thuốc về tự chấm, nhưng cô không bán đâu nha. Vì liều lượng và cách chấm là bí quyết riêng, không đúng thì không có tác dụng. Cô làm trực tiếp để đảm bảo cho các bạn.

Bạn nào có nhu cầu cứ ghé cô tại Hà Nội (P.803 KĐT Resco, Xuân Đỉnh) hoặc Quảng Ninh (chợ Mạo Khê), hoặc gọi 0979.979.981 nhé!

#TayNotRuoi #GiaTruyenCoLan #UyTinTanTam #LamDepGiaTruyen`,

  // Chủ đề 3: Cô đi xa làm cho khách
  `Các bạn ở xa hỏi cô có đi vào trong Nam làm được không - cô đã có nhiều chuyến đi vào tận TP. Hồ Chí Minh và nhiều tỉnh thành khác để làm cho khách rồi. Bạn nào ở xa có nhu cầu cứ liên hệ trước, cô sẽ sắp xếp lịch.

Còn ở Hà Nội và Quảng Ninh thì cô có cơ sở cố định, các bạn cứ đến trực tiếp:
📍 Hà Nội: P.803 KĐT Resco, Xuân Đỉnh
📍 Quảng Ninh: Chợ Trung tâm Mạo Khê (hỏi cô Lan tẩy nốt ruồi ai cũng biết)

☎ Cô Lan: 0979.979.981

#TayNotRuoi #CoLanMaoKhe #GiaTruyen #HoChiMinh #HaNoi #QuangNinh`,

  // Chủ đề 4: Tâm sự nghề nghiệp
  `Một ngày làm việc nữa của cô tại cơ sở. Bao nhiêu năm gắn bó với nghề, mỗi khách đến với cô đều là một câu chuyện riêng. Có bạn ngần ngại nốt ruồi trên mặt mãi mới dám đi tẩy, có bạn quan tâm đến sức khỏe muốn xử lý sớm.

Phương pháp gia truyền của nhà cô đã 3 đời, ông cô được học từ thầy đông y Trung Quốc, sau truyền lại trong gia đình. Đến cô là đời thứ ba duy nhất nắm được bí quyết bào chế thuốc.

Bạn nào quan tâm cứ nhắn page hoặc gọi cô qua số 0979.979.981. Cô có cả ở Hà Nội và Quảng Ninh.

#TayNotRuoi #GiaTruyen #CoLan #DongYTruyenThong`,

  // Chủ đề 5: Cô ở chợ Mạo Khê
  `Tại chợ Mạo Khê (Quảng Ninh), nhiều bạn hỏi "tẩy nốt ruồi gia truyền cô Lan" thì hầu như ai cũng biết - bao nhiêu năm cô ở đây làm nghề rồi 😊

Ngoài cơ sở Quảng Ninh, cô còn có cơ sở tại Hà Nội (P.803 KĐT Resco, Xuân Đỉnh) cho các bạn ở khu vực phía Bắc tiện ghé.

Bí quyết gia truyền của gia đình cô là phương pháp đông y, làm trực tiếp lên da, không xâm lấn, không cần dao kéo. Mỗi ca làm chỉ 15-30 phút thôi, các bạn về luôn được.

☎ Đặt lịch: 0979.979.981

#TayNotRuoi #CoLanMaoKhe #ChoMaoKhe #QuangNinh #HaNoi #GiaTruyen`,
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

function isRefusal(text) {
  if (!text) return true;
  const lower = text.toLowerCase();
  
  const refusalKeywords = [
    "i'm not able", "i cannot", "i can't", "i won't",
    "regulatory concern", "medical risk", "safety concerns",
    "i'd encourage them to visit", "licensed dermatologist",
    "i don't feel comfortable", "i'm unable to",
    "tôi không thể", "tôi xin lỗi nhưng", "không thể giúp",
    "rất tiếc", "lo ngại về",
  ];

  for (const keyword of refusalKeywords) {
    if (lower.includes(keyword)) return true;
  }

  if (!text.includes("#") && !text.includes("0979")) return true;
  return false;
}

function getRandomFallbackCaption() {
  const idx = Math.floor(Math.random() * FALLBACK_CAPTIONS.length);
  return FALLBACK_CAPTIONS[idx];
}

// ============================================================
//  CLAUDE VIẾT CAPTION (với câu chuyện gia truyền 3 đời)
// ============================================================
async function generateCaption(imageBuffer, mimeType) {
  const imageBase64 = imageBuffer.toString("base64");

  const prompt = `Bạn đang viết bài đăng Facebook cho cơ sở "Tẩy nốt ruồi gia truyền Cô Lan" — đã hoạt động hơn 40 năm tại Hà Nội và Quảng Ninh.

CÂU CHUYỆN GIA TRUYỀN (có thể dùng để làm phong phú bài viết):
- Nghề này được truyền 3 đời trong gia đình cô Lan
- Ngày xưa, ông cô Lan học bí quyết từ một thầy đông y người Trung Quốc
- Ông truyền nghề cho nhiều người con, nhưng chỉ một mình cô Lan học được
- Cô Lan là người duy nhất nắm bí quyết bào chế thuốc
- Bí quyết chấm thuốc, liều lượng đều là bí truyền - cô không bán thuốc ra ngoài
- Cô Lan đã có nhiều chuyến đi vào TP.HCM và các tỉnh khác để làm cho khách
- Tại chợ Mạo Khê, hỏi "cô Lan tẩy nốt ruồi" ai cũng biết

THÔNG TIN CƠ SỞ:
- Hà Nội: P.803 KĐT Resco, Xuân Đỉnh
- Quảng Ninh: Chợ Trung tâm Mạo Khê
- Đặt lịch: 0979.979.981
- Khách ở xa có thể liên hệ để cô sắp xếp lịch đi vào

Hãy viết một bài đăng Facebook tự nhiên, kiểu cô Lan chia sẻ với khách hàng. Có thể chọn 1 trong các góc độ sau:
- Tâm sự về 1 ca làm hôm nay
- Kể câu chuyện gia truyền của gia đình
- Chia sẻ về việc khách cũ giới thiệu khách mới
- Nhắc đến chuyến đi xa làm cho khách
- Lý do không bán thuốc

Yêu cầu:
- Giọng cô Lan: ấm áp, gần gũi, tiếng Việt miền Bắc tự nhiên
- 100-180 chữ
- Nhắc 2 cơ sở Hà Nội + Quảng Ninh
- Mời nhắn page hoặc gọi 0979.979.981
- Kết thúc với 5-7 hashtag
- KHÔNG dùng từ y tế ("chữa", "khỏi", "trị", "điều trị")
- Chỉ chia sẻ về dịch vụ và mời gọi

Chỉ trả về nội dung bài đăng bằng tiếng Việt, không lời mở đầu, không giải thích.`;

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 700,
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
