import { GoogleGenAI } from "@google/genai";

// 1. Chuyển sang Edge Runtime để hỗ trợ Streaming trực tiếp không bị timeout 10s của Vercel
export const runtime = "edge";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req) {
  try {
    const { imagesMinh, imagesNau, contextImages, battleContextText } =
      await req.json();

    const systemInstruction = `
Bạn là Quân Sư Tác Chiến game "Thế Giới Nước Điên Cuồng" (Mad Survivor: Arid War).
Nhiệm vụ: Đọc ảnh hồ sơ 2 bên và bối cảnh sự kiện để xuất KẾ HOẠCH TÁC CHIẾN LIÊN MINH NGẮN GỌN, TRỰC DIỆN.

QUY TẮC PHÂN TÍCH:
- Nhận diện nhanh: Tên, Căn cứ, Lực chiến, Binh chủng (Tàu Tuần Tra / Cano / Thiết Giáp Hạm), Tướng.
- Bám sát Giờ Server (UTC) và quy đổi sang Giờ VN (UTC+7).
- Phân công rõ: Rally Lead (Chủ công), Garrison Lead (Thủ cứ điểm), Fast Capper (Chiếm cờ tốc độ), Chi viện.
- Áp dụng Điền Kỵ Tái Mã xếp cặp.
YÊU CẦU: Xuất ngay dạng gạch đầu dòng mệnh lệnh, không giải thích dài dòng, không chào hỏi.`;

    const contents = [];

    if (contextImages && contextImages.length > 0) {
      contents.push("--- [ẢNH BẢN ĐỒ / THỂ THỨC] ---");
      contextImages.forEach((img) =>
        contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
      );
    }

    contents.push(
      `--- [BỐI CẢNH & GIỜ SERVER]: ${battleContextText || "Tranh đoạt cứ điểm"} ---`,
    );

    contents.push("--- [HỒ SƠ CLAN MÌNH] ---");
    imagesMinh.forEach((img) =>
      contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
    );

    contents.push("--- [HỒ SƠ CLAN NÂU] ---");
    imagesNau.forEach((img) =>
      contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
    );

    contents.push("Xuất kế hoạch tác chiến ngay:");

    // Gọi stream với gemini-3.8-flash, ép nhiệt độ thấp và giới hạn token để tốc độ tối đa
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.8-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1,
        maxOutputTokens: 2048,
        thinkingConfig: {
          thinkingBudget: 0, // Triệt tiêu thời gian suy nghĩ ngầm, nhả chữ lập tức
        },
      },
    });

    // Tạo luồng phản hồi streaming chuẩn Web Stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
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
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    console.error("API Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
