package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
)

const maxIndexedFileReadBytes = 10 << 20

// ReadIndexedFileContent reads content from an indexed storage path.
func ReadIndexedFileContent(ctx context.Context, storagePath string) ([]byte, error) {
	storagePath = strings.TrimSpace(storagePath)
	if storagePath == "" {
		return nil, fmt.Errorf("file content: storage path required")
	}

	u, err := url.Parse(storagePath)
	if err == nil {
		switch u.Scheme {
		case "http", "https":
			return readHTTPFile(ctx, storagePath)
		case "file":
			return os.ReadFile(u.Path)
		}
	}
	return os.ReadFile(storagePath)
}

func readHTTPFile(ctx context.Context, rawURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("read indexed file: GET returned %d", resp.StatusCode)
	}

	limited := io.LimitReader(resp.Body, maxIndexedFileReadBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if len(data) > maxIndexedFileReadBytes {
		return nil, fmt.Errorf("read indexed file: exceeds %d bytes", maxIndexedFileReadBytes)
	}
	return data, nil
}
