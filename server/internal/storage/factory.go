// Package storage: factory.go — picks the right Storage backend per
// workspace. Reads workspace_secret rows: if tos_* keys are present,
// returns TOSStorage; else returns S3Adapter wrapping the
// process-wide S3Storage; if neither, returns ErrNoBackend.
package storage

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
)

// SecretGetter mirrors service.SecretService.GetPlaintext to avoid
// pulling the service package (would import-cycle since service may
// import storage). Production injects *service.SecretService here;
// tests can drop in a fake.
type SecretGetter interface {
	GetPlaintext(ctx context.Context, workspaceID uuid.UUID, key string) (string, error)
}

// ErrNoBackend means neither TOS nor process-wide S3 is configured.
var ErrNoBackend = errors.New("storage: no backend configured for workspace")

// Workspace-secret keys for TOS. PUT
// /api/workspaces/{id}/secrets/storage writes all five at once.
const (
	SecretTOSAccessKeyID     = "tos_access_key_id"
	SecretTOSSecretAccessKey = "tos_secret_access_key"
	SecretTOSBucket          = "tos_bucket"
	SecretTOSRegion          = "tos_region"
	SecretTOSEndpoint        = "tos_endpoint"
)

// Factory picks per-workspace Storage. fallback is the process-wide
// S3 adapter (or nil) used when no workspace-specific config exists.
type Factory struct {
	Secrets  SecretGetter
	Fallback Storage // typically NewS3Adapter(NewS3StorageFromEnv())
}

// NewFromWorkspace returns the right Storage for this workspace.
// Lookup order:
//  1. workspace_secret tos_* keys → TOSStorage
//  2. Factory.Fallback (process-wide S3) → S3Adapter
//  3. ErrNoBackend
func (f *Factory) NewFromWorkspace(ctx context.Context, workspaceID uuid.UUID) (Storage, error) {
	if f == nil || f.Secrets == nil {
		if f != nil && f.Fallback != nil {
			return f.Fallback, nil
		}
		return nil, ErrNoBackend
	}

	// Probe TOS config. Any single missing required key falls back.
	akid, _ := f.Secrets.GetPlaintext(ctx, workspaceID, SecretTOSAccessKeyID)
	sak, _ := f.Secrets.GetPlaintext(ctx, workspaceID, SecretTOSSecretAccessKey)
	bucket, _ := f.Secrets.GetPlaintext(ctx, workspaceID, SecretTOSBucket)
	if akid != "" && sak != "" && bucket != "" {
		region, _ := f.Secrets.GetPlaintext(ctx, workspaceID, SecretTOSRegion)
		endpoint, _ := f.Secrets.GetPlaintext(ctx, workspaceID, SecretTOSEndpoint)
		s, err := NewTOSStorage(ctx, TOSConfig{
			AccessKeyID:     akid,
			SecretAccessKey: sak,
			Bucket:          bucket,
			Region:          region,
			Endpoint:        endpoint,
		})
		if err != nil {
			return nil, fmt.Errorf("workspace %s: tos init: %w", workspaceID, err)
		}
		return s, nil
	}

	if f.Fallback != nil {
		return f.Fallback, nil
	}
	return nil, ErrNoBackend
}
