const { google } = require("googleapis");
const axios = require("axios");
const cron = require("node-cron");
const FormData = require("form-data");
const sharp = require("sharp");

const POST_CONFIG = {
  CRON_SCHEDULE: "0 13 * * *", // 20:00 GMT+7
  PHOTO_FOLDER_ID: process.env.DRIVE_FOLDER_ID, // folder ảnh chưa đăng
  VIDEO_FOLDER_ID: process.env.DRIVE_VIDEO_FOLDER_ID, // folder video chưa đăng (NEW)
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
//  CAPTION MẪU CHO ẢNH
// ============================================================
const PHOTO_CAPTIONS = [
  `Các bạn ơi, hôm nay cô lại có một bạn khách ghé qua cơ sở. Nghề này cô theo từ hồi còn trẻ, học từ bà nội — bà ngày xưa lại được học từ một thầy đông y người Trung Quốc truyền cho ông cô. Đến giờ đã hơn 40 năm rồi, cứ thế mà gắn bó.

Bí quyết bào chế thuốc trong nhà cô chỉ một mình cô nắm được, chấm thuốc cũng có liều lượng riêng — đó là lý do cô không bán thuốc ra ngoài. Khách muốn làm thì đến cơ sở, cô làm trực tiếp.

📍 Hà Nội: P.803 KĐT Resco, Xuân Đỉnh
📍 Quảng Ninh: Chợ Trung tâm Mạo Khê
☎ 0979.979.981

#TayNotRuoi #GiaTruyen3Doi #CoLanMaoKhe #DongYGiaTruyen #HaNoi #QuangNinh`,

  `Hôm nay cô đón thêm một bạn khách mới - bạn ấy được người quen giới thiệu đến cô. Bao năm làm nghề, niềm vui lớn nhất của cô là khách cũ tin tưởng giới thiệu cho người thân, bạn bè 😊

Nhiều bạn ở xa cũng nhắn cô xin mua thuốc về tự chấm, nhưng cô không bán đâu nha. Vì liều lượng và cách chấm là bí quyết riêng, không đúng thì không có tác dụng. Cô làm trực tiếp để đảm bảo cho các bạn.

Bạn nào có nhu cầu cứ ghé cô tại Hà Nội (P.803 KĐT Resco, Xuân Đỉnh) hoặc Quảng Ninh (chợ Mạo Khê), hoặc gọi 0979.979.981 nhé!

#TayNotRuoi #GiaTruyenCoLan #UyTinTanTam #LamDepGiaTruyen`,

  `Các bạn ở xa hỏi cô có đi vào trong Nam làm được không - cô đã có nhiều chuyến đi vào tận TP. Hồ Chí Minh và nhiều tỉnh thành khác để làm cho khách rồi. Bạn nào ở xa có nhu cầu cứ liên hệ trước, cô sẽ sắp xếp lịch.

Còn ở Hà Nội và Quảng Ninh thì cô có cơ sở cố định, các bạn cứ đến trực tiếp:
📍 Hà Nội: P.803 KĐT Resco, Xuân Đỉnh
📍 Quảng Ninh: Chợ Trung tâm Mạo Khê (hỏi cô Lan tẩy nốt ruồi ai cũng biết)

☎ Cô Lan: 0979.979.981

#TayNotRuoi #CoLanMaoKhe #GiaTruyen #HoChiMinh #HaNoi #QuangNinh`,

  `Một ngày làm việc nữa của cô tại cơ sở. Bao nhiêu năm gắn bó với nghề, mỗi khách đến với cô đều là một câu chuyện riêng. Có bạn ngần ngại nốt ruồi trên mặt mãi mới dám đi tẩy, có bạn quan tâm đến sức khỏe muốn xử lý sớm.

Phương pháp gia truyền của nhà cô đã 3 đời, ông cô được học từ thầy đông y Trung Quốc, sau truyền lại trong gia đình. Đến cô là đời thứ ba duy nhất nắm được bí quyết bào chế thuốc.

Bạn nào quan tâm cứ nhắn page hoặc gọi cô qua số 0979.979.981. Cô có cả ở Hà Nội và Quảng Ninh.

#TayNotRuoi #GiaTruyen #CoLan #DongYTruyenThong`,

  `Tại chợ Mạo Khê (Quảng Ninh), nhiều bạn hỏi "tẩy nốt ruồi gia truyền cô Lan" thì hầu như ai cũng biết - bao nhiêu năm cô ở đây làm nghề rồi 😊

Ngoài cơ sở Quảng Ninh, cô còn có cơ sở tại Hà Nội (P.803 KĐT Resco, Xuân Đỉnh) cho các bạn ở khu vực phía Bắc tiện ghé.

Bí quyết gia truyền của gia đình cô là phương pháp đông y, làm trực tiếp lên da, không xâm lấn, không cần dao kéo. Mỗi ca làm chỉ 15-30 phút thôi, các bạn về luôn được.

☎ Đặt lịch: 0979.979.981

#TayNotRuoi #CoLanMaoKhe #ChoMaoKhe #QuangNinh #HaNoi #GiaTruyen`,
];

// ============================================================
//  CAPTION MẪU CHO VIDEO (riêng để phù hợp format video)
// ============================================================
const VIDEO_CAPTIONS = [
  `Cùng xem cô Lan làm việc nhé các bạn 🎬

Phương pháp gia truyền 3 đời của nhà cô — nhẹ nhàng, làm trực tiếp lên da, không xâm lấn, không cần dao kéo. Mỗi ca chỉ 15-30 phút là xong.

Cô có 2 cơ sở:
📍 Hà Nội: P.803 KĐT Resco, Xuân Đỉnh
📍 Quảng Ninh: Chợ Trung tâm Mạo Khê

Bạn nào quan tâm cứ nhắn page hoặc gọi cô:
☎ 0979.979.981

#TayNotRuoi #GiaTruyen #CoLan #DongY #HaNoi #QuangNinh`,

  `Một ngày làm việc của cô Lan 🌿

Bao năm gắn bó với nghề, cô vẫn luôn tận tâm với từng khách hàng. Bí quyết gia truyền của nhà cô được truyền lại 3 đời - từ ông cô (học từ thầy đông y Trung Quốc), đến mẹ cô, rồi đến cô.

Khách muốn làm thì đến trực tiếp 1 trong 2 cơ sở:
📍 Hà Nội: P.803 KĐT Resco, Xuân Đỉnh
📍 Quảng Ninh: Chợ Trung tâm Mạo Khê

☎ Đặt lịch: 0979.979.981

#TayNotRuoi #GiaTruyenCoLan #LamDepTuNhien #UyTinTanTam`,

  `Các bạn xem cô làm cho khách nhé 😊

Nhiều bạn nhắn xin mua thuốc về tự chấm nhưng cô không bán đâu - vì liều lượng và cách chấm là bí quyết riêng, không đúng thì không có tác dụng. Cô chỉ làm trực tiếp để đảm bảo cho các bạn.

Khách ở xa có thể liên hệ để cô sắp xếp lịch đi vào - cô đã từng đi tận TP.HCM và nhiều tỉnh thành khác rồi.

📍 2 cơ sở: Hà Nội + Quảng Ninh
☎ Cô Lan: 0979.979.981

#TayNotRuoi #GiaTruyen #CoLan #HoChiMinh #DiTinh`,

  `Cô Lan đang làm cho một bạn khách 🎥

Tại chợ Mạo Khê (Quảng Ninh) - nơi cô đã làm nghề hơn 40 năm, hỏi "cô Lan tẩy nốt ruồi" ai cũng biết. Cô cũng có cơ sở tại Hà Nội (P.803 KĐT Resco, Xuân Đỉnh) cho các bạn ở phía Bắc.

Phương pháp gia truyền - nhẹ nhàng, làm trực tiếp, an toàn cho da.

☎ Đặt lịch: 0979.979.981

#TayNotRuoi #CoLanMaoKhe #ChoMaoKhe #QuangNinh #HaNoi`,

  `Một ca làm việc của cô Lan ✨

Mỗi ngày cô đón nhiều khách, có bạn ở Hà Nội, có bạn ở Quảng Ninh, có cả bạn từ xa đến. Cô vui nhất là khi khách cũ tin tưởng giới thiệu cho người thân, bạn bè.

Hai cơ sở của cô:
📍 Hà Nội: P.803 KĐT Resco, Xuân Đỉnh
📍 Quảng Ninh: Chợ Trung tâm Mạo Khê

Bạn nào quan tâm cứ nhắn page hoặc gọi 0979.979.981 nhé!

#TayNotRuoi #GiaTruyen #CoLan #LamDepGiaTruyen #UyTin`,
];

// ============================================================
//  HELPERS
// ============================================================
function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function listFiles(drive, folderId, mimeFilter) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains '${mimeFilter}' and trashed = false`,
    fields: "files(id, name, mimeType, size)",
    pageSize: 50,
    orderBy: "createdTime",
  });
  return response.data.files || [];
}

async function downloadFromDrive(drive, fileId) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(response.data);
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

function getRandomCaption(captions) {
  return captions[Math.floor(Math.random() * captions.length)];
}

// ============================================================
//  XỬ LÝ ẢNH
// ============================================================
async function composeWithTemplate(customerPhotoBuffer, templateBuffer) {
  const resizedPhoto = await sharp(customerPhotoBuffer)
    .resize(PHOTO_AREA.width, PHOTO_AREA.height, {
      fit: "cover",
      position: "center",
    })
    .toBuffer();

  return await sharp(templateBuffer)
    .composite([
      { input: resizedPhoto, top: PHOTO_AREA.y, left: PHOTO_AREA.x },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function postPhoto(drive) {
  console.log("📸 Bắt đầu đăng ảnh...");

  const photos = await listFiles(drive, POST_CONFIG.PHOTO_FOLDER_ID, "image/");
  if (photos.length === 0) {
    console.log("⚠️  Không có ảnh trong folder!");
    return false;
  }

  const photo = photos[0];
  console.log(`📸 Đang xử lý: ${photo.name}`);

  const customerPhotoBuffer = await downloadFromDrive(drive, photo.id);
  const templateBuffer = await downloadFromDrive(drive, POST_CONFIG.TEMPLATE_FILE_ID);
  const composedImage = await composeWithTemplate(customerPhotoBuffer, templateBuffer);
  console.log("🎨 Đã ghép ảnh vào template");

  const caption = getRandomCaption(PHOTO_CAPTIONS);
  console.log(`📝 Caption: ${caption.substring(0, 80)}...`);

  const formData = new FormData();
  formData.append("source", composedImage, {
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
  console.log(`🎉 Đã đăng ảnh! Post ID: ${response.data.id}`);

  await moveToPosted(drive, photo.id);
  console.log("📁 Đã chuyển ảnh vào folder Đã đăng");
  return true;
}

// ============================================================
//  XỬ LÝ VIDEO
// ============================================================
async function postVideo(drive) {
  console.log("🎬 Bắt đầu đăng video...");

  const videos = await listFiles(drive, POST_CONFIG.VIDEO_FOLDER_ID, "video/");
  if (videos.length === 0) {
    console.log("⚠️  Không có video trong folder!");
    return false;
  }

  const video = videos[0];
  const sizeMB = (video.size / 1024 / 1024).toFixed(2);
  console.log(`🎬 Đang xử lý: ${video.name} (${sizeMB} MB)`);

  // Tải video về
  const videoBuffer = await downloadFromDrive(drive, video.id);
  console.log("✅ Đã tải video về");

  const caption = getRandomCaption(VIDEO_CAPTIONS);
  console.log(`📝 Caption: ${caption.substring(0, 80)}...`);

  // Upload video lên Facebook
  const formData = new FormData();
  formData.append("source", videoBuffer, {
    filename: video.name,
    contentType: video.mimeType || "video/mp4",
  });
  formData.append("description", caption);
  formData.append("access_token", process.env.PAGE_ACCESS_TOKEN);

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/me/videos`,
    formData,
    {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  );
  console.log(`🎉 Đã đăng video! Video ID: ${response.data.id}`);

  await moveToPosted(drive, video.id);
  console.log("📁 Đã chuyển video vào folder Đã đăng");
  return true;
}

