const { google } = require("googleapis");
const axios = require("axios");
const cron = require("node-cron");
const FormData = require("form-data");
const sharp = require("sharp");

const POST_CONFIG = {
  CRON_SCHEDULE: "0 13 * * *", // 20:00 GMT+7
  PHOTO_FOLDER_ID: process.env.DRIVE_FOLDER_ID,
  VIDEO_FOLDER_ID: process.env.DRIVE_VIDEO_FOLDER_ID,
  POSTED_FOLDER_ID: process.env.DRIVE_POSTED_FOLDER_ID,
  TEMPLATE_FILE_ID: process.env.DRIVE_TEMPLATE_FILE_ID,
  COOLDOWN_HOURS: 12,
  RECENT_CAPTIONS_TO_AVOID: 14, // Tránh lặp 14 caption gần nhất
};

const PHOTO_AREA = { x: 0, y: 0, width: 1080, height: 864 };

// ============================================================
//  10 ANGLES - mỗi angle là 1 góc nhìn khác nhau
// ============================================================
const ANGLES = [
  {
    name: "Tâm sự cá nhân",
    instruction: "Viết kiểu cô Lan tâm sự về 1 ca làm hôm nay - kể về cảm xúc của cô khi làm xong cho khách, nhìn khách vui mà cô cũng vui. Mở đầu không phải 'Các bạn ơi'.",
  },
  {
    name: "Đối thoại với khách",
    instruction: "Bắt đầu bằng 1 câu nói của khách hàng (trong dấu ngoặc kép), sau đó cô Lan kể lại tình huống đó. Ví dụ: '\"Cô ơi cháu có đau không?\" - câu cô nghe nhiều nhất...'",
  },
  {
    name: "Hồi tưởng về ông",
    instruction: "Kể về kỷ niệm cô học nghề từ ông - ông dặn gì, dạy gì. Liên kết với việc cô đang làm hôm nay. Mở đầu kiểu 'Cô vẫn nhớ năm cô...' hoặc 'Ngày xưa ông cô bảo...'",
  },
  {
    name: "Câu chuyện 3 đời",
    instruction: "Kể về sự truyền nghề trong gia đình - ông học từ thầy đông y Trung Quốc, ông truyền lại cho mẹ, đến cô. Tại sao chỉ một mình cô nắm bí quyết. Mở đầu kiểu kể chuyện.",
  },
  {
    name: "Khách giới thiệu khách",
    instruction: "Chia sẻ niềm vui khi khách cũ giới thiệu khách mới. Kể tình huống cụ thể: hôm nay 1 bạn đến, bảo được dì/mẹ/bạn giới thiệu. Đó là tài sản 40 năm của cô.",
  },
  {
    name: "Chuyến đi xa",
    instruction: "Kể về chuyến đi vào TP.HCM hoặc tỉnh khác làm cho khách. Cảm xúc khi gặp lại khách cũ ở xa. Mời khách ở xa liên hệ trước để cô sắp xếp.",
  },
  {
    name: "Kiến thức về nốt ruồi",
    instruction: "Chia sẻ kiến thức hữu ích về nốt ruồi/đồi mồi - loại nào nên tẩy, loại nào không. Kết hợp với ảnh đang làm. Mở đầu kiểu 'Nhiều bạn hỏi cô...' hoặc câu hỏi.",
  },
  {
    name: "Cảm ơn cộng đồng",
    instruction: "Bài cảm ơn các khách đã tin tưởng cô bao năm. Số khách trong tuần/tháng cụ thể. Niềm vui không phải tiền mà là sự tin tưởng. Tone biết ơn, ấm áp.",
  },
  {
    name: "Đời sống chợ Mạo Khê",
    instruction: "Kể về cuộc sống tại chợ Mạo Khê - sáng sớm, người ở chợ biết cô, gọi tên cô. Cảm giác gắn bó với mảnh đất này 40 năm. Tone gần gũi.",
  },
  {
    name: "Tự hào nghề gia truyền",
    instruction: "Tự hào về phương pháp gia truyền - nhẹ nhàng, an toàn, không xâm lấn. Lý do cô không bán thuốc ra ngoài. Tone tự tin nhưng không khoe khoang.",
  },
];

