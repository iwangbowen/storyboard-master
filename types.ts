
export enum AssetType {
  CHARACTER = 'CHARACTER',
  SCENE = 'SCENE',
  PROP = 'PROP',
  POSE = 'POSE'
}

export interface VisualAsset {
  id: string;
  name: string;
  type: AssetType;
  imageUrl: string; // 现在存储为 blob:http://... 格式
}

export interface StoryNode {
  id: string;
  parentIds: string[];
  x: number;
  y: number;
  type: 'start' | 'frame' | 'branch';
  title: string;
  content: string; 
  imageUrl?: string;
  connectedTo: string[]; 
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  panelType: 'single' | '4-grid' | '9-grid' | '16-grid' | '25-grid';
  isSketchMode?: boolean;
  selectedAssetIds?: string[]; 
  // React Flow data helpers
  isGenerating?: boolean;
  allAssets?: VisualAsset[];
  onUpdate?: (id: string, updates: Partial<StoryNode>) => void;
  onDelete?: (id: string) => void;
  onGenerate?: (id: string) => void;
  onEditImage?: (id: string) => void;
  onContinueFromSlice?: (id: string, imageData: string) => void;
}

export type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";
export type ImageSize = "1K" | "2K" | "4K";

export interface EditorState {
  isOpen: boolean;
  nodeId: string | null;
  mode: 'text' | 'scribble';
}

export interface ProxyConfig {
  apiHost?: string;
  apiKey?: string;
  textModel?: string;
  imageModel?: string;
}
