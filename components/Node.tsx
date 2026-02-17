
import React, { useState, memo, useMemo, useRef } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { AspectRatio, ImageSize, StoryNode } from '../types';
import { Play, Edit3, Trash2, Download, Maximize2, Square, Grid2X2, Grid3X3, GripHorizontal, Merge, Sparkles, Pencil, LayoutGrid, Plus, Zap, Check, Wand2 } from 'lucide-react';

const StoryboardNode: React.FC<NodeProps<StoryNode>> = ({ data, selected, id }) => {
  const [activeSlice, setActiveSlice] = useState<number | null>(null);

  // 计算当前网格的行列结构
  const { cols, rows } = useMemo(() => {
    switch (data.panelType) {
      case '4-grid': return { cols: 2, rows: 2 };
      case '9-grid': return { cols: 3, rows: 3 };
      case '16-grid': return { cols: 4, rows: 4 };
      case '25-grid': return { cols: 5, rows: 5 };
      default: return { cols: 1, rows: 1 };
    }
  }, [data.panelType]);

  // 动态宽高比计算：让镜头框跟随画面比例自适应缩放
  const aspectStyle = useMemo(() => {
    const [w, h] = data.aspectRatio.split(':').map(Number);
    return {
      aspectRatio: `${w} / ${h}`,
      width: '100%',
    };
  }, [data.aspectRatio]);

  const onUpdate = (updates: Partial<StoryNode>) => {
    if (data.onUpdate) data.onUpdate(id, updates);
  };

  const isMergeNode = useMemo(() => (data.parentIds?.length || 0) > 1, [data.parentIds]);

  const toggleAsset = (assetId: string) => {
    const currentSelected = data.selectedAssetIds || [];
    const newSelected = currentSelected.includes(assetId)
      ? currentSelected.filter(sid => sid !== assetId)
      : [...currentSelected, assetId];
    onUpdate({ selectedAssetIds: newSelected });
  };

  /**
   * 核心算法：像素级精确切片
   * 确保导出的单帧图片在分辨率和比例上与预设完全一致
   */
  const handleSliceAction = async (index: number, action: 'branch' | 'download' | 'refine') => {
    if (!data.imageUrl) return;
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = data.imageUrl;
    
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });

    if (img.naturalWidth === 0) return;

    // 获取原始像素尺寸
    const sliceWidth = img.naturalWidth / cols;
    const sliceHeight = img.naturalHeight / rows;
    const rowIndex = Math.floor(index / cols);
    const colIndex = index % cols;

    // 创建离屏 Canvas 进行像素重采样
    const canvas = document.createElement('canvas');
    canvas.width = sliceWidth;
    canvas.height = sliceHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // 从原图中精准裁切对应区域
    ctx.drawImage(
      img,
      colIndex * sliceWidth, rowIndex * sliceHeight, sliceWidth, sliceHeight,
      0, 0, sliceWidth, sliceHeight
    );

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png', 1.0));
    if (!blob) return;
    const sliceUrl = URL.createObjectURL(blob);

    if (action === 'branch') {
      // 延伸新节点：继承当前帧作为新节点的初始视觉基础
      data.onContinueFromSlice?.(id, sliceUrl);
    } else if (action === 'download') {
      const link = document.createElement('a');
      link.href = sliceUrl;
      link.download = `story-slice-${id}-${index + 1}.png`;
      link.click();
      URL.revokeObjectURL(sliceUrl);
    } else if (action === 'refine') {
      // 触发 AI 编辑器进行局部增强
      data.onEditImage?.(id);
    }
  };

  const aspectRatios: AspectRatio[] = ["1:1", "4:3", "16:9", "9:16", "21:9", "2:3", "3:2", "3:4"];
  const resolutions: ImageSize[] = ["1K", "2K", "4K"];

  return (
    <div className={`transition-all duration-300 rounded-[2.5rem] ${selected ? 'ring-4 ring-indigo-500 ring-offset-8 scale-[1.01]' : ''}`} style={{ width: '380px' }}>
      <Handle 
        type="target" 
        position={Position.Top} 
        className={`!w-5 !h-5 !border-4 !border-white transition-all ${isMergeNode ? '!bg-amber-500 !rounded-xl' : '!bg-indigo-500 !rounded-full'}`} 
      />
      
      <div className={`bg-white rounded-[2.5rem] overflow-hidden flex flex-col border-2 transition-colors ${selected ? 'border-indigo-100 shadow-[0_40px_80px_-15px_rgba(79,70,229,0.15)]' : 'border-gray-100 shadow-xl'}`}>
        {/* Header */}
        <div className={`px-6 py-4.5 border-b flex items-center justify-between transition-colors ${selected ? 'bg-indigo-50/30' : 'bg-gray-50/30'}`}>
          <div className="flex items-center gap-3 overflow-hidden flex-1">
             <GripHorizontal className={`w-4 h-4 transition-colors shrink-0 ${selected ? 'text-indigo-400' : 'text-gray-300'}`} />
             <div className="flex items-center gap-2 flex-1 overflow-hidden">
               {isMergeNode && <Merge className="w-4 h-4 text-amber-500 shrink-0" />}
               <input 
                  className="bg-transparent border-none text-[13px] font-black text-gray-800 focus:ring-0 p-0 w-full placeholder:text-gray-300" 
                  value={data.title}
                  placeholder="未命名分镜..."
                  onChange={(e) => onUpdate({ title: e.target.value })}
               />
             </div>
          </div>
          <button onClick={() => data.onDelete?.(id)} className="text-gray-300 hover:text-red-500 p-2 transition-colors">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Asset Links */}
          {(data.allAssets && data.allAssets.length > 0) && (
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-indigo-400" /> 关联资产视觉参考
              </label>
              <div className="flex flex-wrap gap-2.5 p-3 bg-gray-50/50 rounded-2xl border border-gray-100 max-h-28 overflow-y-auto nodrag custom-scrollbar">
                {data.allAssets.map(asset => {
                  const isSelected = data.selectedAssetIds?.includes(asset.id);
                  return (
                    <button
                      key={asset.id}
                      onClick={() => toggleAsset(asset.id)}
                      className={`relative w-10 h-10 rounded-xl overflow-hidden border-2 transition-all ${isSelected ? 'border-indigo-500 ring-4 ring-indigo-50 shadow-md scale-105' : 'border-transparent grayscale opacity-40 hover:grayscale-0 hover:opacity-100'}`}
                      title={asset.name}
                    >
                      <img src={asset.imageUrl} className="w-full h-full object-cover" alt="" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
                           <Check className="w-4 h-4 text-white drop-shadow-md stroke-[4]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preset Config */}
          <div className="bg-gray-50/30 p-5 rounded-[2rem] border border-gray-100 shadow-inner space-y-4">
            <div className="flex items-center justify-between">
               <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                 规格与布局
               </label>
               <button 
                  onClick={() => onUpdate({ isSketchMode: !data.isSketchMode })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black border transition-all nodrag ${data.isSketchMode ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-gray-100 text-gray-400'}`}
               >
                 <Pencil className="w-3.5 h-3.5" /> 参考草图模式
               </button>
            </div>
            
            <div className="flex gap-2.5">
              <select 
                className="flex-1 text-[11px] font-black bg-white border border-gray-100 rounded-xl px-3 py-2.5 outline-none shadow-sm nodrag cursor-pointer"
                value={data.aspectRatio}
                onChange={(e) => onUpdate({ aspectRatio: e.target.value as AspectRatio })}
              >
                {aspectRatios.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select 
                className="flex-1 text-[11px] font-black bg-white border border-gray-100 rounded-xl px-3 py-2.5 outline-none shadow-sm nodrag cursor-pointer"
                value={data.imageSize}
                onChange={(e) => onUpdate({ imageSize: e.target.value as ImageSize })}
              >
                {resolutions.map(res => <option key={res} value={res}>{res}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'single', icon: <Square className="w-3.5 h-3.5" />, label: '1' },
                { id: '4-grid', icon: <Grid2X2 className="w-3.5 h-3.5" />, label: '4' },
                { id: '9-grid', icon: <Grid3X3 className="w-3.5 h-3.5" />, label: '9' },
                { id: '16-grid', icon: <LayoutGrid className="w-3.5 h-3.5" />, label: '16' },
                { id: '25-grid', icon: <LayoutGrid className="w-3.5 h-3.5" />, label: '25' }
              ].map(type => (
                <button
                  key={type.id}
                  onClick={() => {
                    onUpdate({ panelType: type.id as any });
                    setActiveSlice(null);
                  }}
                  className={`flex-1 min-w-[50px] flex items-center justify-center gap-2 text-[10px] font-black py-2.5 rounded-xl border transition-all nodrag ${data.panelType === type.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-gray-100 text-gray-500 hover:border-indigo-200'}`}
                >
                  {type.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas Box: 自适应比例缩放 */}
          <div 
            className="w-full bg-neutral-900 rounded-[2rem] overflow-hidden relative group border-2 border-transparent transition-all hover:border-indigo-500/50"
            style={aspectStyle}
          >
            {data.imageUrl ? (
              data.panelType === 'single' ? (
                <>
                  <img src={data.imageUrl} className="w-full h-full object-cover" alt="Frame" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-6 backdrop-blur-[3px]">
                    <button onClick={() => data.onEditImage?.(id)} className="p-4.5 bg-white/10 hover:bg-indigo-600 text-white rounded-[1.75rem] border border-white/20 transition-all nodrag shadow-2xl scale-90 hover:scale-100">
                      <Wand2 className="w-7 h-7" />
                    </button>
                    <button onClick={() => { const link = document.createElement('a'); link.href = data.imageUrl!; link.download = 'frame.png'; link.click(); }} className="p-4.5 bg-white/10 hover:bg-indigo-600 text-white rounded-[1.75rem] border border-white/20 transition-all nodrag shadow-2xl scale-90 hover:scale-100">
                      <Download className="w-7 h-7" />
                    </button>
                  </div>
                </>
              ) : (
                <div 
                  className="w-full h-full grid relative"
                  style={{ 
                    gridTemplateColumns: `repeat(${cols}, 1fr)`,
                    gridTemplateRows: `repeat(${rows}, 1fr)`
                  }}
                >
                  {Array.from({ length: cols * rows }).map((_, i) => {
                    const r = Math.floor(i / cols);
                    const c = i % cols;
                    const isActive = activeSlice === i;
                    
                    return (
                      <div 
                        key={i}
                        onClick={() => setActiveSlice(isActive ? null : i)}
                        className={`relative cursor-pointer border-[0.5px] border-white/10 overflow-hidden transition-all nodrag ${isActive ? 'ring-[5px] ring-inset ring-indigo-500 z-10' : 'hover:bg-white/5'}`}
                        style={{
                          backgroundImage: `url(${data.imageUrl})`,
                          backgroundSize: `${cols * 100}% ${rows * 100}%`,
                          backgroundPosition: `${c * (100 / (cols - 1 || 1))}% ${r * (100 / (rows - 1 || 1))}%`,
                        }}
                      >
                        {isActive && (
                          <div className="absolute inset-0 bg-black/75 backdrop-blur-[4px] flex flex-col items-center justify-center gap-3 p-3 animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSliceAction(i, 'branch'); }}
                                className="p-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 shadow-xl border border-indigo-400"
                              >
                                <Plus className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSliceAction(i, 'refine'); }}
                                className="p-3 bg-white text-indigo-600 rounded-2xl hover:bg-gray-50 shadow-xl"
                              >
                                <Zap className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSliceAction(i, 'download'); }}
                                className="p-3 bg-white/20 text-white rounded-2xl hover:bg-white/30 shadow-xl border border-white/10"
                              >
                                <Download className="w-5 h-5" />
                              </button>
                            </div>
                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">面板 {i+1}</span>
                          </div>
                        )}
                        {!isActive && (
                          <div className="absolute top-2 left-2 bg-black/40 backdrop-blur-md text-white/50 text-[9px] font-black px-2 py-0.5 rounded-lg border border-white/10">
                             #{i+1}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Global Tools for Grid Mode */}
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                    <button 
                      onClick={() => data.onEditImage?.(id)}
                      className="p-3.5 bg-black/50 backdrop-blur-2xl text-white hover:bg-indigo-600 rounded-[1.5rem] border border-white/10 transition-all nodrag shadow-2xl"
                      title="编辑完整网格"
                    >
                      <LayoutGrid className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 space-y-4 bg-neutral-900/50">
                <div className="relative">
                   {data.isSketchMode ? <Pencil className="w-14 h-14 text-amber-500/10" /> : <Maximize2 className="w-14 h-14 text-white/5" />}
                   <Sparkles className="w-6 h-6 text-indigo-500/20 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30">
                  {data.isSketchMode ? "等待分页草绘..." : "等待生成指令..."}
                </p>
              </div>
            )}

            {/* AI Generator Overlay */}
            {data.isGenerating && (
               <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-indigo-950/40 backdrop-blur-[8px] animate-in fade-in duration-300">
                  <div className="bg-white p-10 rounded-[3.5rem] shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95">
                    <div className="relative">
                      <div className={`w-14 h-14 border-[6px] border-t-transparent rounded-full animate-spin ${data.isSketchMode ? 'border-amber-500' : 'border-indigo-600'}`}></div>
                      <Sparkles className={`w-6 h-6 absolute -top-1 -right-1 animate-pulse ${data.isSketchMode ? 'text-amber-400' : 'text-indigo-400'}`} />
                    </div>
                    <div className="text-center space-y-2">
                      <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${data.isSketchMode ? 'text-amber-900' : 'text-indigo-900'}`}>
                        {data.isSketchMode ? "正在深度解析剧本草图..." : (isMergeNode ? "AI 正在跨流融合画面..." : "正在渲染电影级分镜...")}
                      </p>
                      <p className="text-[8px] text-gray-400 font-bold tracking-widest uppercase">Gemini Vision Core</p>
                    </div>
                  </div>
               </div>
            )}
          </div>

          <textarea
            className="w-full text-[13px] p-6 rounded-[2rem] bg-gray-50/50 border border-gray-100 focus:ring-[8px] focus:ring-indigo-100 focus:bg-white resize-none h-36 outline-none font-bold transition-all nodrag shadow-sm placeholder:text-gray-300 leading-relaxed"
            placeholder={data.isSketchMode ? "描述一段连续剧本，AI 将自动分页为您绘制草图网格..." : (isMergeNode ? "描述如何完美融合多个前置分镜的视觉特征..." : "描述您心中理想的画面构图与视觉内容...")}
            value={data.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
          />

          <button 
            onClick={() => data.onGenerate?.(id)}
            disabled={data.isGenerating}
            className={`w-full text-white text-[11px] font-black py-5.5 rounded-[1.75rem] transition-all flex items-center justify-center gap-3.5 uppercase tracking-[0.25em] shadow-2xl disabled:opacity-40 nodrag ${data.isSketchMode ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-100' : (isMergeNode ? 'bg-indigo-800 hover:bg-indigo-900 shadow-indigo-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100')}`}
          >
            {data.isSketchMode ? <Pencil className="w-5 h-5 fill-current" /> : (isMergeNode ? <Merge className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />)}
            {data.isSketchMode ? '生成分页草图' : (isMergeNode ? '执行叙述融合' : '开始渲染镜头')}
          </button>
        </div>

        {/* Node Metadata Footer */}
        <div className="px-8 py-4.5 bg-gray-50/80 border-t flex items-center justify-between text-[9px] font-black text-gray-400 uppercase tracking-widest">
           <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
              <span>NODERENDER v2.0 // ID: {id.slice(0, 8)}</span>
           </div>
           <div className="flex gap-3">
             <div className="bg-indigo-50 text-indigo-600 px-3.5 py-1.5 rounded-full border border-indigo-100 shadow-sm">
               {data.aspectRatio}
             </div>
             <div className="bg-white text-gray-400 px-3.5 py-1.5 rounded-full border border-gray-100 shadow-sm">
               {data.imageSize}
             </div>
           </div>
        </div>
      </div>

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="!w-6 !h-6 !bg-indigo-600 !border-[5px] !border-white !rounded-full transition-transform hover:scale-125 shadow-2xl" 
      />
    </div>
  );
};

export default memo(StoryboardNode);
