// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Markdown, parseBlocks } from "./Markdown";

afterEach(cleanup);

const html = (text: string, streaming = false) => render(<Markdown text={text} streaming={streaming} />).container.firstElementChild!;

describe("Markdown (model output → React nodes)", () => {
  it("splits paragraphs on blank lines and keeps single newlines as line breaks", () => {
    const el = html("First line\nsame paragraph\n\nSecond paragraph");
    const ps = el.querySelectorAll("p");
    expect(ps).toHaveLength(2);
    expect(ps[0].querySelectorAll("br")).toHaveLength(1);
    expect(ps[0].textContent).toBe("First linesame paragraph");
    expect(ps[1].textContent).toBe("Second paragraph");
  });

  it("renders bold, italic and inline code, including nesting", () => {
    const el = html("A **bold *and italic*** word, *just italic*, __also bold__ and `code **not bold**`.");
    expect(el.querySelector("strong")?.textContent).toBe("bold and italic");
    expect(el.querySelector("strong em")?.textContent).toBe("and italic");
    expect([...el.querySelectorAll("em")].map((e) => e.textContent)).toContain("just italic");
    expect([...el.querySelectorAll("strong")].map((e) => e.textContent)).toContain("also bold");
    expect(el.querySelector("code")?.textContent).toBe("code **not bold**");
  });

  it("handles ***bold italic*** as one span", () => {
    const el = html("***both***");
    expect(el.querySelector("strong em")?.textContent).toBe("both");
    expect(el.textContent).toBe("both");
  });

  it("leaves arithmetic, snake_case and stray markers literal", () => {
    const el = html("2 * 3 * 4 and snake_case_name and a lone ** here");
    expect(el.querySelector("em, strong")).toBeNull();
    expect(el.textContent).toBe("2 * 3 * 4 and snake_case_name and a lone ** here");
  });

  it("renders -, •, * and numbered lists, keeping the start number", () => {
    const el = html("Risks:\n- one\n• two\n* three\n\n3. third\n4) fourth");
    expect(el.querySelector("p")?.textContent).toBe("Risks:");
    expect([...el.querySelectorAll("ul > li")].map((li) => li.textContent)).toEqual(["one", "two", "three"]);
    const ol = el.querySelector("ol")!;
    expect(ol.getAttribute("start")).toBe("3");
    expect([...ol.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["third", "fourth"]);
  });

  it("nests indented items and joins continuation lines into the item", () => {
    const el = html("1. Parent\n   - child a\n   - child b\n2. Next\n   continues here");
    const top = el.querySelectorAll(":scope > ol > li");
    expect(top).toHaveLength(2);
    expect([...top[0].querySelectorAll("ul > li")].map((li) => li.textContent)).toEqual(["child a", "child b"]);
    expect(top[1].querySelector("br")).not.toBeNull();
    expect(top[1].textContent).toBe("Nextcontinues here");
  });

  it("keeps a list going across blank lines between items", () => {
    expect(parseBlocks("- a\n\n- b")).toHaveLength(1);
  });

  it("renders headings as bold lead-ins, quotes, rules and fenced code", () => {
    const el = html("## The bull case\nText\n\n> a quote\n\n---\n\n```\nconst x = 1;\n```");
    expect(el.querySelector("p")?.textContent).toBe("The bull case");
    expect(el.querySelector("blockquote")?.textContent).toBe("a quote");
    expect(el.querySelector("hr")).not.toBeNull();
    expect(el.querySelector("pre code")?.textContent).toBe("const x = 1;");
  });

  it("renders a pipe table", () => {
    const el = html("| Lens | Read |\n|---|---|\n| Valuation | Stretched |\n| Technical | Extended |");
    expect([...el.querySelectorAll("th")].map((c) => c.textContent)).toEqual(["Lens", "Read"]);
    expect(el.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("links http(s) only, opening in a new tab", () => {
    const el = html("See [the filing](https://sec.gov/x) or https://example.com/a. Not [this](javascript:alert(1)).");
    const links = [...el.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://sec.gov/x", "https://example.com/a"]);
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(el.textContent).toContain("[this](javascript:alert(1))");
  });

  it("never interprets HTML in model output", () => {
    const el = html('<img src=x onerror="alert(1)"> **<b>hi</b>**');
    expect(el.querySelector("img, b")).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(el.querySelector("strong")?.textContent).toBe("<b>hi</b>");
  });

  it("while streaming, styles an unclosed span instead of showing the marker", () => {
    expect(html("Revenue grew **thirty", true).querySelector("strong")?.textContent).toBe("thirty");
    expect(html("Run `npm te", true).querySelector("code")?.textContent).toBe("npm te");
    // Once the stream is done, an unclosed marker is just text.
    expect(html("Revenue grew **thirty").querySelector("strong")).toBeNull();
  });

  it("renders an unclosed code fence to the end while streaming", () => {
    const el = html("```\nline one\nline two", true);
    expect(el.querySelector("pre code")?.textContent).toBe("line one\nline two");
  });
});
