import { createHash } from 'node:crypto';

export const FROZEN_PROVIDER_EVALUATION_SCHEMA =
  'holoscript.agent-runtime.frozen-provider-evaluation.v2';
export const FROZEN_PROVIDER_PROMPT_SCHEMA = 'holoscript.agent-runtime.frozen-provider-prompt.v1';
export const FROZEN_PROVIDER_CONTEXT_ISOLATION_SCHEMA =
  'holoscript.agent-runtime.context-isolation.v1';

const DEFAULT_SYSTEM_PROMPT = [
  'Return exactly one valid JSON object and no other text.',
  'Do not use tools, files, repository context, web search, memory, or external sources.',
  'Answer each task independently from only the task wording.',
].join(' ');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)])
  );
}

export function stableEvaluationJson(value) {
  return JSON.stringify(stableValue(value));
}

export function evaluationSha256(value) {
  const input = typeof value === 'string' ? value : stableEvaluationJson(value);
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

function text(value) {
  return String(value ?? '').trim();
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSuite(suite) {
  if (!Array.isArray(suite) || suite.length === 0) {
    throw new Error('suite must contain at least one frozen evaluation task');
  }
  const seen = new Set();
  return suite.map((row, index) => {
    const evalId = text(row?.eval_id || row?.id);
    const instruction = text(row?.instruction || row?.task?.instruction);
    if (!evalId) throw new Error(`suite task ${index + 1} is missing eval_id`);
    if (!instruction) throw new Error(`${evalId}: instruction is required`);
    if (seen.has(evalId)) throw new Error(`duplicate suite eval_id: ${evalId}`);
    seen.add(evalId);
    return { eval_id: evalId, instruction };
  });
}

function normalizeContexts(contexts) {
  if (!Array.isArray(contexts) || contexts.length < 2) {
    throw new Error('at least two context labels are required');
  }
  const labels = contexts.map((entry) => text(entry?.id || entry));
  if (labels.some((label) => !label)) throw new Error('context labels must be non-empty');
  if (new Set(labels).size !== labels.length) throw new Error('context labels must be unique');
  return labels;
}

export function buildFrozenProviderPrompt({
  promptId,
  suite,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
} = {}) {
  const id = text(promptId);
  const frozenSystemPrompt = text(systemPrompt);
  if (!id) throw new Error('promptId is required');
  if (!frozenSystemPrompt) throw new Error('systemPrompt is required');
  const tasks = normalizeSuite(suite);
  const userPrompt = [
    'Use this exact response shape:',
    '{"responses":[{"eval_id":"...","answer":"..."}]}',
    '',
    ...tasks.flatMap((task, index) => [
      `${index + 1}. eval_id: ${task.eval_id}`,
      `Task: ${task.instruction}`,
      '',
    ]),
  ]
    .join('\n')
    .trimEnd();
  const snapshot = {
    schema: FROZEN_PROVIDER_PROMPT_SCHEMA,
    id,
    frozen: true,
    systemPrompt: frozenSystemPrompt,
    userPrompt,
    tasks,
  };
  return {
    ...snapshot,
    suiteSha256: evaluationSha256(tasks),
    templateSha256: evaluationSha256(snapshot),
  };
}

function redactExactValues(value, secretValues) {
  let output = value;
  for (const secret of secretValues) {
    const candidate = String(secret || '');
    if (candidate.length >= 8) output = output.split(candidate).join('[REDACTED_SECRET]');
  }
  return output;
}

export function redactEvaluationText(value, { secretValues = [] } = {}) {
  const source = String(value ?? '');
  const redacted = redactExactValues(source, secretValues)
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '[REDACTED_DATABASE_URL]')
    .replace(/(authorization:\s*bearer\s+)[^\s"']+/giu, '$1[REDACTED_SECRET]')
    .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9._-]{12,}\b/giu, '[REDACTED_SECRET]')
    .replace(/\bAIza[0-9A-Za-z_-]{30,}\b/gu, '[REDACTED_SECRET]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/gu, '[REDACTED_SECRET]')
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu,
      '[REDACTED_PRIVATE_KEY]'
    );
  return {
    text: redacted,
    secretLeakDetected: redacted !== source,
  };
}

function redactValue(value, options) {
  if (typeof value === 'string') {
    const result = redactEvaluationText(value, options);
    return { value: result.text, secretLeakDetected: result.secretLeakDetected };
  }
  if (Array.isArray(value)) {
    const children = value.map((child) => redactValue(child, options));
    return {
      value: children.map((child) => child.value),
      secretLeakDetected: children.some((child) => child.secretLeakDetected),
    };
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, child]) => [key, redactValue(child, options)]);
    return {
      value: Object.fromEntries(entries.map(([key, child]) => [key, child.value])),
      secretLeakDetected: entries.some(([, child]) => child.secretLeakDetected),
    };
  }
  return { value, secretLeakDetected: false };
}

