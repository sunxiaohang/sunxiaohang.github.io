export interface Tool {
  id: string;
  name: string;
  description: string;
  url: string;
  icon?: string;
  category: string;
  createdAt: string;
}

export interface ToolsData {
  tools: Tool[];
  categories: string[];
}
