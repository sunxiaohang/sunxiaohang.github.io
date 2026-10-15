# CodeMotion

用 XML 脚本驱动的**几何动画引擎与教程编辑器**。写一份声明式脚本，就能得到一段可播放、可逐步讲解、可导出成视频 / 分镜 / 图片的动画教程——无需手写帧，无需引入动画库。

## 特性

- **声明式补间**：`<circle at="3,3" fill="red"/>` 加 `<step say="...">` 写「变成什么样」，而不是「怎么变」
- **编程能力**：`<let>` / `<set>` / `<for>` / `<if>` / `<def>` 模板、`<anim>` 关键帧、表达式，可批量生成内容
- **面向教学**：步骤 + 字幕 + 逐字朗读节奏，暂停在任意一步画面自带解释
- **版式自检**：连线端点被图形盖住 / 没接上、卡片里文字贴边或溢出、标签被压得太小，编辑器和 `cli/check.js` 都会指出并给出修复建议；连线可直接写对象 id（`<arrow from="a" to="b"/>`），自动贴边并随对象移动；路径与尾迹按弧长参数化，圆心永远在尾迹笔尖上
- **字幕样式**：默认是安静的半透明胶囊，颜色跟随配色；`<scene caption="plain|bar|minimal|accent|classic">` 换样式，`caption-size="small|large|xlarge|22"` 调字号，`caption-pos="top"` 放到上方，`caption="false"` 关闭；编辑器里也有对应下拉框
- **丰富效果**：20+ 缓动曲线、`pulse`/`shake`/`jump`/`spin`/`flash`/`wobble`、落地投影、文字描边、星形多边形
- **换肤与复用**：`<theme>` 语义色一键换肤，`<import>` 跨文件引入组件库 / 主题
- **数据驱动**：CSV / JSON 数据源 → `<for in="{rows}">` 批量渲染（报表、数据可视化）
- **配色模板**：`<scene palette="porcelain">` 一行套用瓷白 / 石墨 / 极光 / 香槟 / Material / Pantone 年度色 / Nord / Dracula 等 23 套配色，背景、默认图形色、文字线条色、标签对比度自动跟随；循环里用 `pal(i)` 取系列色，工具栏「配色…」可一键切换
- **流式布局**：`<row>`/`<column>` 自动排布、`after`/`below` 相对定位、`distribute` 等距分布——省掉手算坐标，又不失精准
- **图标与素材**：`<icon text="🎯"/>` emoji 图标实体 + 内置素材面板一键插入
- **所见即所得**：点选画布对象 → 属性面板查看/编辑，超框/重叠在画布上红框高亮
- **分享库**：浏览内置作品集，一键复制到自己的场景（另支持分享链接、多场景管理、导入/导出 .xml）
- **离线导出**：WebCodecs 逐帧编码 WebM（可带音轨）、PNG、分镜长图
- **零运行时依赖**：纯浏览器 + Node，无第三方库

## 快速开始

需要 [Node.js](https://nodejs.org) ≥ 20。

```bash
npm start          # 本地编辑器 → http://localhost:5173
npm test           # 运行全部测试（200+ 用例）
npm run gallery    # 生成静态画廊页 gallery.html
```

打开后从左上角「示例」下拉选一个，或直接写一个最小场景：

```xml
<scene width="800" height="600" grid="4x3">
  <circle id="a" at="1,1" fill="#7c6cff" sound="pop"/>
  <step say="你好！" dur=".6">
    <a at="3,3" pulse=".1"/>
  </step>
</scene>
```

点「语法速查」查看完整语言参考。

## 导出

| 按钮 | 产物 | 说明 |
|---|---|---|
| 导出当前帧 | PNG | 当前画面截图 |
| 导出分镜 | PNG 长图 | 所有步骤静帧拼成一张图文教程 |
| 导出 WebM | 视频（可带音轨） | Chrome/Edge 走 WebCodecs 离线逐帧编码，旧浏览器自动降级为实时录制 |

## 部署到 GitHub Pages

项目是**纯静态前端**，无需构建。仓库 Settings → Pages → Source 选默认分支（如 `master`）`/ (root)` 即可。站点页面：`index.html` 首页、`works.html` 作品库、`docs.html` 文档、`editor.html` 编辑器，支持亮/暗主题。Vercel 部署时 Framework Preset 选 `Other`，Build Command 留空。注意：GitHub Free 的 Pages 仅对**公开仓库**免费。

## 项目结构

```
src/
  core/        语言与引擎（无 DOM 依赖，Node/浏览器通用）
    lang/       XML 解析、表达式、展开（let/for/if/def/anim）、schema
    compile/    场景/对象/步骤/补间/效果/冲突检测
    runtime/    evaluate(scene, t) 纯函数求值
    analysis/   lint（出界/超框/重叠检测）、describe（场景摘要）
  render/      渲染中间表示（IR）+ Canvas2D 后端（可插 SVG/WebGL）
  player/      播放控制（seek/tick/步骤）
  editor/      代码编辑器、语法高亮、诊断、文档
  export/      分镜、离线逐帧渲染、WebCodecs 编码、WebM 封装
  audio/       Web Audio 合成音效（零音频文件）
examples/      内置示例与标准库（themes/、lib/）
cli/check.js   命令行：编译 + 诊断 + 场景摘要
```

## License

[MIT](./LICENSE)