// ============================================================
//  POOL 30 CAPTION FALLBACK - đa dạng 6 chủ đề × 5 cap
// ============================================================
const FALLBACK_CAPTIONS = [
  // ===== Chủ đề 1: Câu chuyện gia truyền (5 cap) =====
  `Cô vẫn nhớ năm cô 18 tuổi, ông cô gọi về dạy cho cô từng giọt thuốc, từng cách chấm. Ông bảo "trong nhà phải có người giữ nghề, không được để mất". Đến giờ đã hơn 40 năm rồi, cô vẫn làm theo những gì ông dạy.

Bí quyết bào chế thuốc trong nhà cô chỉ một mình cô nắm được. Nhiều bạn xin mua nhưng cô không bán đâu — vì sai liều lượng thì uổng công các bạn.

📞 Đặt lịch: 0979.979.981
📍 Hà Nội · Quảng Ninh

#GiaTruyen3Doi #CoLan #DongYTruyenThong #40NamLamNghe`,

  `Ngày xưa, ông cô được một thầy đông y người Trung Quốc truyền cho bài thuốc gia truyền này. Ông học mất bao năm mới nắm hết bí quyết. Sau ông truyền cho con cháu, nhưng chỉ mỗi cô là học được trọn vẹn.

Đến giờ trong gia đình cô là người duy nhất nắm bí quyết. Đó là lý do cô làm trực tiếp, không bán thuốc — vì chỉ cô biết liều lượng đúng cho từng loại nốt ruồi, đồi mồi.

☎ 0979.979.981
📍 P.803 KĐT Resco, Xuân Đỉnh, HN
📍 Chợ Trung tâm Mạo Khê, QN

#TayNotRuoi #BiQuyetGiaTruyen #DongYTrungHoa`,

  `Có người hỏi cô "tại sao bao đời truyền nghề mà chỉ cô học được?" Cô trả lời: vì học cái này không chỉ là kỹ thuật, mà còn là cái duyên với nghề. Mấy người con khác của ông cũng được dạy, nhưng không ai theo đến cùng.

Cô may mắn được ông tin tưởng, dặn dò từng chi tiết. Bao năm rồi, cô vẫn giữ nguyên cách làm như ông dạy.

📞 0979.979.981 - Cô Lan
#DuyenNghe #GiaTruyen #CoLanMaoKhe`,

  `Trong tủ nhà cô có một cuốn sổ cũ - ông cô viết lại các bài thuốc gia truyền cho con cháu. Cô vẫn giữ đến giờ. Mỗi lần làm cho khách, cô vẫn nhớ những lời ông dặn về liều lượng, cách chấm.

40 năm trôi qua, cô vẫn trung thành với phương pháp đó. Không thay đổi, không cải tiến lung tung. Vì cái gì truyền 3 đời rồi thì có lý do của nó.

☎ Đặt lịch trực tiếp: 0979.979.981
#GiaTruyen #BiQuyetGiaDinh #UyTin40Nam`,

  `Có bạn nhắn cô: "Sao cô không truyền nghề cho con để mở nhiều cơ sở?" - Cô cười. Vì truyền nghề không đơn giản, phải có duyên. Ông cô cũng từng cố truyền cho nhiều con nhưng chỉ mỗi cô học được.

Có lẽ vì vậy mà nghề này quý. Không phải ai cũng làm được, không phải tiền nhiều là mua được bí quyết. Cô làm vì giữ nghề ông truyền, không vì mở rộng kinh doanh.

📞 0979.979.981
#GiuNghe #GiaTruyen #CoLan`,

  // ===== Chủ đề 2: Khách giới thiệu (5 cap) =====
  `Sáng nay có một bạn khách trẻ đến, vừa ngồi xuống đã bảo "cháu được dì cháu giới thiệu, dì làm ở chỗ cô năm ngoái". Bao năm làm nghề, nghe câu đó cô vui lắm — vì có nghĩa khách cũ tin tưởng cô.

Cứ như vậy, chợ Mạo Khê này, nhiều gia đình 2-3 đời đều đến cô. Có cô có chú, có mẹ có con cùng đến. Đó là tài sản lớn nhất của cô sau 40 năm.

☎ 0979.979.981 — Cô Lan
#KhachGioiThieu #CoLanMaoKhe #UyTin40Nam`,

  `Hôm nay cô đón thêm 3 bạn khách mới, cả 3 đều được người quen giới thiệu đến. Cô vui không phải vì có khách mới, mà vì biết khách cũ vẫn nhớ và tin cô.

Bao năm làm nghề, cô không quảng cáo nhiều, chủ yếu khách cũ giới thiệu khách mới. Đó là cách marketing tốt nhất - không phải tiền mà là sự tin tưởng.

📞 Đặt lịch: 0979.979.981
📍 Hà Nội · Quảng Ninh
#TruyenMieng #UyTinTanTam`,

  `"Cô ơi, mẹ cháu năm trước làm chỗ cô, hôm nay cháu đến" - câu chào của một bạn sáng nay. Cô nhớ ngay người mẹ, kể chuyện ngày đó. Hai mẹ con cùng đến cô tẩy nốt ruồi, đó là điều cô tự hào nhất.

Khách cũ giới thiệu khách mới, đời này qua đời khác. Đó là cái lộc của nghề gia truyền.

☎ 0979.979.981
#KhachGioiThieu #CoLan #GiaDinhCoLan`,

  `Tuần này cô gặp 2 bạn khách - cả hai đều bảo bạn ấy được giới thiệu từ một người làm với cô 5-7 năm trước. Cô bất ngờ vì lâu vậy mà các bạn vẫn nhớ.

Có lẽ kết quả tốt là cách quảng cáo bền nhất. Cô làm xong khách hài lòng, nhiều năm sau vẫn giới thiệu cho người thân. Đó là điều ý nghĩa hơn cả tiền.

📞 Liên hệ: 0979.979.981
#KhachQuen #UyTinLauNam`,

  `Chiều nay cô có 1 cuộc hẹn đặc biệt - 3 chị em ruột cùng đến tẩy nốt ruồi. Chị cả đến trước, sau giới thiệu cho 2 em. Bao nhiêu gia đình đến với cô như vậy rồi.

Đó là điều cô trân trọng nhất - sự tin tưởng được truyền từ người này qua người khác trong gia đình. Không phải ai cũng có được điều đó.

☎ 0979.979.981
#GiaDinh #KhachQuen #CoLan`,

  // ===== Chủ đề 3: Chuyến đi xa (5 cap) =====
  `Tháng trước cô vào TP.HCM làm cho mấy bạn khách trong đó. Có bạn 3 năm rồi vẫn nhắn cô "khi nào cô vào lại Sài Gòn báo cháu nhé". Cô cảm động lắm.

Bạn nào ở xa Hà Nội, Quảng Ninh có nhu cầu cứ nhắn cô, gom đủ người là cô sắp xếp lịch đi vào. Cô đã đi nhiều tỉnh rồi — Đà Nẵng, Cần Thơ, Vũng Tàu...

📞 Liên hệ trước: 0979.979.981
#TayNotRuoiSaiGon #DiTinh #CoLanGiaTruyen`,

  `Sắp tới cô có chuyến đi vào miền Trung. Bạn nào ở Đà Nẵng, Huế, Quảng Bình muốn làm thì nhắn cô trước nhé, để cô sắp xếp lịch và địa điểm.

Cô đi xa không phải để mở rộng kinh doanh, mà vì có nhiều bạn ở xa, đi ra Bắc khó. Cô sắp xếp được thì đi để các bạn không phải chờ.

☎ 0979.979.981 - Cô Lan
#DiMienTrung #DaNang #Hue`,

  `Có bạn ở Cần Thơ nhắn cô từ năm ngoái: "Cô ơi, lần sau cô vào Nam nhớ ghé Cần Thơ nhé". Cô vẫn nhớ. Lần sau vào TP.HCM xong cô sẽ tranh thủ qua Cần Thơ vài hôm.

Cô không có cơ sở cố định ở miền Nam, nhưng các bạn cứ liên hệ trước, gom đủ người thì cô sắp xếp. Cô làm tại nhà khách hoặc khách sạn đều được.

📞 0979.979.981
#CanTho #MienNam #CoLan`,

  `Chuyến đi vào TP.HCM lần trước cô làm cho 12 bạn trong 3 ngày. Có bạn ở quận 1, có bạn từ Bình Dương lên. Mọi người đều bảo "lâu lắm rồi mới có người ra Bắc vào tận đây làm".

Cô đi không phải vì lợi nhuận, đi vì nghề. Khách tin cô, gọi cô vào, cô sắp xếp được thì đi.

☎ Đặt lịch chuyến tới: 0979.979.981
#DiSaiGon #LamTaiNha #CoLan`,

  `Bạn nào ở Hà Tĩnh, Nghệ An, Thanh Hóa muốn làm mà ngại đi Hà Nội/Quảng Ninh thì nhắn cô. Cô có chuyến công tác qua các tỉnh này hàng tháng, có thể ghé qua làm cho các bạn.

Liên hệ trước nhé, cô sắp xếp lịch theo từng vùng. Một bạn ở xa khó, gom 3-4 bạn cô đến luôn.

📞 0979.979.981
#MienBacTrung #DiTinh #PhucVuKhachXa`,

  // ===== Chủ đề 4: Kiến thức nốt ruồi/đồi mồi (5 cap) =====
  `Nhiều bạn hỏi cô "nốt ruồi nào nên tẩy, nốt ruồi nào không?" Cô chia sẻ:

✓ Nốt nhỏ, đều màu, cố định nhiều năm → an toàn để tẩy
✗ Nốt to lên nhanh, đổi màu, nhiều màu khác nhau → cần đi khám da liễu trước
✗ Nốt đang ngứa, chảy máu → KHÔNG tẩy

Bạn không chắc cứ gửi ảnh cho cô qua Messenger, cô tư vấn miễn phí.

☎ 0979.979.981
#KienThucNotRuoi #LamDepAnToan`,

  `Đồi mồi và tàn nhang khác nhau như thế nào, các bạn biết không?

🔸 Đồi mồi: đốm nâu lớn, đậm, thường ở má/trán, do tuổi tác và nắng
🔸 Tàn nhang: đốm nhỏ, màu nâu nhạt, di truyền

Cả hai đều có thể xử lý được bằng phương pháp gia truyền của cô. Bạn nào quan tâm cứ ghé cô tư vấn.

📞 0979.979.981
📍 Hà Nội · Quảng Ninh
#DoiMoi #TanNhang #KienThucDa`,

  `Sau khi tẩy nốt ruồi, các bạn cần lưu ý:

1. KIÊNG NƯỚC vùng đó trong 24h đầu
2. Vùng da sẽ đóng vảy, tự rụng sau 5-7 ngày
3. KHÔNG cạy vảy (sẽ để lại sẹo)
4. Tránh nắng gắt vùng vừa làm trong 1 tuần
5. Nếu chưa hết hoàn toàn, cô làm lại miễn phí

Đơn giản vậy thôi, không cần kiêng cữ phức tạp.

☎ Tư vấn: 0979.979.981
#HuongDanSauKhiLam #ChamSocDa`,

  `Có bạn hỏi: "Cô ơi, tẩy nốt ruồi có để lại sẹo không?"

Phụ thuộc vào 3 yếu tố:
- Phương pháp tẩy (laser, đốt, hoá chất, gia truyền)
- Cơ địa người làm
- Cách chăm sóc sau

Phương pháp gia truyền của cô làm nhẹ nhàng, ít kích ứng, vảy tự rụng. Đa số khách của cô không để sẹo, hoặc rất mờ.

📞 0979.979.981
#CoSeoKhong #PhuongPhapAnToan`,

  `Mụn cóc, mụn cơm khác mụn thường ở chỗ nào, bạn biết không?

🔸 Mụn cóc: do virus HPV, thường ở tay/chân, sần sùi
🔸 Mụn cơm: cũng do HPV, mặt/cổ, mịn hơn
🔸 Mụn thường: do dầu nhờn, thường ở mặt/lưng

Cô xử lý được mụn cóc và mụn cơm bằng phương pháp gia truyền. Mụn thường thì cô không làm vì đó là vấn đề da khác.

☎ 0979.979.981
#MunCoc #MunCom #KienThuc`,

  // ===== Chủ đề 5: Tâm sự nghề (5 cap) =====
  `Hôm nay vắng khách, cô ngồi nghĩ lại 40 năm làm nghề. Bao nhiêu khuôn mặt, bao nhiêu câu chuyện đi qua tay cô. Có người vui vì hết nốt ruồi tự ti bao năm. Có người ngại đi spa nên tìm đến cô.

Cô vẫn giữ nghề như ông dạy: tận tâm, đúng phương pháp, không vì lợi nhuận mà làm ẩu. Đó là lý do nhiều người tin cô.

📞 0979.979.981 — Cô Lan, chợ Mạo Khê
#NgheGiaTruyen #40NamLamNghe`,

  `Có người hỏi cô: "40 năm rồi cô không thấy chán nghề này à?" Cô lắc đầu. Vì mỗi khách đến với cô đều khác nhau, mỗi câu chuyện một mới mẻ.

Có bạn ngần ngại nốt ruồi 10 năm mới đi tẩy. Có bạn trẻ vừa lớn đã muốn xinh đẹp. Mỗi người một lý do, cô lắng nghe và chia sẻ. Đó là điều giữ cô gắn bó với nghề.

☎ 0979.979.981
#TamSuNghe #LamNgheBangTinhCam`,

  `Một ngày của cô bắt đầu từ 7h sáng - dọn cơ sở, chuẩn bị thuốc. 8h là khách bắt đầu đến. Có bạn đặt lịch trước, có bạn vãng lai ghé qua chợ.

Đến 11h trưa cô nghỉ ăn, chiều lại tiếp tục đến 5h. Lịch trình bao năm không thay đổi. Đơn giản vậy thôi, nhưng cô thấy đủ.

📞 0979.979.981
📍 Chợ Trung tâm Mạo Khê, Quảng Ninh
#NgayCuaCoLan #ChoMaoKhe`,

  `Có bạn bảo cô: "Cô làm nghề này 40 năm chắc giàu lắm". Cô cười. Cô không giàu, nhưng đủ sống và đủ vui.

Vì nghề này không phải nghề kinh doanh - không quảng cáo rầm rộ, không bán hàng trăm khách/ngày. Mỗi ngày 5-10 bạn là cô làm hết tâm. Đủ rồi.

☎ Đặt lịch: 0979.979.981
#NgheGiaTruyen #DuLaDuoc`,

  `Khoảng thời gian khó nhất là dịch Covid - cô đóng cửa cơ sở mấy tháng. Lúc đó nhiều bạn nhắn hỏi: "Cô khoẻ không, khi nào mở lại?". Đó là động lực để cô vượt qua.

Bao nhiêu năm có nhiều thăng trầm, nhưng cô luôn có khách bên cạnh ủng hộ. Cô biết ơn lắm.

📞 0979.979.981
#NhinLai #BietOnKhach`,

  // ===== Chủ đề 6: Đời sống chợ Mạo Khê (5 cap) =====
  `Sáng sớm chợ Mạo Khê đông nhộn, cô ngồi từ 8h đến 11h là đông khách rồi. Có bác bán cá đi ngang vào hỏi thăm, có cô bán rau sang chơi.

Người ở chợ này biết cô từ ngày cô còn trẻ. Hỏi "Cô Lan tẩy nốt ruồi" thì ai cũng chỉ. Đó là cái duyên mà cô có được sau bao năm gắn bó với mảnh đất này.

📞 0979.979.981
#ChoMaoKhe #QuangNinh #CoLanGiaTruyen`,

  `Chợ Mạo Khê 30 năm trước khác lắm so với bây giờ. Khi cô mới mở cửa hàng, chợ còn nhỏ, vài chục hộ kinh doanh. Giờ đông đúc, sầm uất.

Nhưng có một thứ không đổi - đó là tình cảm của những người buôn bán quanh đây. Mọi người vẫn quan tâm, hỏi thăm nhau như xưa.

☎ 0979.979.981
📍 Chợ Trung tâm P. Mạo Khê
#MaoKhe #KyNiemChoMaoKhe`,

  `Hôm qua cô bán cá bên cạnh sang chơi, kể chuyện cháu bà ấy bị nốt ruồi to ở má, ngại đi học. Cô bảo "đưa cháu sang đây cô tẩy cho", bà cảm ơn rối rít.

Đời sống chợ là vậy - mọi người giúp đỡ nhau như người nhà. Cô có nghề, ai cần cô giúp thì giúp. Đơn giản vậy thôi.

📞 0979.979.981
#TinhLangNgheo #ChoMaoKhe`,

  `Mỗi sáng đi làm cô đều ghé hàng phở quen ăn sáng. Bà chủ quán làm cô bát phở quen thuộc 20 năm rồi. Đó là một trong nhiều niềm vui nhỏ của cuộc sống chợ.

Bao năm gắn bó với Mạo Khê, cô không nghĩ sẽ chuyển đi đâu. Đây là quê hương thứ hai của cô.

☎ Đặt lịch tại Mạo Khê: 0979.979.981
#MaoKheLaNha #DoiSongCho`,

  `Sáng nay đi qua chợ, có bác bảo "Cô Lan, cháu tôi mới mọc nốt ruồi to, hôm nào dắt cháu sang nhé". Cô bảo cứ cuối tuần đưa cháu qua, cô làm cho.

Người ở chợ là vậy - thân thiết như gia đình. Bao năm rồi, cô không chỉ làm khách quen mà còn là láng giềng, hàng xóm của mọi người.

📞 0979.979.981
#LangXom #ChoMaoKhe`,
];

