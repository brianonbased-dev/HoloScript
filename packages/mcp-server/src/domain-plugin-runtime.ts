import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerEnergyGridTraitHandlers } from '../../plugins/energy-grid-plugin/src/runtime';
import { registerFitnessWellnessTraitHandlers } from '../../plugins/fitness-wellness-plugin/src/runtime';
import { registerTravelHospitalityTraitHandlers } from '../../plugins/travel-hospitality-plugin/src/runtime';

interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

interface BuiltinDomainPluginEntry {
  pluginId: string;
  packageName: string;
  aliases: string[];
  traits: string[];
  register: (registrar: TraitRegistrar) => void;
}

export interface BuiltinDomainPluginInstallResult {
  success: boolean;
  pluginId?: string;
  packageName?: string;
  state?: 'enabled' | 'already_enabled';
  registeredTraits?: string[];
  runtime: 'HoloScriptRuntime';
  alreadyInstalled?: boolean;
  supportedPlugins?: string[];
  error?: string;
}

const BUILTIN_DOMAIN_PLUGINS: BuiltinDomainPluginEntry[] = [
  {
    pluginId: 'energy-grid',
    packageName: '@holoscript/energy-grid-plugin',
    aliases: ['energy-grid', 'energy-grid-plugin', '@holoscript/energy-grid-plugin'],
    traits: ['power_flow'],
    register: registerEnergyGridTraitHandlers,
  },
  {
    pluginId: 'fitness-wellness',
    packageName: '@holoscript/plugin-fitness-wellness',
    aliases: ['fitness-wellness', 'fitness-wellness-plugin', '@holoscript/plugin-fitness-wellness'],
    traits: ['one_rep_max'],
    register: registerFitnessWellnessTraitHandlers,
  },
  {
    pluginId: 'travel-hospitality',
    packageName: '@holoscript/plugin-travel-hospitality',
    aliases: [
      'travel-hospitality',
      'travel-hospitality-plugin',
      '@holoscript/plugin-travel-hospitality',
    ],
    traits: ['revpar'],
    register: registerTravelHospitalityTraitHandlers,
  },
];

const DOMAIN_PLUGIN_BY_ALIAS = new Map<string, BuiltinDomainPluginEntry>();
for (const entry of BUILTIN_DOMAIN_PLUGINS) {
  for (const alias of entry.aliases) {
    DOMAIN_PLUGIN_BY_ALIAS.set(alias.toLowerCase(), entry);
  }
}

let builtinDomainPluginRuntime: HoloScriptRuntime | null = null;
const installedBuiltinDomainPlugins = new Set<string>();

export function getBuiltinDomainPluginRuntime(): HoloScriptRuntime {
  builtinDomainPluginRuntime ??= new HoloScriptRuntime();
  return builtinDomainPluginRuntime;
}

export function listBuiltinDomainPluginNames(): string[] {
  return BUILTIN_DOMAIN_PLUGINS.map((entry) => entry.packageName);
}

export function resetBuiltinDomainPluginRuntimeForTests(): void {
  builtinDomainPluginRuntime = null;
  installedBuiltinDomainPlugins.clear();
}

export function installBuiltinDomainPlugin(pluginName: string): BuiltinDomainPluginInstallResult {
  const normalized = pluginName.trim().toLowerCase();
  const entry = DOMAIN_PLUGIN_BY_ALIAS.get(normalized);

  if (!entry) {
    return {
      success: false,
      runtime: 'HoloScriptRuntime',
      supportedPlugins: listBuiltinDomainPluginNames(),
      error: `Unsupported domain plugin: ${pluginName}`,
    };
  }

  const runtime = getBuiltinDomainPluginRuntime();
  const alreadyInstalled = installedBuiltinDomainPlugins.has(entry.pluginId);
  if (!alreadyInstalled) {
    entry.register(runtime);
    installedBuiltinDomainPlugins.add(entry.pluginId);
  }

  return {
    success: true,
    pluginId: entry.pluginId,
    packageName: entry.packageName,
    state: alreadyInstalled ? 'already_enabled' : 'enabled',
    runtime: 'HoloScriptRuntime',
    registeredTraits: entry.traits,
    alreadyInstalled,
  };
}
