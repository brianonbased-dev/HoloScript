# VRChat Japan HoloLand Physics Outreach

Status: ready-to-post package. External posting still requires an authenticated
VRChat Ask Forum, Discord, Reddit, or creator account and should not be claimed
complete until a public URL is captured.

This brief turns the VRChat physics tutorial into a Japanese creator wedge for
HoloLand. The posture is bridge-first: VRChat is the network-effect venue,
HoloScript is the physics authoring layer, and HoloLand is the destination for
worlds that need richer simulation than standard Udon workflows can comfortably
carry.

## Current Public Baseline

- VRChat Creator Docs list Unity-powered custom worlds, Udon, ClientSim, allowed
  components, and supported scripted assets as the world-creation surface.
- VRChat's current supported Unity version is `2022.3.22f1`.
- UdonSharp is included in the VRChat Worlds SDK and compiles C# into Udon
  Assembly.
- VRChat's Ask Forum has public Creator Hub, Worlds, Udon, Tool Creators, and
  Tutorials/Tools/Resources categories.
- HoloTunnel provides the no-cable Quest preview path: start a local WebXR or
  Studio preview, expose it with HoloTunnel, then open the `/live` URL in Quest
  Browser. Desktop Unity remains the final VRChat upload path.

Sources checked 2026-05-20:

- https://creators.vrchat.com/worlds/
- https://creators.vrchat.com/sdk/
- https://creators.vrchat.com/sdk/upgrade/current-unity-version/
- https://creators.vrchat.com/worlds/udon/udonsharp/
- https://ask.vrchat.com/categories
- https://ask.vrchat.com/c/creator-hub/63
- https://ask.vrchat.com/c/guides/39

## IP-Safe Positioning

Internal strategy can say "HoloLand should satisfy the desire for a real
Shangri-La Frontier." Public copy should say:

> HoloLand is for anime-grade, physics-first virtual worlds: curtains you can
> push through, fountains that react, structures that fail, and NPC/world systems
> that keep moving when the player is not looking.

Do not use copyrighted names, characters, logos, story beats, world names, or
visual assets. The design target is the feeling of a responsive, consequential
VRMMO world, not a clone.

## Channel Map

| Channel | Post type | First action |
|---------|-----------|--------------|
| VRChat Ask Forum: Tutorials, Tools, and Resources | Japanese tutorial/resource post | Publish the tutorial link and ask for world-creator feedback |
| VRChat Ask Forum: Creator Hub / Worlds / Udon | Technical discussion post | Ask what physics workflows are currently painful in Unity/Udon |
| Official VRChat Discord `#world-dev` if available after joining | Short Japanese intro + link | Ask for feedback from world gimmick creators |
| r/VRChat | Use weekly thread if self-promotion rules are strict | Share as Japanese/English creator resource, not an ad |
| BOOTH / VRCFinder discovery | Creator research, not mass posting | Identify public creators selling Udon/world gimmick assets |
| X/Twitter JP | Thread with demo GIF/video when available | Use only after there is a visual HoloTunnel or VRChat demo |

## Creator Discovery Queries

Use these to identify public Japanese creators who already build physics,
Udon, or world-gimmick assets. Respect profile contact preferences and do not
scrape private communities.

```text
VRChat ワールド ギミック UdonSharp
VRChat Udon ギミック BOOTH
VRChat ワールド 制作者 物理
VRChat ワールド カーテン シェーダー
VRChat 噴水 パーティクル Udon
VRChat 破壊 ギミック ワールド
VRChat Quest対応 ワールド ギミック
VRC ワールド素材 インタラクション
VRC UdonSharp ギミック
VRC World gimmick creator Japan
```

Prioritize creators whose public products include:

- Udon/UdonSharp world gimmicks
- interactive furniture, doors, pickups, object pools, or save systems
- shaders or assets for curtains, water, particles, or interiors
- Quest-compatible world assets with performance discipline
- public contact channel for commissions or collaboration

## VRChat Ask Forum Draft

Title:

```text
[Tutorial] HoloScriptでVRChatの物理ワールドを作る: cloth / fluid / structural collapse
```

Body:

```markdown
こんにちは。HoloScriptのVRChat向け物理ワールド制作チュートリアルを日本語化しました。

対象は、Unity + VRChat SDK3でワールド制作をしている制作者です。UdonSharpを手書きせずに、`.holo` から布、流体、構造破壊、Pickup同期のあるVRChatワールドを生成する流れをまとめています。

- 布カーテン: `@cloth`
- 触れるボール/Pickup: `@interaction` + `@sync`
- 流体表現: `domain fluid`
- 壊れる構造物: `@structural`
- Quest実機確認: HoloTunnelでQuest BrowserにWebXRプレビューを開くため、Linkケーブルなしでスケール確認できます

日本語版:
https://github.com/brianonbased-dev/HoloScript/blob/main/docs/tutorials/vrchat-physics-worlds-ja.md

英語版:
https://github.com/brianonbased-dev/HoloScript/blob/main/docs/tutorials/vrchat-physics-worlds.md

今知りたいこと:

1. Unity/Udonだけで物理ギミックを作るとき、一番面倒な部分はどこですか？
2. Quest対応で一番先に落とすべき表現は、布、流体、破壊、同期のどれですか？
3. 日本語のサンプルワールドとして、カーテン、噴水、壊れる橋のどれが見たいですか？

宣伝というより、ワールド制作者向けの制作実験です。フィードバックをもらえたら、次のサンプルワールドに反映します。
```