// ============================================================
//  TRACKING - tránh dùng lại caption gần đây
// ============================================================
let recentCaptionIndexes = []; // lưu index của caption đã dùng gần đây
let lastPostTimestamp = 0;

function pickFreshCaptionIndex() {
  // Lọc ra các index chưa dùng gần đây
  const usedSet = new Set(recentCaptionIndexes);
  const available = FALLBACK_CAPTIONS
    .map((_, idx) => idx)
    .filter((idx) => !usedSet.has(idx));

  // Nếu hết caption fresh → reset (bắt đầu lại)
  if (available.length === 0) {
    recentCaptionIndexes = [];
    return Math.floor(Math.random() * FALLBACK_CAPTIONS.length);
  }

  // Random từ pool còn lại
  const pickedIdx = available[Math.floor(Math.random() * available.length)];

  // Lưu vào lịch sử (giữ tối đa 14 cái gần nhất)
  recentCaptionIndexes.push(pickedIdx);
  if (recentCaptionIndexes.length > POST_CONFIG.RECENT_CAPTIONS_TO_AVOID) {
    recentCaptionIndexes.shift();
  }

  return pickedIdx;
}

function getRandomFallbackCaption() {
  const idx = pickFreshCaptionIndex();
  return FALLBACK_CAPTIONS[idx];
}

