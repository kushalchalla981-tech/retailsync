/**
 * Hermetic tests for Kafka topic provisioning using a fake KafkaJS admin
 * (no broker connection). Live provisioning on Aiven is pending credentials.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ITopicConfig, PartitionMetadata } from 'kafkajs';

import {
  buildTopicConfigs,
  describeKafkaError,
  ensureTopics,
  minInsyncReplicas,
  parseProvisionArgs,
  resolveReplicationFactor,
  TOPIC_SPECS,
  TOPICS,
  type TopicAdmin,
} from './topics.js';

function partitions(count: number, replicas: number, leader = 0): PartitionMetadata[] {
  return Array.from({ length: count }, (_, partitionId) => ({
    partitionErrorCode: 0,
    partitionId,
    leader,
    replicas: Array.from({ length: replicas }, (_, r) => r),
    isr: Array.from({ length: replicas }, (_, r) => r),
  }));
}

interface ClusterState {
  brokers: number;
  topics: Map<string, PartitionMetadata[]>;
  createError?: Error;
}

function fakeAdmin(state: ClusterState) {
  const created: ITopicConfig[][] = [];
  const admin: TopicAdmin = {
    async describeCluster() {
      return {
        brokers: Array.from({ length: state.brokers }, (_, nodeId) => ({ nodeId, host: `b${nodeId}`, port: 9092 })),
        controller: 0,
        clusterId: 'test-cluster',
      };
    },
    async listTopics() {
      return [...state.topics.keys()];
    },
    async createTopics({ topics }) {
      if (state.createError) throw state.createError;
      created.push(topics);
      for (const t of topics) state.topics.set(t.topic, partitions(t.numPartitions ?? 1, t.replicationFactor ?? 1));
      return true;
    },
    async fetchTopicMetadata(options) {
      const names = options?.topics ?? [...state.topics.keys()];
      return {
        topics: names.filter((name) => state.topics.has(name)).map((name) => ({ name, partitions: state.topics.get(name)! })),
      };
    },
  };
  return { admin, created };
}

describe('topic specs', () => {
  it('provisions exactly orders.placed and inventory.updated', () => {
    assert.deepEqual(TOPICS, { ORDERS_PLACED: 'orders.placed', INVENTORY_UPDATED: 'inventory.updated' });
    assert.deepEqual(TOPIC_SPECS.map((s) => s.topic), ['orders.placed', 'inventory.updated']);
  });

  it('uses 3 partitions and 7-day delete retention', () => {
    for (const spec of TOPIC_SPECS) {
      assert.equal(spec.numPartitions, 3);
      assert.equal(spec.configEntries['cleanup.policy'], 'delete');
      assert.equal(spec.configEntries['retention.ms'], String(7 * 24 * 3600 * 1000));
    }
  });

  it('caps replication at the broker count and sizes min.insync.replicas to tolerate one failure', () => {
    assert.equal(resolveReplicationFactor(1), 1);
    assert.equal(resolveReplicationFactor(2), 2);
    assert.equal(resolveReplicationFactor(3), 3);
    assert.equal(resolveReplicationFactor(6), 3);
    assert.throws(() => resolveReplicationFactor(0), /0 brokers/);
    assert.equal(minInsyncReplicas(3), 2);
    assert.equal(minInsyncReplicas(2), 1);
    assert.equal(minInsyncReplicas(1), 1);
  });

  it('builds KafkaJS CreateTopics entries', () => {
    assert.deepEqual(buildTopicConfigs(TOPIC_SPECS.slice(0, 1), 3), [
      {
        topic: 'orders.placed',
        numPartitions: 3,
        replicationFactor: 3,
        configEntries: [
          { name: 'cleanup.policy', value: 'delete' },
          { name: 'retention.ms', value: '604800000' },
          { name: 'min.insync.replicas', value: '2' },
        ],
      },
    ]);
    assert.equal(buildTopicConfigs(TOPIC_SPECS, 1, 2)[1]!.numPartitions, 2, 'partition override');
  });
});

describe('ensureTopics', () => {
  it('creates missing topics on a 3-broker cluster with RF 3 and verifies them from metadata', async () => {
    const { admin, created } = fakeAdmin({ brokers: 3, topics: new Map() });
    const result = await ensureTopics(admin);
    assert.equal(result.brokerCount, 3);
    assert.equal(result.replicationFactor, 3);
    assert.equal(created.length, 1, 'single CreateTopics request');
    assert.deepEqual(created[0]!.map((t) => t.topic), ['orders.placed', 'inventory.updated']);
    assert.deepEqual(
      result.topics.map(({ topic, status, partitions: p, replicationFactor, warnings }) => [topic, status, p, replicationFactor, warnings]),
      [
        ['orders.placed', 'created', 3, 3, []],
        ['inventory.updated', 'created', 3, 3, []],
      ],
    );
  });

  it('is idempotent: existing topics are verified, not recreated', async () => {
    const state: ClusterState = {
      brokers: 3,
      topics: new Map([
        ['orders.placed', partitions(3, 3)],
        ['inventory.updated', partitions(3, 3)],
        ['unrelated', partitions(1, 3)],
      ]),
    };
    const { admin, created } = fakeAdmin(state);
    const result = await ensureTopics(admin);
    assert.equal(created.length, 0);
    assert.deepEqual(result.topics.map((t) => t.status), ['exists', 'exists']);
  });

  it('creates only the missing topic', async () => {
    const { admin, created } = fakeAdmin({ brokers: 3, topics: new Map([['orders.placed', partitions(3, 3)]]) });
    const result = await ensureTopics(admin);
    assert.deepEqual(created[0]!.map((t) => t.topic), ['inventory.updated']);
    assert.deepEqual(result.topics.map((t) => t.status), ['exists', 'created']);
  });

  it('reports partition / replication drift and leaderless partitions on existing topics without altering them', async () => {
    const state: ClusterState = {
      brokers: 3,
      topics: new Map([
        ['orders.placed', partitions(1, 1)],
        ['inventory.updated', partitions(3, 3, -1)],
      ]),
    };
    const { admin, created } = fakeAdmin(state);
    const result = await ensureTopics(admin);
    assert.equal(created.length, 0);
    assert.match(result.topics[0]!.warnings.join('\n'), /has 1 partition\(s\), expected 3/);
    assert.match(result.topics[0]!.warnings.join('\n'), /replication factor 1 is below the expected 3/);
    assert.match(result.topics[1]!.warnings.join('\n'), /3 partition\(s\) have no leader/);
  });

  it('adapts to a single-broker cluster (RF 1)', async () => {
    const { admin, created } = fakeAdmin({ brokers: 1, topics: new Map() });
    const result = await ensureTopics(admin);
    assert.equal(result.replicationFactor, 1);
    assert.ok(created[0]!.every((t) => t.replicationFactor === 1));
  });

  it('honours explicit partition / replication overrides and rejects impossible ones', async () => {
    const { admin, created } = fakeAdmin({ brokers: 3, topics: new Map() });
    const result = await ensureTopics(admin, { partitions: 2, replicationFactor: 2 });
    assert.ok(created[0]!.every((t) => t.numPartitions === 2 && t.replicationFactor === 2));
    assert.ok(result.topics.every((t) => t.warnings.length === 0));

    const small = fakeAdmin({ brokers: 2, topics: new Map() });
    await assert.rejects(ensureTopics(small.admin, { replicationFactor: 3 }), /exceeds the 2 available broker/);
    await assert.rejects(ensureTopics(small.admin, { partitions: 0 }), /partitions must be a positive integer/);
  });

  it('surfaces aggregated CreateTopics errors with an Aiven console hint for authorization/policy failures', async () => {
    const aggregate = Object.assign(new Error('Topic creation errors'), {
      errors: [{ type: 'TOPIC_AUTHORIZATION_FAILED', message: 'Not authorized to access topics: [Topic authorization failed]' }],
    });
    const { admin } = fakeAdmin({ brokers: 3, topics: new Map(), createError: aggregate });
    await assert.rejects(ensureTopics(admin), (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /creating topics orders\.placed, inventory\.updated failed/);
      assert.match(message, /TOPIC_AUTHORIZATION_FAILED/);
      assert.match(message, /Aiven Console/);
      return true;
    });
  });

  it('fails if a topic is still missing from metadata after creation', async () => {
    const { admin } = fakeAdmin({ brokers: 3, topics: new Map() });
    const lying: TopicAdmin = { ...admin, createTopics: async () => true };
    await assert.rejects(ensureTopics(lying), /topic orders\.placed is missing from cluster metadata/);
  });
});

describe('helpers', () => {
  it('describeKafkaError includes inner error types', () => {
    assert.equal(describeKafkaError(Object.assign(new Error('x'), { type: 'POLICY_VIOLATION' })), 'x [POLICY_VIOLATION]');
    assert.equal(describeKafkaError(new Error('plain')), 'plain');
  });

  it('parseProvisionArgs accepts --flag N and --flag=N, rejects junk', () => {
    assert.deepEqual(parseProvisionArgs([]), {});
    assert.deepEqual(parseProvisionArgs(['--partitions', '2', '--replication-factor=3']), { partitions: 2, replicationFactor: 3 });
    assert.throws(() => parseProvisionArgs(['--partitions']), /needs a positive integer/);
    assert.throws(() => parseProvisionArgs(['--partitions', '1.5']), /needs a positive integer/);
    assert.throws(() => parseProvisionArgs(['--bogus']), /unknown argument --bogus/);
  });
});
