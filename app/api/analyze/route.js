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
- Nếu có Bảng so sánh / BXH: Ưu tiên bám sát BXH để so sánh tổng quan lực chiến và định vị ngay các Whale (tay to nhất), không cần đọc chi tiết từng chỉ số phụ.
- Đọc thông số cơ bản: Tên, Lực chiến, Binh chủng sở trường (Tàu Tuần Tra / Cano / Thiết Giáp Hạm), Tướng.
- Quy đổi Giờ Server (UTC) sang Giờ VN (UTC+7).
- Phân công rõ: Rally Lead, Garrison Lead, Fast Capper, Chi viện.
- Ghép cặp Điền Kỵ Tái Mã.
- ĐỊNH DẠNG: TUYỆT ĐỐI KHÔNG dùng mã LaTeX (như $\\rightarrow$ hay $\\Rightarrow$). Bắt buộc dùng ký tự Unicode như "➔" hoặc "->".
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

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        await writer.write(encoder.encode(""));

        let responseStream = null;
        let lastError = null;

        // Cơ chế Retry tự động 3 lần nếu dính lỗi quá tải 503 / 429
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            responseStream = await ai.models.generateContentStream({
              model: "gemini-3.8-flash",
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
            console.warn(`Lần thử ${attempt} thất bại:`, err.message);
            if (err.message?.includes("503") || err.message?.includes("429")) {
              await delay(1500 * attempt); // Chờ 1.5s, 3s trước khi thử lại
            } else {
              break;
            }
          }
        }

        if (!responseStream) {
          throw (
            lastError || new Error("Không thể kết nối đến AI sau 3 lần thử.")
          );
        }

        for await (const chunk of responseStream) {
          if (chunk.text) {
            await writer.write(encoder.encode(chunk.text));
          }
        }
      } catch (err) {
        console.error("Gemini Error:", err);
        const errMsg = err.message?.includes("503")
          ? "\n\n⚠️ Cụm máy chủ Google AI đang chịu tải cao đột ngột. Hãy thử bấm lại sau vài giây!"
          : `\n\n⚠️ Lỗi tác chiến: ${err.message}`;
        await writer.write(encoder.encode(errMsg));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    console.error("API Route Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
