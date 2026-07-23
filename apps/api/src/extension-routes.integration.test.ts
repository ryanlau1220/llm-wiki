import { afterEach, describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { eq } from 'drizzle-orm'

import { createDbClient, extensionDevices, extensionPairingCodes, researchCaptures } from '@llm-wiki/db'
import { loadConfig } from './config'
import { researchCaptureExtensionRoutes } from './extension-routes'
import { createExtensionPairingCodeForDashboard, hashSecret } from './research-captures'

const DATABASE_URL = process.env.DATABASE_URL
const describeWithDatabase = DATABASE_URL ? describe : describe.skip
const TEST_DEVICE_NAME = 'integration-test-capture-device'
const TEST_CAPTURE_TITLE = 'Integration test research capture'

describeWithDatabase('research capture extension routes', () => {
  const config = loadConfig()
  const app = new Elysia().use(researchCaptureExtensionRoutes(config))
  const createdDeviceIds: string[] = []
  const createdCaptureIds: string[] = []
  const createdPairingCodes: string[] = []

  afterEach(async () => {
    const { db } = createDbClient(DATABASE_URL!)
    if (createdCaptureIds.length) {
      await db.delete(researchCaptures).where(eq(researchCaptures.id, createdCaptureIds[0]!))
    }
    if (createdDeviceIds.length) {
      await db.delete(extensionDevices).where(eq(extensionDevices.id, createdDeviceIds[0]!))
    }
    if (createdPairingCodes.length) {
      await db.delete(extensionPairingCodes).where(eq(
        extensionPairingCodes.code_hash,
        hashSecret(createdPairingCodes[0]!)
      ))
    }
  })

  test('pairs a local device and accepts a validated capture', async () => {
    const pairing = await createExtensionPairingCodeForDashboard(config)
    createdPairingCodes.push(pairing.code)
    const pairResponse = await app.handle(new Request('http://local.test/extension/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: pairing.code, name: TEST_DEVICE_NAME }),
    }))
    expect(pairResponse.status).toBe(200)
    const device = await pairResponse.json() as { deviceId: string; token: string }
    createdDeviceIds.push(device.deviceId)

    const captureResponse = await app.handle(new Request('http://local.test/extension/captures', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${device.token}`,
      },
      body: JSON.stringify({
        sourceUrl: 'https://example.com/research',
        sourceTitle: TEST_CAPTURE_TITLE,
        query: 'Does the extension preserve provenance?',
        content: 'Yes. The reviewed note preserves the capture URL and source links.',
        sources: [{ title: 'Example source', url: 'https://example.com/source' }],
        capturedAt: '2026-07-23T10:30:00.000Z',
      }),
    }))
    expect(captureResponse.status).toBe(201)
    const capture = await captureResponse.json() as { id: string; status: string }
    createdCaptureIds.push(capture.id)
    expect(capture.status).toBe('inbox')

    const { db } = createDbClient(DATABASE_URL!)
    const stored = await db.select({ title: researchCaptures.source_title })
      .from(researchCaptures)
      .where(eq(researchCaptures.id, capture.id))
    expect(stored).toEqual([{ title: TEST_CAPTURE_TITLE }])
  })

  test('rejects an unpaired extension token', async () => {
    const response = await app.handle(new Request('http://local.test/extension/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-paired-device-token' },
      body: JSON.stringify({
        sourceUrl: 'https://example.com/research',
        sourceTitle: TEST_CAPTURE_TITLE,
        content: 'This must not be saved.',
        capturedAt: '2026-07-23T10:30:00.000Z',
      }),
    }))
    expect(response.status).toBe(401)
  })
})
