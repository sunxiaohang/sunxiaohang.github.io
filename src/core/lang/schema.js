import { EASE_NAMES } from '../util/ease.js';
import { FUNCTION_DOCS, CONST_NAMES } from './expr.js';

export const ENTITY_TYPES = ['circle', 'ellipse', 'rect', 'triangle', 'star', 'text', 'icon', 'line', 'arrow', 'ring', 'note', 'grid', 'map', 'camera', 'emitter'];
export const SOLID = new Set(['circle', 'ellipse', 'rect', 'triangle', 'star']);
/** 参与位置动画的类型。camera 复用同一套位移机制（at/path/by/arc），但不渲染、不参与 lint */
export const POSITIONAL = new Set(['circle', 'ellipse', 'rect', 'triangle', 'star', 'text', 'icon', 'ring', 'note', 'camera', 'emitter']);
export const SEGMENTED = new Set(['line', 'arrow']);
/** 底板类：不参与位置动画，也不参与重叠 / 越界检查 */
export const BACKDROP = new Set(['grid', 'map']);
/** 有 w/h 两个独立尺寸的类型 */
export const BOXED = new Set(['rect', 'ellipse']);
/** 能逐字显现 / 数字滚动的文本类 */
export const TEXTLIKE = new Set(['text', 'icon']);
/** 支持渐变填充（fill→fill2）的类型 */
export const GRADABLE = new Set(['circle', 'ellipse', 'rect', 'triangle', 'star', 'text']);
/** 粒子发射模式 */
export const EMIT_MODES = ['burst', 'fountain', 'rise', 'fall', 'snow'];
/** 混合模式：缺省 normal；add/screen 让颜色叠加变亮，用来做光效、发光 */
export const BLEND_MODES = ['normal', 'add', 'screen', 'multiply', 'overlay', 'lighten', 'darken', 'difference'];

export const TIMING = ['dur', 'delay', 'ease'];
export const EFFECTS = ['pulse', 'shake', 'jump', 'spin', 'flash', 'wobble', 'do', 'loop', 'yoyo'];
/** 内置音色（src/audio/sound.js 实现，无音频文件） */
export const SOUND_NAMES = ['pop', 'tick', 'ding', 'snap', 'whoosh', 'wobble', 'success', 'spring'];
/** 只能在创建时设置、不能在步骤里动画的属性 */
export const STATIC_ATTRS = new Set(['projection', 'region', 'highlight', 'names', 'border', 'borderWidth', 'coast', 'coastWidth', 'island', 'islandWidth', 'dash', 'provinces', 'inset', 'inner', 'river', 'ticks', 'frame', 'off', 'id', 'layer', 'group', 'flat', 'in', 'dash', 'head', 'side', 'gap', 'style', 'dots', 'labels', 'radius', 'points', 'after', 'below', 'blend', 'clip', 'gradient', 'fmt']);
/** <emitter> 的参数都在创建时定死，不参与步骤补间 */
const EMITTER_STATIC = new Set(['mode', 'count', 'spread', 'life', 'speed', 'gravity', 'wind']);

const B = (doc, def) => ({ doc, ...(def !== undefined && { default: def }) });

