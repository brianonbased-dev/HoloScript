import { createHash, randomUUID } from 'node:crypto';

export const SECOND_BRAIN_RUNTIME_SCHEMA = 'holoscript.agent-runtime.second-brain.v1';
export const SECOND_BRAIN_TURN_RECEIPT_SCHEMA = 'holoscript.agent-runtime.turn-receipt.v1';
export const SECOND_BRAIN_LOOP_RECEIPT_SCHEMA = 'holoscript.agent-runtime.loop-receipt.v1';
export const DECISION_NETWORK_SCHEMA = 'holoscript.agent-runtime.decision-network.v1';

const SECRET_KEY_RE =
  /(?:api.?key|authorization|bearer|credential|password|private.?key|secret|token)/iu;
const SECRET_VALUE_RE =
  /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9._-]{12,}|\bAIza[0-9A-Za-z_-]{30,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}|\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s]+)/iu;
const NON_SECRET_TOKEN_COUNTER_KEY_RE =
  /^(?:prompt|completion|input|output|total|max|cached)[_-]?tokens?$/iu;

function isSecretKey(key, value) {
  const numericCounter =
    NON_SECRET_TOKEN_COUNTER_KEY_RE.test(key) &&
    (value === null || (typeof value === 'number' && Number.isFinite(value)));
  return SECRET_KEY_RE.test(key) && !numericCounter;
}

function cleanText(value, fallback = null) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function errorMessage(error) {
  return cleanText(error?.message ?? error, 'unknown error');
}

function sha256Text(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, 200);
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sanitizeValue(value, { maxDepth, maxArray, maxString }, depth, seen) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (SECRET_VALUE_RE.test(value)) return '<redacted>';
    return value.length > maxString ? `${value.slice(0, maxString)}...` : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (depth >= maxDepth) return '<max-depth>';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '<circular>';
  seen.add(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, maxArray)
      .map((item) => sanitizeValue(item, { maxDepth, maxArray, maxString }, depth + 1, seen));
  }
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key, child)) {
      output[key] = '<redacted>';
      continue;
    }
    const sanitized = sanitizeValue(child, { maxDepth, maxArray, maxString }, depth + 1, seen);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

export function redactRuntimeValue(value, options = {}) {
  const limits = {
    maxDepth: boundedInt(options.maxDepth, 8, 1, 20),
    maxArray: boundedInt(options.maxArray, 50, 1, 500),
    maxString: boundedInt(options.maxString, 1000, 32, 20_000),
  };
  return sanitizeValue(value, limits, 0, new WeakSet());
}

function normalizeProfile(input = {}) {
  const agentId = cleanText(input.agentId ?? input.handle);
  if (!agentId) throw new Error('profile.agentId is required');
  return {
    agentId,
    family: cleanText(input.family, 'other'),
    surface: cleanText(input.surface, 'agent'),
    runtimePackage: cleanText(input.runtimePackage),
    model: cleanText(input.model),
    node: {
      profile: cleanText(input.node?.profile ?? input.nodeProfile, 'operator-supplied'),
      custody: cleanText(input.node?.custody ?? input.custody, 'caller-owned'),
    },
    metadata: redactRuntimeValue(input.metadata ?? {}),
  };
}

function normalizeIntent(input) {
  if (typeof input === 'string') {
    const summary = cleanText(input);
    if (!summary) throw new Error('intent summary is required');
    return { id: null, summary, constraints: [], metadata: {} };
  }
  const source = input && typeof input === 'object' ? input : {};
  const summary = cleanText(source.summary ?? source.objective ?? source.intent);
  if (!summary) throw new Error('intent.summary is required');
  return {
    id: cleanText(source.id),
    summary,
    constraints: Array.isArray(source.constraints)
      ? source.constraints.map((item) => cleanText(item)).filter(Boolean)
      : [],
    metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
  };
}

function normalizePlan(input, idFactory) {
  if (!input || typeof input !== 'object') throw new Error('planner.plan must return an object');
  if (!Array.isArray(input.actions)) throw new Error('planner.plan must return an actions array');
  return {
    summary: cleanText(input.summary, 'Plan supplied by caller adapter'),
    rationale: cleanText(input.rationale),
    metadata: input.metadata ?? {},
    actions: input.actions.map((action, index) => {
      if (!action || typeof action !== 'object')
        throw new Error(`plan action ${index} must be an object`);
      const type = cleanText(action.type ?? action.tool);
      if (!type) throw new Error(`plan action ${index} requires type or tool`);
      return {
        id: cleanText(action.id, idFactory('action')),
        type,
        summary: cleanText(action.summary, type),
        risk: cleanText(action.risk, 'unspecified'),
        input: action.input ?? {},
        metadata: action.metadata ?? {},
      };
    }),
  };
}

