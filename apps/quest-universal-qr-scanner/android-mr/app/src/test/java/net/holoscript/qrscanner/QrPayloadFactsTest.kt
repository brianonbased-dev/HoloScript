package net.holoscript.qrscanner

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class QrPayloadFactsTest {
  @Test
  fun rejectsMalformedOrAmbiguousWebAuthorities() {
    assertFalse(QrPayloadFacts.syntaxSafe("https://"))
    assertFalse(QrPayloadFacts.syntaxSafe("https://example.com:bad"))
    assertFalse(QrPayloadFacts.syntaxSafe("https://user@example.com/path"))
    assertFalse(QrPayloadFacts.syntaxSafe("https://example.com:70000/path"))
    assertTrue(QrPayloadFacts.syntaxSafe("https://example.com/path"))
  }

  @Test
  fun permitsControlsOnlyInsideAValidStructuredEnvelope() {
    assertFalse(QrPayloadFacts.controlsSafe("https://example.com/\nextra"))
    assertFalse(QrPayloadFacts.controlsSafe("plain\ttext"))
    assertFalse(QrPayloadFacts.syntaxSafe("BEGIN:VCARD\nnot-a-card"))
    assertTrue(QrPayloadFacts.controlsSafe("BEGIN:VCARD\r\nFN:Ada\r\nEND:VCARD"))
    assertTrue(QrPayloadFacts.syntaxSafe("BEGIN:VCARD\r\nFN:Ada\r\nEND:VCARD"))
    assertTrue(QrPayloadFacts.controlsSafe("BEGIN:VEVENT\nSUMMARY:Launch\nEND:VEVENT"))
    assertTrue(QrPayloadFacts.syntaxSafe("BEGIN:VEVENT\nSUMMARY:Launch\nEND:VEVENT"))
  }
}
