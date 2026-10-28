// Copyright 2023 The Blacksmith Authors
// SPDX-License-Identifier: MIT

package migrations

import (
	"forgejo.org/modules/structs"
)

func init() {
	RegisterDownloaderFactory(&BlacksmithDownloaderFactory{})
	RegisterDownloaderFactory(&ForgejoDownloaderFactory{})
}

type BlacksmithDownloaderFactory struct {
	GiteaDownloaderFactory
}

func (f *BlacksmithDownloaderFactory) GitServiceType() structs.GitServiceType {
	return structs.BlacksmithService
}

type ForgejoDownloaderFactory struct {
	GiteaDownloaderFactory
}

func (f *ForgejoDownloaderFactory) GitServiceType() structs.GitServiceType {
	return structs.ForgejoService
}
