import { queryClient } from './queryClient'
import { createEntity } from './domainCommands'
import type { QuickCaptureCandidate } from '../utils/quickCapture'
import { validateLedgerCreate, validateNoteCreate, validateTodoCreate } from '../utils/createValidation'

export async function submitQuickCapture(
  userId: string,
  candidate: QuickCaptureCandidate,
  commandId: string,
  rawText?: string,
  candidates?: QuickCaptureCandidate[]
): Promise<{ status: 'applied' | 'queued' | 'conflict'; commandId: string; entityId: string; data: Record<string, unknown> | null }> {
  const ambiguous = candidate.confidence === 'ambiguous' || candidate.missingFields.length > 0
  if (ambiguous) {
    return createEntity(queryClient, userId, 'inbox', {
      raw_text: rawText?.trim() || (candidate.kind === 'note' ? candidate.draft.body : candidate.kind === 'todo' ? candidate.draft.text : candidate.draft.note ?? ''),
      source: 'quick_capture',
      parsed_candidates: candidates?.length ? candidates : [candidate],
      suggested_kind: candidate.kind === 'note' ? candidate.suggestedKind ?? candidate.kind : candidate.kind,
      status: 'pending'
    }, { commandId, entityId: commandId })
  }
  let result
  if (candidate.kind === 'todo') {
    result = await createEntity(queryClient, userId, 'todo', validateTodoCreate(candidate.draft), { commandId, entityId: commandId })
  } else if (candidate.kind === 'ledger') {
    const payload = validateLedgerCreate(candidate.draft)
    result = await createEntity(queryClient, userId, 'ledger', { ...payload, amount_minor: Math.round(Number(payload.amount) * 100), currency_code: 'CNY', status: 'posted' }, { commandId, entityId: commandId })
  } else {
    result = await createEntity(queryClient, userId, 'note', validateNoteCreate(candidate.draft), { commandId, entityId: commandId })
  }
  const prefixes = candidate.kind === 'todo'
    ? [['todos'], ['dashboard_summary'], ['workbench_insights'], ['focus_items']]
    : candidate.kind === 'ledger'
      ? [['ledger_entries'], ['dashboard_summary'], ['workbench_insights']]
      : [['notes'], ['dashboard_summary'], ['workbench_insights']]
  await Promise.all(prefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  return result
}
