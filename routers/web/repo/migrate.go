// Copyright 2014 The Gogs Authors. All rights reserved.
// Copyright 2020 The Gitea Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package repo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"forgejo.org/models"
	admin_model "forgejo.org/models/admin"
	"forgejo.org/models/db"
	quota_model "forgejo.org/models/quota"
	repo_model "forgejo.org/models/repo"
	user_model "forgejo.org/models/user"
	"forgejo.org/modules/base"
	"forgejo.org/modules/lfs"
	"forgejo.org/modules/log"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/structs"
	"forgejo.org/modules/util"
	"forgejo.org/modules/web"
	"forgejo.org/services/context"
	"forgejo.org/services/forms"
	"forgejo.org/services/migrations"
	migrations_allowlist "forgejo.org/services/migrations/allowlist"
	"forgejo.org/services/task"
)

const (
	tplMigrate base.TplName = "repo/migrate/migrate"
)

// Migrate render migration of repository page
func Migrate(ctx *context.Context) {
	if setting.Repository.DisableMigrations {
		ctx.Error(http.StatusForbidden, "Migrate: the site administrator has disabled migrations")
		return
	}

	serviceType := structs.GitServiceType(ctx.FormInt("service_type"))

	setMigrationContextData(ctx, serviceType)

	if serviceType == 0 {
		ctx.Data["Org"] = ctx.FormString("org")
		ctx.Data["Mirror"] = ctx.FormString("mirror")

		ctx.HTML(http.StatusOK, tplMigrate)
		return
	}

	ctx.Data["private"] = getRepoPrivate(ctx)
	ctx.Data["mirror"] = ctx.FormString("mirror") == "1"
	ctx.Data["lfs"] = ctx.FormString("lfs") == "1"
	ctx.Data["wiki"] = ctx.FormString("wiki") == "1"
	ctx.Data["milestones"] = ctx.FormString("milestones") == "1"
	ctx.Data["labels"] = ctx.FormString("labels") == "1"
	ctx.Data["issues"] = ctx.FormString("issues") == "1"
	ctx.Data["pull_requests"] = ctx.FormString("pull_requests") == "1"
	ctx.Data["releases"] = ctx.FormString("releases") == "1"

	ctxUser := checkContextUser(ctx, ctx.FormInt64("org"))
	if ctx.Written() {
		return
	}
	ctx.Data["ContextUser"] = ctxUser

	ctx.HTML(http.StatusOK, base.TplName("repo/migrate/"+serviceType.Name()))
}

func handleMigrateError(ctx *context.Context, owner *user_model.User, err error, name string, tpl base.TplName, form *forms.MigrateRepoForm) {
	if setting.Repository.DisableMigrations {
		ctx.Error(http.StatusForbidden, "MigrateError: the site administrator has disabled migrations")
		return
	}

	switch {
	case migrations.IsRateLimitError(err):
		ctx.RenderWithErr(ctx.Tr("form.visit_rate_limit"), tpl, form)
	case migrations.IsTwoFactorAuthError(err):
		ctx.RenderWithErr(ctx.Tr("form.2fa_auth_required"), tpl, form)
	case repo_model.IsErrReachLimitOfRepo(err):
		maxCreationLimit := owner.MaxCreationLimit()
		msg := ctx.TrN(maxCreationLimit, "repo.form.reach_limit_of_creation_1", "repo.form.reach_limit_of_creation_n", maxCreationLimit)
		ctx.RenderWithErr(msg, tpl, form)
	case repo_model.IsErrRepoAlreadyExist(err):
		ctx.Data["Err_RepoName"] = true
		ctx.RenderWithErr(ctx.Tr("form.repo_name_been_taken"), tpl, form)
	case repo_model.IsErrRepoFilesAlreadyExist(err):
		ctx.Data["Err_RepoName"] = true
		switch {
		case ctx.IsUserSiteAdmin() || (setting.Repository.AllowAdoptionOfUnadoptedRepositories && setting.Repository.AllowDeleteOfUnadoptedRepositories):
			ctx.RenderWithErr(ctx.Tr("form.repository_files_already_exist.adopt_or_delete"), tpl, form)
		case setting.Repository.AllowAdoptionOfUnadoptedRepositories:
			ctx.RenderWithErr(ctx.Tr("form.repository_files_already_exist.adopt"), tpl, form)
		case setting.Repository.AllowDeleteOfUnadoptedRepositories:
			ctx.RenderWithErr(ctx.Tr("form.repository_files_already_exist.delete"), tpl, form)
		default:
			ctx.RenderWithErr(ctx.Tr("form.repository_files_already_exist"), tpl, form)
		}
	case db.IsErrNameReserved(err):
		ctx.Data["Err_RepoName"] = true
		ctx.RenderWithErr(ctx.Tr("repo.form.name_reserved", err.(db.ErrNameReserved).Name), tpl, form)
	case db.IsErrNamePatternNotAllowed(err):
		ctx.Data["Err_RepoName"] = true
		ctx.RenderWithErr(ctx.Tr("repo.form.name_pattern_not_allowed", err.(db.ErrNamePatternNotAllowed).Pattern), tpl, form)
	default:
		err = util.SanitizeErrorCredentialURLs(err)
		if strings.Contains(err.Error(), "Authentication failed") ||
			strings.Contains(err.Error(), "Bad credentials") ||
			strings.Contains(err.Error(), "could not read Username") {
			ctx.Data["Err_Auth"] = true
			ctx.RenderWithErr(ctx.Tr("form.auth_failed", err.Error()), tpl, form)
		} else if strings.Contains(err.Error(), "fatal:") {
			ctx.Data["Err_CloneAddr"] = true
			ctx.RenderWithErr(ctx.Tr("repo.migrate.failed", err.Error()), tpl, form)
		} else {
			ctx.ServerError(name, err)
		}
	}
}

