"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";

export default function Home() {
  const [imagesMinh, setImagesMinh] = useState([]);
  const [imagesNau, setImagesNau] = useState([]);
  const [contextImages, setContextImages] = useState([]);
  const [battleContextText, setBattleContextText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  // Nén ảnh sâu: Tối đa 600px, chất lượng 0.5 (Chỉ ~30KB/ảnh, triệt tiêu lỗi payload)
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 600;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
          resolve({
            data: dataUrl.split(",")[1],
            type: "image/jpeg",
          });
        };
      };
    });
  };

  const handleFileChange = async (files, setter) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const compressedList = await Promise.all(
      fileList.map((f) => compressImage(f)),
    );
    setter(compressedList);
  };

  const handleAnalyze = async () => {
    if (imagesMinh.length === 0 || imagesNau.length === 0) {
      alert("Vui lòng chọn ít nhất 1 ảnh profile cho mỗi bên Clan!");
      return;
    }

    const payload = {
      imagesMinh,
      imagesNau,
      contextImages,
      battleContextText,
    };

    const payloadString = JSON.stringify(payload);
    const payloadSizeMB = new Blob([payloadString]).size / (1024 * 1024);

    if (payloadSizeMB > 4.0) {
      alert(
        `Dung lượng gửi lên quá lớn (${payloadSizeMB.toFixed(2)}MB / tối đa 4.0MB). Hãy giảm bớt số lượng ảnh!`,
      );
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadString,
      });

      // Nếu server trả về lỗi HTTP (400, 500, 503...)
      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = errorText;
        try {
          const parsed = JSON.parse(errorText);
          errorMsg = parsed.error?.message || parsed.error || errorText;
        } catch {
          // Giữ nguyên text thô nếu không parse được JSON
        }
        throw new Error(errorMsg || "Lỗi máy chủ!");
      }

      // Xử lý Stream từ server trả về
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Giải mã chunk hiện tại và nối dồn hiển thị ngay lập tức
        accumulatedText += decoder.decode(value, { stream: true });
        setResult(accumulatedText);
      }
    } catch (err) {
      alert("Lỗi: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="text-center pb-4 border-b border-slate-700">
          <h1 className="text-2xl md:text-3xl font-extrabold text-cyan-400">
            QUÂN SƯ LIÊN MINH: THẾ GIỚI NƯỚC ĐIÊN CUỒNG
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Hệ thống phân tích tương quan & Lên kế hoạch tác chiến GvG
          </p>
        </header>

        {/* Bối cảnh chiến sự */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
          <h2 className="text-sm font-bold text-cyan-400">
            1. BỐI CẢNH CHIẾN TRƯỜNG & THỜI GIAN SERVER
          </h2>
          <textarea
            value={battleContextText}
            onChange={(e) => setBattleContextText(e.target.value)}
            placeholder="Ví dụ: Tranh đoạt Trung Tâm Lọc Nước lúc 12:00 UTC (19h VN). Cần kiềm chế Top 1 Nâu..."
            rows={2}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm focus:outline-none focus:border-cyan-500"
          />
          <div>
            <label className="text-xs text-slate-300 block mb-1">
              Ảnh bản đồ / Thể thức tính điểm (nếu có):
            </label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) =>
                handleFileChange(e.target.files, setContextImages)
              }
              className="text-xs text-slate-400"
            />
            <span className="text-xs text-slate-400 ml-2">
              Đã chọn: {contextImages.length} ảnh
            </span>
          </div>
        </div>

        {/* Nạp ảnh profile 2 bên */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-2">
            <h2 className="font-bold text-emerald-400 text-sm">
              2. ẢNH PROFILE CLAN MÌNH
            </h2>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileChange(e.target.files, setImagesMinh)}
              className="w-full text-xs text-slate-400"
            />
            <p className="text-xs text-emerald-400">
              Đã chọn: {imagesMinh.length} ảnh profile
            </p>
          </div>

          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-2">
            <h2 className="font-bold text-amber-500 text-sm">
              3. ẢNH PROFILE CLAN NÂU (ĐỐI THỦ)
            </h2>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileChange(e.target.files, setImagesNau)}
              className="w-full text-xs text-slate-400"
            />
            <p className="text-xs text-amber-500">
              Đã chọn: {imagesNau.length} ảnh profile
            </p>
          </div>
        </div>

        {/* Nút kích hoạt */}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 py-3 rounded-xl font-bold transition flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading
            ? "Đang phân tích số liệu & lập kịch bản..."
            : "⚡ Bắt Đầu Quân Sư Tác Chiến"}
        </button>

        {/* Kết quả hiển thị tối ưu giao diện */}
        {(result || loading) && (
          <div className="bg-slate-800 p-5 md:p-6 rounded-xl border border-cyan-500/50 space-y-4 shadow-lg">
            <div className="flex justify-between items-center pb-3 border-b border-slate-700">
              <h3 className="font-bold text-cyan-300 text-base md:text-lg flex items-center gap-2">
                📋 KẾ HOẠCH ĐIỀU QUÂN LIÊN MINH
              </h3>
              {result && (
                <button
                  onClick={() => navigator.clipboard.writeText(result)}
                  className="text-xs bg-cyan-700/60 hover:bg-cyan-600 text-white font-medium px-3 py-1.5 rounded-lg border border-cyan-500/40 transition cursor-pointer"
                >
                  Sao chép lệnh
                </button>
              )}
            </div>

            {/* Vùng render Markdown chuẩn font sans, phân cấp đề mục trực quan */}
            <div className="text-slate-200 text-sm md:text-base leading-relaxed space-y-3 font-sans [&>h1]:text-xl [&>h1]:font-extrabold [&>h1]:text-cyan-400 [&>h2]:text-lg [&>h2]:font-bold [&>h2]:text-cyan-300 [&>h3]:text-base [&>h3]:font-bold [&>h3]:text-emerald-400 [&>p]:leading-relaxed [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1 [&>ol]:list-decimal [&>ol]:pl-5 [&>hr]:border-slate-700 [&>hr]:my-3 [&_strong]:text-amber-300 [&_strong]:font-semibold [&_code]:bg-slate-950 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-cyan-300 [&_code]:text-xs">
              <ReactMarkdown>{result}</ReactMarkdown>
              {loading && (
                <span className="inline-block w-2.5 h-4 ml-1 bg-cyan-400 animate-pulse align-middle rounded-xs" />
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
