
import React, { useState } from 'react';
import { AssetType, VisualAsset } from '../types';
import { Plus, Trash2, Loader2, Sparkles, Package, Focus, User, MapPin } from 'lucide-react';
import { analyzeAsset } from '../services/geminiService';

/**
 * 图像压缩逻辑：长边限制在 1200px，JPEG 格式，质量 0.8
 */
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 1200;

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context failed'));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Compression failed'));
      }, 'image/jpeg', 0.8);
    };
    img.onerror = () => reject(new Error('Image load failed'));
  });
};

interface SidebarProps {
  assets: VisualAsset[];
  onAddAsset: (asset: VisualAsset) => void;
  onRemoveAsset: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ assets, onAddAsset, onRemoveAsset }) => {
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: AssetType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    try {
      // 拦截并压缩图片流
      const compressedBlob = await compressImage(file);
      const blobUrl = URL.createObjectURL(compressedBlob);
      
      // 让 AI 分析压缩后的资产
      const description = await analyzeAsset(blobUrl);
      
      onAddAsset({
        id: Math.random().toString(36).substr(2, 9),
        name: description.slice(0, 30) + (description.length > 30 ? '...' : ''),
        type,
        imageUrl: blobUrl,
      });
    } catch (error) {
      console.error("Asset analysis/processing failed:", error);
      // 若压缩或分析失败，尝试用原始流作为回退（或根据需要处理错误）
      const fallbackUrl = URL.createObjectURL(file);
      onAddAsset({
        id: Math.random().toString(36).substr(2, 9),
        name: "未命名资产",
        type,
        imageUrl: fallbackUrl,
      });
    } finally {
      setIsUploading(false);
    }
    
    e.target.value = '';
  };

  const renderAssetSection = (type: AssetType, label: string, Icon: any, uploadLabel: string) => {
    const sectionAssets = assets.filter(a => a.type === type);
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <Icon className="w-3 h-3" /> {label}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {sectionAssets.map(asset => (
            <div key={asset.id} className="relative group aspect-square">
              <img src={asset.imageUrl} className="w-full h-full object-cover rounded-xl border border-gray-100 group-hover:border-indigo-400 transition-all shadow-sm" alt={asset.name} title={asset.name} />
              <button 
                onClick={() => onRemoveAsset(asset.id)}
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <label className="border-2 border-dashed border-gray-100 rounded-xl aspect-square flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all group">
            <Plus className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 transition-colors" />
            <span className="text-[9px] font-bold text-gray-400 group-hover:text-indigo-500 mt-1 uppercase tracking-tighter">{uploadLabel}</span>
            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, type)} />
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="w-72 bg-white border-r h-full flex flex-col shadow-sm relative z-50">
      <div className="p-4 border-b flex items-center justify-between bg-gray-50/50">
        <h2 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          视觉资产库
        </h2>
        <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-bold">{assets.length}</span>
      </div>

      <div className="p-4 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
        {renderAssetSection(AssetType.CHARACTER, "角色资产", User, "上传角色")}
        {renderAssetSection(AssetType.SCENE, "场景资产", MapPin, "上传场景")}
        {renderAssetSection(AssetType.PROP, "道具资产", Package, "上传道具")}
        {renderAssetSection(AssetType.POSE, "站位/关键帧", Focus, "上传参考图")}
      </div>

      {isUploading && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="text-center">
            <div className="relative mb-3">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
              <Sparkles className="w-4 h-4 text-indigo-400 absolute top-0 right-0 animate-pulse" />
            </div>
            <p className="text-[10px] font-bold text-gray-900 uppercase tracking-widest">正在解析资产...</p>
            <p className="text-[9px] text-gray-400 mt-1">Gemini 正在提取视觉特征</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
