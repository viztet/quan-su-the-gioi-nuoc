import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req) {
  try {
    const {
      imagesMinh,
      imagesNau,
      contextImages,
      compareImages,
      battleContextText,
    } = await req.json();

    const systemInstruction = `
Bạn là Quân Sư Tác Chiến game "Thế Giới Nước Điên Cuồng" (Mad Survivor: Arid War).
Nhiệm vụ: Phân tích nhanh chỉ số 2 bên qua ảnh BXH, ảnh profile và bối cảnh để xuất KẾ HOẠCH TÁC CHIẾN LIÊN MINH NGẮN GỌN, TRỰC DIỆN.

QUY TẮC:
- Nếu có Bảng so sánh / BXH: Bám sát BXH để so sánh tổng quan lực chiến và định vị ngay các Whale, không đọc lan man.
- Đọc thông số cơ bản: Tên, Lực chiến, Binh chủng sở trường (Tàu Tuần Tra / Cano / Thiết Giáp Hạm), Tướng.
- Quy đổi Giờ Server (UTC) sang Giờ VN (UTC+7).
- Phân công rõ: Rally Lead, Garrison Lead, Fast Capper, Chi viện.
- Ghép cặp Điền Kỵ Tái Mã.
- ĐỊNH DẠNG: TUYỆT ĐỐI KHÔNG dùng mã LaTeX. Bắt buộc dùng ký tự Unicode như "➔" hoặc "->".
Yêu cầu: Xuất ngay dạng gạch đầu dòng mệnh lệnh, không giải thích dài dòng, không chào hỏi.`;

    const contents = [];

    if (contextImages && contextImages.length > 0) {
      contents.push("--- [ẢNH BẢN ĐỒ / THỂ THỨC SỰ KIỆN] ---");
      contextImages.forEach((img) =>
        contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
      );
    }

    if (compareImages && compareImages.length > 0) {
      contents.push(
        "--- [ẢNH SO SÁNH TƯƠNG QUAN LỰC CHIẾN / BẢNG XẾP HẠNG] ---",
      );
      compareImages.forEach((img) =>
        contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
      );
    }

    contents.push(
      `--- [BỐI CẢNH & GIỜ SERVER]: ${battleContextText || "Tranh đoạt cứ điểm"} ---`,
    );

    if (imagesMinh && imagesMinh.length > 0) {
      contents.push("--- [HỒ SƠ PROFILE CLAN MÌNH] ---");
      imagesMinh.forEach((img) =>
        contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
      );
    }

    if (imagesNau && imagesNau.length > 0) {
      contents.push("--- [HỒ SƠ PROFILE CLAN NÂU (ĐỐI THỦ)] ---");
      imagesNau.forEach((img) =>
        contents.push({ inlineData: { data: img.data, mimeType: img.type } }),
      );
    }

    contents.push("Xuất kế hoạch tác chiến ngay:");

    // Danh sách model thế hệ 3 chuẩn xác: Thử 3.8 -> 3.6 -> 3.5-flash-lite
    const ACTIVE_MODELS = [
      "gemini-3.8-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
    ];

    let responseStream = null;
    let lastError = null;

    for (const modelName of ACTIVE_MODELS) {
      try {
        responseStream = await ai.models.generateContentStream({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        });
        if (responseStream) break;
      } catch (err) {
        lastError = err;
        console.warn(
          `Model ${modelName} gặp lỗi/tải cao, chuyển tiếp model khác...`,
          err.message,
        );
        await delay(800);
      }
    }

    if (!responseStream) {
      const msg = lastError?.message?.includes("503")
        ? "Cụm máy chủ AI đang chịu tải cao đột ngột trên các cụm Flash. Bạn thử lại sau 30 giây nhé!"
        : lastError?.message || "Lỗi kết nối Gemini API";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
        } catch (streamErr) {
          console.error("Stream error:", streamErr);
          controller.enqueue(
            encoder.encode(`\n\n⚠️ Lỗi ngắt quãng luồng: ${streamErr.message}`),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    console.error("Route Handler Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