export const ATTR = {
  id: B('对象名。之后的步骤可以直接把它当标签来修改它；省略则自动生成'),
  at: B('位置：格子坐标 "列,行"（从 1 起，格子中心），也可写 H8；小数表示格内位置，如 1.5,2'),
  px: B('位置：像素坐标 "x,y"（与 at 二选一）'),
  city: B('地理位置：城市名，如 city="成都"（需要先写 <map>）。可写别名与带“市”的写法；步骤里写则是移动到那座城市'),
  lonlat: B('地理位置：经度,纬度（经度在前），如 lonlat="104.06,30.66"（需要先写 <map>）；冷门地点用它'),
  off: B('在 at 的基础上再偏移 "dx,dy"，单位与 size 相同（像素或 .3c）。在卡片 / 面板里摆文字请用它，不要给 at 加小数——at 的小数按行高列宽算，和 c 单位对不齐'),
  size: B('尺寸（px 或 1.5c）。圆=直径；文字=字号；矩形/椭圆=同时设置 w 和 h'),
  w: B('矩形/椭圆宽度；text 时为折行宽度（超过则自动换行）'),
  h: B('矩形/椭圆高度'),
  radius: B('圆角半径（矩形）/ 棋盘底板圆角（grid）'),
  points: B('星形角数（3~24，默认 5）'),
  fill: B('填充色；none 为不填充。文字的颜色也是 fill'),
  stroke: B('描边色 / 线条色；none 为无'),
  width: B('描边或线条粗细（px 或 0.1c）'),
  color: B('文字颜色（note / 图形 label）/ 坐标标签颜色（grid）'),
  alpha: B('透明度 0~1', 1),
  rot: B('旋转角度（度）', 0),
  z: B('层内顺序，大的在上', 0),
  layer: B('所属图层名；图层 z 越大越靠上'),
  group: B('所属分组名；步骤里写组名即可批量修改组内全部对象，如 <红方 pulse/>'),
  flat: B('平面图形：不画落地投影与高光（河流、地面、背景板用；缺省属性）'),
  in: B('登场动画：pop | fade | drop | draw | type | none。line/arrow 默认 draw，grid 默认 fade，其余默认 pop；type 是文字打字机（逐字显现）'),
  label: B('图形中心的文字（文字颜色用 color，字号随图形大小）'),
  text: B('文字内容；note 与 text 通用'),
  from: B('线条起点：格子坐标 "列,行"，或对象 id（绑定连线：自动贴到对象边缘，对象移动时跟着走）'),
  to: B('线条终点：格子坐标 "列,行"，或对象 id。例：<arrow from="a" to="b"/>，a、b 要先于连线定义'),
  dash: B('虚线（缺省属性）'),
  head: B('箭头大小'),
  side: B('气泡出现在目标的哪一侧：top | bottom | left | right', 'top'),
  gap: B('气泡与目标的距离；绑定连线时是连线端点与对象边缘的间距（箭头默认 0.05c）', '0.5c'),
  style: B('棋盘线风格：line（线穿过格子中心，棋类用）| cell（格子边框）', 'line'),
  dots: B('棋盘星位，如 dots="4,4 12,4 8,8"'),
  labels: B('在棋盘外侧标注坐标 A~ / 1~（缺省属性）'),
  projection: B('地图投影：lambert（兰伯特圆锥，国内地图标准形状，默认）| equirect（等距柱状）| mercator（网络墨卡托）', 'lambert'),
  region: B('地图范围：china（全国，默认）、省名（可写多个，空格分隔，如 "四川 云南 西藏"）、或 "经度min,纬度min,经度max,纬度max"。自动缩放居中'),
  highlight: B('高亮的省：空格分隔的省名，这些省会用 fill 填充，其余省保持底色。如 highlight="四川 云南"'),
  names: B('在省的中心写省名（缺省属性），字号随地图大小自动取，可写 names="small" / "large"'),
  border: B('省界线的颜色，none 为不画省界。默认取次要色并半透明'),
  borderWidth: B('省界线粗细（px 或 .05c），默认 1.2'),
  coast: B('外轮廓（国界与海岸线）的颜色，默认取正文色'),
  coastWidth: B('外轮廓线粗细，默认 2'),
  island: B('南海诸岛与九段线的颜色，none 为不画，默认同外轮廓'),
  islandWidth: B('南海诸岛线粗细，默认同外轮廓'),
  provinces: B('要画哪些省：默认全部；写 "none" 则只画外轮廓。与 region 配合做区域地图'),
  inset: B('南海诸岛小图：none 不画；corner（默认）在地图右下角放一张缩小的南海诸岛；off 则按真实位置画在海上'),
  inner: B('只画内部分隔线、不画外框，两端略微内缩（井字棋的 # 形；缺省属性，style="cell" 用）'),
  river: B('河界（象棋）：写河在第几行之后，如 river="5" 表示河在第 5、6 行之间；中间的竖线在河处断开，只保留最左最右两条边线（style="line" 用）'),
  ticks: B('炮位 / 兵位标记（象棋）：在这些交叉点四周画小折角，靠边的一侧自动省略，如 ticks="2,3 8,3 1,4 3,4"'),
  frame: B('外框：在棋盘线的最外圈再画一圈加粗边框，写线宽，如 frame="4"'),
  draw: B('线条的绘制进度 0~1'),
  by: B('相对当前位置移动 "dx,dy"（格数）'),
  path: B('沿折线移动，如 path="1,1 3,1 3,3"；有 <map> 时可以直接写站点：path="北京 武汉 广州"（城市名或 经度,纬度）'),
  smooth: B('让 path 变成平滑曲线（缺省属性）'),
  arc: B('让 path 的每一段弯成弧线：数值是弧度大小（占这一段长度的比例，常用 0.12~0.25），正数向前进方向的左边凸，负数向右。写 arc 就不用再写 smooth。也可单独写 arc="0.2" 配合 at / city 让一次移动走成弧线'),
  heading: B('朝向：图形沿移动方向转动。数值是图形默认“车头”的角度：0 = 默认朝右，-90 = 默认朝上，90 = 朝下。适合小车、飞机、箭头（用于 at / city / path 移动）'),
  trail: B('移动时在身后留下一条尾迹线，走完保留——让静帧也能看出"走过哪里"。可写颜色 trail="#ffd166"，缺省属性则用对象自己的颜色'),
  walk: B('以"走"的方式移动：圆会滚动，其他图形一步一跳（缺省属性）'),
  out: B('退场：fade（默认）| pop | none；退场后对象消失'),
  dur: B('时长（秒）。对 do 动画表示"单次"时长'),
  delay: B('在原定开始时间上再延后（秒）', 0),
  ease: B(`缓动：${EASE_NAMES.join(' / ')} 或 cubic(x1,y1,x2,y2)；任何属性都可单独写 属性名.ease`, 'soft'),
  pulse: B('脉冲放大再回弹，可写 pulse="0.4"（幅度，默认 0.25）'),
  shake: B('左右抖动并衰减，可写 shake="0.2c"（幅度）'),
  jump: B('跳起，可写 jump="1c"（高度）；与 at 同写则是"跳到那里"'),
  spin: B('相对旋转，可写 spin="180"（度，默认 360）'),
  flash: B('闪烁：明暗几次，可写 flash="3"（次数，默认 3）'),
  wobble: B('摆动：左右摇摆并衰减，可写 wobble="12"（摆角，度）'),
  do: B('播放自定义关键帧动画（<anim> 里定义的名字）'),
  loop: B('do 动画重复次数', 1),
  yoyo: B('do 动画循环时来回播放（缺省属性）'),
  name: B('图层 / 分组名；对 <icon> 则是内置矢量图标：car（小汽车）/ bus（公交）/ train（火车）/ plane（飞机）/ ship（船）。车头默认朝右，配 heading="0" 随路径转向'),
  sound: B(`触发时播放的音效：${SOUND_NAMES.join(' / ')}`),
  after: B('相对定位：放在指定 id 对象的右边（配合 gap，锚点要写在前面且带 id）'),
  below: B('相对定位：放在指定 id 对象的下面（配合 gap）'),
  orbit: B('绕圆心匀速转圈：半径（长度）。配 around="圆心坐标" 与 turns="圈数"，真正的圆（不走折线逼近）'),
  around: B('orbit 的圆心（格子坐标）'),
  turns: B('orbit 的圈数（默认 1，可为小数）'),
  fill2: B('渐变填充的第二个颜色：写了它，fill → fill2 就是渐变。如 fill="accent" fill2="accent2"；圆/矩形/三角/星形/文字支持'),
  gradient: B('渐变方式：linear（默认，线性，可写 "linear 135" 指定角度，0=向上、90=向右，默认 135）| radial（从中心向外）。配 fill2 使用'),
  blur: B('模糊半径（px）。做景深、聚焦、朦胧；也可放进步骤里做"从模糊到清晰"的聚焦动画', 0),
  blend: B(`混合模式：${BLEND_MODES.join(' / ')}（默认 normal）。add / screen 让颜色叠加变亮，multiply 变暗，用来做光效、发光、叠加`),
  clip: B('裁剪容器：写一个实心图形（circle/rect/ellipse/triangle/star）的 id，本对象只在它内部可见。如 <rect id="窗" …/> 之后 <text clip="窗" …/>'),
  reveal: B('文字显现进度 0~1：0 完全隐藏、0.5 显示前一半（逐字打字机）。配 dur + ease="linear"；也可用 in="type" 一步到位', 1),
  count: B('数字滚动：把文字补间到这个数值，如 count="1280"（从当前数值滚上去）。配 fmt 控制格式'),
  fmt: B('数字格式，用 # 代表数值（整数自动加千分位）：fmt="# 人" → 1,280 人；fmt="¥#.00" → ¥1,280.00；fmt="#%" → 87%。小数位用 #.0 / #.00 控制'),
  zoom: B('镜头缩放倍数（1 原始、2 放大一倍、0.5 拉远）；<camera> 专用', 1),
  follow: B('镜头跟随对象，写对象 id；写 none 停止跟随。可配 zoom 做"跟随 + 推近"；<camera> 专用'),
  mode: B(`粒子发射方式：${EMIT_MODES.join(' / ')}（burst 向四周爆开、fountain 喷泉、rise 上升、fall 下落、snow 飘雪）；<emitter> 专用`, 'burst'),
  spread: B('粒子发射源的半径（长度）：粒子从以 at 为中心、半径 spread 的圆内随机出发。0 则都从一点出发', 0),
  life: B('单颗粒子的存活时长（秒）：出生 → 运动 → 淡出的总时间。loop 时粒子循环复用', 1.4),
  gravity: B('重力（正数向下、负数向上，单位 格/秒²）：fountain / burst 常配正重力做抛物线回落', 0),
  wind: B('横向风力（正数向右，单位 格/秒²），给 snow / fall 增加飘移', 0),
};

