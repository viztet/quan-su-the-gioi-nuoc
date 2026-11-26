import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req) {
  try {
    const { imagesMinh, imagesNau, contextImages, battleContextText } =
      await req.json();

    const systemInstruction = `
Bạn là Tổng Tham Mưu Trưởng Tác Chiến Liên Minh trong tựa game "Thế Giới Nước Điên Cuồng" (Mad Survivor: Arid War).
Nhiệm vụ: Phân tích ảnh hồ sơ hai bên (Clan Mình vs Clan Nâu) và ảnh bản đồ/thể thức sự kiện để xuất KẾ HOẠCH TÁC CHIẾN LIÊN MINH CHI TIẾT.

QUY TẮC PHÂN TÍCH:
1. ĐỌC CHỈ SỐ: Bóc tách Tên, Cấp căn cứ nổi, Lực chiến tổng, Cấp lính/thuyền, Anh hùng và binh chủng sở trường (Tàu Tuần Tra / Cano Cao Tốc / Thiết Giáp Hạm).
2. QUY ĐỔI THỜI GIAN: Bám sát theo GIỜ SERVER (UTC). Khi xuất mốc giờ tập kết, ghi rõ cả 2 mốc: Giờ Server (UTC) và Giờ Việt Nam (UTC+7).
3. ĐIỀN KỴ TÁI MÃ & KHẮC CHẾ:
   - Ghép cặp cụ thể: Ai bên mình kiềm tỏa ai bên Nâu.
   - Cách câu giờ khi Top 1 Nâu đi Rally; dồn lực lượng nào đánh chiếm cứ điểm/nhà máy lọc nước.
4. PHÂN CÔNG VAI TRÒ (GỌI ĐÍCH DANH TÊN):
   - Rally Leaders (Mũi nhọn dồn quân).
   - Garrison Leads (Thủ cứ điểm/thành lũy).
   - Fast Cappers (Cano chiếm cờ đầu trận).
   - Đội chi viện (Gửi loại quân phù hợp vào Rally).
Lời văn dứt khoát, mang tính mệnh lệnh quân sự.`;

    const contents = [];

    // Nạp ảnh thể thức / bản đồ
    if (contextImages && contextImages.length > 0) {
      contents.push("--- [ẢNH BẢN ĐỒ / THỂ THỨC SỰ KIỆN] ---");
      contextImages.forEach((img) =>
        contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
      );
    }

    // Nạp bối cảnh gõ tay
    contents.push(
      `--- [MÔ TẢ BỐI CẢNH & MỤC TIÊU]: ${battleContextText || "Chiếm cứ điểm và diệt quân"} ---`,
    );

    // Nạp ảnh Clan Mình
    contents.push("--- [HỒ SƠ THÀNH VIÊN CLAN MÌNH] ---");
    imagesMinh.forEach((img) =>
      contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
    );

    // Nạp ảnh Clan Nâu
    contents.push("--- [HỒ SƠ THÀNH VIÊN CLAN NÂU (ĐỐI THỦ)] ---");
    imagesNau.forEach((img) =>
      contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
    );

    contents.push(
      "Hãy phân tích toàn bộ dữ liệu trên và xuất phương án tác chiến liên minh chi tiết ngay.",
    );

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2,
      },
    });

    return NextResponse.json({ result: response.text });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
