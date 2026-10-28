// SPDX-License-Identifier: MIT

package v1

import (
	"net/http"

	"forgejo.org/modules/json"
	"forgejo.org/modules/setting"
)

type Blacksmith struct{}

var _ ServerInterface = &Blacksmith{}

func NewBlacksmith() *Blacksmith {
	return &Blacksmith{}
}

func (f *Blacksmith) GetVersion(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(Version{&setting.BlacksmithVersion})
}