const BASE = ['id', 'alpha', 'z', 'layer', 'group', 'in', 'sound', 'after', 'below', 'gap'];
/** 视觉修饰：所有可见图元通用的渐变 / 模糊 / 混合 / 裁剪 */
const LOOK = ['fill2', 'gradient', 'blur', 'blend', 'clip'];
const SHAPE = [...BASE, ...LOOK, 'at', 'px', 'city', 'lonlat', 'off', 'size', 'fill', 'stroke', 'width', 'rot', 'label', 'color', 'flat'];

export const ENTITY_ATTRS = {
  circle: SHAPE,
  ellipse: [...SHAPE, 'w', 'h'],
  rect: [...SHAPE, 'w', 'h', 'radius'],
  triangle: SHAPE,
  star: [...SHAPE, 'points'],
  text: [...BASE, ...LOOK, 'at', 'px', 'city', 'lonlat', 'off', 'size', 'fill', 'rot', 'text', 'w', 'stroke', 'width', 'reveal', 'count', 'fmt'],
  icon: [...BASE, 'blur', 'blend', 'clip', 'at', 'px', 'city', 'lonlat', 'off', 'size', 'fill', 'stroke', 'width', 'rot', 'text', 'name', 'reveal'],
  ring: [...BASE, 'blur', 'blend', 'clip', 'at', 'px', 'city', 'lonlat', 'off', 'size', 'stroke', 'width', 'rot'],
  line: [...BASE, 'blur', 'blend', 'from', 'to', 'stroke', 'width', 'dash'],
  arrow: [...BASE, 'blur', 'blend', 'from', 'to', 'stroke', 'width', 'dash', 'head'],
  note: [...BASE, 'blend', 'clip', 'at', 'px', 'city', 'lonlat', 'off', 'size', 'fill', 'color', 'text', 'side', 'gap'],
  grid: [...BASE, 'style', 'dots', 'labels', 'inner', 'river', 'ticks', 'frame', 'color', 'fill', 'stroke', 'width', 'radius'],
  map: [...BASE, 'projection', 'region', 'highlight', 'names', 'fill', 'stroke', 'border', 'borderWidth', 'coast', 'coastWidth', 'island', 'islandWidth', 'dash', 'provinces', 'inset', 'color', 'at', 'w', 'h'],
  camera: [...BASE, 'at', 'px', 'city', 'lonlat', 'off', 'zoom', 'follow'],
  emitter: [...BASE, 'at', 'px', 'city', 'lonlat', 'off', 'size', 'fill', 'fill2', 'gradient', 'blend', 'mode', 'count', 'spread', 'life', 'speed', 'gravity', 'wind'],
};
export const LAYER_ATTRS = ['name', 'id', 'z', 'alpha', 'blur', 'blend'];
export const GROUP_ATTRS = ['name', 'layer'];

