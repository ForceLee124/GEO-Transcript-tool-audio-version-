/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { UploadCloud, FileAudio, Loader2, CheckCircle, Download, ChevronDown, ChevronUp, AlertCircle, FileVideo, X, FileText } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ full_text: string; segments: { time: string; text: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;
    
    // Just a loose check, allow anything that might be audio/video
    if (!selectedFile.type.startsWith('audio/') && !selectedFile.type.startsWith('video/')) {
       setError("請上傳有效的音訊或影片檔案 (mp4, m4a, wav, mp3)。");
       return;
    }

    if (selectedFile.size > 600 * 1024 * 1024) {
      setError("檔案大小超過 600MB 限制。");
      return;
    }
    
    setFile(selectedFile);
    setError(null);
    setResult(null);
  };

  const processFile = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    try {
      let uploadedFile = await ai.files.upload({
        file: file,
        config: {
          mimeType: file.type,
          displayName: file.name,
        }
      });

      while (uploadedFile.state === 'PROCESSING') {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        uploadedFile = await ai.files.get({ name: uploadedFile.name });
      }

      if (uploadedFile.state === 'FAILED') {
        throw new Error("檔案處理失敗，請嘗試其他檔案。");
      }
      
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
              fileUri: uploadedFile.uri,
              mimeType: uploadedFile.mimeType
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

      if (response.text) {
        const parsedResult = JSON.parse(response.text);
        setResult(parsedResult);
      } else {
        throw new Error("無法取得辨識結果");
      }
    } catch (err: any) {
      console.error(err);
      setError(`執行發生錯誤: ${err.message || '未知錯誤'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadText = () => {
    if (!result) return;
    const blob = new Blob([result.full_text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">團隊會議逐字稿工具</h1>
          </div>
          <div className="flex items-start gap-2 p-4 bg-blue-50 text-blue-800 rounded-xl border border-blue-100">
            <span className="text-xl leading-none">💡</span>
            <p className="text-sm font-medium">提示：上傳影片或音檔後，系統會自動辨識語音並轉為繁體中文。</p>
          </div>
        </header>

        {/* Main Content */}
        <main className="space-y-6">
          
          {/* Uploader */}
          {!result && (
            <div className="space-y-4">
              <div 
                className={`relative border-2 border-dashed rounded-2xl p-8 md:p-12 transition-colors flex flex-col items-center justify-center text-center cursor-pointer
                  ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50'}
                  ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="hidden"
                  accept="audio/*,video/*,.mp4,.m4a,.wav,.mp3"
                />
                
                {!file ? (
                  <>
                    <div className="w-16 h-16 mb-4 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <UploadCloud className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">拖曳會議影片或音檔至此</h3>
                    <p className="text-slate-500 text-sm mb-4">支援 mp4, m4a, wav, mp3 (最大 600MB)</p>
                    <button className="px-4 py-2 bg-white border border-slate-200 shadow-sm rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                      選擇檔案
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col items-center w-full max-w-md">
                    <div className="w-16 h-16 mb-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                      {file.type.startsWith('video') ? <FileVideo className="w-8 h-8" /> : <FileAudio className="w-8 h-8" />}
                    </div>
                    <div className="flex items-center justify-between w-full p-3 bg-slate-100 rounded-lg mb-6">
                      <div className="truncate pr-4 text-sm font-medium">{file.name}</div>
                      <div className="text-xs text-slate-500 whitespace-nowrap">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                    
                    {!isProcessing && (
                      <div className="flex gap-3 w-full">
                        <button 
                          onClick={(e) => { e.stopPropagation(); clearFile(); }}
                          className="flex-1 px-4 py-2.5 bg-white border border-slate-200 shadow-sm rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                        >
                          重新選擇
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); processFile(); }}
                          className="flex-1 px-4 py-2.5 bg-indigo-600 text-white shadow-sm rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                        >
                          開始辨識
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="p-4 bg-red-50 text-red-800 rounded-xl border border-red-100 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {isProcessing && (
                <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <div>
                    <h3 className="font-semibold text-slate-900">🚀 AI 正在努力辨識中...</h3>
                    <p className="text-sm text-slate-500 mt-1">視影片長度可能需要幾分鐘，請耐心等候</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span className="font-medium">✨ 辨識完成！</span>
                <button 
                  onClick={clearFile}
                  className="ml-auto p-1 hover:bg-emerald-100 rounded-md transition-colors"
                  title="處理新檔案"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-semibold text-lg">逐字稿內容回覽</h2>
                  <button 
                    onClick={downloadText}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    下載繁體文字檔
                  </button>
                </div>
                <div className="p-5">
                  <textarea 
                    readOnly
                    value={result.full_text}
                    className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none custom-scrollbar"
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <button 
                  onClick={() => setShowTimestamps(!showTimestamps)}
                  className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <h2 className="font-semibold text-lg">查看詳細時間戳記</h2>
                  {showTimestamps ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>
                
                {showTimestamps && (
                  <div className="p-5 pt-0 border-t border-slate-100">
                    <div className="mt-4 space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                      {result.segments.map((segment, idx) => (
                        <div key={idx} className="flex gap-4 text-sm p-2 hover:bg-slate-50 rounded-lg transition-colors">
                          <span className="font-mono text-indigo-600 font-medium shrink-0 pt-0.5">
                            {segment.time}
                          </span>
                          <span className="text-slate-700 leading-relaxed">
                            {segment.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
