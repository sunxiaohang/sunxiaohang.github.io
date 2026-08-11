# Entrance — 个人入口终端

基于 React + TypeScript 的个人信息聚合工作台。Dashboard 风格，可拖拽布局，组件化架构。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | React 18 + TypeScript | 组件模型天然映射到 Widget 系统 |
| 构建 | Vite 6 | 快速 HMR，代码分割 |
| 状态 | Zustand + IndexedDB (idb) | 布局 + 业务数据分离持久化 |
| 布局 | react-grid-layout | 12 列网格，拖拽排序，自由缩放 |
| 样式 | Tailwind CSS 3.4 | 暗色/浅色双主题 |
| 图标 | Lucide React | 轻量 SVG 图标库 |
| 部署 | GitHub Pages (docs/) | master 分支 /docs 目录 |

## 项目结构

```
entrance/
├── src/
│   ├── core/                          # 核心引擎（平台无关）
│   │   ├── registry/
│   │   │   ├── WidgetRegistry.ts      # 部件注册中心（单例 Map）
│   │   │   └── types.ts              # WidgetManifest / WidgetLayout 类型
│   │   ├── layout/
│   │   │   ├── Workspace.tsx          # 网格工作区，双模式（预览/编辑）
│   │   │   ├── WidgetCard.tsx         # 部件卡片外壳（拖拽柄 + 懒加载）
│   │   │   ├── WidgetLibrary.tsx      # 右侧部件库面板
│   │   │   └── TodoPanel.tsx          # 左侧固定待办面板
│   │   └── store/
│   │       └── workspaceStore.ts      # Zustand 布局状态
│   ├── widgets/                       # 内置部件目录
│   │   ├── registry.ts               # 注册入口（加部件：import + push）
│   │   ├── clock/                     # 时钟（今日进度环）
│   │   ├── bookmarks/                 # 书签（分类收藏）
│   │   ├── ideas/                     # 灵感记录（标签 + 编辑）
│   │   ├── tools/                     # 工具集（图标 + 链接）
│   │   └── quick-note/               # 便签（自动保存）
│   ├── hooks/
│   │   ├── useWidgetData.ts          # 部件数据 IndexedDB 读写
│   │   └── useTheme.ts              # 浅色/深色切换
│   ├── lib/
│   │   ├── db.ts                     # IndexedDB 封装
│   │   └── utils.ts                  # 工具函数
│   ├── App.tsx                        # 主 shell（三栏 + 顶栏 + 模式切换）
│   ├── main.tsx                       # 入口
│   └── index.css                      # Tailwind + Material Design 组件类
├── docs/                              # 构建产物（GitHub Pages）
├── tailwind.config.ts                 # 网易红配色 + Material 阴影
├── vite.config.ts
└── package.json
```

## 架构设计

### 1. Widget Registry（部件注册中心）

每个部件是一个独立的文件夹，导出 `WidgetManifest`：

```typescript
interface WidgetManifest {
  id: string;           // 唯一标识，如 "todo"
  name: string;         // 显示名，如 "待办事项"
  description: string;  // 部件库中显示的描述
  icon: string;         // Lucide 图标名
  category: 'productivity' | 'reference' | 'info' | 'custom';
  defaultSize: { cols: number; rows: number };
  minSize: { cols: number; rows: number };
  loader: () => Promise<{ default: ComponentType<WidgetProps> }>;
}
```

**添加新部件三步：**

1. 创建 `src/widgets/my-widget/` → 写 `index.ts`（导出 manifest）+ `MyWidget.tsx`（组件）
2. 在 `src/widgets/registry.ts` 中 `import` 并加入数组
3. 部件库自动出现，点击添加到工作区

### 2. 工作区系统

- **预览模式（默认）**：卡片只读，无拖拽手柄，无删除按钮。右侧部件库显示引导提示
- **编辑模式**：卡片可拖拽排序、右下角缩放、删除。部件库可搜索添加
- react-grid-layout 12 列网格，rowHeight=76px
- 布局通过 Zustand persist 持久化到 localStorage

### 3. 数据层

```
┌──────────────┐     ┌─────────────────┐
│  Zustand     │────▶│  localStorage   │  布局位置、激活状态
│  workspaceStore │     │                 │
└──────────────┘     └─────────────────┘

┌──────────────┐     ┌─────────────────┐
│  useWidgetData│────▶│  IndexedDB      │  业务数据（待办、书签、笔记…）
│  (per-instance)│    │  (idb key-val)  │
└──────────────┘     └─────────────────┘
```

- **布局数据**（位置、大小）→ Zustand + localStorage，读写快，不需要异步
- **业务数据**（任务、书签、灵感）→ IndexedDB，容量大，结构化存储，互不干扰

### 4. 三栏固定布局

```
┌──────────┬──────────────────────┬──────────┐
│  待办事项  │                      │  部件库   │
│  (360px) │      工作区          │  (360px) │
│          │    (弹性宽度)         │          │
│  固定面板  │   可拖拽网格         │  固定面板  │
└──────────┴──────────────────────┴──────────┘
```

