import { afterEach, describe, expect, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'

import { createDbClient, extensionDevices, extensionPairingCodes, researchCaptureActivities, researchCaptures } from '@llm-wiki/db'
import { loadConfig } from './config'
import {
  approveResearchCapture,
  createExtensionPairingCodeForDashboard,
  createResearchCapture,
  hashSecret,
  pairExtension,
  retryResearchCaptureIndex,
} from './research-captures'

const DATABASE_URL = process.env.DATABASE_URL
const describeWithDatabase = DATABASE_URL ? describe : describe.skip
const TEST_DEVICE_NAME = 'integration-test-approval-device'
const TEST_NOTE_TITLE = 'Approved research capture'

describeWithDatabase('research capture approval', () => {
  const config = loadConfig()
  const createdCaptureIds: string[] = []
  const createdDeviceIds: string[] = []
  const createdPairingCodes: string[] = []
  const temporaryVaults: string[] = []

  afterEach(async () => {
    const { db } = createDbClient(DATABASE_URL!)
    for (const captureId of createdCaptureIds.splice(0)) {
      await db.delete(researchCaptures).where(eq(researchCaptures.id, captureId))
    }
    for (const deviceId of createdDeviceIds.splice(0)) {
      await db.delete(extensionDevices).where(eq(extensionDevices.id, deviceId))
    }
    for (const pairingCode of createdPairingCodes.splice(0)) {
      await db.delete(extensionPairingCodes).where(eq(extensionPairingCodes.code_hash, hashSecret(pairingCode)))
    }
    for (const vaultPath of temporaryVaults.splice(0)) {
      await fs.rm(vaultPath, { recursive: true, force: true })
    }
  })

  test('writes a source-linked note and marks the capture approved after indexing succeeds', async () => {
    const temporaryVault = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-wiki-capture-approval-'))
    temporaryVaults.push(temporaryVault)
    const testConfig = { ...config, vaultPath: temporaryVault }
    const pairing = await createExtensionPairingCodeForDashboard(testConfig)
    createdPairingCodes.push(pairing.code)
    const device = await pairExtension(testConfig, pairing.code, TEST_DEVICE_NAME)
    createdDeviceIds.push(device.deviceId)
    const capture = await createResearchCapture(testConfig, device.token, {
      sourceUrl: 'https://example.com/answer',
      sourceTitle: 'Primary [source]',
      query: 'How is provenance retained?',
      content: 'The response is stored only after an explicit review decision.',
      sources: [{ title: 'Supporting [source]', url: 'https://example.com/supporting-source' }],
      capturedAt: '2026-07-23T10:30:00.000Z',
    })
    createdCaptureIds.push(capture.id)

    const result = await approveResearchCapture(testConfig, {
      id: capture.id,
      title: TEST_NOTE_TITLE,
      tags: ['git', 'local-first'],
      destinationFolder: 'research/git',
    }, {
      reindex: async (_config, relativePath) => ({ vaultPath: relativePath, status: 'created' }),
    })

    expect(result.status).toBe('approved')
    const note = await fs.readFile(path.join(temporaryVault, result.path), 'utf8')
    expect(note).toContain('source_kind: browser_capture')
    expect(note).toContain('tags: ["git", "local-first"]')
    expect(note).toContain('[Primary \\[source\\]](https://example.com/answer)')
    expect(note).toContain('[Supporting \\[source\\]](https://example.com/supporting-source)')

    const { db } = createDbClient(DATABASE_URL!)
    const [stored] = await db.select({ status: researchCaptures.status, savedPath: researchCaptures.saved_path })
      .from(researchCaptures)
      .where(eq(researchCaptures.id, capture.id))
    expect(stored).toEqual({ status: 'approved', savedPath: result.path })
  })

  test('keeps an indexing failure recoverable and retries the existing vault note', async () => {
    const temporaryVault = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-wiki-capture-retry-'))
    temporaryVaults.push(temporaryVault)
    const testConfig = { ...config, vaultPath: temporaryVault }
    const pairing = await createExtensionPairingCodeForDashboard(testConfig)
    createdPairingCodes.push(pairing.code)
    const device = await pairExtension(testConfig, pairing.code, `${TEST_DEVICE_NAME}-retry`)
    createdDeviceIds.push(device.deviceId)
    const capture = await createResearchCapture(testConfig, device.token, {
      sourceUrl: 'https://example.com/retry',
      sourceTitle: 'Recoverable source',
      content: 'The vault note should remain recoverable after an indexing error.',
      sources: [],
      capturedAt: '2026-07-23T11:30:00.000Z',
    })
    createdCaptureIds.push(capture.id)

    const failed = await approveResearchCapture(testConfig, {
      id: capture.id,
      title: 'Recoverable research capture',
    }, {
      reindex: async (_config, relativePath) => ({
        vaultPath: relativePath,
        status: 'failed',
        error: 'Embedding service unavailable',
      }),
    })

    expect(failed).toMatchObject({ status: 'indexing_failed', error: 'Embedding service unavailable' })
    const notePath = path.join(temporaryVault, failed.path)
    await fs.appendFile(notePath, '\nManual recovery marker\n', 'utf8')

    const retried = await retryResearchCaptureIndex(testConfig, { id: capture.id }, {
      reindex: async (_config, relativePath) => ({ vaultPath: relativePath, status: 'created' }),
    })

    expect(retried).toMatchObject({ status: 'approved', path: failed.path })
    expect(await fs.readFile(notePath, 'utf8')).toContain('Manual recovery marker')

    const { db } = createDbClient(DATABASE_URL!)
    const [stored] = await db.select({
      status: researchCaptures.status,
      indexError: researchCaptures.index_error,
      savedPath: researchCaptures.saved_path,
    })
      .from(researchCaptures)
      .where(eq(researchCaptures.id, capture.id))
    expect(stored).toEqual({ status: 'approved', indexError: null, savedPath: failed.path })

    const activities = await db.select({ eventType: researchCaptureActivities.event_type })
      .from(researchCaptureActivities)
      .where(eq(researchCaptureActivities.capture_id, capture.id))
      .orderBy(researchCaptureActivities.created_at)
    expect(activities.map((activity) => activity.eventType)).toEqual([
      'captured',
      'indexing_failed',
      'indexing_retried',
    ])
  })
})
