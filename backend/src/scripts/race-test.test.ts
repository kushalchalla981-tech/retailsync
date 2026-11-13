/**
 * Offline tests for the race test's pure exports: argument parsing, in-flight
 * overlap and the shared scenario verdict. Importing race-test.ts never runs
 * the live CLI (isMainModule guard), so no Aiven access happens here.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateScenario,
  maxInFlight,
  parseRaceArgs,
  type ScenarioExpectation,
  type ScenarioObservation,
  type WorkerResult,
} from './race-test.js';

function worker(index: number, status: number, extra: Partial<WorkerResult> = {}): WorkerResult {
  return { worker: index, status, startedAt: 0, endedAt: 100 + index, ...extra };
}

/** Ideal last-unit outcome at concurrency 10: one winner, nine OUT_OF_STOCK. */
function lastUnitObservation(): ScenarioObservation {
  return {
    results: [
      worker(1, 201, { orderId: 'order-1' }),
      ...Array.from({ length: 9 }, (_, i) => worker(i + 2, 409, { code: 'OUT_OF_STOCK' })),
    ],
    products: [{ sku: 'ELEC-009', initial: 1, final: 0, unitsSold: 1 }],
    orderCount: 1,
  };
}

const lastUnitExpectation: ScenarioExpectation = {
  created: 1,
  outOfStock: 9,
  finalStock: { 'ELEC-009': 0 },
};

/** Message of the error `fn` throws (assert.throws' regex-mismatch diagnostic is not strict TAP). */
function errorOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '(did not throw)';
}

function failuresOf(observation: ScenarioObservation, expectation: ScenarioExpectation = lastUnitExpectation): string[] {
  const verdict = evaluateScenario(observation, expectation);
  assert.equal(verdict.pass, verdict.failures.length === 0);
  return verdict.failures;
}

describe('parseRaceArgs', () => {
  it('defaults to 10 workers on ELEC-009 at Bangalore Central, all scenarios, cleanup on', () => {
    const args = parseRaceArgs([]);
    assert.deepEqual(args, {
      concurrency: 10,
      sku: 'ELEC-009',
      location: 'Bangalore Central',
      scenario: 'all',
      keep: false,
    });
    assert.equal(args.baseUrl, undefined);
  });

  it('parses every flag, in both --flag value and --flag=value form', () => {
    const args = parseRaceArgs([
      '--concurrency',
      '20',
      '--sku=ELEC-001',
      '--location',
      'Mumbai Metro',
      '--scenario=deadlock',
      '--base-url',
      'http://localhost:3000/',
      '--keep',
    ]);
    assert.deepEqual(args, {
      concurrency: 20,
      sku: 'ELEC-001',
      location: 'Mumbai Metro',
      scenario: 'deadlock',
      baseUrl: 'http://localhost:3000',
      keep: true,
    });
  });

  it('accepts every scenario name', () => {
    for (const scenario of ['last-unit', 'deadlock', 'double-submit', 'all'] as const) {
      assert.equal(parseRaceArgs(['--scenario', scenario]).scenario, scenario);
    }
  });

  it('rejects --concurrency 1 and 51 (range 2-50) and non-integers', () => {
    assert.match(errorOf(() => parseRaceArgs(['--concurrency', '1'])), /--concurrency/);
    assert.match(errorOf(() => parseRaceArgs(['--concurrency', '51'])), /--concurrency/);
    assert.match(errorOf(() => parseRaceArgs(['--concurrency', '2.5'])), /--concurrency/);
  });

  it('rejects an unknown scenario', () => {
    assert.match(errorOf(() => parseRaceArgs(['--scenario', 'bogus'])), /--scenario must be one of/);
  });

  it('rejects an unknown flag, a missing value and a non-http base URL', () => {
    assert.match(errorOf(() => parseRaceArgs(['--turbo'])), /unknown argument/);
    assert.match(errorOf(() => parseRaceArgs(['--sku'])), /requires a value/);
    assert.match(errorOf(() => parseRaceArgs(['--base-url', 'ftp://example.com'])), /--base-url/);
  });
});