function strictResponses(content, expectedIds) {
  const normalized = String(content)
    .trim()
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  const parsed = JSON.parse(normalized);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.responses)) {
    throw new Error('provider response must contain a responses array');
  }
  const responses = parsed.responses.map((row, index) => ({
    eval_id: text(row?.eval_id),
    answer: text(row?.answer),
    index,
  }));
  const ids = responses.map((row) => row.eval_id);
  const duplicates = ids.filter((id, index) => id && ids.indexOf(id) !== index);
  const missing = expectedIds.filter((id) => !ids.includes(id));
  const unknown = ids.filter((id) => id && !expectedIds.includes(id));
  if (responses.some((row) => !row.eval_id || !row.answer)) {
    throw new Error('every response requires eval_id and answer');
  }
  if (duplicates.length) {
    throw new Error(`duplicate response eval_id: ${[...new Set(duplicates)].join(', ')}`);
  }
  if (missing.length) throw new Error(`missing response eval_id: ${missing.join(', ')}`);
  if (unknown.length) {
    throw new Error(`unknown response eval_id: ${[...new Set(unknown)].join(', ')}`);
  }
  return responses.map(({ eval_id, answer }) => ({ eval_id, answer }));
}

function usageEvidence(usage) {
  const explicitlyUnreported = usage?.reported === false;
  const promptTokens = finiteOrNull(usage?.promptTokens);
  const completionTokens = finiteOrNull(usage?.completionTokens);
  const totalTokens = finiteOrNull(usage?.totalTokens);
  const reported =
    !explicitlyUnreported &&
    [promptTokens, completionTokens, totalTokens].some((value) => value !== null);
  return {
    reported,
    promptTokens: reported ? promptTokens : null,
    completionTokens: reported ? completionTokens : null,
    totalTokens: reported ? totalTokens : null,
  };
}

function safeError(error, options) {
  return redactEvaluationText(error?.message || error || 'unknown error', options).text.slice(
    0,
    1_000
  );
}

function unverifiedContextIsolation(contextLabel) {
  return {
    schema: FROZEN_PROVIDER_CONTEXT_ISOLATION_SCHEMA,
    contextLabel,
    status: 'unverified',
    mode: null,
    isolationIdSha256: null,
    priorMessageCount: null,
    attestedBy: null,
    evidenceSha256: null,
    reason: 'createContext adapter not supplied',
  };
}

function normalizeContextIsolation(contextLabel, isolation, redactionOptions) {
  if (!isolation || typeof isolation !== 'object' || Array.isArray(isolation)) {
    throw new Error(`${contextLabel}: createContext isolation evidence is required`);
  }
  if (isolation.schema !== FROZEN_PROVIDER_CONTEXT_ISOLATION_SCHEMA) {
    throw new Error(
      `${contextLabel}: isolation schema must be ${FROZEN_PROVIDER_CONTEXT_ISOLATION_SCHEMA}`
    );
  }
  const mode = text(isolation.mode);
  if (!['stateless-request', 'fresh-session'].includes(mode)) {
    throw new Error(`${contextLabel}: isolation mode must be stateless-request or fresh-session`);
  }
  const isolationId = text(isolation.isolationId);
  if (!isolationId) throw new Error(`${contextLabel}: isolationId is required`);
  if (Number(isolation.priorMessageCount) !== 0) {
    throw new Error(`${contextLabel}: priorMessageCount must be 0`);
  }
  const attestedBy = redactEvaluationText(text(isolation.attestedBy), redactionOptions);
  if (!attestedBy.text) throw new Error(`${contextLabel}: attestedBy is required`);
  if (attestedBy.secretLeakDetected) {
    throw new Error(`${contextLabel}: attestedBy contains secret-like material`);
  }

  const evidence = {
    schema: FROZEN_PROVIDER_CONTEXT_ISOLATION_SCHEMA,
    contextLabel,
    status: 'attested',
    mode,
    isolationIdSha256: evaluationSha256(isolationId),
    priorMessageCount: 0,
    attestedBy: attestedBy.text,
  };
  return {
    ...evidence,
    evidenceSha256: evaluationSha256(evidence),
    reason: null,
  };
}

