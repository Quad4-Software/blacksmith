// Copyright The Blacksmith Authors.
// SPDX-License-Identifier: MIT

// Package capcap integrates Cap (trycap.dev), a self-hosted
// proof-of-work captcha. The server API is compatible with
// reCAPTCHA's siteverify: POST {secret, response} -> {success}.
package capcap

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"forgejo.org/modules/setting"
)

var sharedClient = &http.Client{Timeout: 10 * time.Second}

// Verify checks a cap-token response against the Cap server.
func Verify(ctx context.Context, response string) (bool, error) {
	if response == "" {
		return false, nil
	}

	if setting.Service.CapURL == "" {
		return false, fmt.Errorf("cap url is empty")
	}
	verifyURL := setting.Service.CapURL + setting.Service.CapSitekey + "/siteverify"

	body, err := json.Marshal(map[string]string{
		"secret":   setting.Service.CapSecret,
		"response": response,
	})
	if err != nil {
		return false, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, verifyURL, bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := sharedClient
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("cap verify returned %d", resp.StatusCode)
	}

	var out struct {
		Success bool `json:"success"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, fmt.Errorf("cap verify response: %w", err)
	}
	return out.Success, nil
}
