
import React, { useState, useEffect, useMemo } from 'react';
import { X, Globe, AlertCircle, Info, Save, Cpu, Image as ImageIcon, Loader2, Zap, Check, Shield, Sparkles, Box } from 'lucide-react';
import { ProxyConfig } from '../types';
import { testConnection } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<ProxyConfig>({ 
    apiHost: '', 
    apiKey: '',
    textModel: 'gemini-3-flash-preview',
    imageModel: 'gemini-3-pro-image-preview'
  });
  const [isSaved, setIsSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('proxy_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setConfig(prev => ({ ...prev, ...parsed }));
        } catch (e) {}
      }
    }
  }, [isOpen]);

  const modelInfo = useMemo(() => {
    const infos: Record<string, { desc: string; icon: any; color: string; label: string }> = {
      'gemini-3-flash-preview': { label: '剧本速迭代', desc: '毫秒级响应，最适合长文本剧本的实时分析与分页逻辑拆解。', icon: Zap, color: 'text-amber-500' },
      'gemini-3-pro-preview': { label: '逻辑深分析', desc: '具备极强的角色连贯性理解与复杂空间逻辑推理能力。', icon: Cpu, color: 'text-indigo-500' },
      'gemini-2.0-flash': { label: '均衡性核心', desc: '新一代多模态引擎，在速度与指令遵循度上达到平衡点。', icon: Box, color: 'text-emerald-500' },
      'gemini-3-pro-image-preview': { label: '4K 叙事级', desc: '原生支持高动态范围渲染，能完美保留资产库中的角色视觉细节。', icon: Sparkles, color: 'text-indigo-600' },
      'gemini-2.5-flash-image': { label: '极速成片', desc: '针对快节奏草图模式优化，单次请求可并行生成多个分镜候选。', icon: Zap, color: 'text-sky-500' },
    };
    return infos;
  }, []);

  if (!isOpen) return null;

  const handleSave = () => {
    const cleanConfig: ProxyConfig = {
      apiHost: config.apiHost?.trim() || '',
      apiKey: config.apiKey?.trim() || '',
      textModel: config.textModel,
      imageModel: config.imageModel
    };
    
    localStorage.setItem('proxy_config', JSON.stringify(cleanConfig));
    setConfig(cleanConfig);
    
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 800);
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError(null);
    try {
      await testConnection();
      setTestStatus('success');
    } catch (err: any) {
      setTestStatus('error');
      setTestError(err.message || String(err));
    }
  };

  const textModels = [
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (推荐)' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
  ];

  const imageModels = [
    { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image (超清)' },
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image' }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xl p-4">
      <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] border border-white/20 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="p-10 border-b flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-100/50">
              <Globe className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 leading-none text-lg uppercase tracking-tight">架构配置中心</h3>
              <p className="text-[11px] text-gray-400 mt-2 uppercase tracking-[0.2em] font-black">AI CORE // V1BETA REST INTERFACE</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-red-50 hover:text-red-500 rounded-full transition-all group">
            <X className="w-7 h-7 text-gray-400 group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Connection Settings */}
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-3">
              <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Globe className="w-4 h-4" /> 代理中转端点
              </label>
              <input 
                type="text" 
                placeholder="例如: api.yourproxy.com"
                className="w-full p-5 text-sm bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-mono font-bold"
                value={config.apiHost || ''}
                onChange={(e) => setConfig({ ...config, apiHost: e.target.value })}
              />
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Shield className="w-4 h-4" /> 独立 API 访问密钥
              </label>
              <input 
                type="password" 
                placeholder="在此输入由 Google AI Studio 提供的 API Key"
                className="w-full p-5 text-sm bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-mono"
                value={config.apiKey || ''}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              />
            </div>

            <button 
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              className={`w-full py-5 rounded-2xl text-[12px] font-black flex items-center justify-center gap-3 border transition-all ${
                testStatus === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 
                testStatus === 'error' ? 'bg-red-50 border-red-200 text-red-600' :
                'bg-white border-gray-100 text-gray-500 hover:border-indigo-300 shadow-sm'
              }`}
            >
              {testStatus === 'testing' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
              {testStatus === 'success' ? '连通性测试通过' : testStatus === 'error' ? '连接失败，请检查设置' : '测试 API 链路状态'}
            </button>
          </div>

          {/* Model Selection */}
          <div className="space-y-8 pt-8 border-t border-dashed">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Cpu className="w-4 h-4" /> 文本分析核心
                  </label>
                  <select 
                    className="w-full p-5 text-sm font-bold bg-white border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 cursor-pointer shadow-sm appearance-none"
                    value={config.textModel}
                    onChange={(e) => setConfig({...config, textModel: e.target.value})}
                  >
                    {textModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {modelInfo[config.textModel!] && (
                    <div className="p-5 bg-gray-50/50 rounded-2xl border border-gray-100 space-y-2">
                      <div className="flex items-center gap-2">
                        {React.createElement(modelInfo[config.textModel!].icon, { className: `w-4 h-4 ${modelInfo[config.textModel!].color}` })}
                        <span className="text-[10px] font-black uppercase text-gray-900">{modelInfo[config.textModel!].label}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium leading-relaxed">{modelInfo[config.textModel!].desc}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> 视觉生成引擎
                  </label>
                  <select 
                    className="w-full p-5 text-sm font-bold bg-white border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 cursor-pointer shadow-sm appearance-none"
                    value={config.imageModel}
                    onChange={(e) => setConfig({...config, imageModel: e.target.value})}
                  >
                    {imageModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {modelInfo[config.imageModel!] && (
                    <div className="p-5 bg-gray-50/50 rounded-2xl border border-gray-100 space-y-2">
                      <div className="flex items-center gap-2">
                        {React.createElement(modelInfo[config.imageModel!].icon, { className: `w-4 h-4 ${modelInfo[config.imageModel!].color}` })}
                        <span className="text-[10px] font-black uppercase text-gray-900">{modelInfo[config.imageModel!].label}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium leading-relaxed">{modelInfo[config.imageModel!].desc}</p>
                    </div>
                  )}
                </div>
             </div>
          </div>

          <div className="p-6 bg-indigo-50 rounded-[2rem] border border-indigo-100 flex gap-4">
             <Sparkles className="w-6 h-6 text-indigo-500 shrink-0 mt-1" />
             <div>
               <p className="text-[12px] font-black text-indigo-900 uppercase tracking-tight">智能渲染建议</p>
               <p className="text-[11px] text-indigo-700/70 mt-1 leading-relaxed font-bold">
                 建议在最终出图阶段将视觉引擎切换至 <span className="text-indigo-900 underline">Gemini 3 Pro Image</span> 并开启 <span className="text-indigo-900 underline">4K 分辨率</span>，以获得最佳的资产还原度与光影质感。
               </p>
             </div>
          </div>

          <button 
            onClick={handleSave}
            className={`w-full py-6 rounded-[2rem] font-black text-sm flex items-center justify-center gap-4 transition-all shadow-2xl uppercase tracking-[0.2em] ${isSaved ? 'bg-emerald-500 text-white shadow-emerald-200 scale-95' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'}`}
          >
            {isSaved ? <Check className="w-6 h-6 stroke-[4]" /> : <Save className="w-6 h-6" />}
            {isSaved ? '已固化当前配置' : '同步至系统内核'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
