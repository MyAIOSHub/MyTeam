import { describe, it, expect } from "vitest";
import { detectKind, parseCsv } from "./file-viewer-panel";

describe("detectKind", () => {
  it("treats .md as markdown", () => {
    expect(detectKind("README.md")).toBe("markdown");
    expect(detectKind("foo.markdown")).toBe("markdown");
    expect(detectKind("foo.bin", "text/markdown")).toBe("markdown");
  });

  it("detects html by extension or mime", () => {
    expect(detectKind("index.html")).toBe("html");
    expect(detectKind("page.htm")).toBe("html");
    expect(detectKind("blob", "text/html")).toBe("html");
  });

  it("detects pdf by extension or mime", () => {
    expect(detectKind("doc.pdf")).toBe("pdf");
    expect(detectKind("blob", "application/pdf")).toBe("pdf");
  });

  it("detects images", () => {
    expect(detectKind("a.png")).toBe("image");
    expect(detectKind("a.JPG")).toBe("image");
    expect(detectKind("unknown", "image/webp")).toBe("image");
  });

  it("detects excel formats as a distinct kind", () => {
    expect(detectKind("a.xlsx")).toBe("excel");
    expect(detectKind("a.xls")).toBe("excel");
    expect(detectKind("blob", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("excel");
  });

  it("detects other office formats", () => {
    expect(detectKind("a.docx")).toBe("office");
    expect(detectKind("a.pptx")).toBe("office");
  });

  it("treats code + data extensions as code", () => {
    expect(detectKind("foo.ts")).toBe("code");
    expect(detectKind("foo.py")).toBe("code");
    expect(detectKind("foo.json")).toBe("code");
    expect(detectKind("foo.yaml")).toBe("code");
  });

  it("csv distinct from text", () => {
    expect(detectKind("rows.csv")).toBe("csv");
  });

  it("falls back to text for plain mime", () => {
    expect(detectKind("note.txt")).toBe("text");
    expect(detectKind("something", "text/plain")).toBe("text");
  });

  it("returns unknown for opaque binaries", () => {
    expect(detectKind("a.bin")).toBe("unknown");
  });
});

describe("parseCsv", () => {
  it("parses a simple grid", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas", () => {
    expect(parseCsv('"name","desc"\n"Ada","hi, world"')).toEqual([
      ["name", "desc"],
      ["Ada", "hi, world"],
    ]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsv('a,b\n"she said ""hi""",x')).toEqual([
      ["a", "b"],
      ['she said "hi"', "x"],
    ]);
  });

  it("handles embedded newlines in quotes", () => {
    expect(parseCsv('a,b\n"line1\nline2",x')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("drops fully empty rows", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
