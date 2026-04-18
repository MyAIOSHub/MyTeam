// Package storage: storage.go — Storage interface that hides the
// concrete object-store backend. Phase 0 of the memory-storage
// foundation plan: contract only, S3 + TOS impls land in Phase 1.
//
// Design intent (per plan 2026-04-19-memory-storage-foundation §0):
//   - Replaceable backend (S3, Volcengine TOS, future MinIO-only, future
//     local-disk for offline mode) without touching callers.
//   - Raw upload bytes preserved 1:1; backend never rewrites content.
//   - Backend() string lets the file_index row record which backend
//     produced the storage_path so a future migration can reconstruct.
package storage

import (
	"context"
	"io"
	"time"
)

// Backend identifiers persisted in file_index.backend.
const (
	BackendS3    = "s3"
	BackendTOS   = "tos"
	BackendLocal = "local"
)

// Storage is the contract every object-store backend satisfies. Methods
// take a "key" (the storage_path persisted in file_index) and return
// raw bytes / presigned URLs without exposing backend-specific quirks.
type Storage interface {
	// Put writes body under key. Returns the canonical storage_path
	// (usually equal to key but a backend may rewrite, e.g. add prefix).
	// contentType is the MIME type; filename is used for inline
	// Content-Disposition headers.
	Put(ctx context.Context, key string, body io.Reader, contentType, filename string) (storagePath string, err error)

	// Get streams the object back. Caller must Close.
	Get(ctx context.Context, storagePath string) (io.ReadCloser, error)

	// Presign returns a time-limited URL that an external service
	// (Doubao 妙记, browser) can fetch without holding our credentials.
	Presign(ctx context.Context, storagePath string, ttl time.Duration) (url string, err error)

	// Delete removes the object. Idempotent.
	Delete(ctx context.Context, storagePath string) error

	// Backend returns one of BackendS3/BackendTOS/BackendLocal so
	// file_index can record which backend wrote a row.
	Backend() string
}
