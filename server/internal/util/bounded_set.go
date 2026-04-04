package util

import "sync"

// BoundedUUIDSet is a fixed-capacity ring buffer for UUID deduplication.
// O(1) add/has/evict, bounded memory.
type BoundedUUIDSet struct {
	mu       sync.RWMutex
	capacity int
	ring     []string
	set      map[string]bool
	writeIdx int
}

func NewBoundedUUIDSet(capacity int) *BoundedUUIDSet {
	return &BoundedUUIDSet{
		capacity: capacity,
		ring:     make([]string, capacity),
		set:      make(map[string]bool, capacity),
	}
}

// Add adds a UUID. Returns true if new, false if duplicate.
func (s *BoundedUUIDSet) Add(uuid string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.set[uuid] {
		return false
	}

	if evicted := s.ring[s.writeIdx]; evicted != "" {
		delete(s.set, evicted)
	}

	s.ring[s.writeIdx] = uuid
	s.set[uuid] = true
	s.writeIdx = (s.writeIdx + 1) % s.capacity
	return true
}

// Has checks if a UUID was recently seen.
func (s *BoundedUUIDSet) Has(uuid string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.set[uuid]
}

// Size returns current count.
func (s *BoundedUUIDSet) Size() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.set)
}
