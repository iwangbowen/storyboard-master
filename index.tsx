
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import ReactFlow, { 
  Background, 
  Controls, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Connection, 
  Edge, 
  Node as RFNode,
  MarkerType,
  Panel
} from 'reactflow';
import Sidebar from './components/Sidebar';
import StoryboardNode from './components/Node';
import EditorModal from './components/EditorModal';
import SettingsModal from './components/SettingsModal';
import { StoryNode, VisualAsset, EditorState, ProxyConfig } from './types';
import { generateStoryboardFrame, editFrame } from './services/geminiService';
import { Plus, AlertCircle, X, Settings2, Globe, Server, Merge, Share2, Layers, Pencil } from 'lucide-react';

const initialNodes: RFNode<StoryNode>[] = [];
const initialEdges: Edge[] = [];

const nodeTypes = {
  storyboardNode: StoryboardNode,
};

const App: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [editor, setEditor] = useState<EditorState>({ isOpen: false, nodeId: null, mode: 'text' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isProxyActive, setIsProxyActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 使用 Ref 解决闭包陷阱：确保异步回调 handleGenerate 总是能拿到最新的 nodes 和 assets 状态
  const nodesRef = useRef<RFNode<StoryNode>[]>(nodes);
  const assetsRef = useRef<VisualAsset[]>(assets);
  const edgesRef = useRef<Edge[]>(edges);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const checkKeyStatus = useCallback(async () => {
    const saved = localStorage.getItem('proxy_config');
    let proxyActive = false;
    if (saved) {
      try {
        const config: ProxyConfig = JSON.parse(saved);
        if (config.apiHost) proxyActive = true;
      } catch (e) {}
    }
    setIsProxyActive(proxyActive);
  }, []);

  const ensureApiKey = async () => {
    if (typeof window.aistudio !== 'undefined') {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
      }
    }
  };

  const handleGenerate = async (id: string) => {
    setError(null);
    // 从 Ref 中获取最新状态，避免闭包导致的 content 为空
    const currentNodes = nodesRef.current;
    const node = currentNodes.find(n => n.id === id);
    
    if (!node || !node.data.content?.trim()) {
      setError("请输入画面描述或分镜剧本。");
      return;
    }

    await ensureApiKey();

    const currentAssets = assetsRef.current;
    const currentEdges = edgesRef.current;
    
    const nodeSpecificAssets = currentAssets.filter(a => node.data.selectedAssetIds?.includes(a.id));
    const parentEdges = currentEdges.filter(e => e.target === id);
    const parentNodes = parentEdges.map(e => currentNodes.find(n => n.id === e.source)).filter(Boolean) as RFNode<StoryNode>[];
    const previousFrameUrls = parentNodes.map(p => p.data.imageUrl).filter(Boolean) as string[];

    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isGenerating: true } } : n));

    try {
      if (node.data.imageUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(node.data.imageUrl);
      }

      const result = await generateStoryboardFrame(node.data.content, nodeSpecificAssets, {
        aspectRatio: node.data.aspectRatio,
        imageSize: node.data.imageSize,
        panelType: node.data.panelType,
        isSketchMode: node.data.isSketchMode,
        previousFrameUrls
      });
      
      if (result) {
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, imageUrl: result, isGenerating: false } } : n));
      } else {
        throw new Error("模型未返回图像结果");
      }
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found") && typeof window.aistudio !== 'undefined') {
        await window.aistudio.openSelectKey();
      }
      setError(err.message || "生成失败。");
      setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isGenerating: false } } : n));
    }
  };

  const addNode = useCallback((x: number, y: number, parentIds: string[] = [], initialImageUrl?: string, isSketch = false) => {
    const id = Math.random().toString(36).substr(2, 9);
    const isMerge = parentIds.length > 1;
    
    const newNode: RFNode<StoryNode> = {
      id,
      type: 'storyboardNode',
      position: { x, y },
      data: {
        id,
        parentIds: [...parentIds],
        x, y,
        type: 'frame',
        title: initialImageUrl ? `分支镜头` : (isMerge ? `融合镜头` : (isSketch ? `参考草图` : `新镜头`)),
        content: '',
        connectedTo: [],
        aspectRatio: '16:9',
        imageSize: '1K',
        panelType: isSketch ? '9-grid' : 'single',
        isSketchMode: isSketch,
        imageUrl: initialImageUrl,
        isGenerating: false,
        allAssets: assetsRef.current,
        selectedAssetIds: [],
        onUpdate: (nodeId, updates) => {
          setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
        },
        onDelete: (nodeId) => {
          setNodes(nds => {
            const nodeToDelete = nds.find(n => n.id === nodeId);
            if (nodeToDelete?.data.imageUrl?.startsWith('blob:')) {
              URL.revokeObjectURL(nodeToDelete.data.imageUrl);
            }
            return nds.filter(n => n.id !== nodeId);
          });
          setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
        },
        onGenerate: (nodeId) => handleGenerate(nodeId),
        onEditImage: (nodeId) => setEditor({ isOpen: true, nodeId, mode: 'text' }),
        onContinueFromSlice: (nodeId, img) => {
          const currentNodes = nodesRef.current;
          const node = currentNodes.find(n => n.id === nodeId);
          if (node) addNode(node.position.x + 400, node.position.y, [nodeId], img);
        }
      },
    };

    setNodes((nds) => {
      let nextNodes = nds.map(n => 
        parentIds.includes(n.id) 
          ? { ...n, data: { ...n.data, connectedTo: [...new Set([...n.data.connectedTo, id])] } }
          : n
      );
      return nextNodes.concat(newNode);
    });
    
    if (parentIds.length > 0) {
      const newEdges = parentIds.map(pid => ({
        id: `e-${pid}-${id}`,
        source: pid,
        target: id,
        animated: true,
        style: { stroke: isMerge ? '#818cf8' : '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isMerge ? '#818cf8' : '#6366f1' },
      }));
      setEdges((eds) => eds.concat(newEdges));
    }
  }, [setNodes, setEdges]); // 移除对 nodes.length 的直接依赖，因为 ID 是随机的，逻辑不依赖顺序

  useEffect(() => {
    checkKeyStatus();
    if (nodesRef.current.length === 0) {
      addNode(100, 100);
    }
  }, [checkKeyStatus, addNode]);

  // 资产更新时，同步更新所有节点中的 allAssets 列表，确保节点能渲染资产选择器
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, allAssets: assets }
    })));
  }, [assets, setNodes]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ 
      ...params, 
      animated: true, 
      style: { stroke: '#6366f1', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
    }, eds));
    
    if (params.target && params.source) {
      setNodes(nds => nds.map(n => {
        if (n.id === params.target) {
          return { ...n, data: { ...n.data, parentIds: [...new Set([...(n.data.parentIds || []), params.source!])] } };
        }
        if (n.id === params.source) {
          return { ...n, data: { ...n.data, connectedTo: [...new Set([...(n.data.connectedTo || []), params.target!])] } };
        }
        return n;
      }));
    }
  }, [setEdges, setNodes]);

  const handleEditSave = async (prompt: string, maskImageUrl?: string) => {
    if (!editor.nodeId) return;
    const node = nodesRef.current.find(n => n.id === editor.nodeId);
    if (!node || !node.data.imageUrl) return;

    await ensureApiKey();

    setNodes(nds => nds.map(n => n.id === editor.nodeId ? { ...n, data: { ...n.data, isGenerating: true } } : n));
    setError(null);
    try {
      const result = await editFrame(node.data.imageUrl, prompt, maskImageUrl);
      if (result) {
        if (node.data.imageUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(node.data.imageUrl);
        }
        setNodes(nds => nds.map(n => n.id === editor.nodeId ? { ...n, data: { ...n.data, imageUrl: result, isGenerating: false } } : n));
      }
    } catch (err: any) {
      if (err.message?.includes("Requested entity was not found") && typeof window.aistudio !== 'undefined') {
        await window.aistudio.openSelectKey();
      }
      setError(err.message || "重绘失败。");
      setNodes(nds => nds.map(n => n.id === editor.nodeId ? { ...n, data: { ...n.data, isGenerating: false } } : n));
    }
  };

  const handleRemoveAsset = (id: string) => {
    const asset = assets.find(a => a.id === id);
    if (asset?.imageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(asset.imageUrl);
    }
    setAssets(assets.filter(a => a.id !== id));
  };

  const handleMultiExtend = () => {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length === 0) return;
    const maxX = Math.max(...selectedNodes.map(n => n.position.x));
    const avgY = selectedNodes.reduce((sum, n) => sum + n.position.y, 0) / selectedNodes.length;
    addNode(maxX + 450, avgY, selectedNodes.map(n => n.id));
  };

  const selectedCount = useMemo(() => nodes.filter(n => n.selected).length, [nodes]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 select-none">
      <Sidebar 
        assets={assets} 
        onAddAsset={(a) => setAssets([...assets, a])} 
        onRemoveAsset={handleRemoveAsset} 
      />
      
      <main className="flex-1 relative overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={4}
        >
          <Background color="#f3f4f6" gap={20} />
          <Controls />
          
          <Panel position="top-left" className="flex gap-3 m-4">
            <button 
              onClick={() => addNode(100, 100)}
              className="bg-white px-5 py-2.5 rounded-full shadow-lg border border-indigo-100 flex items-center gap-2 font-bold text-sm text-indigo-600 hover:bg-indigo-50 transition-all pointer-events-auto"
            >
              <Plus className="w-4 h-4" />
              新建镜头
            </button>
            <button 
              onClick={() => addNode(100, 300, [], undefined, true)}
              className="bg-white px-5 py-2.5 rounded-full shadow-lg border border-amber-100 flex items-center gap-2 font-bold text-sm text-amber-600 hover:bg-amber-50 transition-all pointer-events-auto"
            >
              <Pencil className="w-4 h-4" />
              参考草图
            </button>
            {selectedCount > 0 && (
               <button 
                onClick={handleMultiExtend}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 font-bold text-sm hover:bg-indigo-700 transition-all pointer-events-auto"
               >
                 {selectedCount > 1 ? <Merge className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                 {selectedCount > 1 ? `合并多路延伸 (${selectedCount})` : '延伸序列'}
               </button>
            )}
          </Panel>

          <Panel position="top-right" className="flex items-center gap-4 m-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold shadow-sm transition-all pointer-events-auto ${isProxyActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
              {isProxyActive ? <><Globe className="w-3 h-3" /> 代理模式</> : <><Server className="w-3 h-3" /> 直连模式</>}
            </div>

            <button 
              onClick={() => setSettingsOpen(true)}
              className="p-2 bg-white rounded-full shadow-lg border border-gray-100 text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-all pointer-events-auto"
              title="API 设置"
            >
              <Settings2 className="w-5 h-5" />
            </button>
          </Panel>

          {error && (
            <Panel position="top-right" className="m-4 mt-20">
              <div className="bg-white border-l-4 border-red-500 p-4 rounded-xl shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-right-4 max-w-sm pointer-events-auto">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">提示与错误</p>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed font-mono">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-gray-400 hover:text-red-500 p-1"><X className="w-4 h-4" /></button>
              </div>
            </Panel>
          )}

          <Panel position="bottom-right" className="m-4">
             <div className="bg-white/80 backdrop-blur border p-3 rounded-2xl shadow-lg flex items-center gap-4 text-gray-400 text-[10px] font-bold uppercase tracking-widest">
                <div className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-indigo-500" /> 多路径叙述支持</div>
                <div className="w-px h-3 bg-gray-200"></div>
                <div>内存优化 Blob 模式</div>
             </div>
          </Panel>
        </ReactFlow>
      </main>

      <EditorModal
        isOpen={editor.isOpen}
        onClose={() => setEditor({ ...editor, isOpen: false })}
        imageUrl={nodes.find(n => n.id === editor.nodeId)?.data.imageUrl || ''}
        onSave={handleEditSave}
      />

      <SettingsModal 
        isOpen={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          checkKeyStatus();
        }}
      />
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
