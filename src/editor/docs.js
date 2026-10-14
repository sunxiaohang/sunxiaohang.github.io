const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function attrRows(attrs) {
  return Object.entries(attrs)
    .map(([k, v]) => {
      const def = v.default !== undefined ? ` <i>默认 ${esc(v.default)}</i>` : '';
      return `<tr><td><code>${esc(k)}</code></td><td>${esc(v.doc || '')}${def}</td></tr>`;
    })
    .join('');
}

function section(title, items) {
  const body = Object.entries(items)
    .map(
      ([name, def]) => `<details>
  <summary><code>&lt;${esc(name)}&gt;</code><span>${esc(def.doc)}</span></summary>
  ${def.attrs ? `<table>${attrRows(def.attrs)}</table>` : ''}
</details>`,
    )
    .join('');
  return `<h4>${title}</h4>${body}`;
}

/** 语法文档由 schema 自动生成，保证和实际行为一致。 */
export function buildDocs(s) {
  return `
<h4>基本思路</h4>
<p>场景由<b>对象</b>和<b>步骤</b>组成。每个 <code>&lt;step&gt;</code> 里写"让谁变成什么样"，同一步里的内容同时发生，步与步依次执行；
每一步结束时的画面都是一张自带字幕（<code>say</code>）的静帧。</p>
<pre>&lt;circle id="a" at="1,1" fill="red"/&gt;
&lt;step say="小球走到右下角"&gt;
  &lt;a at="3,3" walk fill="blue"/&gt;   &lt;!-- 已有对象：id 当标签，写什么变什么 --&gt;
  &lt;star at="2,2"/&gt;                 &lt;!-- 新类型：登场 --&gt;
&lt;/step&gt;</pre>
<h4>坐标与单位</h4>
<table>${s.units.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<h4>场景 &lt;scene&gt;</h4>
<table>${attrRows(s.scene)}</table>
<h4>步骤 &lt;step&gt;</h4>
<table>${attrRows(s.step)}</table>
${section('对象（新建）', s.entities)}
<h4>修改对象（步骤里）</h4>
<p>${esc(s.modify.doc)}</p>
<table>${attrRows(s.modify.attrs)}</table>
<h4>效果（叠加型，结束后回到原状）</h4>
<table>${attrRows(s.effects)}</table>
${section('编程语法', s.programming)}
<h4>表达式</h4>
<p>写在 <code>{…}</code> 里：数字、字符串 <code>'黑'</code>、数组 <code>[1,2]</code>、<code>+ - * / % **</code>、
<code>== != &lt; &gt; &amp;&amp; || !</code>（也可写 and/or/not）、三元 <code>a ? b : c</code>、<code>list[i]</code>、<code>list.length</code>。
常量：<code>${s.constants.join('</code> <code>')}</code></p>
<table>${s.functions.map((f) => `<tr><td><code>${esc(f.sig)}</code></td><td>${esc(f.doc)}</td></tr>`).join('')}</table>
<p>缓动：<code>${s.eases.join('</code> <code>')}</code>，或 <code>cubic(x1,y1,x2,y2)</code>。</p>`;
}
