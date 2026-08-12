import { queryClient } from './queryClient'
import { enqueueOperation } from './outbox'
import type { OperationResult } from './outbox'
import type { QuickCaptureCandidate } from '../utils/quickCapture'
import { validateLedgerCreate, validateNoteCreate, validateTodoCreate } from '../utils/createValidation'

export async function submitQuickCapture(
  userId: string,
  candidate: QuickCaptureCandidate,
  operationId: string
): Promise<OperationResult> {
  let result: OperationResult
  if (candidate.kind === 'todo') {
    result = await enqueueOperation(userId, 'todo.create', validateTodoCreate(candidate.draft), operationId)
  } else if (candidate.kind === 'ledger') {
    result = await enqueueOperation(userId, 'ledger.create', validateLedgerCreate(candidate.draft), operationId)
  } else {
    result = await enqueueOperation(userId, 'note.create', validateNoteCreate(candidate.draft), operationId)
  }
  const prefixes = candidate.kind === 'todo'
    ? [['todos'], ['dashboard_summary'], ['workbench_insights'], ['focus_items']]
    : candidate.kind === 'ledger'
      ? [['ledger_entries'], ['dashboard_summary'], ['workbench_insights']]
      : [['notes'], ['dashboard_summary'], ['workbench_insights']]
  await Promise.all(prefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  return result
}
