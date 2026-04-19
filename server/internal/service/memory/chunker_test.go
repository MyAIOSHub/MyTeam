package memory

import (
	"strings"
	"testing"
)

func TestRecursiveChunker_FixedSize(t *testing.T) {
	c := &RecursiveChunker{ChunkSize: 100, ChunkOverlap: 20}
	chunks := c.Split(strings.Repeat("a", 250))
	if len(chunks) < 3 {
		t.Fatalf("want >=3 chunks, got %d", len(chunks))
	}
	// Each chunk Text length <= ChunkSize.
	for i, ch := range chunks {
		if len(ch.Text) > 100 {
			t.Errorf("chunk %d len %d > 100", i, len(ch.Text))
		}
	}
	// Step = 100-20 = 80; offsets: 0, 80, 160, 240(if any)
	if chunks[0].ByteOffset != 0 || chunks[1].ByteOffset != 80 {
		t.Errorf("offsets wrong: %d, %d", chunks[0].ByteOffset, chunks[1].ByteOffset)
	}
}

func TestMarkdownChunker_BySections(t *testing.T) {
	text := "# Goals\nship feature.\n# Risks\nlate.\n# Open\nq?"
	chunks := NewMarkdownChunker().Split(text)
	if len(chunks) != 3 {
		t.Fatalf("want 3 chunks (3 sections), got %d", len(chunks))
	}
	if !strings.HasPrefix(chunks[0].Text, "# Goals") {
		t.Errorf("chunk 0 should start with header, got %q", chunks[0].Text)
	}
}

func TestMarkdownChunker_NoHeader_FallsBackToRecursive(t *testing.T) {
	text := strings.Repeat("hello world ", 200)
	chunks := NewMarkdownChunker().Split(text)
	if len(chunks) < 2 {
		t.Errorf("expected recursive fallback to produce >1 chunks, got %d", len(chunks))
	}
}

func TestHTMLChunker_StripsTags(t *testing.T) {
	text := "<html><body><h1>Title</h1><p>Body text here.</p></body></html>"
	chunks := NewHTMLChunker().Split(text)
	if len(chunks) != 1 {
		t.Fatalf("want 1 chunk for short text, got %d", len(chunks))
	}
	if strings.Contains(chunks[0].Text, "<") || strings.Contains(chunks[0].Text, ">") {
		t.Errorf("tags not stripped: %q", chunks[0].Text)
	}
}

func TestPickChunker_ByContentType(t *testing.T) {
	cases := []struct {
		ct, fn   string
		wantName string
	}{
		{"text/markdown", "", "markdown"},
		{"", "spec.md", "markdown"},
		{"text/html", "", "html"},
		{"", "page.html", "html"},
		{"", "data.txt", "recursive"},
		{"application/octet-stream", "", "recursive"},
	}
	for _, tc := range cases {
		got := PickChunker(tc.ct, tc.fn).Name()
		if got != tc.wantName {
			t.Errorf("PickChunker(%q, %q) = %s, want %s", tc.ct, tc.fn, got, tc.wantName)
		}
	}
}
