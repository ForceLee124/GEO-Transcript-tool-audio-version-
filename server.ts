import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import fs from "fs";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 600 * 1024 * 1024 } // 600MB
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.post("/api/transcribe", upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let uploadedFileDetails: any = null;

    try {
      const filePath = req.file.path;
      const mimeType = req.file.mimetype;

      console.log(`Uploading ${req.file.originalname} to Gemini...`);
      const uploadResponse = await ai.files.upload({
        file: filePath,
        config: { mimeType: mimeType },
      });
      uploadedFileDetails = uploadResponse;

      if (mimeType.startsWith('video/')) {
        console.log(`Waiting for video processing...`);
        let fileInfo = await ai.files.get({ name: uploadResponse.name });
        while (fileInfo.state === 'PROCESSING') {
          await new Promise(resolve => setTimeout(resolve, 5000));
          fileInfo = await ai.files.get({ name: uploadResponse.name });
        }
        if (fileInfo.state === 'FAILED') {
          throw new Error('Gemini failed to process the video file.');
        }
      }

      console.log(`Generating transcript...`);
      const prompt = `請將附帶的會議音檔/影片轉錄為繁體中文逐字稿。
這是一份繁體中文會議記錄，包含專案名稱與技術討論。

請以 JSON 格式輸出，包含以下兩個欄位：
1. "full_text": 完整的純文字逐字稿，段落分明。
2. "segments": 陣列，包含每個片段的 "time" (格式如 [00:00]) 和 "text" (該片段的文字)。`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            fileData: {
              fileUri: uploadResponse.uri,
              mimeType: mimeType
            }
          },
          prompt
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              full_text: { type: Type.STRING },
              segments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING },
                    text: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      if (!response.text) {
        throw new Error("無法取得辨識結果");
      }

      const parsedResult = JSON.parse(response.text);
      res.json(parsedResult);

    } catch (error: any) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    } finally {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      if (uploadedFileDetails) {
        try {
          await ai.files.delete({ name: uploadedFileDetails.name });
          console.log(`Deleted file from Gemini: ${uploadedFileDetails.name}`);
        } catch (cleanupError) {
          console.error("Failed to delete file from Gemini:", cleanupError);
        }
      }
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
