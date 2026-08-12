import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMotionComposition,
  canonicalMotionRenderRequest,
  validateMotionRenderRequest,
} from './local-motion-template.mjs'

const requestFor = (templateId) => ({
  templateId,
  templateVersion: 1,
  values: { title: 'Local <motion>', body: 'Editable & cached', accent: '#ec4899' },
  accentColor: '#ec4899',
  durationSec: 5,
  width: 1920,
  height: 1080,
  fps: 30,
})

for (const templateId of ['kinetic_title', 'product_card', 'end_card']) {
  test(`builds a self-contained ${templateId} composition`, () => {
    const request = validateMotionRenderRequest(requestFor(templateId))
    const html = buildMotionComposition(request)
    assert.match(html, /data-composition-id="rhymx-motion"/)
    assert.match(html, /window\.__timelines\['rhymx-motion'\]/)
    assert.match(html, /const at = \(seconds\) => seconds \* \(request\.durationSec \/ 5\)/)
    assert.match(html, /src="\.\/gsap\.min\.js"/)
    assert.doesNotMatch(html, /Local <motion>/)
    assert.match(html, /Local \\u003cmotion\\u003e/)
  })
}

test('canonicalizes field order for deterministic cache keys', () => {
  const first = validateMotionRenderRequest({ ...requestFor('kinetic_title'), values: { body: 'B', title: 'A' } })
  const second = validateMotionRenderRequest({ ...requestFor('kinetic_title'), values: { title: 'A', body: 'B' } })
  assert.equal(canonicalMotionRenderRequest(first), canonicalMotionRenderRequest(second))
})

test('rejects unknown templates and unsafe dimensions', () => {
  assert.throws(() => validateMotionRenderRequest(requestFor('unknown')), /Unsupported/)
  assert.throws(
    () => validateMotionRenderRequest({ ...requestFor('end_card'), width: 20_000 }),
    /width/
  )
})