describe('maxInFlight', () => {
  it('returns 3 for three overlapping intervals', () => {
    assert.equal(
      maxInFlight([
        { startedAt: 0, endedAt: 10 },
        { startedAt: 1, endedAt: 9 },
        { startedAt: 2, endedAt: 8 },
      ]),
      3,
    );
  });

  it('returns 1 for three back-to-back intervals', () => {
    assert.equal(
      maxInFlight([
        { startedAt: 0, endedAt: 1 },
        { startedAt: 1, endedAt: 2 },
        { startedAt: 2, endedAt: 3 },
      ]),
      1,
    );
  });

  it('returns 0 for no requests', () => {
    assert.equal(maxInFlight([]), 0);
  });
});

describe('evaluateScenario - last-unit', () => {
  it('passes the ideal outcome: 1 x 201, 9 x 409 OUT_OF_STOCK, 1 -> 0, sold 1, 1 order, 10 in flight', () => {
    const verdict = evaluateScenario(lastUnitObservation(), lastUnitExpectation);
    assert.deepEqual(verdict, { pass: true, failures: [] });
  });

  it('fails on two 201s (oversell)', () => {
    const observation = lastUnitObservation();
    observation.results[1] = worker(2, 201, { orderId: 'order-2' });
    observation.orderCount = 2;
    const failures = failuresOf(observation);
    assert.ok(failures.some((failure) => /expected 1 x 201, got 2/.test(failure)), failures.join(' | '));
  });

  it('fails on any 500', () => {
    const observation = lastUnitObservation();
    observation.results[3] = worker(4, 500, { code: 'INTERNAL_ERROR' });
    const failures = failuresOf(observation);
    assert.ok(failures.some((failure) => /server error: 1 x 500 INTERNAL_ERROR/.test(failure)), failures.join(' | '));
  });

  it('fails on any 503 CHECKOUT_BUSY (no deadlock / lock timeout is tolerated)', () => {
    const observation = lastUnitObservation();
    observation.results[5] = worker(6, 503, { code: 'CHECKOUT_BUSY' });
    const failures = failuresOf(observation);
    assert.ok(failures.some((failure) => /503 CHECKOUT_BUSY/.test(failure)), failures.join(' | '));
  });

  it('fails when the final stock is not the expected value', () => {
    const observation = lastUnitObservation();
    observation.products = [{ sku: 'ELEC-009', initial: 1, final: 1, unitsSold: 0 }];
    const failures = failuresOf(observation);
    assert.ok(failures.some((failure) => /ELEC-009 final stock 1, expected 0/.test(failure)), failures.join(' | '));
  });

  it('fails when units sold differ from initial minus final', () => {
    const observation = lastUnitObservation();
    observation.products = [{ sku: 'ELEC-009', initial: 1, final: 0, unitsSold: 2 }];
    const failures = failuresOf(observation);
    assert.ok(failures.some((failure) => /units sold 2 != stock decrement 1/.test(failure)), failures.join(' | '));
  });

  it('fails on negative stock', () => {
    const observation = lastUnitObservation();
    observation.products = [{ sku: 'ELEC-009', initial: 1, final: -1, unitsSold: 2 }];
    const failures = failuresOf(observation, { ...lastUnitExpectation, finalStock: {} });
    assert.ok(failures.some((failure) => /negative/.test(failure)), failures.join(' | '));
  });

  it('fails when the order count differs from the success count', () => {
    const observation = lastUnitObservation();
    observation.orderCount = 2;
    const failures = failuresOf(observation);
    assert.ok(failures.some((failure) => /order count 2 != successful checkouts 1/.test(failure)), failures.join(' | '));
  });

  it('fails as inconclusive when max in-flight is below 2', () => {
    const observation = lastUnitObservation();
    observation.results = observation.results.map((result, index) => ({
      ...result,
      startedAt: index * 10,
      endedAt: index * 10 + 10,
    }));
    const failures = failuresOf(observation);
    assert.ok(failures.some((failure) => /inconclusive: max in-flight 1 < 2/.test(failure)), failures.join(' | '));
  });
});

