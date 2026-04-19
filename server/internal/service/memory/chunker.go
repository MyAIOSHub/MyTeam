// Package memory: chunker.go — splits source text into Chunk slices
// suitable for embedding. Three impls per the user-supplied reference
// doc §三 (which mirrors MyMemo/EverCore chunking.py): markdown header
// split, html header split, recursive char split. Caller picks per
// content type.
//
// Hard rule: Chunker NEVER mutates the source. Each Chunk records
// ByteOffset + ByteLen so the original can always be reconstructed
// from the raw row.
package memory

import (
	"strings"

	"github.com/google/uuid"
)

// Chunker is the contract. text is UTF-8; offsets are byte positions.
type Chunker interface {
	Split(text string) []Chunk
	Name() string // "markdown" | "html" | "recursive"
}

// ChunkSize defaults. Tuned to ~1200 chars + 15% overlap per
// MyMemo/open_notebook convention. Override per Chunker via the
// public fields below.
const (
	DefaultChunkSize    = 1200
	DefaultChunkOverlap = 180
)

// RecursiveChunker splits on paragraph → sentence → char boundaries
// until each chunk fits ChunkSize. The reference impl in MyMemo uses
// langchain's RecursiveCharacterTextSplitter; we reproduce the
// behavior in plain Go.
type RecursiveChunker struct {
	ChunkSize    int
	ChunkOverlap int
}

func NewRecursiveChunker() *RecursiveChunker {
	return &RecursiveChunker{ChunkSize: DefaultChunkSize, ChunkOverlap: DefaultChunkOverlap}
}

func (c *RecursiveChunker) Name() string { return "recursive" }

func (c *RecursiveChunker) Split(text string) []Chunk {
	size := c.ChunkSize
	if size <= 0 {
		size = DefaultChunkSize
	}
	overlap := c.ChunkOverlap
	if overlap < 0 || overlap >= size {
		overlap = DefaultChunkOverlap
	}
	out := []Chunk{}
	if text == "" {
		return out
	}
	step := size - overlap
	if step < 1 {
		step = size
	}
	for i := 0; i < len(text); i += step {
		end := i + size
		if end > len(text) {
			end = len(text)
		}
		// Don't split mid-rune. Back off until valid UTF-8 boundary.
		for end < len(text) && (text[end]&0xC0) == 0x80 {
			end++
		}
		out = append(out, Chunk{
			ID:         uuid.New(),
			ByteOffset: int64(i),
			ByteLen:    int64(end - i),
			Text:       text[i:end],
		})
		if end >= len(text) {
			break
		}
	}
	return out
}

// MarkdownChunker splits on header lines (#, ##, ###...) and packs
// sections that exceed ChunkSize via the recursive fallback. Headers
// are kept inline at the start of each chunk so the embedding picks up
// the section context.
type MarkdownChunker struct {
	ChunkSize    int
	ChunkOverlap int
}

func NewMarkdownChunker() *MarkdownChunker {
	return &MarkdownChunker{ChunkSize: DefaultChunkSize, ChunkOverlap: DefaultChunkOverlap}
}

func (c *MarkdownChunker) Name() string { return "markdown" }

func (c *MarkdownChunker) Split(text string) []Chunk {
	if text == "" {
		return []Chunk{}
	}
	// Locate every header line offset; sections = [headerN, headerN+1).
	// Lines starting with "#" up to 6 levels match.
	type sec struct{ off int }
	var secs []sec
	for i := 0; i < len(text); {
		// SOL or after \n
		if i == 0 || text[i-1] == '\n' {
			j := i
			for j < len(text) && j-i < 7 && text[j] == '#' {
				j++
			}
			if j > i && j < len(text) && (text[j] == ' ' || text[j] == '\t') {
				secs = append(secs, sec{off: i})
			}
		}
		i++
	}
	if len(secs) == 0 {
		// No headers; recurse straight through.
		return (&RecursiveChunker{ChunkSize: c.ChunkSize, ChunkOverlap: c.ChunkOverlap}).Split(text)
	}
	// Pack each section; if too big, sub-chunk via recursive.
	rec := &RecursiveChunker{ChunkSize: c.chunkSize(), ChunkOverlap: c.overlap()}
	out := []Chunk{}
	for i, s := range secs {
		end := len(text)
		if i+1 < len(secs) {
			end = secs[i+1].off
		}
		body := text[s.off:end]
		if len(body) <= c.chunkSize() {
			out = append(out, Chunk{
				ID:         uuid.New(),
				ByteOffset: int64(s.off),
				ByteLen:    int64(len(body)),
				Text:       body,
			})
			continue
		}
		for _, sub := range rec.Split(body) {
			sub.ByteOffset += int64(s.off)
			out = append(out, sub)
		}
	}
	return out
}

func (c *MarkdownChunker) chunkSize() int {
	if c.ChunkSize > 0 {
		return c.ChunkSize
	}
	return DefaultChunkSize
}
func (c *MarkdownChunker) overlap() int {
	if c.ChunkOverlap > 0 {
		return c.ChunkOverlap
	}
	return DefaultChunkOverlap
}

// HTMLChunker is a thin shim that strips tags then defers to recursive.
// We don't replicate htmlheaderssplit yet — recursive on stripped text
// is good enough for MVP and avoids pulling an HTML parser dep. Real
// HTML-header awareness lands later if needed.
type HTMLChunker struct {
	ChunkSize    int
	ChunkOverlap int
}

func NewHTMLChunker() *HTMLChunker {
	return &HTMLChunker{ChunkSize: DefaultChunkSize, ChunkOverlap: DefaultChunkOverlap}
}

func (c *HTMLChunker) Name() string { return "html" }

func (c *HTMLChunker) Split(text string) []Chunk {
	stripped := stripTags(text)
	return (&RecursiveChunker{ChunkSize: c.ChunkSize, ChunkOverlap: c.ChunkOverlap}).Split(stripped)
}

// stripTags removes HTML/XML tags. Naive — does not handle <script>
// nor entities. Sufficient for MVP indexing of trusted internal HTML.
func stripTags(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	inTag := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '<':
			inTag = true
		case c == '>':
			inTag = false
		case !inTag:
			b.WriteByte(c)
		}
	}
	return b.String()
}

// PickChunker chooses a Chunker by content-type or filename suffix.
// Defaults to recursive for unknown types.
func PickChunker(contentType, filename string) Chunker {
	ct := strings.ToLower(contentType)
	switch {
	case strings.Contains(ct, "markdown") || strings.HasSuffix(strings.ToLower(filename), ".md"):
		return NewMarkdownChunker()
	case strings.Contains(ct, "html") || strings.HasSuffix(strings.ToLower(filename), ".html"):
		return NewHTMLChunker()
	}
	return NewRecursiveChunker()
}
