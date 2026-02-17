
import { VisualAsset, AspectRatio, ImageSize, ProxyConfig, AssetType } from "../types";

/**
 * 通用请求队列管理类
 */
class RequestQueue {
  private queue: (() => Promise<any>)[] = [];
  private activeCount = 0;

  constructor(private maxConcurrency: number) {}

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) return;
    this.activeCount++;
    const task = this.queue.shift()!;
    try {
      await task();
    } finally {
      this.activeCount--;
      this.process();
    }
  }
}

// 实例化队列：图像生成串行以防超载，文本任务适度并发
const imageQueue = new RequestQueue(1);
const textQueue = new RequestQueue(10);

/**
 * 带有指数退避重试机制的 Fetch 封装
 */
const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const response = await fetch(url, options);
    
    // 只有 429 (Too Many Requests) 或 5xx (Server Errors) 才触发重试
    if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
      if (attempt === maxRetries) return response;
      const delay = Math.pow(2, attempt) * 2000; // 指数退避: 2s, 4s, 8s
      console.warn(`[API] 遇到状态码 ${response.status}，准备第 ${attempt + 1} 次重试，等待 ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
      continue;
    }
    return response;
  }
  return fetch(url, options);
};

/**
 * 智能 URL 处理：支持远程地址和本地 Nginx 相对路径（如 /api）
 */
const normalizeBaseUrl = (host: string): string => {
  let url = host.trim().replace(/\/+$/, "");
  if (!url) return "https://generativelanguage.googleapis.com";
  
  // 如果是相对路径（以 / 开头），直接返回，由 Nginx 处理同源代理
  if (url.startsWith('/')) return url;
  
  // 稳健的协议补全逻辑
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
};

const getConfig = (): ProxyConfig => {
  const saved = localStorage.getItem('proxy_config');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {}
  }
  return {
    apiHost: "",
    apiKey: "", 
    textModel: "gemini-3-flash-preview",
    imageModel: "gemini-3-pro-image-preview"
  };
};

const imageUrlToBase64 = async (url: string): Promise<string> => {
  if (!url) return "";
  if (url.startsWith('data:')) return url.split(',')[1];
  
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Failed to convert image to base64", e);
    return "";
  }
};

/**
 * 核心请求分发器：支持智能路由、双重鉴权与队列管理
 */
const geminiRequest = async (model: string, action: string, payload: any) => {
  const config = getConfig();
  const baseUrl = normalizeBaseUrl(config.apiHost || "");
  const apiKey = config.apiKey || process.env.API_KEY || "";
  
  const url = `${baseUrl}/v1beta/models/${model}:${action}?key=${apiKey}`;

  // 构造请求选项，整合多种鉴权头以支持不同的中转服务商
  const options: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "Authorization": `Bearer ${apiKey}` // 增强兼容性
    },
    body: JSON.stringify(payload)
  };

  // 任务路由：图像任务进 imageQueue，其他进 textQueue
  const isImageTask = model.includes('image') || payload.generationConfig?.imageConfig;
  const queue = isImageTask ? imageQueue : textQueue;

  return queue.add(async () => {
    try {
      const response = await fetchWithRetry(url, options);

      if (!response.ok) {
        let errorDetail = "";
        try {
          const errorJson = await response.json();
          errorDetail = errorJson?.error?.message || JSON.stringify(errorJson);
        } catch (e) {
          errorDetail = await response.text();
        }
        throw new Error(`[Gemini API Error] ${response.status}: ${errorDetail}`);
      }

      return await response.json();
    } catch (error: any) {
      // 增强错误捕获：针对连接重置或网络故障
      if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
        console.error("网络连接重置，请检查代理地址或图片大小。");
      }
      throw error;
    }
  });
};

const base64ToBlobUrl = (base64: string): string => {
  const byteString = atob(base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: 'image/png' });
  return URL.createObjectURL(blob);
};

export const generateStoryboardFrame = async (
  prompt: string,
  assets: VisualAsset[],
  config: { 
    aspectRatio: AspectRatio; 
    imageSize: ImageSize; 
    panelType: 'single' | '4-grid' | '9-grid' | '16-grid' | '25-grid';
    isSketchMode?: boolean;
    previousFrameUrls?: string[];
  }
): Promise<string | undefined> => {
  const { imageModel } = getConfig();
  const model = imageModel || 'gemini-3-pro-image-preview';
  
  const assetParts = await Promise.all(assets.map(async (asset) => ({
    inlineData: {
      data: await imageUrlToBase64(asset.imageUrl),
      mimeType: 'image/png'
    }
  })));

  const previousParts = await Promise.all((config.previousFrameUrls || []).map(async (url) => ({
    inlineData: {
      data: await imageUrlToBase64(url),
      mimeType: 'image/png'
    }
  })));

  let panelDesc = "";
  switch (config.panelType) {
    case '4-grid': panelDesc = "a 2x2 grid of 4 sequential stills"; break;
    case '9-grid': panelDesc = "a 3x3 grid of 9 sequential stills"; break;
    case '16-grid': panelDesc = "a 4x4 grid of 16 sequential stills"; break;
    case '25-grid': panelDesc = "a 5x5 grid of 25 sequential stills"; break;
    default: panelDesc = "a single high-fidelity cinematic still";
  }

  const styleDesc = config.isSketchMode 
    ? "STYLE: Professional charcoal and pencil storyboard sketches, rough hand-drawn art."
    : "STYLE: Realistic cinematic photography, high-fidelity movie still.";

  const payload = {
    contents: [{
      parts: [
        ...assetParts,
        ...previousParts,
        { text: `STORYBOARD TASK: ${panelDesc}. ${styleDesc} Description: ${prompt}` }
      ]
    }],
    generationConfig: {
      imageConfig: {
        aspectRatio: config.aspectRatio,
        imageSize: config.imageSize
      }
    }
  };

  const data = await geminiRequest(model, "generateContent", payload);
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const b64 = part.inlineData?.data;
    if (b64) return base64ToBlobUrl(b64);
  }
  return undefined;
};

export const editFrame = async (
  originalImageUrl: string,
  editPrompt: string,
  maskImageUrl?: string
): Promise<string | undefined> => {
  const { imageModel } = getConfig();
  const model = imageModel || 'gemini-2.5-flash-image';

  const parts: any[] = [
    { inlineData: { data: await imageUrlToBase64(originalImageUrl), mimeType: 'image/png' } }
  ];
  if (maskImageUrl) {
    parts.push({ inlineData: { data: await imageUrlToBase64(maskImageUrl), mimeType: 'image/png' } });
  }
  parts.push({ text: `Edit: ${editPrompt}. Maintain cinematic style.` });

  const data = await geminiRequest(model, "generateContent", { contents: [{ parts }] });
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  for (const part of responseParts) {
    const b64 = part.inlineData?.data;
    if (b64) return base64ToBlobUrl(b64);
  }
  return undefined;
};

export const refineImageClarity = async (
  imageUrl: string,
  assets: VisualAsset[],
  targetSize: ImageSize
): Promise<string | undefined> => {
  const { imageModel } = getConfig();
  const model = imageModel || 'gemini-3-pro-image-preview';

  const assetParts = await Promise.all(
    assets.filter(a => a.type === AssetType.CHARACTER).map(async (asset) => ({
      inlineData: { data: await imageUrlToBase64(asset.imageUrl), mimeType: 'image/png' }
    }))
  );

  const payload = {
    contents: [{
      parts: [
        ...assetParts,
        { inlineData: { data: await imageUrlToBase64(imageUrl), mimeType: 'image/png' } },
        { text: `Refine image clarity to ${targetSize} while maintaining character features.` }
      ]
    }],
    generationConfig: {
      imageConfig: {
        imageSize: targetSize
      }
    }
  };

  const data = await geminiRequest(model, "generateContent", payload);
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  for (const part of responseParts) {
    const b64 = part.inlineData?.data;
    if (b64) return base64ToBlobUrl(b64);
  }
  return undefined;
};

export const analyzeAsset = async (imageUrl: string): Promise<string> => {
  const { textModel } = getConfig();
  const model = textModel || 'gemini-3-flash-preview';

  const payload = {
    contents: [{
      parts: [
        { inlineData: { data: await imageUrlToBase64(imageUrl), mimeType: 'image/png' } },
        { text: "Describe this visual asset in 5 words." }
      ]
    }]
  };

  const data = await geminiRequest(model, "generateContent", payload);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Asset";
};

export const testConnection = async (): Promise<boolean> => {
  const model = "gemini-2.0-flash";
  const payload = { contents: [{ parts: [{ text: "ping" }] }] };
  await geminiRequest(model, "generateContent", payload);
  return true;
};