function pickRandomAngle() {
  return ANGLES[Math.floor(Math.random() * ANGLES.length)];
}

// ============================================================
//  COOLDOWN
// ============================================================
function canPost() {
  const elapsed = Date.now() - lastPostTimestamp;
  return elapsed >= POST_CONFIG.COOLDOWN_HOURS * 60 * 60 * 1000;
}

function getCooldownRemaining() {
  const elapsed = Date.now() - lastPostTimestamp;
  const remaining = POST_CONFIG.COOLDOWN_HOURS * 60 * 60 * 1000 - elapsed;
  if (remaining <= 0) return "0 phút";
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// ============================================================
//  REFUSAL DETECTION
// ============================================================
function isRefusal(text) {
  if (!text) return true;
  const lower = text.toLowerCase();
  const keywords = [
    "i'm not able", "i cannot", "i can't", "i won't",
    "regulatory concern", "medical risk", "safety concerns",
    "i'd encourage them to visit", "licensed dermatologist",
    "i don't feel comfortable", "i'm unable to",
    "tôi không thể", "tôi xin lỗi nhưng", "không thể giúp",
    "rất tiếc", "lo ngại về",
  ];
  for (const kw of keywords) if (lower.includes(kw)) return true;
  if (!text.includes("#") && !text.includes("0979")) return true;
  return false;
}

// ============================================================
//  CLAUDE WRITE CAPTION (10 angles, mỗi lần khác nhau)
// ============================================================
async function generateCaptionWithClaude(imageBuffer, mimeType) {
  const angle = pickRandomAngle();
  console.log(`🎭 Angle: ${angle.name}`);

  const prompt = `Bạn đang viết bài đăng Facebook cho cơ sở "Tẩy nốt ruồi gia truyền Cô Lan" - đã hoạt động 40 năm tại Hà Nội và Quảng Ninh.

THÔNG TIN VỀ CÔ LAN:
- Nghề gia truyền 3 đời, ông cô học từ một thầy đông y người Trung Quốc
- Cô là người duy nhất trong gia đình nắm bí quyết bào chế thuốc
- Hơn 40 năm kinh nghiệm, nổi tiếng tại chợ Mạo Khê, Quảng Ninh
- Cô có chuyến đi vào TP.HCM và các tỉnh khác để làm cho khách
- Cô KHÔNG bán thuốc - chỉ làm trực tiếp tại cơ sở
- 2 cơ sở: Hà Nội (P.803 KĐT Resco, Xuân Đỉnh) và Quảng Ninh (chợ Trung tâm Mạo Khê)
- SĐT: 0979.979.981

GÓC ĐỘ HÔM NAY: ${angle.name}
HƯỚNG DẪN: ${angle.instruction}

Đây là ảnh quá trình cô Lan đang làm việc cho khách.

Yêu cầu bài viết:
- Theo đúng góc độ và hướng dẫn ở trên
- Tiếng Việt miền Bắc tự nhiên, ấm áp
- 100-180 chữ
- KHÔNG dùng từ y tế ("chữa", "khỏi", "trị", "điều trị")
- Mở đầu KHÔNG được là "Các bạn ơi" (đã quá nhàm)
- Cuối bài ghi đầy đủ:
  + 2 cơ sở (HN + QN)
  + SĐT 0979.979.981
  + 5-7 hashtag tiếng Việt CamelCase

Chỉ trả về nội dung bài đăng, không lời mở đầu, không giải thích.`;

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: imageBuffer.toString("base64") } },
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
      console.log("⚠️  Claude từ chối, dùng fallback pool");
      return getRandomFallbackCaption();
    }
    console.log("✨ Claude đã viết caption mới");
    return caption;
  } catch (err) {
    console.log("⚠️  Lỗi Claude, dùng fallback:", err.message);
    return getRandomFallbackCaption();
  }
}

