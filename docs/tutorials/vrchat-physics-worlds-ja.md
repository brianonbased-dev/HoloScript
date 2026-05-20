# HoloScriptでVRChat物理ワールドを作る

HoloScriptを使うと、布、流体、構造破壊、複数物体の相互作用を持つ
VRChatワールドを、Unity物理コードやUdonSharpを手書きせずに作れます。

HoloScriptは `.holo` の構成をVRChat SDK3 + UdonSharp向けの出力へ変換します。
手作業なら数日かかるUnityの設定、Rigidbody、Collider、Pickup、同期処理を、
HoloScriptのコンパイル結果としてまとめて扱えます。

> **対象読者**: Unity + VRChat SDK3でワールド制作をしたことがある
> VRChatワールド制作者向けです。Unityパッケージの読み込みとPlay Modeの実行が
> できる前提で進めます。C#やUdonSharpの知識は不要です。

> **IPについて**: Shangri-La Frontierのような「実在感のあるVRMMO体験」は
> デザイン上の参考にできますが、名称、キャラクター、アセット、物語、ロゴは
> 使いません。HoloLand/HoloScript側では、物理で遊べるオリジナル世界として作ります。

---

## なぜVRChat物理にHoloScriptを使うのか

一般的なVRChatワールド制作では、次の作業が必要になります。

- UdonSharp C#を手書きする
- Rigidbody、Collider、VRC_Pickup、ネットワーク同期を手でつなぐ
- 物理ギミックのためにUnity + PhysXの知識が必要になる
- 布や流体は外部プラグインかベイク済みキャッシュに頼りがち

HoloScriptでは、次のように進めます。

- `.holo` にワールドの意味と物理挙動を書く
- `compile_to_vrchat` がUdonSharp、Prefab階層、World Descriptor設定を生成する
- 構造、布、流体、音響など、複数ドメインの物理を同じ構成内で扱う
- 重い計算はできる限りコンパイル時にベイクし、VRChat実行時の負荷を抑える

---

## 前提

1. VRChatが現在サポートするUnity `2022.3.22f1`
2. VRChat Creator CompanionまたはVRChat SDK3 Worlds入りのUnityプロジェクト
3. HoloScript MCPまたはCLIへのアクセス
4. ワールドアップロード権限のあるVRChatアカウント

VRChat公式ドキュメントでは、Creator Companionの利用、Unityでのワールド制作、
SDK Control Panelでのログイン、Build & Test/Publishの流れが案内されています。

---

## チュートリアル1: 布シミュレーションの部屋

### 1. 構成を書く

`cloth-room.holo` を作ります。

```holo
world ClothRoom {
  environment {
    skybox: "studio_dark"
    ambient: [0.1, 0.1, 0.15]
  }

  object Floor {
    geometry: box
    scale: [10, 0.1, 10]
    position: [0, 0, 0]
    @physics { mass: 0, static: true }
  }

  object ClothPanel {
    geometry: plane
    scale: [2, 2, 1]
    position: [0, 3, 0]
    @cloth {
      stiffness: 0.8
      damping: 0.2
      mass: 0.1
      pinTopEdge: true
    }
    @interaction { pickup: true, throwable: true }
  }

  object HeavyBall {
    geometry: sphere
    scale: [0.4, 0.4, 0.4]
    position: [0, 5, 0]
    @physics { mass: 5.0, restitution: 0.3 }
    @interaction { pickup: true, throwable: true }
    @sync { networked: true }
  }
}
```

### 2. VRChat向けにコンパイルする

MCPツールから実行する場合:

```text
compile_to_vrchat composition=ClothRoom sdkVersion=3.5 worldName="Cloth Physics Demo"
```

CLIから実行する場合:

```bash
holoscript compile --target vrchat cloth-room.holo -o cloth-room-vrchat/
```

### 3. 生成されるファイル

