import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Pipeline = require('../dist/pipeline.js');
const model = require('../dist/model.json');
const Protection = require('../dist/protection.js');
const Intelligence = require('../dist/intelligence.js'),
  intelligenceModel = require('../dist/intelligence-model.json');
const Temporal = require('../dist/temporal-graph.js'),
  temporalModel = require('../dist/temporal-graph-model.json');
export default {
  async fetch(request) {
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    };
    if (request.method !== 'POST')
      return Response.json(
        { error: 'Use POST for demo assessments.' },
        { status: 405, headers: { ...headers, Allow: 'POST' } },
      );
    if (!request.headers.get('content-type')?.includes('application/json'))
      return Response.json({ error: 'Send application/json.' }, { status: 415, headers });
    try {
      if (Number(request.headers.get('content-length') || 0) > 300000)
        return Response.json({ error: 'Demo payload is too large.' }, { status: 413, headers });
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 300000)
        return Response.json({ error: 'Demo payload is too large.' }, { status: 413, headers });
      const body = JSON.parse(text),
        result = Pipeline.assess(model, body),
        layers = Intelligence.assess(intelligenceModel, body, result);
      if (temporalModel.enabled) {
        const temporalStart = performance.now();
        layers.temporalGraphModel = Temporal.score(temporalModel, body.history, body.payment);
        if (
          Math.max(layers.temporalGraphModel.sender, layers.temporalGraphModel.recipient) >=
            temporalModel.reviewThreshold &&
          layers.decision === 'Allow'
        ) {
          layers.decision = 'Verify';
          layers.reasons.push(
            'The experimental temporal graph model requests verification from amount, timing and directed relationship patterns.',
          );
        }
        layers.scoringMs += performance.now() - temporalStart;
      }
      result.intelligence = layers;
      result.decision = layers.decision;
      result.reasons.push(...layers.reasons);
      const protectionStarted = performance.now(),
        protection = Protection.evaluate(body, result);
      result.timings.protectionMs = performance.now() - protectionStarted;
      result.timings.serverTotalMs += result.timings.protectionMs;
      result.protection = protection;
      if (
        protection.decision === 'Flag' ||
        (protection.decision === 'Verify' && result.decision === 'Allow')
      )
        result.decision = protection.decision;
      result.reasons.push(...protection.triggered.map((r) => r.reason));
      result.settlementPermitted = result.decision === 'Allow';
      result.timings.scoringMs += layers.scoringMs;
      result.timings.serverTotalMs += layers.scoringMs;
      return Response.json(result, {
        headers: {
          ...headers,
          'Server-Timing': `model;dur=${result.timings.scoringMs.toFixed(3)},assessment;dur=${result.timings.serverTotalMs.toFixed(3)}`,
        },
      });
    } catch (error) {
      console.error('demo_assessment_rejected', error.name);
      return Response.json(
        { error: 'Invalid demo request. Check the sample payment and history.' },
        { status: 400, headers },
      );
    }
  },
};
