import { GoogleGenAI } from "@google/genai";

export const runtime = "edge";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Danh sách các model tương thích hiện tại để tự động chuyển luân phiên khi có lỗi 503
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.0-flash"];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req) {
  try {
    const { imagesMinh, imagesNau, contextImages, battleContextText } =
      await req.json();

    const systemInstruction = `
Bạn là Quân Sư Tác Chiến game "Thế Giới Nước Điên Cuồng" (Mad Survivor: Arid War).
Nhiệm vụ: Phân tích ảnh hồ sơ 2 bên và bối cảnh để xuất KẾ HOẠCH TÁC CHIẾN LIÊN MINH NGẮN GỌN, TRỰC DIỆN.

QUY TẮC:
- Đọc thông số: Tên, Lực chiến, Căn cứ, Binh chủng (Tàu Tuần Tra / Cano / Thiết Giáp Hạm), Tướng.
- Bám sát Giờ Server (UTC) và quy đổi sang Giờ VN (UTC+7).
- Phân vai rõ ràng: Rally Lead, Garrison Lead, Fast Capper, Chi viện.
- Áp dụng Điền Kỵ Tái Mã xếp cặp.
Yêu cầu: Xuất trực tiếp dạng gạch đầu dòng mệnh lệnh, súc tích, không dông dài.`;

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

    let responseStream = null;
    let lastError = null;

    // Vòng lặp tự động chuyển model hoặc thử lại khi dính lỗi 503
    for (const modelName of MODELS) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          responseStream = await ai.models.generateContentStream({
            model: modelName,
            contents: contents,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.1,
              maxOutputTokens: 2048,
              thinkingConfig: { thinkingBudget: 0 },
            },
          });
          if (responseStream) break;
        } catch (err) {
          lastError = err;
          // Nếu server báo 503 hoặc 429, tạm dừng 1s rồi thử lại
          if (err.message?.includes("503") || err.message?.includes("429")) {
            await delay(1000);
          } else {
            break; // Lỗi khác (như 404) thì đổi ngay sang model kế tiếp
          }
        }
      }
      if (responseStream) break;
    }

    if (!responseStream) {
      throw (
        lastError ||
        new Error(
          "Cụm máy chủ AI đang chịu tải cao, vui lòng thử lại sau giây lát.",
        )
      );
    }

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