## Reddit Draft

Use the weekly thread if standalone self-promotion is risky.

Title:

```text
Japanese VRChat world creators: tutorial for physics worlds with HoloScript
```

Body:

```markdown
I put together a Japanese tutorial for VRChat world creators who want physics-heavy worlds without hand-writing all the UdonSharp glue.

It covers cloth curtains, interactable rigid bodies, fluid-style particle systems, structural collapse scenes, and a no-Link-cable Quest preview loop using HoloTunnel + Quest Browser before the final VRChat SDK Build & Test step in Unity.

Japanese tutorial:
https://github.com/brianonbased-dev/HoloScript/blob/main/docs/tutorials/vrchat-physics-worlds-ja.md

English version:
https://github.com/brianonbased-dev/HoloScript/blob/main/docs/tutorials/vrchat-physics-worlds.md

I’m especially looking for feedback from people who build Udon/world gimmicks: which physics workflow is currently the most painful in VRChat?
```

## Direct Outreach Draft

Japanese:

```text
こんにちは。VRChat向けのワールドギミック/物理表現を作っている方を探していて、ご連絡しました。

HoloScriptという、`.holo` からVRChat SDK3 + UdonSharp向けの物理ワールドを生成するツールの日本語チュートリアルを作りました。布カーテン、触れるオブジェクト、流体風の噴水、壊れる構造物のようなサンプルを扱っています。

もしご興味があれば、ワールド制作者目線で「これは使えそう / ここが現実的ではない」という率直なフィードバックをいただきたいです。

日本語版:
https://github.com/brianonbased-dev/HoloScript/blob/main/docs/tutorials/vrchat-physics-worlds-ja.md

※ 既存IPやキャラクターを使う話ではなく、オリジナルの物理インタラクティブワールド制作の相談です。
```

English:

```text
Hi. I’m looking for VRChat world creators who already build Udon/world gimmicks, especially physics-heavy interactions.

We translated a HoloScript tutorial for generating VRChat SDK3 + UdonSharp world scaffolds from `.holo`: cloth curtains, interactable objects, fluid-style fountains, and structural collapse scenes.

I’d value blunt creator feedback: what feels useful, what feels unrealistic, and what sample world would prove the workflow fastest?

Japanese tutorial:
https://github.com/brianonbased-dev/HoloScript/blob/main/docs/tutorials/vrchat-physics-worlds-ja.md
```

## Flagship Commission Brief

Working title: `Frontier Physics Gallery`

Public Japanese title: `触れる物理フロンティア`

Goal: commission or co-build one compact VRChat/HoloLand showcase that proves
HoloScript is useful to Japanese world creators before asking them to change
their workflow.

Core rooms:

1. Cloth gate: heavy curtains that react to players and thrown objects.
2. Fluid court: a fountain whose particle behavior changes when users move
   stones or valves.
3. Collapse bridge: a small structure that fails when a load crosses a threshold.
4. Quiet NPC/world-state corner: a guide character or world sign that remembers
   which demonstrations have been triggered.

Technical constraints:

- VRChat upload remains desktop Unity + VRChat SDK3.
- Quest preview uses HoloTunnel + Quest Browser WebXR for no-cable iteration.
- Quest-compatible edition can reduce fluid particle count and collapse fragment
  count before Android build.
- No copyrighted IP, names, characters, logos, or recognizably copied locations.
- Every generated scene should preserve a SimulationContract/provenance receipt
  when the target supports it.

Acceptance criteria:

- A creator can understand the `.holo` source in under ten minutes.
- The Unity import path is documented from generated scripts to Build & Test.
- The no-cable Quest preview path is demonstrated or recorded.
- One Japanese creator gives feedback on the workflow before broader posting.

## Posting Receipt Checklist

Do not mark public outreach as posted until these are filled:

| Target | URL | Posted by | Date | Notes |
|--------|-----|-----------|------|-------|
| VRChat Ask Forum tutorial/resource | | | | |
| VRChat Creator Hub / Worlds / Udon | | | | |
| Reddit / weekly thread | | | | |
| Direct creator outreach 1 | private receipt only | | | |
| Direct creator outreach 2 | private receipt only | | | |
