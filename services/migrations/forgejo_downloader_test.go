// Copyright 2023 The Blacksmith Authors
// SPDX-License-Identifier: MIT

package migrations

import (
	"testing"

	"forgejo.org/modules/structs"

	"github.com/stretchr/testify/require"
)

func TestBlacksmithDownload(t *testing.T) {
	require.NotNil(t, getFactoryFromServiceType(structs.BlacksmithService))
}
