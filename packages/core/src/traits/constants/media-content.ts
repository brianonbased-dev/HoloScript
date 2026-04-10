/**
 * Media / Content Traits
 *
 * Media processing and content generation — image resize, video
 * transcode, PDF generation, and markdown rendering.
 *
 * @version 1.0.0
 */
export const MEDIA_CONTENT_TRAITS = [
  'image_resize', // Image resize / crop / convert
  'video_transcode', // Video format conversion and encoding
  'pdf_generate', // PDF document generation from templates
  'markdown_render', // Markdown to HTML rendering
] as const;

export type MediaContentTraitName = (typeof MEDIA_CONTENT_TRAITS)[number];
