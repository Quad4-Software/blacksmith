// Copyright 2023 The Blacksmith Authors
// SPDX-License-Identifier: MIT

package migrations

import (
	"forgejo.org/modules/structs"
)

func init() {
	RegisterDownloaderFactory(&BlacksmithDownloaderFactory{})
}

type BlacksmithDownloaderFactory struct {
	GiteaDownloaderFactory
}

func (f *BlacksmithDownloaderFactory) GitServiceType() structs.GitServiceType {
	return structs.BlacksmithService
}