const ENTITY_DOC = {
  circle: '圆',
  ellipse: '椭圆（w、h 分别设置）',
  rect: '圆角矩形',
  triangle: '三角形',
  star: '五角星',
  text: '文字',
  icon: '图标：emoji / 符号（如 text="🎯"），零资源、跨平台',
  line: '线段（color 用 stroke）',
  arrow: '箭头',
  ring: '圆环，用来圈出重点',
  note: '带指向的文字气泡，用来做标注',
  grid: '棋盘/参考网格，按 <scene> 的 grid 划分',
  map: '地图：画省界、外轮廓、南海诸岛（内置，离线可用）。之后的对象用 city="成都" / lonlat="104,30" 定位，path="北京 武汉 广州" 走路线',
  camera: '镜头：推近 / 拉远 / 平移 / 跟随对象，整个画面随它变换，但字幕和背景不动。<camera zoom="2" at="3,3"/> 或 <camera follow="车" zoom="2"/>。一个场景只用一个',
  emitter: '粒子发射器：一句话生成大量粒子（礼花、火花、气泡、飘雪）。<emitter at="4,3" mode="burst" count="60" fill="accent"/>。整组粒子是一个轻量对象，不是几十个 circle',
};

/** 步骤里能改的属性：创建属性去掉静态项，再加上位置/效果类 */
export function modAttrs(type) {
  if (type === 'layer') return new Set(['alpha', 'z', 'blur', ...TIMING]);
  const s = new Set(['alpha', 'z', 'out', 'blur', ...TIMING]);
  const extraStatic = type === 'emitter' ? EMITTER_STATIC : null;
  for (const a of ENTITY_ATTRS[type]) if (!STATIC_ATTRS.has(a) && !(extraStatic && extraStatic.has(a))) s.add(a);
  if (POSITIONAL.has(type) && type !== 'emitter') for (const a of ['by', 'path', 'smooth', 'walk', 'trail', 'orbit', 'around', 'turns', 'heading', 'arc', 'city', 'lonlat', ...EFFECTS]) s.add(a);
  if (type === 'camera') for (const a of ['zoom', 'follow']) s.add(a);
  if (type === 'emitter') for (const a of ['at', 'px', 'by']) s.add(a); // 发射源可移动
  if (SEGMENTED.has(type) || TEXTLIKE.has(type)) s.add('draw');
  if (TEXTLIKE.has(type)) s.add('reveal');
  if (GRADABLE.has(type)) s.add('fill2');
  return s;
}

