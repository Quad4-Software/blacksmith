// Copyright 2023 The Blacksmith Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package gitea_migrations

import (
	"testing"

	migration_tests "forgejo.org/models/gitea_migrations/test"
)

func TestMain(m *testing.M) {
	migration_tests.MainTest(m)
}
