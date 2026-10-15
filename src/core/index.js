/**
 * CodeMotion 核心引擎（无 DOM 依赖，Node / 浏览器通用）
 *
 *   util/      基础：缓动、颜色
 *   lang/      语言：XML 解析 → 表达式 / 展开 → 语法定义(schema) / 属性读取与诊断
 *   compile/   编译：场景、对象、步骤、目标状态补间、效果、冲突检测
 *   runtime/   运行：evaluate(scene, t) 纯函数求值
 *   analysis/  分析：lint（出界/重叠）、describe（给 AI 的摘要）
 */
export { compile, compileRoot, MAX_SEGMENTS } from './compile/index.js';
export { compileWithImports } from './imports.js';
export { evaluate } from './runtime/evaluate.js';
export { lint, describe } from './analysis/lint.js';
export { parseXML } from './lang/parser.js';
export { schema } from './lang/schema.js';
export { evalExpr } from './lang/expr.js';
export { parseColor, toCss, mix, shade } from './util/color.js';
export { resolveEase, EASE_NAMES, clamp, lerp } from './util/ease.js';
