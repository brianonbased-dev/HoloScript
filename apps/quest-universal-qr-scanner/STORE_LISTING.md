# HoloQR — Meta Horizon Store Listing

This is the prepared listing for Meta app `1114952721709215`, submission
`1114952735042547`. It describes the behavior compiled from [`scanner.holo`](./scanner.holo);
do not add claims that are not present in the source or proven on a headset.

## Commercial settings

- Listing type: **Full release**
- Price intent: **USD $3**. If Meta exposes price tiers rather than exact prices, use the closest
  tier shown by the dashboard and record the selected tier in the release receipt.
- Category: **Apps**
- Suggested genre, if requested: **Utilities**
- Early Access: **Disabled**
- Ads: **No**
- Subscription: **No**
- Social features: **No**

## Name

HoloQR

## Short description

Scan QR codes without taking off your Quest. HoloQR decodes through the Quest 3 or 3S passthrough
cameras on-device, then lets you open links, copy useful content, or enter HoloScript worlds.

## Long description

HoloQR turns your Quest 3 or 3S into a look-to-scan QR utility.

Point your headset at a QR code. HoloQR processes the camera frame on-device and shows a result card
when it finds a code.

- Open web links in the Quest Browser after you choose Open.
- Copy Wi-Fi, contact, email, phone, message, location, calendar, and plain-text payloads.
- Save useful links as local bookmarks on your headset.
- Scan a HoloScript world link to enter an immersive world and keep scanning.

Camera frames are never stored or uploaded. Decoded contents are not sent to the developer. Saved
bookmarks stay on the headset and can be deleted in the app. HoloQR has no accounts, ads, analytics,
or subscriptions.

HoloQR requires the Headset cameras permission and supports Meta Quest 3 and Quest 3S.

## Search keywords

1. QR
2. scanner
3. utility
4. productivity
5. mixed reality

## Technical specs

- Player mode: Single player
- Input: Tracked controllers
- Physical modes: Sitting and standing
- Play area: Stationary
- Comfort: Comfortable
- Internet connection: Not required for scanning; an internet connection is needed to load an
  external web link in the Quest Browser.
- Supported language: English
- Supported devices: Quest 3 and Quest 3S
- Purchase-block unsupported devices: Quest 2 and Quest Pro, if Meta lists them

## Publisher details

- Developer: Brian X Base LLC
- Publisher: Brian X Base LLC
- Website: `https://holoscript.net`
- Privacy policy target:
  `https://raw.githubusercontent.com/brianonbased-dev/HoloScript/main/apps/quest-universal-qr-scanner/PRIVACY.md`
- Support target: `https://github.com/brianonbased-dev/HoloScript/issues`
- Contact email: requires founder confirmation before it is entered or published

## Reviewer notes

HoloQR is a single-player, on-device QR utility for Quest 3 and Quest 3S. It requests the
`horizonos.permission.HEADSET_CAMERA` permission. Camera frames are decoded locally with ZXing and
are not stored or transmitted. The app has no accounts, ads, analytics, or test credentials.

Review flow:

1. Grant the Headset cameras permission.
2. Choose **Start scanning**.
3. Point the headset at a QR code.
4. For a web link, choose **Open** to launch the Quest Browser. For other content, choose **Copy**.

## Asset map

| Meta field                     | Repository asset                              | Status                   |
| ------------------------------ | --------------------------------------------- | ------------------------ |
| Landscape cover, 2560×1440     | `store-assets/cover-landscape-2560x1440.png`  | Ready                    |
| Square cover, 1440×1440        | `store-assets/cover-square-1440x1440.png`     | Ready                    |
| Portrait cover, 1008×1440      | `store-assets/cover-portrait-1008x1440.png`   | Ready                    |
| Hero cover, 3000×900           | `store-assets/cover-hero-3000x900.png`        | Ready                    |
| Icon, 512×512                  | `store-assets/icon-512.png`                   | Ready                    |
| Spatial foreground, 180×180    | `store-assets/icon-spatialized-180.png`       | Optional; ready          |
| Screenshots, five at 2560×1440 | On-headset capture from the release candidate | **Required; missing**    |
| Trailer                        | None                                          | Optional; omitted for v1 |

## Release blockers

- Upload the signed APK to the Production channel and pass Meta's binary validation.
- Install that exact channel build on Quest 3 or 3S and run the headset smoke/performance matrix.
- Capture five distinct 2560×1440 images from actual in-experience content.
- Replace the contact placeholder in `PRIVACY.md` with a founder-approved public address.
- Complete the IARC questionnaire, app-sharing preference, pricing tier, and submission contact.
