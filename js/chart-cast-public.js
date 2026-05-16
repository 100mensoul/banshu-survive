import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function sbReady() {
  const url = window.__SB_URL;
  const key = window.__SB_ANON_KEY;
  return (
    key &&
    String(key).trim().length > 0 &&
    url &&
    String(url).trim().length > 0 &&
    !String(url).includes('あなたのプロジェクトID')
  );
}

function mapRowsToChartCast(groups, members) {
  const membersByGroup = new Map();
  for (const m of members || []) {
    if (!membersByGroup.has(m.group_code)) {
      membersByGroup.set(m.group_code, []);
    }
    membersByGroup.get(m.group_code).push({
      id: m.slug,
      name: m.name,
      reading: m.reading || '',
      role: m.role || '',
      tagline: m.tagline || '',
      photo: m.photo_url || '',
      bio: m.bio || '',
      featured: !!m.featured,
      profileHref: m.profile_href || '',
    });
  }

  return {
    groups: (groups || []).map(function (g) {
      return {
        id: g.code,
        title: g.title,
        theme: g.theme || '#4a7a9e',
        members: membersByGroup.get(g.code) || [],
      };
    }),
  };
}

function runInit(data) {
  if (typeof window.initChartPage === 'function') {
    window.initChartPage(data);
  }
}

async function loadFromSupabase() {
  const supabase = createClient(window.__SB_URL, window.__SB_ANON_KEY);

  const { data: groups, error: gErr } = await supabase
    .from('cast_chart_groups')
    .select('code,title,theme,sort_order')
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true });

  if (gErr || !groups || !groups.length) return null;

  const { data: members, error: mErr } = await supabase
    .from('cast_chart_members')
    .select(
      'slug,group_code,name,reading,role,tagline,photo_url,bio,featured,profile_href,sort_order'
    )
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('slug', { ascending: true });

  if (mErr || !members || !members.length) return null;

  return mapRowsToChartCast(groups, members);
}

if (sbReady()) {
  try {
    const fromDb = await loadFromSupabase();
    if (fromDb && fromDb.groups.length) {
      runInit(fromDb);
    } else if (window.CHART_CAST) {
      runInit(window.CHART_CAST);
    }
  } catch (_e) {
    if (window.CHART_CAST) runInit(window.CHART_CAST);
  }
} else if (window.CHART_CAST) {
  runInit(window.CHART_CAST);
}
