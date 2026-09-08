import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "./markdown.tsx";

function html(source: string): string {
  return renderToStaticMarkup(<>{renderMarkdown(source)}</>);
}

describe("renderMarkdown", () => {
  it("renders headings at three levels", () => {
    const out = html("# One\n\n## Two\n\n### Three");
    expect(out).toContain("<h1>One</h1>");
    expect(out).toContain("<h2>Two</h2>");
    expect(out).toContain("<h3>Three</h3>");
  });

  it("renders a paragraph", () => {
    expect(html("Plain text here.")).toBe("<p>Plain text here.</p>");
  });

  it("renders bold", () => {
    expect(html("a **bold** word")).toBe("<p>a <strong>bold</strong> word</p>");
  });

  it("renders italic", () => {
    expect(html("a *italic* word")).toBe("<p>a <em>italic</em> word</p>");
  });

  it("renders a link", () => {
    const out = html("[text](https://example.com)");
    expect(out).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">text</a></p>',
    );
  });

  it("renders a mailto link without target/rel", () => {
    const out = html("[email](mailto:a@b.com)");
    expect(out).toBe('<p><a href="mailto:a@b.com">email</a></p>');
  });

  it("renders an unordered list", () => {
    const out = html("- one\n- two\n- three");
    expect(out).toBe(
      '<ul class="terms-bullets"><li>one</li><li>two</li><li>three</li></ul>',
    );
  });

  it("renders a horizontal rule", () => {
    expect(html("---")).toBe("<hr/>");
  });

  it("degrades an unsupported construct (table row) to plain text, not raw markup", () => {
    const out = html("| a | b |\n| - | - |");
    // Never a crash and never left as an unrendered React-breaking string;
    // it must show up as visible text.
    expect(out).toContain("| a | b |");
    expect(out).not.toContain("<table");
  });

  it("does not use dangerouslySetInnerHTML anywhere obvious (no raw <script> passthrough)", () => {
    const out = html("<script>alert(1)</script>");
    // Treated as plain paragraph text, not parsed as HTML — React escapes it.
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
