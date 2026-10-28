// Copyright 2023 The Gitea Authors. All rights reserved.
// Copyright 2026 The Blacksmith Authors. All rights reserved.
// SPDX-License-Identifier: MIT

package misc

import (
	"net/http"
	"path"
	"sync"

	"forgejo.org/modules/httpcache"
	"forgejo.org/modules/log"
	"forgejo.org/modules/setting"
	"forgejo.org/modules/util"
)

func SSHInfo(rw http.ResponseWriter, req *http.Request) {
	rw.Header().Set("content-type", "text/json;charset=UTF-8")
	_, err := rw.Write([]byte(`{"type":"agit","version":1}`))
	if err != nil {
		log.Error("fail to write result: err: %v", err)
		rw.WriteHeader(http.StatusInternalServerError)
		return
	}
	rw.WriteHeader(http.StatusOK)
}

func DummyOK(w http.ResponseWriter, req *http.Request) {
	w.WriteHeader(http.StatusOK)
}

func ManifestJSON(w http.ResponseWriter, req *http.Request) {
	httpcache.SetCacheControlInHeader(w.Header(), setting.StaticCacheTime)
	w.Header().Add("content-type", "application/manifest+json;charset=UTF-8")

	manifestJSON := util.FilePathJoinAbs(setting.CustomPath, "public/manifest.json")
	if ok, _ := util.IsExist(manifestJSON); ok {
		http.ServeFile(w, req, manifestJSON)
		return
	}

	bytes, err := setting.GetManifestJSON()
	if err != nil {
		log.Error("unable to marshal manifest JSON. Error: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	if _, err := w.Write(bytes); err != nil {
		log.Error("unable to write manifest JSON. Error: %v", err)
		return
	}
}

func StaticRedirect(target string) func(w http.ResponseWriter, req *http.Request) {
	return func(w http.ResponseWriter, req *http.Request) {
		http.Redirect(w, req, path.Join(setting.StaticURLPrefix, target), http.StatusMovedPermanently)
	}
}

var defaultRobotsTxt = sync.OnceValue(func() []byte {
	return []byte(`# The default Blacksmith robots.txt

# AI scrapers and crawlers - fully disallowed
User-agent: AI2Bot
User-agent: Ai2Bot-Dolma
User-agent: Amazonbot
User-agent: anthropic-ai
User-agent: Applebot-Extended
User-agent: AwarioRssBot
User-agent: AwarioSmartBot
User-agent: Bytespider
User-agent: CCBot
User-agent: ChatGPT-User
User-agent: Claude-Web
User-agent: ClaudeBot
User-agent: cohere-ai
User-agent: cohere-training-data-crawler
User-agent: Cotoyogi
User-agent: CrawlSpace
User-agent: Datenbank Crawler
User-agent: Diffbot
User-agent: DuckAssistBot
User-agent: FacebookBot
User-agent: factset_spyderbot
User-agent: FirecrawlAgent
User-agent: FriendlyCrawler
User-agent: GPTBot
User-agent: Google-Extended
User-agent: GoogleOther
User-agent: GoogleOther-Image
User-agent: GoogleOther-Video
User-agent: iaskspider/2.0
User-agent: ICC-Crawler
User-agent: ImagesiftBot
User-agent: img2dataset
User-agent: ISSCyberRiskCrawler
User-agent: Kangaroo Bot
User-agent: LinerBot
User-agent: meta-externalagent
User-agent: Meta-ExternalAgent
User-agent: meta-externalfetcher
User-agent: MistralAI-User
User-agent: MistralAI-User/1.0
User-agent: OAI-SearchBot
User-agent: omgili
User-agent: omgilibot
User-agent: Operator
User-agent: PanguBot
User-agent: Perplexity-User
User-agent: PerplexityBot
User-agent: PetalBot
User-agent: Scrapy
User-agent: SemrushBot-OCOB
User-agent: SemrushBot-SWA
User-agent: Sidetrade indexer bot
User-agent: TikTokSpider
User-agent: Timpibot
User-agent: VelenPublicWebCrawler
User-agent: Webzio-Extended
User-agent: YouBot
Disallow: /

User-agent: *
Disallow: /api/
Disallow: /avatars/
Disallow: /user/
Disallow: /swagger.*.json
Disallow: /explore/*?*

Disallow: /repo/create
Disallow: /repo/migrate
Disallow: /org/create
Disallow: /*/*/fork

Disallow: /*/*/watchers
Disallow: /*/*/stargazers
Disallow: /*/*/forks

Disallow: /*/*/src/
Disallow: /*/*/blame/
Disallow: /*/*/commit/
Disallow: /*/*/commits/
Disallow: /*/*/raw/
Disallow: /*/*/media/
Disallow: /*/*/tags
Disallow: /*/*/graph
Disallow: /*/*/branches
Disallow: /*/*/compare
Disallow: /*/*/lastcommit/
Disallow: /*/*/rss/branch/
Disallow: /*/*/atom/branch/

Disallow: /*/*/activity
Disallow: /*/*/activity_author_data

Disallow: /*/*/actions
Disallow: /*/*/projects
Disallow: /*/*/labels
Disallow: /*/*/milestones

Disallow: /*/*/find/
Disallow: /*/*/tree-list/
Disallow: /*/*/search/
Disallow: /*/-/code

Disallow: /*/*/issues/new
Disallow: /*/*/pulls/*/files
Disallow: /*/*/pulls/*/commits

Disallow: /attachments/
Disallow: /*/*/attachments/
Disallow: /*/*/issues/*/attachments/
Disallow: /*/*/pulls/*/attachments/
Disallow: /*/*/releases/attachments
Disallow: /*/*/releases/download

Disallow: /*/*/archive/
Disallow: /*.bundle$
Disallow: /*.patch$
Disallow: /*.diff$
Disallow: /*.atom$
Disallow: /*.rss$

Disallow: /*lang=*
Disallow: /*redirect_to=*
Disallow: /*tab=*
Disallow: /*q=*
Disallow: /*sort=*
Disallow: /*repo-search-archived=*
`)
})

func RobotsTxt(w http.ResponseWriter, req *http.Request) {
	httpcache.SetCacheControlInHeader(w.Header(), setting.StaticCacheTime)
	w.Header().Set("Content-Type", "text/plain")

	robotsTxt := util.FilePathJoinAbs(setting.CustomPath, "public/robots.txt")
	if ok, _ := util.IsExist(robotsTxt); ok {
		http.ServeFile(w, req, robotsTxt)
		return
	}

	_, err := w.Write(defaultRobotsTxt())
	if err != nil {
		log.Error("failed to write robots.txt: %v", err)
	}
}