func handleMigrateRemoteAddrError(ctx *context.Context, err error, tpl base.TplName, form *forms.MigrateRepoForm) {
	if models.IsErrInvalidCloneAddr(err) {
		addrErr := err.(*models.ErrInvalidCloneAddr)
		switch {
		case addrErr.IsProtocolInvalid:
			ctx.RenderWithErr(ctx.Tr("repo.mirror_address_protocol_invalid"), tpl, form)
		case addrErr.IsURLError:
			ctx.RenderWithErr(ctx.Tr("form.url_error", addrErr.Host), tpl, form)
		case addrErr.IsPermissionDenied:
			if addrErr.LocalPath {
				ctx.RenderWithErr(ctx.Tr("repo.migrate.permission_denied"), tpl, form)
			} else {
				ctx.RenderWithErr(ctx.Tr("repo.migrate.permission_denied_blocked"), tpl, form)
			}
		case addrErr.IsInvalidPath:
			ctx.RenderWithErr(ctx.Tr("repo.migrate.invalid_local_path"), tpl, form)
		case addrErr.HasCredentials:
			ctx.RenderWithErr(ctx.Tr("migrate.form.error.url_credentials"), tpl, form)
		default:
			log.Error("Error whilst updating url: %v", err)
			ctx.RenderWithErr(ctx.Tr("form.url_error", "unknown"), tpl, form)
		}
	} else {
		log.Error("Error whilst updating url: %v", err)
		ctx.RenderWithErr(ctx.Tr("form.url_error", "unknown"), tpl, form)
	}
}

