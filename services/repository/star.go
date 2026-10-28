// Copyright 2024 The Blacksmith Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repository

import (
	"context"

	"forgejo.org/models/repo"
	"forgejo.org/models/user"
)

func StarRepoAndSendLikeActivities(ctx context.Context, doer user.User, repoID int64, star bool) error {
	if err := repo.StarRepo(ctx, doer.ID, repoID, star); err != nil {
		return err
	}

	return nil
}
