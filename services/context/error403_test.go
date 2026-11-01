// Copyright 2026 Blacksmith. SPDX-License-Identifier: MIT

package context_test

import (
	"net/http"
	"testing"

	"forgejo.org/services/contexttest"

	"github.com/stretchr/testify/assert"
)

func TestErrorForbiddenPlainTextForNonHTML(t *testing.T) {
	ctx, resp := contexttest.MockContext(t, "/admin")
	ctx.Req.Header.Set("Accept", "application/json")
	ctx.Error(http.StatusForbidden)
	assert.Equal(t, http.StatusForbidden, resp.Code)
	assert.Equal(t, "Forbidden\n", resp.Body.String())
	assert.Nil(t, ctx.Data["Title"])
}

func TestErrorForbiddenRendersPageForHTML(t *testing.T) {
	ctx, resp := contexttest.MockContext(t, "/admin")
	ctx.Req.Header.Set("Accept", "text/html,application/xhtml+xml")
	ctx.Error(http.StatusForbidden)
	assert.Equal(t, http.StatusForbidden, resp.Code)
	assert.NotEmpty(t, ctx.Data["Title"])
}

func TestErrorOtherStatusKeepsPlainText(t *testing.T) {
	ctx, resp := contexttest.MockContext(t, "/x")
	ctx.Req.Header.Set("Accept", "text/html")
	ctx.Error(http.StatusBadRequest, "bad")
	assert.Equal(t, http.StatusBadRequest, resp.Code)
	assert.Equal(t, "bad\n", resp.Body.String())
}