// MigratePost response for migrating from external git repository
func MigratePost(ctx *context.Context) {
	form := web.GetForm(ctx).(*forms.MigrateRepoForm)
	if setting.Repository.DisableMigrations {
		ctx.Error(http.StatusForbidden, "MigratePost: the site administrator has disabled migrations")
		return
	}

	if form.Mirror && setting.Mirror.DisableNewPull {
		ctx.Error(http.StatusBadRequest, "MigratePost: the site administrator has disabled creation of new mirrors")
		return
	}

	setMigrationContextData(ctx, form.Service)

	ctxUser := checkContextUser(ctx, form.UID)
	if ctx.Written() {
		return
	}
	ctx.Data["ContextUser"] = ctxUser

	tpl := base.TplName("repo/migrate/" + form.Service.Name())

	if !ctx.CheckQuota(quota_model.LimitSubjectSizeReposAll, ctxUser.ID, ctxUser.Name) {
		return
	}

	if ctx.HasError() {
		ctx.HTML(http.StatusOK, tpl)
		return
	}

	remoteAddr, err := forms.ParseRemoteAddr(form.CloneAddr, form.AuthUsername, form.AuthPassword)
	if err == nil {
		err = migrations_allowlist.IsMigrateURLAllowed(remoteAddr, ctx.Doer)
	}
	if err != nil {
		ctx.Data["Err_CloneAddr"] = true
		handleMigrateRemoteAddrError(ctx, err, tpl, form)
		return
	}

	form.LFS = form.LFS && setting.LFS.StartServer

	if form.LFS && len(form.LFSEndpoint) > 0 {
		ep := lfs.DetermineEndpoint("", form.LFSEndpoint)
		if ep == nil {
			ctx.Data["Err_LFSEndpoint"] = true
			ctx.RenderWithErr(ctx.Tr("repo.migrate.invalid_lfs_endpoint"), tpl, &form)
			return
		}
		err = migrations_allowlist.IsMigrateURLAllowed(ep.String(), ctx.Doer)
		if err != nil {
			ctx.Data["Err_LFSEndpoint"] = true
			handleMigrateRemoteAddrError(ctx, err, tpl, form)
			return
		}
	}

	opts := migrations.MigrateOptions{
		OriginalURL:    form.CloneAddr,
		GitServiceType: form.Service,
		CloneAddr:      remoteAddr,
		RepoName:       form.RepoName,
		Description:    form.Description,
		Private:        form.Private || setting.Repository.ForcePrivate,
		Mirror:         form.Mirror,
		LFS:            form.LFS,
		LFSEndpoint:    form.LFSEndpoint,
		AuthUsername:   form.AuthUsername,
		AuthPassword:   form.AuthPassword,
		AuthToken:      form.AuthToken,
		Wiki:           form.Wiki,
		Issues:         form.Issues,
		Milestones:     form.Milestones,
		Labels:         form.Labels,
		Comments:       form.Issues || form.PullRequests,
		PullRequests:   form.PullRequests,
		Releases:       form.Releases,
	}
	if opts.Mirror {
		opts.Issues = false
		opts.Milestones = false
		opts.Labels = false
		opts.Comments = false
		opts.PullRequests = false
		opts.Releases = false
	}

	err = repo_model.CheckCreateRepository(ctx, ctx.Doer, ctxUser, opts.RepoName)
	if err != nil {
		handleMigrateError(ctx, ctxUser, err, "MigratePost", tpl, form)
		return
	}

	err = task.MigrateRepository(ctx, ctx.Doer, ctxUser, opts)
	if err == nil {
		ctx.Redirect(ctxUser.HomeLink() + "/" + url.PathEscape(opts.RepoName))
		return
	}

	handleMigrateError(ctx, ctxUser, err, "MigratePost", tpl, form)
}

func setMigrationContextData(ctx *context.Context, serviceType structs.GitServiceType) {
	ctx.Data["Title"] = ctx.Tr("new_migrate.title")

	ctx.Data["LFSActive"] = setting.LFS.StartServer
	ctx.Data["IsForcedPrivate"] = setting.Repository.ForcePrivate
	ctx.Data["DisableNewPullMirrors"] = setting.Mirror.DisableNewPull

	// Plain git should be first
	ctx.Data["Services"] = append([]structs.GitServiceType{structs.PlainGitService}, structs.SupportedFullGitService...)
	ctx.Data["service"] = serviceType
}

func MigrateRetryPost(ctx *context.Context) {
	ok, err := quota_model.EvaluateForUser(ctx, ctx.Repo.Repository.OwnerID, quota_model.LimitSubjectSizeReposAll)
	if err != nil {
		ctx.ServerError("quota_model.EvaluateForUser", err)
		return
	}
	if !ok {
		if err := task.SetMigrateTaskMessage(ctx, ctx.Repo.Repository.ID, ctx.Locale.TrString("repo.settings.pull_mirror_sync_quota_exceeded")); err != nil {
			log.Error("SetMigrateTaskMessage failed: %v", err)
			ctx.ServerError("task.SetMigrateTaskMessage", err)
			return
		}
		ctx.JSON(http.StatusRequestEntityTooLarge, map[string]any{
			"ok":    false,
			"error": ctx.Tr("repo.settings.pull_mirror_sync_quota_exceeded"),
		})
		return
	}

	if err := task.RetryMigrateTask(ctx, ctx.Repo.Repository.ID); err != nil {
		ctx.ServerError("task.RetryMigrateTask", err)
		return
	}
	ctx.JSONOK()
}

func MigrateCancelPost(ctx *context.Context) {
	migratingTask, err := admin_model.GetMigratingTask(ctx, ctx.Repo.Repository.ID)
	if err != nil {
		log.Error("GetMigratingTask: %v", err)
		ctx.Redirect(ctx.Repo.Repository.Link())
		return
	}
	if migratingTask.Status == structs.TaskStatusRunning {
		taskUpdate := &admin_model.Task{ID: migratingTask.ID, Status: structs.TaskStatusFailed, Message: "canceled"}
		if err = taskUpdate.UpdateCols(ctx, "status", "message"); err != nil {
			ctx.ServerError("task.UpdateCols", err)
			return
		}
	}
	ctx.Redirect(ctx.Repo.Repository.Link())
}