async function prepareContextExecutions({
  contextLabels,
  createContext,
  evaluationId,
  provider,
  model,
  redactionOptions,
}) {
  if (typeof createContext !== 'function') {
    return contextLabels.map((contextLabel) => ({
      contextLabel,
      complete: provider.complete.bind(provider),
      isolation: unverifiedContextIsolation(contextLabel),
    }));
  }

  const prepared = [];
  for (const [index, contextLabel] of contextLabels.entries()) {
    let context;
    try {
      context = await createContext({
        evaluationId,
        contextLabel,
        index,
        provider,
        model,
      });
    } catch (error) {
      throw new Error(
        `${contextLabel}: createContext failed: ${safeError(error, redactionOptions)}`
      );
    }
    if (typeof context?.complete !== 'function') {
      throw new Error(`${contextLabel}: createContext.complete is required`);
    }
    prepared.push({
      contextLabel,
      complete: context.complete,
      isolation: normalizeContextIsolation(contextLabel, context.isolation, redactionOptions),
    });
  }

  const isolationIds = prepared.map((context) => context.isolation.isolationIdSha256);
  if (new Set(isolationIds).size !== isolationIds.length) {
    throw new Error('createContext isolationId values must be unique across contexts');
  }
  return prepared;
}

async function runIndependentContext({
  contextLabel,
  complete,
  isolation,
  providerName,
  model,
  prompt,
  verifier,
  maxTokens,
  timeoutMs,
  requestOptions,
  redactionOptions,
}) {
  const controller = new AbortController();
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error('provider evaluation timed out');
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  const startedAt = Date.now();
  let response;
  let providerError = null;
  try {
    response = await Promise.race([
      complete(
        {
          ...requestOptions,
          messages: [
            { role: 'system', content: prompt.systemPrompt },
            { role: 'user', content: prompt.userPrompt },
          ],
          tools: [],
          toolChoice: 'none',
          maxTokens,
        },
        model,
        { signal: controller.signal }
      ),
      timeoutPromise,
    ]);
  } catch (error) {
    providerError = safeError(error, redactionOptions);
  } finally {
    clearTimeout(timeout);
  }

  const rawContent = text(response?.content);
  const redactedContent = redactEvaluationText(rawContent, redactionOptions);
  const toolUses = Array.isArray(response?.toolUses) ? response.toolUses : [];
  let responses = null;
  let parseError = null;
  if (!providerError) {
    try {
      responses = strictResponses(
        redactedContent.text,
        prompt.tasks.map((task) => task.eval_id)
      );
    } catch (error) {
      parseError = safeError(error, redactionOptions);
    }
  }

  let verification = {
    status: 'not-run',
    ok: false,
    result: null,
    resultSha256: null,
    error: null,
  };
  if (
    responses &&
    toolUses.length === 0 &&
    !redactedContent.secretLeakDetected &&
    typeof verifier === 'function'
  ) {
    try {
      const rawResult = await verifier({
        contextLabel,
        prompt,
        suite: prompt.tasks,
        responses,
      });
      const result = redactValue(rawResult, redactionOptions);
      verification = {
        status: 'completed',
        ok: rawResult?.ok === true && !result.secretLeakDetected,
        result: result.value,
        resultSha256: evaluationSha256(result.value),
        error: null,
        secretLeakDetected: result.secretLeakDetected,
      };
    } catch (error) {
      verification = {
        status: 'failed',
        ok: false,
        result: null,
        resultSha256: null,
        error: safeError(error, redactionOptions),
        secretLeakDetected: false,
      };
    }
  }

  const reportedProvider = redactEvaluationText(response?.provider, redactionOptions);
  const reportedModel = redactEvaluationText(response?.reportedModel, redactionOptions);
  const compatibilityModel = redactEvaluationText(response?.model, redactionOptions);
  const finishReason = redactEvaluationText(response?.finishReason, redactionOptions);
  const requestId = text(response?.requestId);
  const metadataSecretLeakDetected = [
    reportedProvider,
    reportedModel,
    compatibilityModel,
    finishReason,
  ].some((entry) => entry.secretLeakDetected);
  const secretLeakDetected =
    redactedContent.secretLeakDetected ||
    metadataSecretLeakDetected ||
    verification.secretLeakDetected === true;

  return {
    contextLabel,
    independent: isolation.status === 'attested',
    isolation,
    ok:
      !providerError &&
      !parseError &&
      toolUses.length === 0 &&
      !secretLeakDetected &&
      verification.ok,
    durationMs: Date.now() - startedAt,
    provider: {
      requestedProvider: providerName,
      requestedModel: model,
      reportedProvider: reportedProvider.text || null,
      reportedModel: reportedModel.text || null,
      compatibilityModel: compatibilityModel.text || null,
      finishReason: finishReason.text || null,
      requestIdSha256: requestId ? evaluationSha256(requestId) : null,
      usage: usageEvidence(response?.usage),
    },
    generation: {
      responseSha256: rawContent ? evaluationSha256(rawContent) : null,
      response: redactedContent.text || null,
      parsedResponses: responses,
      parseError,
      providerError,
      toolUseCount: toolUses.length,
      noToolsObserved: toolUses.length === 0,
      secretLeakDetected: redactedContent.secretLeakDetected,
    },
    verification,
    secretLeakDetected,
  };
}

