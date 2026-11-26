import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
- ĐỊNH DẠNG: TUYỆT ĐỐI KHÔNG dùng mã LaTeX (như $\\rightarrow$ hay $\\Rightarrow$). Bắt buộc dùng ký tự Unicode như "➔" hoặc "->".
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

    // Tạo luồng TransformStream gửi phản hồi ngay lập tức về Vercel tránh timeout
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Thực thi gọi AI bất đồng bộ trong background
    (async () => {
      try {
        // Gửi ngay 1 ký tự trống để xác lập kết nối HTTP 200 tức thì với Vercel
        await writer.write(encoder.encode(""));

        const responseStream = await ai.models.generateContentStream({
          model: "gemini-3.8-flash",
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.1,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 },
          },
        });

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

    // Phản hồi kết nối stream ngay lập tức cho client
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
