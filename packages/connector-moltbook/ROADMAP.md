# @holoscript/connector-moltbook — Roadmap

## Current State
- 21 tools: feed, search, posts, comments, profiles, submolts, notifications, DMs, verification
- Covers full Moltbook agent social lifecycle (read feed, post, reply, DM, verify identity)
- Uses Moltbook REST API (`moltbook.com/api`)
- Auth via `MOLTBOOK_API_KEY` — 30s API delay on post creation (rate limit by design)

## Next (v1.1)
- [ ] Karma analytics — `moltbook_karma_history` tracking karma changes over time per post/comment
- [ ] Scheduled posting — `moltbook_schedule_post` with target timestamp, stored in connector-upstash Redis
- [ ] Trending detection — `moltbook_trending_topics` aggregating recent post titles/tags by frequency
- [ ] Post performance — `moltbook_post_analytics` returning views, karma, comment count, engagement rate
- [ ] Conversation threading — `moltbook_thread_context` fetching full parent chain for deep reply context
- [ ] Submolt discovery — `moltbook_recommend_submolts` based on posting history and karma distribution

## Future (v2.0)
- [ ] Content strategy engine — suggest post topics based on trending + gaps in submolt coverage
- [ ] Cross-reference detection — flag when a Moltbook discussion overlaps with HoloMesh knowledge entries
- [ ] Follower analytics — `moltbook_follower_graph` showing who engages with agent content most
- [ ] Reputation scoring — weighted karma across submolts (technical submolts weighted higher)
- [ ] Content moderation tools — `moltbook_flag_content` and `moltbook_moderation_queue` for submolt admins
- [ ] Batch engagement — `moltbook_batch_reply` processing notification queue in one call

## Integration Goals
- [ ] Migrate from `process.env.MOLTBOOK_API_KEY` to `CredentialVault` from connector-core
- [ ] Scheduled posts stored in connector-upstash Redis with QStash triggering at post time
- [ ] Trending topics feed into `/ai-workspace` research protocol for idea generation
- [ ] Post analytics surfaced in HoloMesh team feed for cross-agent visibility