// ============================================================
//  HÀM CHÍNH - QUYẾT ĐỊNH ĐĂNG ẢNH HAY VIDEO
// ============================================================
async function runAutoPost() {
  console.log("🕐 Bắt đầu auto-post...");

  try {
    const drive = getDriveClient();

    // Lịch xen kẽ:
    // Thứ 2 (1), 4 (3), 6 (5) → đăng ảnh
    // Thứ 3 (2), 5 (4), 7 (6), CN (0) → đăng video
    const dayOfWeek = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    ).getDay();

    const isPhotoDay = [1, 3, 5].includes(dayOfWeek);
    const dayName = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dayOfWeek];
    console.log(`📅 Hôm nay là ${dayName} → ưu tiên: ${isPhotoDay ? "ẢNH" : "VIDEO"}`);

    let success = false;

    if (isPhotoDay) {
      success = await postPhoto(drive);
      // Nếu hết ảnh, fallback sang video
      if (!success) {
        console.log("🔄 Hết ảnh, chuyển sang đăng video");
        success = await postVideo(drive);
      }
    } else {
      success = await postVideo(drive);
      // Nếu hết video, fallback sang ảnh
      if (!success) {
        console.log("🔄 Hết video, chuyển sang đăng ảnh");
        success = await postPhoto(drive);
      }
    }

    if (!success) {
      console.log("⚠️  Hết cả ảnh và video! Upload thêm vào Drive nhé.");
    }
  } catch (err) {
    console.error("❌ Lỗi auto-post:", err.message);
    if (err.response?.data) {
      console.error("Chi tiết:", JSON.stringify(err.response.data));
    }
  }
}

function startAutoPost() {
  console.log(`📅 Auto-post đã bật — đăng lúc 20:00 mỗi ngày`);
  console.log(`📸 Ảnh: T2, T4, T6  |  🎬 Video: T3, T5, T7, CN`);
  cron.schedule(POST_CONFIG.CRON_SCHEDULE, runAutoPost, {
    timezone: "Asia/Ho_Chi_Minh",
  });
}

module.exports = { startAutoPost, runAutoPost };
