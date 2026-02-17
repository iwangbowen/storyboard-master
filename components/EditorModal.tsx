
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Check, MousePointer2, Eraser, Loader2, Sparkles, Wand2, RefreshCw, ZoomIn, ZoomOut, Move, Settings, Undo, Trash2, Eye, EyeOff } from 'lucide-react';

interface EditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  onSave: (prompt: string, maskData?: string) => void;
}

const EditorModal: React.FC<EditorModalProps> = ({ isOpen, onClose, imageUrl, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [brushSize, setBrushSize] = useState(30);
  const [maskOpacity, setMaskOpacity] = useState(0.6);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [scale, setScale] = useState(1);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [showMask, setShowMask] = useState(true);

  const saveToUndo = useCallback(() => {
    if (canvasRef.current) {
      const data = canvasRef.current.toDataURL();
      setUndoStack(prev => [...prev.slice(-19), data]); // 保留最近20步
    }
  }, []);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const lastState = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    
    const img = new Image();
    img.src = lastState;
    img.onload = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(img, 0, 0);
      }
    };
  };

  useEffect(() => {
    if (isOpen && canvasRef.current && imageUrl) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasMask(false);
        setUndoStack([]);
        setScale(1);
      }
    }
  }, [isOpen, imageUrl]);

  if (!isOpen) return null;

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
      screenX: clientX,
      screenY: clientY
    };
  };

  const startDrawing = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    saveToUndo();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = brushSize / scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'brush' ? `rgba(0, 255, 127, ${maskOpacity})` : 'rgba(0, 0, 0, 1)';
    ctx.globalCompositeOperation = tool === 'brush' ? 'source-over' : 'destination-out';
    setIsDrawing(true);
    setHasMask(true);
  };

  const draw = (e: React.MouseEvent) => {
    const { x, y, screenX, screenY } = getCoordinates(e);
    setMousePos({ x: screenX, y: screenY });

    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const handleApply = async () => {
    if (!prompt) return;
    setIsProcessing(true);
    let maskData: string | undefined = undefined;
    
    if (hasMask && canvasRef.current) {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvasRef.current.width;
      maskCanvas.height = canvasRef.current.height;
      const mctx = maskCanvas.getContext('2d');
      if (mctx) {
        mctx.fillStyle = 'black';
        mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        mctx.globalCompositeOperation = 'source-over';
        mctx.drawImage(canvasRef.current, 0, 0);
        mctx.globalCompositeOperation = 'source-in';
        mctx.fillStyle = 'white';
        mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        maskData = maskCanvas.toDataURL('image/png');
      }
    }
    
    await onSave(prompt, maskData);
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4 sm:p-10 overflow-hidden select-none">
      {/* 虚拟画笔预览 */}
      <div 
        className="fixed pointer-events-none z-[100] border border-white mix-blend-difference rounded-full flex items-center justify-center transition-all duration-75"
        style={{ 
          left: mousePos.x, 
          top: mousePos.y, 
          width: brushSize, 
          height: brushSize,
          transform: 'translate(-50%, -50%)',
          opacity: isDrawing ? 0.3 : 0.8
        }}
      >
        <div className="w-0.5 h-0.5 bg-white rounded-full"></div>
      </div>

      <div className="bg-white rounded-3xl w-full max-w-7xl h-full flex flex-col shadow-2xl overflow-hidden border border-white/10 relative">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-100"><Wand2 className="w-5 h-5 text-white" /></div>
            <div>
              <h3 className="font-bold text-gray-900 leading-none">精准局部重绘</h3>
              <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter">涂抹范围越精细，AI 生成越准确</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <div className="flex items-center bg-white border rounded-full px-3 py-1 shadow-sm mr-4">
                <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><ZoomOut className="w-4 h-4 text-gray-500" /></button>
                <span className="text-[10px] font-bold w-12 text-center text-gray-600">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(4, s + 0.1))} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><ZoomIn className="w-4 h-4 text-gray-500" /></button>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-all group">
               <X className="w-6 h-6 text-gray-400 group-hover:rotate-90 transition-transform" />
             </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* 交互工作区 */}
          <div 
            ref={scrollContainerRef} 
            className="flex-1 bg-neutral-900 overflow-auto p-20 flex items-center justify-center cursor-none relative"
            onMouseMove={draw}
          >
             <div 
               className="relative shadow-[0_0_100px_rgba(0,0,0,0.5)] bg-black" 
               style={{ 
                 width: imageRef.current ? imageRef.current.naturalWidth * scale : 'auto', 
                 height: imageRef.current ? imageRef.current.naturalHeight * scale : 'auto' 
               }}
             >
                <div 
                  className="origin-center absolute inset-0 flex items-center justify-center" 
                  style={{ transform: `scale(${scale})` }}
                >
                  <div className="relative inline-block shadow-2xl">
                    <img 
                      ref={imageRef} 
                      src={imageUrl} 
                      className="block rounded-sm max-w-none select-none pointer-events-none" 
                      alt="Original"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (canvasRef.current) {
                          canvasRef.current.width = img.naturalWidth;
                          canvasRef.current.height = img.naturalHeight;
                        }
                      }}
                    />
                    <canvas 
                      ref={canvasRef} 
                      className={`absolute inset-0 cursor-none z-10 transition-opacity ${showMask ? 'opacity-100' : 'opacity-0'}`} 
                      onMouseDown={startDrawing} 
                      onMouseMove={draw} 
                      onMouseUp={stopDrawing} 
                      onMouseLeave={stopDrawing} 
                    />
                  </div>
                </div>
             </div>
          </div>

          {/* 工具控制台 */}
          <div className="w-80 border-l p-6 space-y-8 flex flex-col bg-white overflow-y-auto">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Settings className="w-3 h-3" /> 绘制工具
                </label>
                <div className="flex gap-1">
                  <button onClick={handleUndo} disabled={undoStack.length === 0} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-20 transition-all" title="撤销">
                    <Undo className="w-4 h-4" />
                  </button>
                  <button onClick={() => setShowMask(!showMask)} className={`p-1.5 rounded-lg transition-all ${showMask ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:bg-gray-100'}`} title="预览原图">
                    {showMask ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setTool('brush')} className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${tool === 'brush' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-gray-100 text-gray-400 hover:bg-gray-50'}`}>
                  <MousePointer2 className="w-5 h-5" />
                  <span className="text-[10px] font-bold">画笔</span>
                </button>
                <button onClick={() => setTool('eraser')} className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${tool === 'eraser' ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-gray-100 text-gray-400 hover:bg-gray-50'}`}>
                  <Eraser className="w-5 h-5" />
                  <span className="text-[10px] font-bold">橡皮擦</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
               <div className="flex justify-between items-center">
                 <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">画笔尺寸</label>
                 <span className="text-xs font-mono text-indigo-600 font-bold">{brushSize}px</span>
               </div>
               <input 
                type="range" min="1" max="150" 
                value={brushSize} 
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
               />
            </div>

            <div className="space-y-4">
               <div className="flex justify-between items-center">
                 <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">蒙版透明度</label>
                 <span className="text-xs font-mono text-indigo-600 font-bold">{Math.round(maskOpacity * 100)}%</span>
               </div>
               <input 
                type="range" min="0.1" max="1" step="0.1"
                value={maskOpacity} 
                onChange={(e) => setMaskOpacity(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
               />
            </div>

            <div className="space-y-4 flex-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">重绘指令 (关键)</label>
              <textarea 
                placeholder="描述你想要修改的内容... 例如：'将背景的树换成发光的蘑菇' 或 '让角色戴上墨镜'" 
                className="w-full h-40 p-4 text-sm bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-100 resize-none font-medium shadow-inner transition-all" 
                value={prompt} 
                onChange={(e) => setPrompt(e.target.value)} 
              />
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-[10px] text-indigo-700 leading-tight">
                <strong>小贴士：</strong> 涂抹越精确，AI 对周边环境的保留度就越高，重绘效果越自然。
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <button 
                disabled={!prompt || isProcessing} 
                onClick={handleApply} 
                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-100"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                执行 AI 精准重绘
              </button>
              <button onClick={() => {
                saveToUndo();
                const ctx = canvasRef.current?.getContext('2d');
                ctx?.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
                setHasMask(false);
              }} className="w-full py-2 text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center gap-1">
                <Trash2 className="w-3 h-3" /> 清空所有涂鸦
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorModal;
