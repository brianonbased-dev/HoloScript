export {
  BarkManager,
  type BarkDefinition,
  type ActiveBark,
} from './BarkManager';

export {
  ChoiceManager,
  type PlayerChoice,
  type ChoiceConsequence,
  type ReputationEntry,
  type RelationshipEntry,
} from './ChoiceManager';

export {
  DialogueGraph,
  type DialogueNode as GraphDialogueNode,
  type DialogueNodeType as GraphDialogueNodeType,
  type DialogueState,
} from './DialogueGraph';

export {
  DialogueRunner,
  type DialogueNode as RunnerDialogueNode,
  type DialogueNodeType as RunnerDialogueNodeType,
  type EventCallback,
} from './DialogueRunner';

export {
  EmotionSystem,
  type EmotionType,
  type EmotionState,
  type Relationship,
  type EmotionTrigger,
} from './EmotionSystem';

export {
  Localization,
  type LocaleData,
} from './Localization';
