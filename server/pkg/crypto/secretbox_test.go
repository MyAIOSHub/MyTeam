package crypto

import (
	"bytes"
	"crypto/rand"
	"testing"
)

func mustKey(t *testing.T) []byte {
	t.Helper()
	k := make([]byte, KeySize)
	if _, err := rand.Read(k); err != nil {
		t.Fatal(err)
	}
	return k
}

func TestRoundTrip(t *testing.T) {
	key := mustKey(t)
	pt := []byte("hello, secret world")
	ct, err := Encrypt(pt, key, nil)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(ct, pt) {
		t.Fatal("ciphertext equals plaintext")
	}
	got, err := Decrypt(ct, key, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, pt) {
		t.Errorf("round-trip mismatch: %q", got)
	}
}

func TestEmptyPlaintext(t *testing.T) {
	key := mustKey(t)
	ct, err := Encrypt([]byte{}, key, nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Decrypt(ct, key, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("expected empty, got %q", got)
	}
}

func TestTamperedCiphertextFails(t *testing.T) {
	key := mustKey(t)
	ct, _ := Encrypt([]byte("confidential"), key, nil)
	ct[len(ct)-1] ^= 0x01 // flip one bit in the auth tag
	if _, err := Decrypt(ct, key, nil); err == nil {
		t.Fatal("expected tamper detection, got nil error")
	}
}

func TestWrongKeyFails(t *testing.T) {
	k1, k2 := mustKey(t), mustKey(t)
	ct, _ := Encrypt([]byte("secret"), k1, nil)
	if _, err := Decrypt(ct, k2, nil); err == nil {
		t.Fatal("expected wrong-key failure, got nil")
	}
}

func TestShortCiphertext(t *testing.T) {
	key := mustKey(t)
	if _, err := Decrypt([]byte("short"), key, nil); err == nil {
		t.Fatal("expected ErrCipherTooShort")
	}
}

func TestInvalidKeyLength(t *testing.T) {
	if _, err := Encrypt([]byte("x"), []byte("too-short-key"), nil); err == nil {
		t.Error("Encrypt should reject short key")
	}
	if _, err := Decrypt([]byte("anything-at-all"), []byte("too-short-key"), nil); err == nil {
		t.Error("Decrypt should reject short key")
	}
}

func TestNonceIsFresh(t *testing.T) {
	key := mustKey(t)
	ct1, _ := Encrypt([]byte("same"), key, nil)
	ct2, _ := Encrypt([]byte("same"), key, nil)
	if bytes.Equal(ct1, ct2) {
		t.Fatal("two encryptions of same plaintext should differ (random nonce)")
	}
}

func TestADBindingPreventsTransplant(t *testing.T) {
	key := mustKey(t)
	ad1 := []byte("workspace-A/api_key")
	ad2 := []byte("workspace-B/api_key")
	ct, err := Encrypt([]byte("secret"), key, ad1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Decrypt(ct, key, ad2); err == nil {
		t.Fatal("expected AD mismatch failure")
	}
	if got, err := Decrypt(ct, key, ad1); err != nil || string(got) != "secret" {
		t.Fatalf("matching AD should decrypt: got %q err %v", got, err)
	}
}