/** 字幕样式与字号预设（字号 = 画布宽度的比例） */
export const CAPTION_STYLES = ['soft', 'plain', 'bar', 'minimal', 'accent', 'classic'];
export const CAPTION_SIZES = { small: 0.019, medium: 0.024, large: 0.031, xlarge: 0.04 };

export const SCENE_ATTRS = {
  width: B('画布宽度(px)', 800),
  height: B('画布高度(px)', 600),
  grid: B('把画布划成 "列x行" 的格子，位置都以格子为单位', '3x3'),
  pad: B('格子区域四周的留白（CSS 顺序：上 右 下 左；可写 1/2/4 个数），字幕与坐标标签放在留白里', 0),
  palette: B('配色模板，一行套上：背景、默认图形色、文字/线条色、标签对比度自动跟随。' +
    '可选 material / material-dark / pantone-classic-blue / pantone-living-coral / pantone-viva-magenta / pantone-peach-fuzz / ' +
    'pantone-ultra-violet / pantone-greenery / pantone-mocha-mousse / nord / dracula / solarized-light / macaron / ocean / sunset / neon / mono / dark / light。' +
    '语义色 accent accent2 text sub bg bg2 warn good bad c1…c8 可直接写进 fill/stroke，表达式里用 pal(i) 取系列色'),
  bg: B('背景色（外圈），默认取配色的 bg，没有配色时为 #0f1020', '#0f1020'),
  bg2: B('背景色（中心高光），默认由 bg 自动提亮'),
  shadow: B('是否绘制地面投影', true),
  glow: B('是否绘制图形光晕', true),
  caption: B('步骤字幕：false 关闭；或写样式名 soft（默认，安静的半透明胶囊）/ plain（无底，只有描边字）/ bar（通栏底条）/ minimal（左对齐，一道细竖线）/ accent（主色胶囊）/ classic（深色胶囊）', 'soft'),
  'caption-size': B('字幕字号：small / medium（默认）/ large / xlarge，或直接写像素数（如 22）', 'medium'),
  'caption-pos': B('字幕位置：bottom（默认，画面下方）或 top', 'bottom'),
  hold: B('每一步结束后的停顿下限（秒，≥0.05）', 0.6),
  read: B('字幕阅读速度：每秒读多少个字，步骤停顿会自动延长到读完（0 = 不自动延长）。幼儿内容建议 3~4', 0),
  overlap: B('是否检查冻结画面里图形的重叠；数据可视化、粒子等"重叠是故意的"场景写 overlap="off"', true),
  seed: B('随机数种子，保证 rand() 每次结果一致', 1),
  poster: B('封面帧：作品库和首页的缩略图停在第几步（从 1 开始，0 或不写 = 自动取靠后的一步）。信息量集中在结尾的作品（完整路线、终局）适合写 poster="-1" 取最后一步', 0),
};

