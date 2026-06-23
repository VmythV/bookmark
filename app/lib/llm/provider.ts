/**
 * OpenAI-compatible LLM provider. Uses /chat/completions with response_format
 * json_schema for structured output. See docs/detailed-design.md §8.
 */
import type {
  AppConfig,
  FolderCandidate,
  PageInfo,
  SaveRecommendation,
} from '../shared/types';
import { SAVE_RESPONSE_FORMAT, FOLDER_NAME_RESPONSE_FORMAT } from './schemas';

const SYSTEM_PROMPT = `You organize browser bookmarks. Given a web page and a list of candidate folders (already pre-filtered by semantic similarity), choose the single best existing folder, OR propose creating a new folder when none fit well.

Rules:
- Prefer an existing folder when a candidate clearly fits.
- Only choose create_new when no candidate is a good home; keep new paths short (1-2 levels), reusing an existing top-level folder when sensible (e.g. "Dev/Rust").
- folderId must be one of the provided candidate ids when action is use_existing.
- Reply strictly in the required JSON shape. Be concise in "reason".`;

interface ChatChoice {
  message?: { content?: string | null; refusal?: string | null };
}
interface ChatResponse {
  choices?: ChatChoice[];
}

function endpointUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

async function chat(
  cfg: AppConfig['llm'],
  messages: Array<{ role: string; content: string }>,
  responseFormat: unknown,
): Promise<string> {
  if (!cfg.endpoint || !cfg.apiKey || !cfg.model) {
    throw new Error('LLM not configured');
  }
  const res = await fetch(endpointUrl(cfg.endpoint, '/chat/completions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      response_format: responseFormat,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as ChatResponse;
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) {
    throw new Error(`LLM refusal: ${choice.message.refusal}`);
  }
  const content = choice?.message?.content;
  if (!content) throw new Error('LLM returned empty content');
  return content;
}

function buildUserPrompt(page: PageInfo, candidates: FolderCandidate[]): string {
  const lines: string[] = [];
  lines.push('PAGE:');
  lines.push(`  title: ${page.title}`);
  lines.push(`  url: ${page.url}`);
  if (page.description) lines.push(`  description: ${page.description}`);
  if (page.selectionText)
    lines.push(`  selection: ${page.selectionText.slice(0, 300)}`);
  lines.push('');
  lines.push('CANDIDATE FOLDERS (id — path — sample titles):');
  for (const c of candidates) {
    const samples = c.sampleTitles.length
      ? ` — ${c.sampleTitles.slice(0, 4).join(', ')}`
      : '';
    lines.push(`  ${c.id} — ${c.path}${samples}`);
  }
  if (candidates.length === 0) lines.push('  (none)');
  return lines.join('\n');
}

/** Ask the LLM to choose/propose a folder for the page given the candidates. */
export async function recommendFolder(
  page: PageInfo,
  candidates: FolderCandidate[],
  cfg: AppConfig['llm'],
): Promise<SaveRecommendation> {
  const content = await chat(
    cfg,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(page, candidates) },
    ],
    SAVE_RESPONSE_FORMAT,
  );
  const parsed = JSON.parse(content) as SaveRecommendation;

  // Defensive validation: a use_existing folderId must match a candidate.
  if (parsed.action === 'use_existing') {
    const known = candidates.some((c) => c.id === parsed.folderId);
    if (!known) throw new Error('LLM returned an unknown folderId');
  }
  if (parsed.action === 'create_new' && !parsed.newFolderPath) {
    throw new Error('LLM create_new without a path');
  }
  return parsed;
}

/** Ask the LLM to name a folder for a cluster of bookmark titles (M5). */
export async function nameFolder(
  sampleTitles: string[],
  cfg: AppConfig['llm'],
): Promise<string> {
  const content = await chat(
    cfg,
    [
      {
        role: 'system',
        content:
          'You name bookmark folders. Given sample bookmark titles in a cluster, reply with one concise folder name (no path).',
      },
      { role: 'user', content: sampleTitles.slice(0, 20).join('\n') },
    ],
    FOLDER_NAME_RESPONSE_FORMAT,
  );
  const parsed = JSON.parse(content) as { folderName: string };
  return parsed.folderName;
}
