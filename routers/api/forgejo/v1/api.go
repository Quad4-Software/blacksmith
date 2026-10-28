// Copyright 2023 The Blacksmith Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package v1

import (
	"forgejo.org/modules/web"
	"forgejo.org/routers/api/shared"
)

func Routes() *web.Route {
	m := web.NewRoute()

	m.Use(shared.Middlewares()...)

	forgejo := NewBlacksmith()
	m.Get("", Root)
	m.Get("/version", forgejo.GetVersion)
	return m
}
