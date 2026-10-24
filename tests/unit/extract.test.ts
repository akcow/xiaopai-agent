/** 网页正文抽取单测：不联网，只喂固定 HTML。 */
import test from "node:test";
import assert from "node:assert/strict";
import { extractFromHtml, normalizeUrl } from "../../mcp/web/extract.js";

const HTML = `<!doctype html>
<html><head>
  <title>  Pi 1.0 发布 &amp; 说明  </title>
  <style>.a{color:red}</style>
  <script>console.log("不该出现")</script>
</head>
<body>
  <article>
    <h1>大标题</h1>
    <p>第一段内容，包含实体 &lt;tag&gt; 和&nbsp;空格。</p>
    <p>第二段内容。</p>
    <ul><li>条目一</li><li>条目二</li></ul>
  </article>
  <!-- 注释不该出现 -->
</body></html>`;

test("抽到标题并解码实体", () => {
  const page = extractFromHtml(HTML);
  assert.equal(page.title, "Pi 1.0 发布 & 说明");
});

test("剥掉 script/style/注释", () => {
  const page = extractFromHtml(HTML);
  assert.ok(!page.text.includes("console.log"));
  assert.ok(!page.text.includes("color:red"));
  assert.ok(!page.text.includes("注释不该出现"));
});

test("保留正文文字并解码实体", () => {
  const page = extractFromHtml(HTML);
  assert.ok(page.text.includes("第一段内容"));
  assert.ok(page.text.includes("<tag>"));
  assert.ok(page.text.includes("条目一"));
  assert.ok(page.text.includes("大标题"));
});

test("超长内容按 maxChars 截断并打标记", () => {
  const long = `<html><body><p>${"啊".repeat(5000)}</p></body></html>`;
  const page = extractFromHtml(long, 200);
  assert.equal(page.truncated, true);
  assert.ok(page.text.length <= 201, `实际 ${page.text.length}`);
  assert.ok(page.text.endsWith("…"));
});

test("空页面不抛错", () => {
  const page = extractFromHtml("<html><body></body></html>");
  assert.equal(page.text, "");
  assert.equal(page.title, "");
});

test("URL 规范化：自动补 https、拒绝非 http 协议", () => {
  assert.equal(normalizeUrl("example.com/a"), "https://example.com/a");
  assert.equal(normalizeUrl("http://example.com"), "http://example.com/");
  assert.equal(normalizeUrl("   "), null);
  assert.equal(normalizeUrl("ftp://example.com"), null);
  // 中文会被 URL 解析成 punycode 域名，这里只要求它仍是合法 https 地址，
  // 真正的"打不开"由 fetch 的 E_UPSTREAM 兜底
  assert.match(normalizeUrl("不是网址") ?? "", /^https:\/\/[a-z0-9.-]+\/?$/i);
});