export async function runFrozenProviderEvaluation({
  evaluationId,
  promptId,
  suite,
  provider,
  providerName = provider?.name || 'unknown',
  model,
  createContext = null,
  verifier,
  verifierId = 'caller-local-verifier',
  absorb = null,
  absorptionId = 'caller-owned-absorption',
  contexts = ['context-a', 'context-b'],
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  maxTokens = 1_200,
  timeoutMs = 60_000,
  requestOptions = {},
  providerOnlyClaims = [],
  secretValues = [],
  now = () => new Date(),
} = {}) {
  const id = text(evaluationId);
  const requestedModel = text(model);
  if (!id) throw new Error('evaluationId is required');
  if (!provider || typeof provider.complete !== 'function') {
    throw new Error('provider.complete is required');
  }
  if (!requestedModel) throw new Error('model is required');
  if (typeof verifier !== 'function') throw new Error('a disjoint local verifier is required');
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) throw new Error('maxTokens must be positive');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive');

  const contextLabels = normalizeContexts(contexts);
  const prompt = buildFrozenProviderPrompt({ promptId, suite, systemPrompt });
  const redactionOptions = { secretValues };
  const contextExecutions = await prepareContextExecutions({
    contextLabels,
    createContext,
    evaluationId: id,
    provider,
    model: requestedModel,
    redactionOptions,
  });
  const captures = [];
  for (const context of contextExecutions) {
    captures.push(
      await runIndependentContext({
        contextLabel: context.contextLabel,
        complete: context.complete,
        isolation: context.isolation,
        providerName: text(providerName) || 'unknown',
        model: requestedModel,
        prompt,
        verifier,
        maxTokens,
        timeoutMs,
        requestOptions,
        redactionOptions,
      })
    );
  }

  const verificationStates = captures.map((capture) => capture.verification.ok);
  const responseHashes = captures
    .map((capture) => capture.generation.responseSha256)
    .filter(Boolean);
  const independentCaptures = captures.filter((capture) => capture.independent);
  const isolationEvidenceHashes = independentCaptures
    .map((capture) => capture.isolation.evidenceSha256)
    .filter(Boolean);
  const isolationIdHashes = independentCaptures
    .map((capture) => capture.isolation.isolationIdSha256)
    .filter(Boolean);
  const crossContextInstrumented =
    captures.length >= 2 &&
    independentCaptures.length === captures.length &&
    new Set(isolationIdHashes).size === captures.length;
  const boundary = {
    frozenPrompt: true,
    captureCount: captures.length,
    independentContextCount: independentCaptures.length,
    crossContextInstrumented,
    contextIsolationStatus: crossContextInstrumented ? 'attested' : 'unverified',
    contextIsolationEvidenceSha256s: isolationEvidenceHashes,
    distinctResponseCount: new Set(responseHashes).size,
    responseSha256s: responseHashes,
    localAcceptanceStable: new Set(verificationStates).size === 1,
    allLocallyAccepted: captures.every((capture) => capture.ok),
    retrievalClaimed: false,
    generationObserved: captures.some((capture) => Boolean(capture.generation.responseSha256)),
    rule: 'Context labels and response diversity are not isolation proof. Provider generation, caller-attested context isolation, local acceptance, durable absorption, and provider-only UI behavior are separate evidence states.',
  };
  const absorptionInput = {
    evaluationId: id,
    promptId: prompt.id,
    promptTemplateSha256: prompt.templateSha256,
    suiteSha256: prompt.suiteSha256,
    responseSha256s: responseHashes,
    verificationSha256s: captures
      .map((capture) => capture.verification.resultSha256)
      .filter(Boolean),
    boundary,
  };
  let absorption = {
    id: absorptionId,
    configured: typeof absorb === 'function',
    status: 'not-configured',
    ok: false,
    inputSha256: evaluationSha256(absorptionInput),
    result: null,
    resultSha256: null,
    error: null,
    secretLeakDetected: false,
  };
  if (typeof absorb === 'function') {
    try {
      const rawResult = await absorb(absorptionInput);
      const result = redactValue(rawResult, redactionOptions);
      absorption = {
        ...absorption,
        status: rawResult?.ok === true && !result.secretLeakDetected ? 'absorbed' : 'rejected',
        ok: rawResult?.ok === true && !result.secretLeakDetected,
        result: result.value,
        resultSha256: evaluationSha256(result.value),
        secretLeakDetected: result.secretLeakDetected,
      };
    } catch (error) {
      absorption = {
        ...absorption,
        status: 'failed',
        error: safeError(error, redactionOptions),
        secretLeakDetected: false,
      };
    }
  }

  const redactedProviderOnlyClaims = providerOnlyClaims.map((claim) =>
    redactEvaluationText(text(claim), redactionOptions)
  );
  const secretLeakDetected =
    captures.some((capture) => capture.secretLeakDetected) ||
    absorption.secretLeakDetected ||
    redactedProviderOnlyClaims.some((claim) => claim.secretLeakDetected);
  const locallyAccepted = boundary.allLocallyAccepted && !secretLeakDetected;
  const admissible = !secretLeakDetected && boundary.crossContextInstrumented;
  const ready = locallyAccepted && absorption.ok && admissible;
  const receipt = {
    schema: FROZEN_PROVIDER_EVALUATION_SCHEMA,
    generatedAt: now().toISOString(),
    evaluationId: id,
    status: !locallyAccepted
      ? 'rejected'
      : !boundary.crossContextInstrumented
        ? 'context-isolation-unverified'
        : ready
          ? 'accepted-and-absorbed'
          : 'accepted-not-absorbed',
    ok: ready,
    admissible,
    prompt: {
      schema: prompt.schema,
      id: prompt.id,
      frozen: prompt.frozen,
      taskCount: prompt.tasks.length,
      suiteSha256: prompt.suiteSha256,
      templateSha256: prompt.templateSha256,
    },
    capturePolicy: {
      toolsAllowed: false,
      repositoryContextAllowed: false,
      memoryAllowed: false,
      externalSourcesAllowed: false,
      maxTokens,
      timeoutMs,
      contextFactoryConfigured: typeof createContext === 'function',
      contextIsolationRequiredForAdmission: true,
    },
    verifier: {
      id: verifierId,
      disjointFromProvider: true,
      local: true,
    },
    captures,
    boundary,
    absorption,
    providerOnlyBehavior: {
      measured: false,
      claims: redactedProviderOnlyClaims.map((claim) => ({
        claim: claim.text,
        status: 'unverified',
      })),
      rule: 'UI latency, IDE context flow, managed-agent behavior, browser behavior, and provider custody require separate native-surface receipts.',
    },
    secretLeakDetected,
    nonClaims: [
      'This evaluates one frozen task suite and does not rank providers or establish general model capability.',
      'Distinct context labels or response hashes do not prove independent provider sessions.',
      'Context isolation is caller-attested through createContext; it is not a provider signature.',
      'A provider response is generation evidence, not durable memory or retrieval evidence.',
      'Local acceptance does not prove provider-only UI, IDE, browser, latency, or managed-agent behavior.',
      'Durable absorption requires an explicit caller-owned adapter result.',
    ],
  };
  receipt.receiptSha256 = evaluationSha256(receipt);
  return receipt;
}
