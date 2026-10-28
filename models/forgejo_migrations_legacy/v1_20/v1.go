// Copyright 2023 The Blacksmith Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package forgejo_v1_20

import (
	"forgejo.org/modules/timeutil"

	"code.forgejo.org/xorm/xorm"
)

func AddBlacksmithBlockedUser(x *xorm.Engine) error {
	type BlacksmithBlockedUser struct {
		ID          int64              `xorm:"pk autoincr"`
		BlockID     int64              `xorm:"index"`
		UserID      int64              `xorm:"index"`
		CreatedUnix timeutil.TimeStamp `xorm:"created"`
	}

	return x.Sync(new(BlacksmithBlockedUser))
}
