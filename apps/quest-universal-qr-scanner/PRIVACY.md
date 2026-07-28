# Privacy Policy — Universal QR Scanner

_Last updated: 2026-07-25_

Universal QR Scanner ("the app") is a utility for Meta Quest 3 / 3S that reads QR codes using
the headset's passthrough cameras and opens decoded links in the Quest Browser.

## What the app accesses

- **Headset camera (passthrough).** The app requests the `Headset cameras` permission to receive
  camera frames solely to detect and decode QR codes in real time.

## What the app does with it

- Camera frames are processed **entirely on-device** to find QR codes.
- When a QR code contains a URL, the app opens that URL in the Quest Browser at your request.
- If you choose **Bookmark**, the app saves that link in its private local app storage.
- The app keeps a bounded, private diagnostic receipt chain. A receipt contains the scan type,
  decision, user action, timestamp, and a keyed HMAC commitment. It does **not** contain the QR
  text, URL, image, or camera frame. The random HMAC secret remains in private app storage.

## What the app does NOT do

- It does **not** store, record, save, or upload camera frames or images.
- It does **not** store raw decoded QR contents in diagnostic receipts or system logs.
- It does **not** transmit camera data, decoded contents, bookmarks, receipts, or the receipt key
  to any server.
- It does **not** use analytics, advertising, tracking, or third-party data collection.
- It contains **no** network/data-collection SDKs.

## Local storage and retention

- Saved links remain on the headset until you delete them in the app or clear/uninstall the app.
- Diagnostic receipts are capped at 1,000 entries; when the cap is reached, the local chain rotates.
- Android backup is disabled for the app. Clearing app data or uninstalling removes its local data.

## Data sharing

None. The app shares no data with the developer or any third party.

## Your controls

- The camera permission is requested at first use and can be revoked at any time in the Quest
  Settings. Quest also shows a system recording indicator whenever the camera is active.
- You decide whether to open, copy, bookmark, or enter content. World entry requires an explicit
  **Enter world** action.
- You can delete individual saved links from the app.

## Children's privacy

The app collects no personal data from anyone, including children.

## Contact

Questions about this policy: [support@holoscript.net](mailto:support@holoscript.net).

---

_Host this document at a public URL (e.g. GitHub Pages or any static host) and enter that URL in
the Meta Horizon Store listing's Privacy Policy field. The store requires a reachable Privacy
Policy because the app declares a camera permission._