describe('evaluateScenario - deadlock (multi-item, opposite cart order)', () => {
  const expectation: ScenarioExpectation = {
    created: 5,
    outOfStock: 5,
    finalStock: { 'ELEC-001': 0, 'ELEC-010': 0 },
  };

  function observation(): ScenarioObservation {
    return {
      results: Array.from({ length: 10 }, (_, i) =>
        i < 5 ? worker(i + 1, 201, { orderId: `order-${i}` }) : worker(i + 1, 409, { code: 'OUT_OF_STOCK' }),
      ),
      products: [
        { sku: 'ELEC-001', initial: 5, final: 0, unitsSold: 5 },
        { sku: 'ELEC-010', initial: 5, final: 0, unitsSold: 5 },
      ],
      orderCount: 5,
    };
  }

  it('passes K x 201, the rest 409 OUT_OF_STOCK, both products at 0 with per-product conservation', () => {
    assert.deepEqual(evaluateScenario(observation(), expectation), { pass: true, failures: [] });
  });

  it('fails when a deadlock surfaced as 503 CHECKOUT_BUSY and one product is not conserved', () => {
    const broken = observation();
    broken.results[4] = worker(5, 503, { code: 'CHECKOUT_BUSY' });
    broken.orderCount = 4;
    broken.products[1] = { sku: 'ELEC-010', initial: 5, final: 1, unitsSold: 5 };
    const failures = failuresOf(broken, expectation);
    assert.ok(failures.some((failure) => /503 CHECKOUT_BUSY/.test(failure)), failures.join(' | '));
    assert.ok(failures.some((failure) => /ELEC-010 units sold 5 != stock decrement 4/.test(failure)), failures.join(' | '));
  });
});

describe('evaluateScenario - double-submit (same cart)', () => {
  const expectation: ScenarioExpectation = {
    created: 1,
    outOfStock: 0,
    replayed: 9,
    singleOrderId: true,
    finalStock: { 'ELEC-007': 59 },
  };

  function observation(): ScenarioObservation {
    return {
      results: [
        worker(1, 201, { orderId: 'order-1', replayed: false }),
        ...Array.from({ length: 9 }, (_, i) => worker(i + 2, 200, { orderId: 'order-1', replayed: true })),
      ],
      products: [{ sku: 'ELEC-007', initial: 60, final: 59, unitsSold: 1 }],
      orderCount: 1,
    };
  }

  it('passes one 201 plus 200 replayed:true for the rest, one order id, one order, decrement 1', () => {
    assert.deepEqual(evaluateScenario(observation(), expectation), { pass: true, failures: [] });
  });

  it('fails when two distinct order ids appear', () => {
    const broken = observation();
    broken.results[3] = worker(4, 200, { orderId: 'order-2', replayed: true });
    const failures = failuresOf(broken, expectation);
    assert.ok(failures.some((failure) => /2 distinct order ids/.test(failure)), failures.join(' | '));
  });

  it('fails when a 200 is not a replay', () => {
    const broken = observation();
    broken.results[3] = worker(4, 200, { orderId: 'order-1', replayed: false });
    const failures = failuresOf(broken, expectation);
    assert.ok(failures.some((failure) => /expected 9 x 200 replayed, got 8/.test(failure)), failures.join(' | '));
  });

  it('treats a 200 replay as unexpected when no replay is expected', () => {
    const results = lastUnitObservation().results;
    results[1] = worker(2, 200, { orderId: 'order-1', replayed: true });
    const failures = failuresOf({ ...lastUnitObservation(), results });
    assert.ok(failures.some((failure) => /unexpected response: 1 x 200 replayed/.test(failure)), failures.join(' | '));
  });
});