export const STEP_ATTRS = {
  say: B('字幕：这一步在说明什么。| 或换行表示换行。暂停在任意一步，画面都自带解释'),
  dur: B('这一步里补间动画的默认时长（秒）', 0.7),
  hold: B('这一步结束后的停顿（秒）；显式写了就不再按字幕长度自动延长。停顿是给人看字幕的，不受 speed 影响'),
  stagger: B('步内子节点依次错开的间隔（秒）', 0),
  sound: B(`这一步开始时的音效：${SOUND_NAMES.join(' / ')}`),
  speed: B('整步快放 / 慢放：speed="2" 一倍速播放（时长减半），speed="0.5" 慢动作。只改这一步的节奏，后面的步骤自动顺延', 1),
  mark: B('给这一步起个时间标记名，供 <audio at="标记名"> 等按名字定位；也可在程序里读取 scene.marks'),
};

export const PROGRAMMING = {
  let: { doc: '声明变量，属性名就是变量名：<let n="5" name="黑" list="{[1,2,3]}"/>。纯数字自动成数字；{…} 里是表达式，保留类型' },
  set: { doc: '修改已声明的变量（包括外层的）：<set turn="{1-turn}"/>' },
  for: {
    doc: '循环：<for var="i" in="1..5">。in 可以是区间 1..5、列表 "a b c"、数组 {list}、数字 5（即 1..5）',
    attrs: { var: B('循环变量名'), in: B('区间 / 列表 / 数组'), index: B('从 0 开始的序号变量名'), step: B('区间步长', 1) },
  },
  if: { doc: '条件：<if test="i % 2 == 0">…</if>，后面可接 <elseif test="…"> 和 <else>', attrs: { test: B('表达式，不用加 {}') } },
  def: {
    doc: '自定义类型。简写：<def name="黑" is="circle" size=".86c" fill="#111"/>，使用时 <黑 at="8,8"/>，同名属性覆盖默认值。' +
      '模板：<def name="旗子" color="red">…子节点里用 {color}…</def>，属性是参数，可带默认值；id 参数自动传入',
  },
  anim: {
    doc: '自定义关键帧（相对当前状态叠加，可反复复用）：<anim name="摇摆" dur=".6"><k at="25%" rot="14"/>…</anim>，使用 do="摇摆"。' +
      '<k> 支持 dx dy（格数）、rot（度）、scale（倍数）、alpha（倍数）、ease；首尾自动回到原样',
  },
  change: {
    doc: '按 id 修改对象，id 可写多个或前缀通配：<change id="a b c" fill="red"/>、<change id="c*" at="2,2"/>。' +
      '适合 id 是计算出来的场景（循环里）。普通情况直接把 id 当标签写就行',
  },
  row: {
    doc: '横向流式布局：<row at="2,2" gap="1.2c">子对象依次从左到右排开，gap 是相邻中心距（格子数，默认 1）。' +
      '子对象自己写 at 则覆盖流式位置（绝对定位优先）。加 to="4,2" distribute="between/evenly/around" 可等距分布',
  },
  column: {
    doc: '纵向流式布局：<column at="2,2" gap="1.5">子对象依次从上到下排开，其余同 <row>',
  },
};

