# @holoscript/connector-appstore — Roadmap

## Current State
- 27 tools across two platforms:
  - Apple (14): App Store Connect API — builds, TestFlight beta groups, app versions, metadata, customer reviews, bundle IDs
  - Google (11): Google Play Developer API — tracks, staged rollouts, APK/AAB uploads, store listings, deobfuscation files
  - Unified (2): webhook handling, artifact detection (`.ipa`/`.aab` from build output)
- Auth: Apple via JWT (key ID + issuer ID + `.p8` private key), Google via service account JSON

## Next (v1.1)
- [ ] Review response — `appstore_reply_review` posting developer responses via App Store Connect `POST /v1/customerReviewResponses`
- [ ] Revenue reporting — `appstore_sales_report` fetching daily/weekly sales from App Store Connect Finance API
- [ ] Google review replies — `playstore_reply_review` via `reviews.reply` endpoint
- [ ] Screenshot management — `appstore_upload_screenshots` handling per-device per-locale asset sets
- [ ] Rollout monitoring — `playstore_rollout_status` with halt/resume controls for staged rollouts
- [ ] Build distribution — `appstore_distribute_build` assigning builds to specific TestFlight groups automatically

## Future (v2.0)
- [ ] A/B experiments — `playstore_experiment_create` using Google Play store listing experiments API
- [ ] Localization pipeline — `appstore_sync_localizations` bulk-importing/exporting metadata across all locales
- [ ] App analytics — `appstore_analytics` pulling installs, crashes, retention from App Store Connect Analytics API
- [ ] Google Vitals — `playstore_vitals` fetching ANR rate, crash rate, startup time from Android Vitals API
- [ ] Phased release automation — `appstore_phased_release` managing 7-day phased release with auto-pause on crash spike
- [ ] Unified dashboard — `appstore_cross_platform_status` comparing iOS/Android version parity and review sentiment

## Integration Goals
- [ ] Migrate from raw `.p8` key path and service account JSON to `CredentialVault` from connector-core
- [ ] Build artifacts from connector-railway deploy trigger TestFlight/Play Store upload automatically
- [ ] Review sentiment analysis via connector-upstash Vector embeddings for trend detection
- [ ] Release events posted to connector-moltbook for community visibility
