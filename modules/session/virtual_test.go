// Copyright The Blacksmith Authors.
// SPDX-License-Identifier: MIT

package session

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestVirtualSessionProviderFilePersistsAcrossRestart(t *testing.T) {
	config, err := json.Marshal(struct {
		Provider       string
		ProviderConfig string
	}{
		Provider:       "file",
		ProviderConfig: filepath.Join(t.TempDir(), "sessions"),
	})
	if err != nil {
		t.Fatal(err)
	}

	const sid = "0123456789abcdef"
	first := &VirtualSessionProvider{}
	if err := first.Init(86400, string(config)); err != nil {
		t.Fatal(err)
	}

	store, err := first.Read(sid)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Set("user", "alice"); err != nil {
		t.Fatal(err)
	}
	if err := store.Release(); err != nil {
		t.Fatal(err)
	}

	// A newly initialized provider represents the application after restart.
	afterRestart := &VirtualSessionProvider{}
	if err := afterRestart.Init(86400, string(config)); err != nil {
		t.Fatal(err)
	}

	store, err = afterRestart.Read(sid)
	if err != nil {
		t.Fatal(err)
	}
	if got := store.Get("user"); got != "alice" {
		t.Fatalf("session value after restart = %v, want alice", got)
	}
}
