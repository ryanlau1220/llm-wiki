import { afterEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { createDbClient, extensionDevices, extensionPairingCodes, researchCaptures } from '@llm-wiki/db'
import { loadConfig } from './config'
import {
  createExtensionPairingCodeForDashboard,
  createResearchCapture,
  hashSecret,
  listResearchCaptureInbox,
  pairExtension,
} from './research-captures'

const DATABASE_URL = process.env.DATABASE_URL
const describeWithDatabase = DATABASE_URL ? describe : describe.skip
const TEST_DEVICE_NAME = 'duplicate-detection-test-device'
const TEST_SOURCE_URL = 'https://example.com/duplicate-source'

describeWithDatabase('research capture duplicates', () => {
  const config = loadConfig()
  const createdCaptureIds: string[] = []
  const createdDeviceIds: string[] = []
  const createdPairingCodes: string[] = []

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
  })

  test('flags an inbox capture when its canonical source is already approved', async () => {
    const pairing = await createExtensionPairingCodeForDashboard(config)
    createdPairingCodes.push(pairing.code)
    const device = await pairExtension(config, pairing.code, TEST_DEVICE_NAME)
    createdDeviceIds.push(device.deviceId)
    const approvedCapture = await createResearchCapture(config, device.token, {
      sourceUrl: TEST_SOURCE_URL,
      sourceTitle: 'Existing source note',
      content: 'Previously approved research.',
      sources: [],
      capturedAt: '2026-07-23T10:30:00.000Z',
    })
    createdCaptureIds.push(approvedCapture.id)
    const { db } = createDbClient(DATABASE_URL!)
    await db.update(researchCaptures).set({ status: 'approved', saved_path: 'research/existing-source-note.md' }).where(eq(researchCaptures.id, approvedCapture.id))
    const inboxCapture = await createResearchCapture(config, device.token, {
      sourceUrl: TEST_SOURCE_URL,
      sourceTitle: 'Repeated source note',
      content: 'New research from the same source.',
      sources: [],
      capturedAt: '2026-07-23T10:31:00.000Z',
    })
    createdCaptureIds.push(inboxCapture.id)

    const [capture] = await listResearchCaptureInbox(config)

    expect(capture).toMatchObject({
      id: inboxCapture.id,
      duplicateCandidates: [{ captureId: approvedCapture.id, title: 'Existing source note', path: 'research/existing-source-note.md' }],
    })
  })
})