// ============================================================
//  GOOGLE DRIVE HELPERS
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

// ============================================================
//  XỬ LÝ ẢNH (Claude write + template)
// ============================================================
async function composeWithTemplate(customerPhotoBuffer, templateBuffer) {
  const resizedPhoto = await sharp(customerPhotoBuffer)
    .resize(PHOTO_AREA.width, PHOTO_AREA.height, { fit: "cover", position: "center" })
    .toBuffer();
  return await sharp(templateBuffer)
    .composite([{ input: resizedPhoto, top: PHOTO_AREA.y, left: PHOTO_AREA.x }])
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

  // Claude write caption dựa trên ảnh GỐC (chưa ghép)
  console.log("✍️  Claude đang viết caption...");
  const caption = await generateCaptionWithClaude(customerPhotoBuffer, photo.mimeType);
  console.log(`📝 Caption: ${caption.substring(0, 100)}...`);

  const formData = new FormData();
  formData.append("source", composedImage, { filename: "post.jpg", contentType: "image/jpeg" });
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
//  XỬ LÝ VIDEO (caption từ pool, không dùng Claude vì khó xem video)
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

  const videoBuffer = await downloadFromDrive(drive, video.id);
  console.log("✅ Đã tải video về");

  // Caption từ pool (đa dạng + tracking)
  const caption = getRandomFallbackCaption();
  console.log(`📝 Caption: ${caption.substring(0, 100)}...`);

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
//  HÀM CHÍNH
// ============================================================
async function runAutoPost() {
  console.log("🕐 Bắt đầu auto-post...");

  if (!canPost()) {
    console.log(`🛡️  CHẶN SPAM: Cooldown còn ${getCooldownRemaining()}. Bỏ qua.`);
    return;
  }

  try {
    const drive = getDriveClient();
    const dayOfWeek = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    ).getDay();

    const isPhotoDay = [1, 3, 5].includes(dayOfWeek);
    const dayName = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dayOfWeek];
    console.log(`📅 ${dayName} → ưu tiên: ${isPhotoDay ? "ẢNH" : "VIDEO"}`);

    let success = false;

    if (isPhotoDay) {
      success = await postPhoto(drive);
      if (!success) {
        console.log("🔄 Hết ảnh, chuyển sang video");
        success = await postVideo(drive);
      }
    } else {
      success = await postVideo(drive);
      if (!success) {
        console.log("🔄 Hết video, chuyển sang ảnh");
        success = await postPhoto(drive);
      }
    }

    if (!success) {
      console.log("⚠️  Hết cả ảnh và video! Upload thêm vào Drive nhé.");
    } else {
      lastPostTimestamp = Date.now();
      console.log(`🛡️  Cooldown ${POST_CONFIG.COOLDOWN_HOURS}h kích hoạt`);
    }
  } catch (err) {
    console.error("❌ Lỗi:", err.message);
    if (err.response?.data) {
      console.error("Chi tiết:", JSON.stringify(err.response.data));
    }
  }
}

function startAutoPost() {
  console.log(`📅 Auto-post 20:00 mỗi ngày`);
  console.log(`📸 Ảnh: T2, T4, T6  |  🎬 Video: T3, T5, T7, CN`);
  console.log(`🤖 Caption: Claude AI viết động (10 angles) + ${FALLBACK_CAPTIONS.length} mẫu fallback`);
  console.log(`🛡️  Cooldown: ${POST_CONFIG.COOLDOWN_HOURS}h | Tracking: tránh ${POST_CONFIG.RECENT_CAPTIONS_TO_AVOID} caption gần nhất`);
  cron.schedule(POST_CONFIG.CRON_SCHEDULE, runAutoPost, {
    timezone: "Asia/Ho_Chi_Minh",
  });
}

module.exports = { startAutoPost, runAutoPost };
