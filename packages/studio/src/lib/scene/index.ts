export * from './sceneUtils';
export * from './sceneTemplates';
export * from './serializer';
// templateSearch has name collisions with sceneTemplates (SceneTemplate, searchTemplates).
// Import directly from './templateSearch' for template search-specific exports.
export {
  BUILT_IN_TEMPLATES,
  getTemplateCategories,
  sortTemplatesByName,
  findTemplateById,
  filterTemplatesByTrait,
  getTemplatesByCategory,
  type SceneTemplate as TemplateSearchSceneTemplate,
  searchTemplates as searchBuiltInTemplates,
} from './templateSearch';
