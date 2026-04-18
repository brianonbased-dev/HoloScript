import { QuestProbe } from '../../components/quest/QuestProbe';

export const metadata = {
  title: 'Quest 3 Probe — HoloScript Studio',
  description:
    "Capability probe for the Quest 3 browser: WebXR, hand tracking, passthrough, voice, WASM, and Studio reachability.",
};

export default function QuestProbePage() {
  return <QuestProbe />;
}