// MassMigratePost migrates or mirrors every repository of a remote
// user or organization. Only forgejo-family services (Blacksmith,
// Forgejo, Gitea) support owner enumeration.
func MassMigratePost(ctx *context.Context) {
	form := web.GetForm(ctx).(*forms.MassMigrateForm)

	if setting.Repository.DisableMigrations {
		ctx.Error(http.StatusForbidden, "Migrate: the site administrator has disabled migrations")
		return
	}
	ctxUser := checkContextUser(ctx, form.UID)
	if ctx.Written() {
		return
	}

	var listURL string
	switch form.Service {
	case structs.BlacksmithService, structs.ForgejoService, structs.GiteaService:
		listURL = strings.TrimSuffix(form.CloneAddr, "/")
	default:
		ctx.Flash.Error(ctx.Tr("repo.migrate.mass.unsupported_service"))
		ctx.Redirect(setting.AppSubURL + "/repo/migrate?service_type=0")
		return
	}

	repos, err := listRemoteOwnerRepos(ctx, listURL, form)
	if err != nil {
		ctx.Flash.Error(ctx.Tr("repo.migrate.mass.list_failed", err.Error()))
		ctx.Redirect(setting.AppSubURL + "/repo/migrate?service_type=0")
		return
	}
	if len(repos) == 0 {
		ctx.Flash.Error(ctx.Tr("repo.migrate.mass.no_repos"))
		ctx.Redirect(setting.AppSubURL + "/repo/migrate?service_type=0")
		return
	}

	succeeded := []string{}
	failed := map[string]string{}
	for _, name := range repos {
		cloneAddr := strings.TrimSuffix(form.CloneAddr, "/") + "/" + form.Owner + "/" + name + ".git"
		remoteAddr, err := forms.ParseRemoteAddr(cloneAddr, form.AuthUsername, form.AuthPassword)
		if err != nil {
			failed[name] = err.Error()
			continue
		}
		if err := migrations_allowlist.IsMigrateURLAllowed(remoteAddr, ctx.Doer); err != nil {
			failed[name] = err.Error()
			continue
		}
		opts := migrations.MigrateOptions{
			OriginalURL:    cloneAddr,
			GitServiceType: form.Service,
			CloneAddr:      remoteAddr,
			RepoName:       name,
			Private:        form.Private || setting.Repository.ForcePrivate,
			Mirror:         form.Mirror,
			AuthUsername:   form.AuthUsername,
			AuthPassword:   form.AuthPassword,
			AuthToken:      form.AuthToken,
		}
		if err := task.MigrateRepository(ctx, ctx.Doer, ctxUser, opts); err != nil {
			failed[name] = err.Error()
			continue
		}
		succeeded = append(succeeded, name)
	}

	if len(failed) > 0 {
		names := []string{}
		for n := range failed {
			names = append(names, n)
		}
		ctx.Flash.Warning(ctx.Tr("repo.migrate.mass.partial", len(succeeded), strings.Join(names, ", ")))
	} else {
		ctx.Flash.Success(ctx.Tr("repo.migrate.mass.success", len(succeeded)))
	}
	ctx.Redirect(ctxUser.HomeLink())
}

// listRemoteOwnerRepos returns the repository names of a remote
// user or org via the forgejo-compatible REST API.
func listRemoteOwnerRepos(ctx *context.Context, base string, form *forms.MassMigrateForm) ([]string, error) {
	names := []string{}
	for _, kind := range []string{"orgs", "users"} {
		page := 1
		for {
			u := fmt.Sprintf("%s/api/v1/%s/%s/repos?limit=50&page=%d", base, kind, form.Owner, page)
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
			if err != nil {
				return nil, err
			}
			if form.AuthToken != "" {
				req.Header.Set("Authorization", "token "+form.AuthToken)
			} else if form.AuthUsername != "" {
				req.SetBasicAuth(form.AuthUsername, form.AuthPassword)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return nil, err
			}
			var payload []struct {
				Name string `json:"name"`
			}
			if resp.StatusCode == http.StatusNotFound && kind == "orgs" {
				resp.Body.Close()
				break
			}
			if resp.StatusCode != http.StatusOK {
				resp.Body.Close()
				return nil, fmt.Errorf("%s returned %d", u, resp.StatusCode)
			}
			if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
				resp.Body.Close()
				return nil, err
			}
			resp.Body.Close()
			for _, r := range payload {
				names = append(names, r.Name)
			}
			if len(payload) < 50 {
				break
			}
			page++
		}
		if len(names) > 0 {
			break
		}
	}
	return names, nil
}