export const UNITS = [
  ['位置', 'at="列,行" 从 1 开始，格子中心；也可写 H8（字母=列）；小数表示格内位置'],
  ['长度', '数字=像素；1.5c=1.5 个格子（c 取格子短边）。size、w、h、width、gap、head、jump、shake 都可用'],
  ['时间', '单位秒；一步里的子节点默认同时开始，步与步依次执行'],
  ['插值', '属性值里写 {表达式}，如 at="{i},{i*2}"、say="第{k+1}步"；字面花括号写成 {{ }}'],
];

export function schema() {
  const attrs = (list) => Object.fromEntries(list.map((n) => [n, ATTR[n]]));
  return {
    units: UNITS,
    scene: SCENE_ATTRS,
    step: STEP_ATTRS,
    entities: {
      ...Object.fromEntries(ENTITY_TYPES.map((t) => [t, { doc: ENTITY_DOC[t], attrs: attrs(ENTITY_ATTRS[t]) }])),
      layer: { doc: '图层：<layer name="marks" z="20">…子对象…</layer>；z 越大越靠上；可在步骤里用图层名改 alpha', attrs: attrs(LAYER_ATTRS) },
      theme: {
        doc: '主题（语义色）：<theme accent="#7c6cff" text="#e8eaf6" bg="#0f1020"/>，之后对象里写 fill="accent" 引用。' +
          '配合 <import> 引入主题文件即可一键换肤。<theme palette="nord" accent="#f90"/> 先套内置配色模板，再覆盖个别颜色（<scene palette> 同理，优先级更高）',
        attrs: attrs([]),
      },
      import: {
        doc: '引入外部库文件：<import src="lib/pieces.xml"/> 或 <import src="themes/dark.xml" as="dk"/>。' +
          '库文件里放 <def>/<anim>/<theme>；带 as 时给定义加命名空间（dk.棋子）',
        attrs: attrs([]),
      },
      audio: {
        doc: '外部音频（旁白 / 背景乐）：<audio src="narration.mp3" at="2" volume=".8"/>。' +
          'at 写秒数或 <step mark="名字"> 的标记名；volume 0~1；loop 循环；fadein/fadeout 淡入淡出秒数。这是唯一需要外部文件的能力',
        attrs: attrs([]),
      },
      data: {
        doc: '数据源：内联 <data name="rows">表头,列2\\n值1,值2</data> 或外部 <data name="rows" src="data.csv" format="csv"/>。' +
          'CSV 第一行是表头（纯数字自动转 number），JSON 用 format="json"。之后 <for var="row" in="{rows}"> 逐行渲染，{row.列名} 取字段',
        attrs: attrs([]),
      },
      group: {
        doc: '分组（纯逻辑，不改变坐标）：<group name="红方">…</group>，组内对象自动属于该组；' +
          '步骤里写组名就是对组内全部对象做同一个修改，如 <红方 pulse/>、<棋盘 out/>；组可嵌套',
        attrs: attrs(GROUP_ATTRS),
      },
    },
    modify: {
      doc: '步骤里写已有对象的 id（或组名）作标签，写什么就让它变成什么（自动补间）；也可 <change id="…">',
      attrs: attrs(['at', 'by', 'path', 'smooth', 'walk', 'trail', 'size', 'w', 'h', 'rot', 'alpha', 'fill', 'fill2', 'stroke', 'width', 'color', 'from', 'to', 'draw', 'reveal', 'count', 'blur', 'zoom', 'follow', 'text', 'label', 'z', 'out', 'dur', 'delay', 'ease']),
    },
    effects: attrs(['pulse', 'shake', 'jump', 'spin', 'do', 'loop', 'yoyo']),
    programming: PROGRAMMING,
    functions: FUNCTION_DOCS,
    constants: CONST_NAMES,
    eases: EASE_NAMES,
  };
}
