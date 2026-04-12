package service

import (
	"context"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// MediationService watches for @mentions in messages and enforces reply SLAs.
// When an @mention is detected it immediately triggers an auto-reply via
// AutoReplyService and tracks whether a response was received within the SLA.
type MediationService struct {
	Queries      *db.Queries
	AutoReply    *AutoReplyService
	Bus          *events.Bus
	replyTimeout time.Duration
}

// NewMediationService creates a new MediationService.
func NewMediationService(q *db.Queries, autoReply *AutoReplyService, bus *events.Bus) *MediationService {
	return &MediationService{
		Queries:      q,
		AutoReply:    autoReply,
		Bus:          bus,
		replyTimeout: 5 * time.Minute,
	}
}

var mentionRegex = regexp.MustCompile(`@(\w[\w.-]*)`)

// SubscribeToEvents registers event bus listeners for mediation.
func (s *MediationService) SubscribeToEvents(bus *events.Bus) {
	bus.Subscribe(protocol.EventMessageCreated, func(e events.Event) {
		s.handleMessageCreated(e)
	})
}

func (s *MediationService) handleMessageCreated(e events.Event) {
	payload, ok := e.Payload.(map[string]any)
	if !ok {
		return
	}

	msgMap, ok := payload["message"].(map[string]any)
	if !ok {
		return
	}

	content, _ := msgMap["content"].(string)
	if content == "" {
		return
	}

	channelID, _ := msgMap["channel_id"].(string)
	senderType, _ := msgMap["sender_type"].(string)
	workspaceID := e.WorkspaceID

	// Extract @mentions
	matches := mentionRegex.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return
	}

	var mentions []string
	seen := map[string]bool{}
	for _, match := range matches {
		name := strings.ToLower(match[1])
		if !seen[name] {
			mentions = append(mentions, match[1])
			seen[name] = true
		}
	}

	if len(mentions) == 0 {
		return
	}

	slog.Info("[mediation] @mention detected",
		"channel", channelID,
		"mentions", mentions,
		"sender_type", senderType,
	)

	// Immediate auto-reply trigger for @mentions
	if s.AutoReply != nil && channelID != "" {
		// Build a minimal trigger message for the auto-reply service.
		// The auto-reply service will look up the agent and generate a response.
		msgID, _ := msgMap["id"].(string)
		senderID, _ := msgMap["sender_id"].(string)
		triggerMsg := db.Message{
			ID:          util.ParseUUID(msgID),
			WorkspaceID: util.ParseUUID(workspaceID),
			SenderID:    util.ParseUUID(senderID),
			SenderType:  senderType,
			ChannelID:   util.ParseUUID(channelID),
			Content:     content,
			ContentType: "text",
		}
		s.AutoReply.CheckAndReply(context.Background(), mentions, workspaceID, channelID, triggerMsg)
	}

	// Schedule SLA timeout check
	go s.checkReplySLA(workspaceID, channelID, mentions, content)
}

// checkReplySLA waits for the SLA timeout then checks if any mentioned agents replied.
func (s *MediationService) checkReplySLA(workspaceID, channelID string, mentions []string, triggerContent string) {
	time.Sleep(s.replyTimeout)

	ctx := context.Background()

	// Check recent messages in the channel for replies from the mentioned agents
	recentMsgs, err := s.Queries.ListChannelMessages(ctx, db.ListChannelMessagesParams{
		ChannelID: util.ParseUUID(channelID),
		Limit:     20,
		Offset:    0,
	})
	if err != nil {
		return
	}

	for _, mentionName := range mentions {
		agent, err := s.Queries.GetAgentByName(ctx, db.GetAgentByNameParams{
			WorkspaceID: util.ParseUUID(workspaceID),
			Name:        mentionName,
		})
		if err != nil {
			continue // Not an agent
		}

		// Check if agent replied after the trigger
		replied := false
		for _, m := range recentMsgs {
			if util.UUIDToString(m.SenderID) == util.UUIDToString(agent.ID) {
				replied = true
				break
			}
		}

		if !replied {
			slog.Info("[mediation] SLA timeout: agent did not reply",
				"agent", mentionName,
				"channel", channelID,
			)
			// Create an inbox item for the agent owner to handle
			if agent.OwnerID.Valid {
				_, _ = s.Queries.CreateInboxItem(ctx, db.CreateInboxItemParams{
					WorkspaceID:   util.ParseUUID(workspaceID),
					RecipientType: "member",
					RecipientID:   agent.OwnerID,
					Type:          "mention_sla",
					Severity:      "warning",
					IssueID:       pgtype.UUID{},
					Title:         "Agent " + mentionName + " did not reply to mention",
					Body:          pgtype.Text{String: "The agent was @mentioned but did not reply within the SLA window.", Valid: true},
					ActorType:     pgtype.Text{String: "system", Valid: true},
					ActorID:       pgtype.UUID{},
				})

				// Publish inbox event
				s.Bus.Publish(events.Event{
					Type:        protocol.EventInboxNew,
					WorkspaceID: workspaceID,
					ActorType:   "system",
					Payload: map[string]any{
						"agent":   mentionName,
						"channel": channelID,
						"reason":  "mention_sla_timeout",
					},
				})
			}
		}
	}
}
