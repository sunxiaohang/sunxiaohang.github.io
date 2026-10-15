/**
 * 内置配色模板。一套配色 = 一组语义色 + 一组"系列色"（c1…c8，给循环里的一批对象依次上色）。
 *
 * 用法：<scene palette="material"> 一行套上，背景、默认图形色、文字色、线条色、标签对比度都会自动跟着走；
 * 也可以写在库文件里：<theme palette="nord" accent="#ff0"/>，后面的显式颜色覆盖模板里的同名项。
 *
 * 语义色（在 fill/stroke/color 里直接写名字引用）：
 *   accent accent2  主色 / 辅色          text sub  正文 / 次要文字
 *   bg bg2          背景外圈 / 中心高光   warn good bad  警示 / 成功 / 错误
 *   c1…c8           系列色（也可在表达式里用 pal(i) 循环取）
 */

const SLOTS = ['accent', 'accent2', 'text', 'sub', 'bg', 'bg2', 'warn', 'good', 'bad'];

function def(name, label, dark, desc, base, series) {
  const tokens = { ...base };
  series.forEach((c, i) => { tokens[`c${i + 1}`] = c; });
  return { name, label, dark, desc, tokens, series };
}

export const PALETTES = [
  // ---------------- Material Design ----------------
  def('material', 'Material 浅色', false, 'Material Design 3 基线紫 + 经典 500 色阶，清爽通用',
    { accent: '#6750A4', accent2: '#625B71', text: '#1D1B20', sub: '#49454F', bg: '#FEF7FF', bg2: '#FFFFFF', warn: '#FFA000', good: '#388E3C', bad: '#D32F2F' },
    ['#2196F3', '#F44336', '#FFC107', '#4CAF50', '#9C27B0', '#FF9800', '#00BCD4', '#E91E63']),
  def('material-dark', 'Material 深色', true, 'Material Design 3 深色基线 + 200 色阶淡彩，深底上不刺眼',
    { accent: '#D0BCFF', accent2: '#CCC2DC', text: '#E6E0E9', sub: '#CAC4D0', bg: '#141218', bg2: '#25212B', warn: '#FFB74D', good: '#81C784', bad: '#F2B8B5' },
    ['#90CAF9', '#EF9A9A', '#FFE082', '#A5D6A7', '#CE93D8', '#FFCC80', '#80DEEA', '#F48FB1']),

  // ---------------- Pantone 年度色 ----------------
  def('pantone-classic-blue', 'Pantone 经典蓝', false, 'Pantone 19-4052 Classic Blue：沉稳、可信，适合讲解与汇报',
    { accent: '#0F4C81', accent2: '#92A8D1', text: '#14283C', sub: '#566A80', bg: '#F4F7FB', bg2: '#FFFFFF', warn: '#E8A317', good: '#3E8E6B', bad: '#C0392B' },
    ['#0F4C81', '#FF6F61', '#88B04B', '#F5DF4D', '#92A8D1', '#955251', '#5F4B8B', '#009473']),
  def('pantone-living-coral', 'Pantone 活珊瑚', false, 'Pantone 16-1546 Living Coral：温暖活泼，亲和力强',
    { accent: '#FF6F61', accent2: '#5FB3B3', text: '#3B2320', sub: '#8A5F58', bg: '#FFF4F0', bg2: '#FFFFFF', warn: '#F5A623', good: '#4C9F70', bad: '#C23B3B' },
    ['#FF6F61', '#5FB3B3', '#F7CAC9', '#FFB347', '#6B5B95', '#88B04B', '#92A8D1', '#D65076']),
  def('pantone-viva-magenta', 'Pantone 非凡洋红', true, 'Pantone 18-1750 Viva Magenta：浓烈有力量，深酒红底',
    { accent: '#E0426A', accent2: '#F4A6B8', text: '#FFEAF0', sub: '#D8A3B5', bg: '#240B16', bg2: '#4A1226', warn: '#FFBE98', good: '#7FD1AE', bad: '#FF6B6B' },
    ['#E0426A', '#F4A6B8', '#FFBE98', '#8E8FD6', '#88B04B', '#F5DF4D', '#45B5AA', '#C79A84']),
  def('pantone-peach-fuzz', 'Pantone 柔桃色', false, 'Pantone 13-1023 Peach Fuzz：柔和温柔，适合儿童与生活类内容',
    { accent: '#FFBE98', accent2: '#A47864', text: '#4A3428', sub: '#8F6F5E', bg: '#FFF8F2', bg2: '#FFFFFF', warn: '#F2A950', good: '#7DB38A', bad: '#D9695F' },
    ['#FFBE98', '#A47864', '#88B04B', '#92A8D1', '#F7CAC9', '#D65076', '#F5DF4D', '#6B8E8A']),
  def('pantone-ultra-violet', 'Pantone 紫外光', true, 'Pantone 18-3838 Ultra Violet（提亮以适配深色底）：神秘、创意、科技感',
    { accent: '#9B83D6', accent2: '#F7CAC9', text: '#F1EBFF', sub: '#B9A8E0', bg: '#1B1230', bg2: '#2E1F54', warn: '#F5DF4D', good: '#7FD1AE', bad: '#FF7A8A' },
    ['#9B83D6', '#FF6F61', '#F5DF4D', '#88B04B', '#92A8D1', '#F7CAC9', '#45B5AA', '#E27D60']),
  def('pantone-greenery', 'Pantone 清新绿', false, 'Pantone 15-0343 Greenery：自然、生机，适合科普与环保类内容',
    { accent: '#88B04B', accent2: '#5B7F2F', text: '#22331A', sub: '#5E7550', bg: '#F6FAF0', bg2: '#FFFFFF', warn: '#E0A526', good: '#5B9A3C', bad: '#C8553D' },
    ['#88B04B', '#F5DF4D', '#FF6F61', '#92A8D1', '#955251', '#5F4B8B', '#45B5AA', '#DD4124']),
  def('pantone-mocha-mousse', 'Pantone 摩卡慕斯', false, 'Pantone 17-1230 Mocha Mousse：大地色系，质感沉静',
    { accent: '#A47864', accent2: '#D2B49F', text: '#3A2A22', sub: '#7D6455', bg: '#F8F2EC', bg2: '#FFFFFF', warn: '#D9983B', good: '#7E9B6A', bad: '#B8574B' },
    ['#A47864', '#D2B49F', '#6B8E8A', '#C97B63', '#8C9A6B', '#5E6A7D', '#E1B382', '#B5838D']),

  // ---------------- 经典 / 开发者配色 ----------------
  def('nord', 'Nord', true, '北欧冷灰蓝，低饱和、耐看',
    { accent: '#88C0D0', accent2: '#81A1C1', text: '#ECEFF4', sub: '#D8DEE9', bg: '#2E3440', bg2: '#3B4252', warn: '#EBCB8B', good: '#A3BE8C', bad: '#BF616A' },
    ['#88C0D0', '#BF616A', '#EBCB8B', '#A3BE8C', '#B48EAD', '#D08770', '#81A1C1', '#8FBCBB']),
  def('dracula', 'Dracula', true, '高对比深紫底，亮色点缀，适合代码与算法演示',
    { accent: '#BD93F9', accent2: '#FF79C6', text: '#F8F8F2', sub: '#A9AFCF', bg: '#282A36', bg2: '#343746', warn: '#F1FA8C', good: '#50FA7B', bad: '#FF5555' },
    ['#BD93F9', '#FF79C6', '#8BE9FD', '#50FA7B', '#FFB86C', '#F1FA8C', '#FF5555', '#6272A4']),
  def('solarized-light', 'Solarized 浅色', false, '米黄纸感底色，护眼',
    { accent: '#268BD2', accent2: '#2AA198', text: '#073642', sub: '#586E75', bg: '#FDF6E3', bg2: '#FFFBEF', warn: '#B58900', good: '#859900', bad: '#DC322F' },
    ['#268BD2', '#DC322F', '#B58900', '#859900', '#6C71C4', '#CB4B16', '#2AA198', '#D33682']),

  // ---------------- 风格化 ----------------
  def('macaron', '马卡龙', false, '粉嫩糖果色，幼儿 / 亲子内容首选',
    { accent: '#FF8FAB', accent2: '#A0E7E5', text: '#5A4A5C', sub: '#76667B', bg: '#FFF5F7', bg2: '#FFFFFF', warn: '#FFB347', good: '#7ED6A5', bad: '#FF7B8A' },
    ['#FFB3C6', '#A0E7E5', '#FBE7C6', '#B4F8C8', '#CDB4FF', '#FFAEBC', '#BDE0FE', '#FFD6A5']),
  def('ocean', '深海', true, '深蓝青底，通透冷静',
    { accent: '#2EC4B6', accent2: '#4CC9F0', text: '#E6F6FA', sub: '#8FBCCB', bg: '#06202B', bg2: '#0B3A4C', warn: '#FFD166', good: '#57E39F', bad: '#FF6B6B' },
    ['#2EC4B6', '#4CC9F0', '#FFD166', '#FF9F68', '#9B8CFF', '#06D6A0', '#FF6B9D', '#A8DADC']),
  def('sunset', '日落', true, '紫红到橙黄的暖渐变，氛围感强',
    { accent: '#FF7E5F', accent2: '#FEB47B', text: '#FFEFE3', sub: '#E3B8C4', bg: '#2B1331', bg2: '#4A1F4D', warn: '#FFD166', good: '#6FD6C2', bad: '#FF5D8F' },
    ['#FF7E5F', '#FEB47B', '#FFD166', '#E76F8B', '#B56CD9', '#6FD6C2', '#F4A261', '#FF5D8F']),
  def('neon', '霓虹', true, '近黑底 + 荧光色，赛博风',
    { accent: '#00F5D4', accent2: '#F72585', text: '#F2F2FF', sub: '#9A9AC8', bg: '#0A0A14', bg2: '#1B1038', warn: '#FEE440', good: '#80FF72', bad: '#FF4D6D' },
    ['#00F5D4', '#F72585', '#FEE440', '#7209B7', '#4CC9F0', '#FF9F1C', '#80FF72', '#FF5D8F']),
  def('mono', '墨白', false, '黑白灰 + 一点橙，极简出版风',
    { accent: '#111111', accent2: '#E4572E', text: '#111111', sub: '#666666', bg: '#F7F7F5', bg2: '#FFFFFF', warn: '#F28F3B', good: '#76B041', bad: '#E4572E' },
    ['#111111', '#E4572E', '#17BEBB', '#FFC914', '#76B041', '#6C5B7B', '#888888', '#F28F3B']),

  // ---------------- 与默认外观一致 ----------------
  def('dark', '默认深色', true, '项目默认的深紫夜色，亮色点缀',
    { accent: '#7c6cff', accent2: '#4cc9f0', text: '#e8eaf6', sub: '#9aa3c7', bg: '#0f1020', bg2: '#1a1e3a', warn: '#ffd166', good: '#57d9a3', bad: '#ff6b6b' },
    ['#ff6b9d', '#4cc9f0', '#ffd166', '#9b8cff', '#06d6a0', '#ff9f68', '#ff5c7a', '#a0e7e5']),
  def('light', '默认浅色', false, '默认外观的浅色版',
    { accent: '#4052b6', accent2: '#00694d', text: '#1b1d2e', sub: '#555a72', bg: '#f4f6ff', bg2: '#ffffff', warn: '#e07a1f', good: '#1a9e6a', bad: '#d64545' },
    ['#4052b6', '#e07a1f', '#1a9e6a', '#d64545', '#7b5cd6', '#0f8fb5', '#c2417c', '#8a6d1d']),
];

const ALIASES = { pantone: 'pantone-classic-blue', md: 'material', 'md-dark': 'material-dark', solarized: 'solarized-light' };

const BY_NAME = new Map(PALETTES.map((p) => [p.name, p]));

export const PALETTE_NAMES = PALETTES.map((p) => p.name);
export const SEMANTIC_NAMES = [...SLOTS, 'c1…c8'];

/** 没启用配色时，pal(i) 与默认图形色使用的系列色 */
export const DEFAULT_SERIES = ['#ff6b9d', '#4cc9f0', '#ffd166', '#9b8cff', '#06d6a0', '#ff9f68'];

export function getPalette(name) {
  const key = String(name ?? '').trim().toLowerCase();
  return BY_NAME.get(ALIASES[key] ?? key) ?? null;
}

/** 从（可能被显式覆盖过的）主题里取出系列色 c1、c2、… */
export function seriesOf(tokens) {
  const out = [];
  for (let i = 1; Object.hasOwn(tokens, `c${i}`); i++) out.push(tokens[`c${i}`]);
  return out;
}
