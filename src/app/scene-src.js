/** 对场景脚本文本做轻量改写（不经过编译）：读写 <scene> 上的单个属性，如 palette、caption、caption-size */

const SCENE_TAG = /<scene\b[^>]*>/;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** 给 <scene> 写入（或移除，value 为空）某个属性；找不到 <scene> 返回 null */
export function setSceneAttr(src, name, value) {
  const m = SCENE_TAG.exec(src);
  if (!m) return null;
  let tag = m[0].replace(new RegExp(`\\s+${escRe(name)}(?:="[^"]*")?(?=[\\s/>])`), '');
  if (value) {
    const selfClose = tag.endsWith('/>');
    const at = tag.length - (selfClose ? 2 : 1);
    tag = `${tag.slice(0, at)} ${name}="${value}"${tag.slice(at)}`;
  }
  return src.slice(0, m.index) + tag + src.slice(m.index + m[0].length);
}

/** 读取 <scene> 上的属性值，没有则返回空串 */
export function getSceneAttr(src, name) {
  const m = SCENE_TAG.exec(src);
  if (!m) return '';
  const v = new RegExp(`\\s${escRe(name)}="([^"]*)"`).exec(m[0]);
  return v ? v[1].trim() : '';
}

export const setScenePalette = (src, name) => setSceneAttr(src, 'palette', name);
export const getScenePalette = (src) => getSceneAttr(src, 'palette');
