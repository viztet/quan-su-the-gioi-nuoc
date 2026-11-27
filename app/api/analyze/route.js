import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Hàm tạo đồng hồ đếm ngược để tự ngắt nếu Google AI treo quá lâu
const withTimeout = (promise, ms) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), ms),
    ),
  ]);
};

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
- ĐỊNH DẠNG: TUYỆT ĐỐI KHÔNG dùng mã LaTeX. Dùng ký tự Unicode như "➔" hoặc "->".
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

    // Gọi 1 lần duy nhất, giới hạn tối đa 25 giây để không bao giờ chạm trần 60s của Vercel
    let responseStream;
    try {
      responseStream = await withTimeout(
        ai.models.generateContentStream({
          model: "gemini-3.8-flash",
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        }),
        25000,
      );
    } catch (apiErr) {
      console.error("Gemini Call Error:", apiErr.message);

      let errMsg = `Lỗi kết nối Gemini: ${apiErr.message}`;
      if (apiErr.message === "GEMINI_TIMEOUT") {
        errMsg =
          "Google AI phản hồi quá chậm (trên 25 giây) do đang nghẽn mạng. Hãy bấm thử lại!";
      } else if (apiErr.message?.includes("503") || apiErr.status === 503) {
        errMsg =
          "Cụm máy chủ Google AI đang quá tải tức thời (503). Hãy đợi vài giây rồi bấm lại!";
      }

      return new Response(JSON.stringify({ error: errMsg }), {
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
          console.error("Stream reading error:", streamErr);
          controller.enqueue(
            encoder.encode(
              `\n\n⚠️ Lỗi ngắt quãng dữ liệu: ${streamErr.message}`,
            ),
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
    console.error("Route Top-Level Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