```text
cloth-room-vrchat/
├── GeneratedWorld.cs
├── ClothPanel_Udon.cs
├── HeavyBall_Udon.cs
├── PrefabHierarchy.txt
└── WorldDescriptor.json
```

### 4. Unityに読み込む

1. 生成された `.cs` ファイルをUnityプロジェクトの `Assets/HoloWorld/Scripts/` に入れる
2. VRChatワールド用のSceneを開く
3. `PrefabHierarchy.txt` に合わせてGameObjectを作る
4. 各 `*_Udon.cs` を対応するGameObjectにアタッチする
5. 布オブジェクトにはUnityの **Cloth** コンポーネントを追加する
6. **VRChat SDK > Build & Test** を実行する

---

## チュートリアル2: 流体エフェクトの部屋

```holo
world FluidRoom {
  environment {
    skybox: "night_city"
    fog: { density: 0.02, color: [0.05, 0.05, 0.1] }
  }

  object Tank {
    geometry: box
    scale: [3, 2, 3]
    position: [0, 1, 0]
    @physics { mass: 0, static: true, transparent: true }
  }

  domain fluid {
    FluidVolume {
      container: Tank
      particleCount: 8000
      viscosity: 0.001
      surfaceTension: 0.072
      density: 1000
    }
  }

  object FluidBall {
    geometry: sphere
    scale: [0.3, 0.3, 0.3]
    position: [0, 2.5, 0]
    @physics { mass: 0.5 }
    @interaction { pickup: true }
    @sync { networked: true }
  }

  state {
    fluidActive: true
  }
}
```

```bash
holoscript compile --target vrchat fluid-room.holo -o fluid-room-vrchat/
```

`domain fluid` は、Unity Particle Systemの設定とUdon同期ロジックを生成します。
HoloScript側で流体の挙動を事前計算し、VRChat内では軽量な表現として動かします。

---

## チュートリアル3: 構造破壊シーン

Unity標準の小さなギミックでは作りにくい、荷重で壊れる床や支柱を作ります。

```holo
world CollapseDemo {
  object Platform {
    geometry: box
    scale: [4, 0.3, 4]
    position: [0, 2, 0]
    @physics { mass: 50, static: false }
    @structural {
      material: concrete
      yieldStrength: 30e6
      fractureMode: brittle
    }
  }

  object SupportLeft {
    geometry: cylinder
    scale: [0.3, 2, 0.3]
    position: [-1.5, 1, 0]
    @physics { mass: 20, static: false }
    @structural { material: steel, yieldStrength: 250e6 }
  }

  object SupportRight {
    geometry: cylinder
    scale: [0.3, 2, 0.3]
    position: [1.5, 1, 0]
    @physics { mass: 20, static: false }
    @structural { material: steel, yieldStrength: 250e6 }
  }

  object DropWeight {
    geometry: box
    scale: [0.8, 0.8, 0.8]
    position: [0, 6, 0]
    @physics { mass: 500, restitution: 0.1 }
    @interaction { pickup: true, throwable: true }
    @sync { networked: true }
  }

  zone ImpactZone {
    bounds: [[-2, 0, -2], [2, 5, 2]]
    onEnter: "triggerStructuralSim"
  }
}
```

構造ソルバーはコンパイル時に破断パターンを計算します。Unity側では、
Udonの状態機械が「無傷」と「破壊後」のメッシュを切り替えます。

---

## チュートリアル4: 複合物理ギャラリー

布、剛体、音響、流体を1つのワールドにまとめます。日本のVRChat制作者に
見せる最初のデモとしては、単なる説明よりも「入って触れる」ギャラリーが強いです。

