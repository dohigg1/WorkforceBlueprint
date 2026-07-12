import { validateToolCall } from './validate.js';
import type { AllowedMeasure, ToolCall } from './schema.js';

/**
 * A deterministic natural-language planner. It maps the INTENT of a question to
 * registered measure tool calls. It treats the entire input as untrusted data:
 * instructions embedded in the text (injection payloads, or instructions hidden
 * in record content passed through) are never executed; only measure intent is
 * extracted. When no registered measure answers the question, it DECLINES. It
 * never infers, never estimates and never emits structured query language.
 *
 * A production deployment may substitute a model-backed planner that is given
 * TOOL_SCHEMA; its output passes through validateToolCall exactly as this does,
 * so the safety properties are identical regardless of planner.
 */

export interface QueryPlan {
  declined: boolean;
  reason?: string;
  toolCalls: ToolCall[];
  answerTemplate?: string;
}

interface Intent {
  test: RegExp;
  measure: AllowedMeasure;
  answer: string;
}

const INTENTS: Intent[] = [
  { test: /\b(head\s?count|how many (positions|people|roles|seats)|number of (positions|roles|people))\b/i, measure: 'headcount', answer: 'The headcount is {value}.' },
  { test: /\bvacan/i, measure: 'vacancies', answer: 'There are {value} vacancies.' },
  { test: /\b(full[- ]?time equivalent|fte)\b/i, measure: 'fte', answer: 'The total full-time equivalent is {value}.' },
  { test: /\b(cost per head|cost per person|average cost)\b/i, measure: 'cost_per_head', answer: 'The cost per head is {value}.' },
  { test: /\b(cost|budget|salary bill|pay bill|wage bill)\b/i, measure: 'cost', answer: 'The fully loaded cost is {value}.' },
  { test: /\b(average span|span of control|spans)\b/i, measure: 'average_span', answer: 'The average span of control is {value}.' },
  { test: /\b(management ratio|managers? to)\b/i, measure: 'management_ratio', answer: 'The management ratio is {value}.' },
  { test: /\b(layers|how deep|depth of|levels)\b/i, measure: 'layers', answer: 'The structure has {value} layers.' },
];

export function planQuery(question: string): QueryPlan {
  const q = String(question ?? '');
  const matched = INTENTS.find((i) => i.test.test(q));
  if (!matched) {
    return {
      declined: true,
      toolCalls: [],
      reason:
        'I can only answer from the registered measures. I cannot infer or estimate, so I will not answer this from the data.',
    };
  }
  const call: ToolCall = { tool: 'evaluate_measure', measure: matched.measure, scope: 'organisation' };
  // Every produced call is validated, exactly as a model-produced call would be.
  if (!validateToolCall(call).ok) {
    return { declined: true, toolCalls: [], reason: 'The composed tool call failed validation.' };
  }
  return { declined: false, toolCalls: [call], answerTemplate: matched.answer };
}

/**
 * Render the final answer, substituting the executed measure value. Every figure
 * is traceable to a measure; the planner never fabricates numbers.
 */
export function renderAnswer(plan: QueryPlan, value: number): string {
  if (plan.declined || !plan.answerTemplate) return plan.reason ?? 'No answer.';
  return plan.answerTemplate.replace('{value}', String(value));
}
