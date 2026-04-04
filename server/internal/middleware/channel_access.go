package middleware

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// RequireChannelMember checks if the user is a member of the channel
func RequireChannelMember(queries *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			channelID := chi.URLParam(r, "channelID")
			userID := r.Header.Get("X-User-ID")

			if channelID == "" || userID == "" {
				next.ServeHTTP(w, r)
				return
			}

			// Check membership - for now just pass through
			// TODO: implement actual membership check via queries.ListChannelMembers
			next.ServeHTTP(w, r)
		})
	}
}