```holo
world PhysicsGallery {
  environment {
    skybox: "museum_interior"
    reverb: 0.6
  }

  object EntranceCurtainL {
    geometry: plane
    scale: [1.5, 3, 1]
    position: [-0.8, 1.5, -5]
    @cloth { stiffness: 0.5, pinTopEdge: true, windResponse: 0.3 }
  }

  object EntranceCurtainR {
    geometry: plane
    scale: [1.5, 3, 1]
    position: [0.8, 1.5, -5]
    @cloth { stiffness: 0.5, pinTopEdge: true, windResponse: 0.3 }
  }

  object CradleStand {
    geometry: box
    scale: [2, 0.1, 0.5]
    position: [0, 2, 0]
    @physics { mass: 0, static: true }
  }

  object Ball1 {
    geometry: sphere
    scale: [0.2, 0.2, 0.2]
    position: [-0.4, 1, 0]
    @physics { mass: 1.0, restitution: 0.99 }
    @interaction { pickup: true }
    @sync { networked: true }
  }

  domain audio {
    ReverbZone {
      position: [3, 1.5, 3]
      radius: 4
      reverbPreset: cavern
      wetMix: 0.7
    }
  }

  domain fluid {
    Fountain {
      emitter: { position: [0, 0.5, 4], radius: 0.2 }
      particleCount: 3000
      viscosity: 0.001
      looped: true
    }
  }
}
```

---

## 物理Traitリファレンス

| Trait | VRChat出力 | メモ |
|-------|------------|------|
| `@physics { mass, restitution, friction }` | Rigidbody + PhysicsMaterial | `mass: 0, static: true` はStatic Collider相当 |
| `@interaction { pickup: true }` | VRC_Pickup + Udon | `throwable: true` で投げられる |
| `@sync { networked: true }` | UdonSynced + VRC_ObjectSync | Pickupや投擲物に使う |
| `@cloth { stiffness, damping, pinTopEdge }` | Unity Cloth + constraints | HoloScriptソルバーからベイク |
| `@structural { material, yieldStrength }` | 破壊メッシュ + Udon状態機械 | 破断はコンパイル時に計算 |
| `domain fluid { ... }` | Particle System + Udon | Quest向けには粒子数を抑える |
| `domain audio { ReverbZone }` | VRC_SpatialAudioSource zone | 空間音響のデモに使う |

---

## ケーブルなしでQuest確認する: HoloTunnel

Linkケーブルがなくても、VRChatアップロード前の確認はできます。Unityでの
最終Build & Testはデスクトップ側に残しつつ、スケール、文字の見やすさ、
移動感、酔いやすさ、インタラクション意図はQuest BrowserのWebXRプレビューで
早く確認します。

```bash
# Studio/WebXR previewを起動してから、ローカルポートをHoloTunnelで公開します。
node packages/studio/scripts/holotunnel-client.mjs --port 3101
```

表示された `/live` URLをQuest Browserで開きます。HoloTunnelはローカルの
プレビューを公開URLに橋渡しするため、USBケーブルなしで実機に近い確認ができます。

MCP接続済みのエージェントなら、`holo_tunnel_create` でも同じローカルから
公開URLへの橋渡しができます。

---

## 公開

1. Unityで **VRChat SDK > Build & Publish for Windows** を実行する
2. ワールド名、説明、タグを設定する
3. タグ例: `physics`, `interactive`, `HoloScript`
4. 日本語の紹介文を添えて、VRChat Ask ForumのCreator Hub / Worlds / Udon、
   またはTutorials, Tools, and Resourcesに投稿する
5. Quest対応が必要な場合はAndroid/Quest向け制約で粒子数、テクスチャ、同期頻度を調整する

---

## 参考リンク

- [英語版チュートリアル](./vrchat-physics-worlds.md)
- [VRChat Creator Docs: Worlds](https://creators.vrchat.com/worlds/)
- [VRChat Creator Docs: Getting Started](https://creators.vrchat.com/sdk/)
- [VRChat Current Unity Version](https://creators.vrchat.com/sdk/upgrade/current-unity-version/)
- [VRChat UdonSharp Docs](https://creators.vrchat.com/worlds/udon/udonsharp/)
- [HoloLand Japan Outreach Brief](../marketing/vrchat-japan-hololand-physics-outreach.md)
