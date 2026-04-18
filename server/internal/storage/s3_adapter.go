// Package storage: s3_adapter.go — adapts the legacy S3Storage struct
// (Upload/Delete signatures) to the Storage interface. New callers
// should use the Storage interface; legacy callers (Handler.Storage,
// AutoReplyService) keep using S3Storage directly until they're
// migrated.
package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Adapter wraps *S3Storage to satisfy the Storage interface. Created
// via NewS3Adapter. Direct field access on the underlying struct stays
// possible via .Inner for legacy code paths.
type S3Adapter struct {
	Inner     *S3Storage
	presigner *s3.PresignClient
}

func NewS3Adapter(s *S3Storage) *S3Adapter {
	if s == nil {
		return nil
	}
	return &S3Adapter{
		Inner:     s,
		presigner: s3.NewPresignClient(s.client),
	}
}

func (a *S3Adapter) Backend() string { return BackendS3 }

func (a *S3Adapter) Put(ctx context.Context, key string, body io.Reader, contentType, filename string) (string, error) {
	buf, err := io.ReadAll(body)
	if err != nil {
		return "", fmt.Errorf("s3: read body: %w", err)
	}
	// Reuse existing Upload to keep S3-specific quirks (CDN URL,
	// IntelligentTiering, sanitized filename) in one place. Upload
	// returns the public URL; we strip back to the bare key for
	// storage_path consistency with TOS.
	if _, err := a.Inner.Upload(ctx, key, buf, contentType, filename); err != nil {
		return "", err
	}
	return key, nil
}

func (a *S3Adapter) Get(ctx context.Context, storagePath string) (io.ReadCloser, error) {
	out, err := a.Inner.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(a.Inner.bucket),
		Key:    aws.String(storagePath),
	})
	if err != nil {
		return nil, fmt.Errorf("s3 GetObject: %w", err)
	}
	return out.Body, nil
}

func (a *S3Adapter) Presign(ctx context.Context, storagePath string, ttl time.Duration) (string, error) {
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	req, err := a.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(a.Inner.bucket),
		Key:    aws.String(storagePath),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("s3 presign: %w", err)
	}
	return req.URL, nil
}

func (a *S3Adapter) Delete(ctx context.Context, storagePath string) error {
	a.Inner.Delete(ctx, storagePath)
	return nil // legacy Delete swallows errors; preserve behavior
}

// Compile-time interface assertion.
var (
	_ Storage = (*S3Adapter)(nil)
	_ Storage = (*TOSStorage)(nil)
)

// Helpers re-exported for adapter-internal use without importing s3
// outside this package.
var _ = strings.HasPrefix
var _ = bytes.NewReader
