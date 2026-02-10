import { NextResponse } from 'next/server';
import { getAllProjects } from '@/lib/jira';

export async function GET() {
  try {
    const projects = await getAllProjects();

    return NextResponse.json({
      projects: projects.map(p => ({
        id: p.id,
        key: p.key,
        name: p.name,
        type: p.projectTypeKey,
        avatar: p.avatarUrls?.['24x24']
      })),
      total: projects.length
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
