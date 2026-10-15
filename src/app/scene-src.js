/** 对场景脚本文本做轻量改写（不经过编译）：读写 <scene palette="…"> */

const SCENE_TAG = /<scene\b[^>]*>/;

/** 给 <scene> 写入（或移除，name 为空）palette 属性；找不到 <scene> 返回 null */
export function setScenePalette(src, name) {
  const m = SCENE_TAG.exec(src);
  if (!m) return null;
  let tag = m[0].replace(/\s+palette="[^"]*"/, '');
  if (name) {
    const selfClose = tag.endsWith('/>');
    const at = tag.length - (selfClose ? 2 : 1);
    tag = `${tag.slice(0, at)} palette="${name}"${tag.slice(at)}`;
  }
  return src.slice(0, m.index) + tag + src.slice(m.index + m[0].length);
}

/** 读取 <scene palette="…">，没有则返回空串 */
export function getScenePalette(src) {
  const m = /<scene\b[^>]*\spalette="([^"]*)"/.exec(src);
  return m ? m[1].trim() : '';
}