function publicPlannerMetadata(value) {
  const source = record(value);
  const prompt = record(source.prompt);
  const provider = record(source.provider);
  const usage = record(source.usage);
  const timing = record(source.timing);
  const bounds = record(source.bounds);
  const grounding = record(source.grounding);
  const generation = record(source.generation);
  return {
    schema: cleanText(source.schema),
    prompt: {
      id: cleanText(prompt.id),
      templateSha256: cleanText(prompt.templateSha256),
      contextSha256: cleanText(prompt.contextSha256),
      requestSha256: cleanText(prompt.requestSha256),
      frozen: prompt.frozen === true,
    },
    provider: {
      requestedName: cleanText(provider.requestedName),
      reportedName: cleanText(provider.reportedName),
      name: cleanText(provider.name),
      requestedModel: cleanText(provider.requestedModel),
      reportedModel: cleanText(provider.reportedModel),
      model: cleanText(provider.model),
      finishReason: cleanText(provider.finishReason),
      nativeToolCall: provider.nativeToolCall === true,
      requestIdSha256: cleanText(provider.requestIdSha256),
    },
    usage: {
      reported: usage.reported === true,
      promptTokens: finiteNumberOrNull(usage.promptTokens),
      completionTokens: finiteNumberOrNull(usage.completionTokens),
      totalTokens: finiteNumberOrNull(usage.totalTokens),
    },
    timing: {
      elapsedMs: finiteNumberOrNull(timing.elapsedMs),
      timeoutMs: finiteNumberOrNull(timing.timeoutMs),
    },
    bounds: {
      maxActions: finiteNumberOrNull(bounds.maxActions),
      maxTokens: finiteNumberOrNull(bounds.maxTokens),
    },
    grounding: {
      suppliedMemoryIds: stringList(grounding.suppliedMemoryIds),
      citedMemoryIds: stringList(grounding.citedMemoryIds),
      suppliedKnowledgeIds: stringList(grounding.suppliedKnowledgeIds),
      citedKnowledgeIds: stringList(grounding.citedKnowledgeIds),
    },
    generation: {
      toolUseCount: finiteNumberOrNull(generation.toolUseCount),
      actionStructuralSha256: cleanText(generation.actionStructuralSha256),
      actionContractSha256: cleanText(generation.actionContractSha256),
      responseTextPresent: generation.responseTextPresent === true,
    },
  };
}

function publicAction(action) {
  const metadata = record(action.metadata);
  return {
    id: action.id,
    type: action.type,
    summary: action.summary,
    risk: action.risk,
    metadata: Object.fromEntries(
      Object.keys(metadata)
        .filter((key) => !isSecretKey(key, metadata[key]))
        .slice(0, 50)
        .map((key) => [key, '<omitted>'])
    ),
    inputKeys:
      action.input && typeof action.input === 'object' && !Array.isArray(action.input)
        ? Object.keys(action.input)
            .filter((key) => !isSecretKey(key, action.input[key]))
            .sort()
        : [],
  };
}

function normalizeAuthorization(value) {
  if (typeof value === 'boolean') return { allowed: value, reason: null, evidence: null };
  if (!value || typeof value !== 'object') {
    throw new Error('authority.authorize must return a boolean or { allowed }');
  }
  return {
    allowed: value.allowed === true,
    reason: cleanText(value.reason),
    evidence: redactRuntimeValue(value.evidence ?? value.receipt ?? null),
  };
}

function normalizeVerification(value) {
  if (typeof value === 'boolean') return { ok: value, summary: null, evidence: null };
  if (!value || typeof value !== 'object') {
    throw new Error('verifier.verify must return a boolean or { ok }');
  }
  return {
    ok: value.ok === true,
    summary: cleanText(value.summary),
    evidence: redactRuntimeValue(value.evidence ?? value.receipt ?? null),
  };
}

function publicMemoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return redactRuntimeValue(entry);
  return {
    id: cleanText(entry.id),
    authorAgent: cleanText(entry.authorAgent ?? entry.author_agent),
    section: cleanText(entry.section),
    type: cleanText(entry.type),
    domain: cleanText(entry.domain),
    tags: Array.isArray(entry.tags) ? redactRuntimeValue(entry.tags) : [],
    content: cleanText(redactRuntimeValue(entry.content))?.slice(0, 300) ?? null,
    createdAt: cleanText(entry.createdAt ?? entry.created_at),
  };
}

