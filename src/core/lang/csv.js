/** 单行 CSV：处理引号包裹（"" 转义）与逗号分隔 */
function parseCSVLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const autoNum = (s) => {
  const t = String(s).trim();
  if (t === '') return t;
  const v = Number(t);
  return Number.isFinite(v) ? v : t;
};

/**
 * 零依赖 CSV 解析：第一行是表头，之后每行产出对象（字段名 → 值，纯数字自动转 number）。
 * 例："名称,数量\n苹果,3" → [{ 名称: '苹果', 数量: 3 }]
 */
export function parseCSV(text) {
  const rows = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (!rows.length) return [];
  const header = parseCSVLine(rows[0]);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = parseCSVLine(rows[i]);
    const obj = {};
    header.forEach((h, j) => { obj[h] = autoNum(cells[j]); });
    out.push(obj);
  }
  return out;
}

/** 解析数据文本：按 format（csv/json）返回数组 */
export function parseData(text, format = 'csv') {
  const t = String(text ?? '').trim();
  if (format === 'json') {
    if (!t) return [];
    const v = JSON.parse(t);
    if (!Array.isArray(v)) throw new Error('JSON 数据必须是数组');
    return v;
  }
  return parseCSV(t);
}
