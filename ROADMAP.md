# Roadmap

The owner's list of what to build next. This file is edited by hand and is
trusted input, unlike `ideas/IDEAS.md`, which holds unvetted visitor
suggestions. Move items to **Done** with a PR link when they ship.

## Now

- [ ] Set `REDIS_URL` on the Vercel project so presence and ideas survive
      restarts and work across instances.
- [ ] Add the `ANTHROPIC_API_KEY` secret and `PARK_BENCH_URL` variable, then
      trigger the ideas workflow once by hand to confirm it opens a PR.

## Next

- [ ] Automated tests: backend protocol tests against a real uvicorn server
      (sit, attack range/cooldown, KO → respawn, ideas) and a Playwright
      multi-visitor smoke test, run in CI on PRs.
- [ ] Phone support: talking needs a physical keyboard today (there is no
      text field to focus), and cursors only move while dragging.
- [ ] Idea moderation: a way to hide spam or abusive ideas before they reach
      the markdown feed.
- [ ] Move the idea rate limit into Redis so it holds across instances.

## Later

- [ ] Remove the starter `/api/v1/items` sample routes.
- [ ] A bench conversation log so people arriving mid-chat can catch up.

## Done

- [x] Seat talkers on the actual bench; cursor battles; battle music; idea
      box and ideas-to-PR workflow — https://github.com/apandji/bench/pull/1