function assertMethod(adapter, method, label) {
  if (!adapter || typeof adapter[method] !== 'function') {
    throw new Error(`${label}.${method} adapter is required`);
  }
}

function validateOptionalAdapter(adapter, method, label) {
  if (adapter != null && typeof adapter[method] !== 'function') {
    throw new Error(`${label}.${method} must be a function when ${label} is supplied`);
  }
}

function adapterCapabilities(adapters) {
  return {
    memory: true,
    planner: true,
    authority: true,
    executor: true,
    verifier: true,
    receipts: true,
    knowledge: Boolean(adapters.knowledge),
    telemetry: Boolean(adapters.telemetry),
    recovery: Boolean(adapters.recovery),
    nextWork: Boolean(adapters.nextWork),
  };
}

function extractNextIntent(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.length ? extractNextIntent(value[0]) : null;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return null;
  if (Array.isArray(value.items))
    return value.items.length ? extractNextIntent(value.items[0]) : null;
  if (value.intent) return value.intent;
  if (value.summary || value.objective) return value;
  return null;
}

export function createSecondBrainRuntime({
  profile: profileInput,
  adapters,
  limits: limitInput = {},
  clock = () => new Date().toISOString(),
  idFactory = (prefix) => `${prefix}-${randomUUID()}`,
} = {}) {
  if (!adapters || typeof adapters !== 'object') throw new Error('adapters are required');
  assertMethod(adapters.memory, 'recall', 'memory');
  assertMethod(adapters.memory, 'store', 'memory');
  assertMethod(adapters.planner, 'plan', 'planner');
  assertMethod(adapters.authority, 'authorize', 'authority');
  assertMethod(adapters.executor, 'execute', 'executor');
  assertMethod(adapters.verifier, 'verify', 'verifier');
  assertMethod(adapters.receipts, 'write', 'receipts');
  validateOptionalAdapter(adapters.knowledge, 'search', 'knowledge');
  if (adapters.knowledge) validateOptionalAdapter(adapters.knowledge, 'publish', 'knowledge');
  validateOptionalAdapter(adapters.telemetry, 'emit', 'telemetry');
  validateOptionalAdapter(adapters.recovery, 'recover', 'recovery');
  validateOptionalAdapter(adapters.nextWork, 'farm', 'nextWork');

  const profile = normalizeProfile(profileInput);
  const limits = {
    maxActions: boundedInt(limitInput.maxActions, 8, 1, 64),
    maxTurns: boundedInt(limitInput.maxTurns, 4, 1, 32),
    recallLimit: boundedInt(limitInput.recallLimit, 12, 1, 200),
  };
  const capabilities = adapterCapabilities(adapters);

  async function runTurn({
    intent: intentInput,
    context = {},
    signal,
    runId: suppliedRunId,
    maxActions,
  } = {}) {
    const intent = normalizeIntent(intentInput);
    const runId = cleanText(suppliedRunId, idFactory('run'));
    const turnId = idFactory('turn');
    const startedAt = clock();
    const actionLimit = boundedInt(maxActions, limits.maxActions, 1, limits.maxActions);
    const nodes = [];
    const edges = [];
    const warnings = [];
    const decisions = [];
    const actionRecords = [];
    let previousNodeId = null;
    let status = 'running';
    let stopReason = null;
    let stage = 'intent';
    let recalledMemory = [];
    let recalledKnowledge = [];
    let plan = null;
    let recovery = null;
    let nextWork = null;
    let storedMemoryId = null;
    let storedMemoryContentSha256 = null;
    let knowledgePublished = false;

    async function addNode(kind, nodeStatus, data = {}) {
      const node = {
        id: idFactory('node'),
        kind,
        status: nodeStatus,
        at: clock(),
        data: redactRuntimeValue(data),
      };
      nodes.push(node);
      if (previousNodeId) edges.push({ from: previousNodeId, to: node.id, relation: 'then' });
      previousNodeId = node.id;
      if (adapters.telemetry) {
        try {
          await adapters.telemetry.emit({
            schema: 'holoscript.agent-runtime.telemetry-event.v1',
            runId,
            turnId,
            profile: redactRuntimeValue(profile),
            node,
          });
        } catch (error) {
          warnings.push({
            kind: 'telemetry-emit-failed',
            stage: kind,
            message: errorMessage(error),
          });
        }
      }
      return node;
    }

    async function recoverFrom(reason, error, action = null, result = null) {
      if (!adapters.recovery) return null;
      try {
        const recovered = await adapters.recovery.recover({
          reason,
          error,
          action,
          result,
          intent,
          profile,
          context,
        });
        await addNode('recovery', 'completed', { reason, recovery: recovered });
        return redactRuntimeValue(recovered);
      } catch (recoveryError) {
        warnings.push({ kind: 'recovery-failed', message: errorMessage(recoveryError) });
        await addNode('recovery', 'failed', { reason, error: errorMessage(recoveryError) });
        return null;
      }
    }

    await addNode('intent', 'completed', {
      summary: intent.summary,
      constraints: intent.constraints,
    });

    try {
      if (signal?.aborted) {
        status = 'stopped';
        stopReason = 'aborted';
        await addNode('stop', 'completed', { reason: stopReason });
      }

      if (status === 'running') {
        stage = 'memory-recall';
        const memoryResult = await adapters.memory.recall(intent.summary, {
          limit: limits.recallLimit,
        });
        recalledMemory = Array.isArray(memoryResult) ? memoryResult : [];
        await addNode('memory-recall', 'completed', {
          count: recalledMemory.length,
          entries: recalledMemory.map(publicMemoryEntry),
        });

        stage = 'knowledge-recall';
        if (adapters.knowledge) {
          const knowledgeResult = await adapters.knowledge.search(intent.summary, {
            limit: limits.recallLimit,
          });
          recalledKnowledge = Array.isArray(knowledgeResult) ? knowledgeResult : [];
          await addNode('knowledge-recall', 'completed', {
            count: recalledKnowledge.length,
            entries: redactRuntimeValue(recalledKnowledge),
          });
        } else {
          await addNode('knowledge-recall', 'skipped', { reason: 'adapter-not-supplied' });
        }

        stage = 'plan';
        plan = normalizePlan(
          await adapters.planner.plan({
            intent,
            context,
            memory: recalledMemory,
            knowledge: recalledKnowledge,
            profile,
            limits,
            signal,
          }),
          idFactory
        );
        if (plan.actions.length > actionLimit) {
          status = 'blocked';
          stopReason = 'action-limit-exceeded';
          await addNode('plan', 'blocked', {
            summary: plan.summary,
            rationale: plan.rationale,
            metadata: publicPlannerMetadata(plan.metadata),
            actionCount: plan.actions.length,
            actionLimit,
          });
        } else {
          await addNode('plan', 'completed', {
            summary: plan.summary,
            rationale: plan.rationale,
            metadata: publicPlannerMetadata(plan.metadata),
            actions: plan.actions.map(publicAction),
          });
        }
      }

      if (status === 'running') {
        for (const action of plan.actions) {
          if (signal?.aborted) {
            status = 'stopped';
            stopReason = 'aborted';
            await addNode('stop', 'completed', {
              reason: stopReason,
              action: publicAction(action),
            });
            break;
          }

          stage = `authority:${action.id}`;
          const authorization = normalizeAuthorization(
            await adapters.authority.authorize({
              intent,
              action,
              profile,
              context,
              priorResults: actionRecords,
            })
          );
          decisions.push({ kind: 'authority', actionId: action.id, ...authorization });
          await addNode('authority', authorization.allowed ? 'completed' : 'blocked', {
            action: publicAction(action),
            ...authorization,
          });
          if (!authorization.allowed) {
            status = 'blocked';
            stopReason = 'authority-denied';
            actionRecords.push({ action: publicAction(action), authorization, status: 'blocked' });
            break;
          }

          stage = `act:${action.id}`;
          const result = await adapters.executor.execute({ intent, action, profile, context });
          await addNode('act', 'completed', {
            action: publicAction(action),
            resultSummary: cleanText(result?.summary),
          });

          stage = `verify:${action.id}`;
          const verification = normalizeVerification(
            await adapters.verifier.verify({
              intent,
              action,
              result,
              profile,
              context,
            })
          );
          decisions.push({ kind: 'verification', actionId: action.id, ...verification });
          actionRecords.push({
            action: publicAction(action),
            authorization,
            verification,
            status: verification.ok ? 'verified' : 'failed',
          });
          await addNode('verify', verification.ok ? 'completed' : 'failed', {
            action: publicAction(action),
            ...verification,
          });
          if (!verification.ok) {
            status = 'failed';
            stopReason = 'verification-failed';
            recovery = await recoverFrom(
              stopReason,
              new Error(verification.summary || stopReason),
              action,
              result
            );
            break;
          }
        }
      }
    } catch (error) {
      status = 'failed';
      stopReason = `${stage}-failed`;
      await addNode('failure', 'failed', {
        stage,
        error: errorMessage(error),
        errorName: cleanText(error?.name),
        errorCode: cleanText(error?.code),
      });
      recovery = await recoverFrom(stopReason, error);
    }

    if (status === 'running') status = 'completed';

    const turnSummary = {
      schema: 'holoscript.agent-runtime.memory-summary.v1',
      runId,
      turnId,
      agentId: profile.agentId,
      family: profile.family,
      intent: intent.summary,
      plan: plan?.summary ?? null,
      plannerEvidence: plan ? publicPlannerMetadata(plan.metadata) : null,
      status,
      stopReason,
      actions: actionRecords,
      recovery,
    };

    stage = 'remember';
    try {
      const memoryContent = JSON.stringify(redactRuntimeValue(turnSummary));
      const memoryContentSha256 = sha256Text(memoryContent);
      storedMemoryId = await adapters.memory.store({
        authorAgent: profile.agentId,
        section: status === 'completed' ? 'D' : 'G',
        type: status === 'completed' ? 'pattern' : 'gotcha',
        domain: 'agent-runtime',
        tags: ['agent-runtime', 'second-brain', profile.family, status],
        confidence: status === 'completed' ? 0.85 : 0.7,
        provenanceHash: memoryContentSha256,
        content: memoryContent,
      });
      storedMemoryContentSha256 = memoryContentSha256;
      await addNode('remember', 'completed', {
        storedMemoryId: cleanText(storedMemoryId),
        contentSha256: storedMemoryContentSha256,
      });
    } catch (error) {
      status = 'failed';
      stopReason = 'memory-store-failed';
      warnings.push({ kind: stopReason, message: errorMessage(error) });
      await addNode('remember', 'failed', { error: errorMessage(error) });
      recovery = recovery ?? (await recoverFrom(stopReason, error));
    }

    turnSummary.status = status;
    turnSummary.stopReason = stopReason;
    turnSummary.recovery = recovery;
    stage = 'knowledge-publish';
    if (adapters.knowledge) {
      try {
        await adapters.knowledge.publish({
          type: status === 'completed' ? 'pattern' : 'gotcha',
          domain: 'agent-runtime',
          confidence: status === 'completed' ? 0.8 : 0.7,
          tags: ['second-brain', profile.family, status],
          content: JSON.stringify(redactRuntimeValue(turnSummary)),
          metadata: { runId, turnId, memoryEntryId: cleanText(storedMemoryId) },
        });
        knowledgePublished = true;
        await addNode('knowledge-publish', 'completed', { published: true });
      } catch (error) {
        status = 'failed';
        stopReason = 'knowledge-publish-failed';
        warnings.push({ kind: stopReason, message: errorMessage(error) });
        await addNode('knowledge-publish', 'failed', { error: errorMessage(error) });
        recovery = recovery ?? (await recoverFrom(stopReason, error));
      }
    } else {
      await addNode('knowledge-publish', 'skipped', { reason: 'adapter-not-supplied' });
    }

    stage = 'next-work';
    if (adapters.nextWork) {
      try {
        nextWork = await adapters.nextWork.farm({
          intent,
          plan,
          status,
          stopReason,
          actions: actionRecords,
          recovery,
          profile,
          context,
        });
        await addNode('next-work', 'completed', { nextWork });
      } catch (error) {
        status = 'failed';
        stopReason = 'next-work-farm-failed';
        warnings.push({ kind: stopReason, message: errorMessage(error) });
        await addNode('next-work', 'failed', { error: errorMessage(error) });
        recovery = recovery ?? (await recoverFrom(stopReason, error));
      }
    } else {
      await addNode('next-work', 'skipped', { reason: 'adapter-not-supplied' });
    }

    await addNode('receipt', 'completed', { sink: 'caller-owned' });
    const receipt = {
      schema: SECOND_BRAIN_TURN_RECEIPT_SCHEMA,
      generatedAt: clock(),
      startedAt,
      runId,
      turnId,
      profile: redactRuntimeValue(profile),
      capabilities,
      limits: { ...limits, maxActions: actionLimit },
      status,
      ok: status === 'completed' && warnings.length === 0,
      stopReason,
      intent: redactRuntimeValue(intent),
      plan: plan
        ? redactRuntimeValue({
            summary: plan.summary,
            rationale: plan.rationale,
            metadata: publicPlannerMetadata(plan.metadata),
            actions: plan.actions.map(publicAction),
          })
        : null,
      actions: redactRuntimeValue(actionRecords),
      decisions: redactRuntimeValue(decisions),
      memory: {
        recalledCount: recalledMemory.length,
        recalled: recalledMemory.map(publicMemoryEntry),
        stored: Boolean(storedMemoryId),
        storedMemoryId: cleanText(storedMemoryId),
        storedContentSha256: storedMemoryContentSha256,
      },
      knowledge: {
        recalledCount: recalledKnowledge.length,
        recalled: redactRuntimeValue(recalledKnowledge),
        published: knowledgePublished,
      },
      recovery,
      nextWork: redactRuntimeValue(nextWork),
      warnings: redactRuntimeValue(warnings),
      decisionNetwork: {
        schema: DECISION_NETWORK_SCHEMA,
        nodes,
        edges,
      },
      delivery: { ok: true, sink: 'caller-owned' },
    };

    try {
      await adapters.receipts.write(receipt);
    } catch (error) {
      receipt.status = 'failed';
      receipt.ok = false;
      receipt.stopReason = 'receipt-write-failed';
      receipt.delivery = { ok: false, sink: 'caller-owned', error: errorMessage(error) };
    }
    return receipt;
  }

  async function runLoop({ initialIntent, context = {}, signal, maxTurns, maxActions } = {}) {
    const loopId = idFactory('loop');
    const turnLimit = boundedInt(maxTurns, limits.maxTurns, 1, limits.maxTurns);
    const startedAt = clock();
    const turns = [];
    let currentIntent = initialIntent;
    let stopReason = 'max-turns';

    for (let index = 0; index < turnLimit; index += 1) {
      if (signal?.aborted) {
        stopReason = 'aborted';
        break;
      }
      const turn = await runTurn({
        intent: currentIntent,
        context: { ...context, loopId, turnIndex: index },
        signal,
        runId: loopId,
        maxActions,
      });
      turns.push(turn);
      if (turn.status !== 'completed') {
        stopReason = `turn-${turn.status}`;
        break;
      }
      const nextIntent = extractNextIntent(turn.nextWork);
      if (!nextIntent) {
        stopReason = capabilities.nextWork ? 'no-next-work' : 'next-work-adapter-unavailable';
        break;
      }
      currentIntent = nextIntent;
    }

    const receipt = {
      schema: SECOND_BRAIN_LOOP_RECEIPT_SCHEMA,
      generatedAt: clock(),
      startedAt,
      loopId,
      profile: redactRuntimeValue(profile),
      status: turns.some((turn) => turn.status === 'failed')
        ? 'failed'
        : turns.some((turn) => turn.status === 'blocked')
          ? 'blocked'
          : turns.some((turn) => turn.status === 'stopped') ||
              (turns.length === 0 && stopReason === 'aborted')
            ? 'stopped'
            : 'completed',
      stopReason,
      limits: { ...limits, maxTurns: turnLimit },
      turnCount: turns.length,
      turns: turns.map((turn) => ({
        turnId: turn.turnId,
        status: turn.status,
        stopReason: turn.stopReason,
        intent: turn.intent,
        nextWork: turn.nextWork,
        receiptDelivered: turn.delivery?.ok === true,
      })),
      delivery: { ok: true, sink: 'caller-owned' },
    };
    try {
      await adapters.receipts.write(receipt);
    } catch (error) {
      receipt.status = 'failed';
      receipt.stopReason = 'receipt-write-failed';
      receipt.delivery = { ok: false, sink: 'caller-owned', error: errorMessage(error) };
    }
    return receipt;
  }

  return {
    schema: SECOND_BRAIN_RUNTIME_SCHEMA,
    profile: redactRuntimeValue(profile),
    capabilities,
    limits,
    stopConditions: [
      'authority-denied',
      'action-limit-exceeded',
      'verification-failed',
      'memory-store-failed',
      'knowledge-publish-failed',
      'next-work-farm-failed',
      'receipt-write-failed',
      'aborted',
      'max-turns',
    ],
    runTurn,
    runLoop,
  };
}
