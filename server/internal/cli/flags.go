package cli

import (
	"os"
	"strings"

	"github.com/spf13/cobra"
)

// FlagOrEnv returns the flag value if set, otherwise the environment variable value,
// otherwise the fallback.
func FlagOrEnv(cmd *cobra.Command, flagName, envKey, fallback string) string {
	if cmd.Flags().Changed(flagName) {
		val, _ := cmd.Flags().GetString(flagName)
		return val
	}
	if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
		return v
	}
	return fallback
}

// FlagOrEnvAny returns the flag value if set, otherwise checks multiple env keys
// in order, otherwise the fallback.
func FlagOrEnvAny(cmd *cobra.Command, flagName string, envKeys []string, fallback string) string {
	if cmd.Flags().Changed(flagName) {
		val, _ := cmd.Flags().GetString(flagName)
		return val
	}
	for _, key := range envKeys {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return fallback
}

// EnvAny returns the trimmed value of the named environment variable.
// Accepts variadic keys for backward compat; uses the first non-empty.
func EnvAny(keys ...string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}
