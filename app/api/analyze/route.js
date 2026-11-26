import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req) {
  try {
    const { imagesMinh, imagesNau, contextImages, battleContextText } =
      await req.json();

    const systemInstruction = `
Bạn là Tổng Tham Mưu Trưởng Tác Chiến Liên Minh trong tựa game "Thế Giới Nước Điên Cuồng" (Mad Survivor: Arid War).
Nhiệm vụ: Đọc ảnh hồ sơ hai bên (Clan Mình vs Clan Nâu) và ảnh bản đồ/ghi chú sự kiện để xuất KẾ HOẠCH TÁC CHIẾN LIÊN MINH NGẮN GỌN, TRỰC DIỆN.

QUY TẮC:
1. ĐỌC CHỈ SỐ: Tên, Căn cứ, Lực chiến, Binh chủng sở trường (Tàu Tuần Tra / Cano / Thiết Giáp Hạm), Tướng.
2. QUY ĐỔI GIỜ: Quy đổi giờ Server (UTC) sang Giờ Việt Nam (UTC+7).
3. ĐIỀN KỴ TÁI MÃ: Ghép cặp khắc chế rõ ràng, cách xử lý khi Top 1 Nâu đi Rally.
4. PHÂN CÔNG VAI TRÒ: Rally Lead, Garrison Lead, Fast Capper, Chi viện.
Yêu cầu: Đi thẳng vào mệnh lệnh tác chiến, súc tích, không dông dài.`;

    const contents = [];

    if (contextImages && contextImages.length > 0) {
      contents.push("--- [ẢNH BẢN ĐỒ / THỂ THỨC SỰ KIỆN] ---");
      contextImages.forEach((img) =>
        contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
      );
    }

    contents.push(
      `--- [BỐI CẢNH & MỤC TIÊU]: ${battleContextText || "Chiếm cứ điểm và diệt quân"} ---`,
    );

    contents.push("--- [HỒ SƠ CLAN MÌNH] ---");
    imagesMinh.forEach((img) =>
      contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
    );

    contents.push("--- [HỒ SƠ CLAN NÂU (ĐỐI THỦ)] ---");
    imagesNau.forEach((img) =>
      contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
    );

    contents.push("Xuất kế hoạch tác chiến liên minh chi tiết ngay.");

    // Danh sách model ưu tiên: Thử model 1, nếu quá tải thì tự nhảy sang model 2
    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash"];
    let responseStream = null;
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        responseStream = await ai.models.generateContentStream({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.1,
          },
        });
        if (responseStream) break; // Gọi thành công thì thoát vòng lặp
      } catch (err) {
        console.warn(
          `Model ${modelName} bị lỗi/quá tải, đang chuyển sang model dự phòng...`,
          err.message,
        );
        lastError = err;
      }
    }

    if (!responseStream) {
      throw (
        lastError ||
        new Error(
          "Tất cả các cụm máy chủ AI đang quá tải, vui lòng thử lại sau 30 giây.",
        )
      );
    }

    // Trả stream dữ liệu về giao diện
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            controller.enqueue(encoder.encode(chunk.text));
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