### 5. 主题系统

- Tailwind `darkMode: 'class'`
- `<html class="dark">` 控制深色模式
- 网易红 `#E82030` 作为主色调
- Material Design 风格：卡片阴影、标签、按钮、输入框

## 内置部件

| 部件 | ID | 类别 | 功能 |
|------|-----|------|------|
| 时钟 | clock | info | 模拟时钟 + 今日进度环 + 日期 |
| 书签 | bookmarks | reference | URL 收藏，分类筛选，favicon 自动获取 |
| 灵感记录 | ideas | productivity | 标题 + Markdown 内容 + 标签，内联编辑 |
| 工具集 | tools | reference | 工具卡片网格，分类，一键跳转 |
| 便签 | quick-note | productivity | 纯文本，800ms 防抖自动保存 |

## 部署

```bash
# 一键部署到 GitHub Pages
npm run deploy    # = build + git add -A + commit + push
```

GitHub Pages 配置：Settings → Pages → Source: Deploy from branch → master → /docs

---

## 功能扩展方案

### 🔖 书签页改造（当前痛点分析）

当前书签是一个普通的 Grid Widget，存在以下局限：

- 空间有限（4x5 网格），条目多了拥挤
- 纯列表展示，缺少视觉层次
- 不支持拖拽排序
- 没有快捷搜索
- favicon 依赖外部 Google 服务

**建议方案：书签独立为二级页面 / 弹出面板**

```
┌─────────────────────────────────────────────┐
│  🔍 搜索书签...              [+ 添加书签]    │
├─────────────────────────────────────────────┤
│  [全部] [工作] [学习] [工具] [娱乐] [其他]     │
├─────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 🎨        │ │ 📦        │ │ 🐙        │    │
│  │ Figma    │ │ npm       │ │ GitHub    │    │
│  │ 设计工具   │ │ 包管理    │ │ 代码托管   │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ 📝        │ │ 📊        │ │ 🔧        │    │
│  │ Notion   │ │ Grafana   │ │ VSCode    │    │
│  │ 笔记协作   │ │ 监控面板   │ │ Web 版    │    │
│  └──────────┘ └──────────┘ └──────────┘    │
└─────────────────────────────────────────────┘
```

或者做成**搜索为中心的快速启动面板**（类似 Alfred/Raycast）：

- `Cmd/Ctrl + K` 唤起搜索框
- 输入关键词模糊匹配书签 + 工具
- 回车直接打开 / 新标签打开

### 💡 可添加的小功能

| 优先级 | 功能 | 说明 |
|--------|------|------|
| ⭐⭐⭐ | **书签吸底工具栏** | 书签卡片底部加"复制链接""编辑""置顶"小按钮 |
| ⭐⭐⭐ | **待办排序方式** | 手动拖拽排序 + 按截止日期/优先级/创建时间排序 |
| ⭐⭐⭐ | **便签多页** | 便签支持多页切换（Tab 式），相当于多个便签本 |
| ⭐⭐ | **天气预报** | 新 Widget：输入城市，显示今日天气 + 未来 3 天（需 API） |
| ⭐⭐ | **倒计时** | 新 Widget：设置目标日期，显示剩余天数/进度 |
| ⭐⭐ | **习惯打卡** | 新 Widget：每日勾选，连续天数统计，简易热力图 |
| ⭐⭐ | **剪贴板历史** | 新 Widget：记录复制的文本片段（需 Clipboard API） |
| ⭐⭐ | **RSS 订阅** | 新 Widget：输入 RSS 源，显示最新 5 条（需 CORS 代理） |
| ⭐⭐ | **便签 Markdown 预览** | 便签支持 Markdown 渲染预览 |
| ⭐ | **番茄钟** | 新 Widget：25 分钟倒计时，完成统计 |
| ⭐ | **汇率转换** | 新 Widget：货币转换小工具 |
| ⭐ | **IP/域名查询** | 新 Widget：输入域名查 IP、DNS 等 |

### 🏗️ 架构层建议

| 优先级 | 功能 | 说明 |
|--------|------|------|
| ⭐⭐⭐ | **Widget 数据导出/导入** | 每个 Widget 支持 JSON 导出，跨设备迁移 |
| ⭐⭐⭐ | **Widget 克隆** | 右键 / 按钮快速复制一个已配置的 Widget |
| ⭐⭐ | **多工作区** | Tab 式切换不同工作区（工作/个人/项目） |
| ⭐⭐ | **快捷键面板** | `?` 显示所有快捷键 |
| ⭐⭐ | **Widget 配置面板** | 点击齿轮打开 Widget 设置侧边栏（颜色、刷新频率等） |
| ⭐ | **协作分享** | 导出工作区配置链接，分享给他人导入 |

---

## 本地开发

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # 输出到 docs/
npm run deploy    # 构建并推送到 GitHub Pages
```
