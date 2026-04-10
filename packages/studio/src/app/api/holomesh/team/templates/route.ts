import { NextRequest, NextResponse } from 'next/server';
import { listTemplates, getTemplate } from '../../../../../lib/holomesh/room-templates';

/**
 * GET /api/holomesh/team/templates
 *
 * Lists all available room templates.
 * Optional query: ?slug=<templateSlug> to retrieve a single template.
 *
 * Response:
 *   { success: true, templates: RoomTemplate[] }
 *   or
 *   { success: true, template: RoomTemplate } when ?slug= is used
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') ?? '';

  if (slug) {
    const template = getTemplate(slug);
    if (!template) {
      return NextResponse.json({ error: `Template '${slug}' not found` }, { status: 404 });
    }
    return NextResponse.json({ success: true, template });
  }

  const templates = listTemplates();
  return NextResponse.json({
    success: true,
    templates,
    count: templates.length,
  });
}
