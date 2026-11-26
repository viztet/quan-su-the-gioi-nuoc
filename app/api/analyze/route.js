import { GoogleGenAI } from "@google/genai";

// Tăng thời gian timeout tối đa trên Vercel lên 60 giây (mức trần của gói Hobby)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.0-flash"];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req) {
  try {
    const { imagesMinh, imagesNau, contextImages, battleContextText } =
      await req.json();

    const systemInstruction = `
Bạn là Quân Sư Tác Chiến game "Thế Giới Nước Điên Cuồng" (Mad Survivor: Arid War).
Nhiệm vụ: Phân tích nhanh chỉ số profile 2 bên và bối cảnh để xuất KẾ HOẠCH TÁC CHIẾN LIÊN MINH NGẮN GỌN, TRỰC DIỆN.

QUY TẮC:
- Đọc thông số: Tên, Lực chiến, Binh chủng sở trường (Tàu Tuần Tra / Cano / Thiết Giáp Hạm), Tướng.
- Quy đổi Giờ Server (UTC) sang Giờ VN (UTC+7).
- Phân công rõ: Rally Lead, Garrison Lead, Fast Capper, Chi viện.
- Ghép cặp Điền Kỵ Tái Mã.
Yêu cầu: Xuất ngay dạng gạch đầu dòng mệnh lệnh, không giải thích dài dòng, không chào hỏi.`;

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
          if (err.message?.includes("503") || err.message?.includes("429")) {
            await delay(1000);
          } else {
            break;
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
        "Transfer-Encoding": "chunked",
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
