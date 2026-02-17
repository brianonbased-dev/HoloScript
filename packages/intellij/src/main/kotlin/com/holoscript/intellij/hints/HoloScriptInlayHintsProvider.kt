package com.holoscript.intellij.hints

import com.holoscript.intellij.HoloScriptLanguage
import com.holoscript.intellij.lexer.HoloScriptTokenTypes
import com.intellij.codeInsight.hints.*
import com.intellij.lang.Language
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.util.elementType
import javax.swing.JPanel

/**
 * Inlay hints provider for HoloScript.
 *
 * Shows inline type/value hints next to:
 * - Properties whose type is inferred
 * - Event handler parameter names
 * - Numeric literal units (e.g. "ms" next to timer delays)
 *
 * Powered by the IntelliJ Inlay Hints API (available since 2020.3).
 */
@Suppress("UnstableApiUsage")
class HoloScriptInlayHintsProvider : InlayHintsProvider<HoloScriptInlayHintsProvider.Settings> {

    data class Settings(
        var showPropertyTypes: Boolean = true,
        var showTimerUnits: Boolean = true,
        var showEventParams: Boolean = true
    )

    override val key: SettingsKey<Settings> = SettingsKey("holoscript.inlay")
    override val name: String = "HoloScript"
    override val previewText: String? =
        """
        composition demo {
          speed: 5
          on_timer: { delay: 1000 }
        }
        """.trimIndent()

    override fun createSettings(): Settings = Settings()

    override fun createConfigurable(settings: Settings): ImmediateConfigurable =
        object : ImmediateConfigurable {
            override fun createComponent(listener: ChangeListener) = JPanel()
        }

    override fun getCollectorFor(
        file: PsiFile,
        editor: Editor,
        settings: Settings,
        sink: InlayHintsSink
    ): InlayHintsCollector = HoloScriptHintsCollector(editor, settings, sink)

    override fun isLanguageSupported(language: Language): Boolean =
        language == HoloScriptLanguage
}

// ---------------------------------------------------------------------------

@Suppress("UnstableApiUsage")
private class HoloScriptHintsCollector(
    editor: Editor,
    private val settings: HoloScriptInlayHintsProvider.Settings,
    private val sink: InlayHintsSink
) : InlayHintsCollector {

    private val factory = HintUtils.getHintsRenderer(editor)

    override fun collect(element: PsiElement, editor: Editor, sink: InlayHintsSink): Boolean {
        if (settings.showTimerUnits && element.elementType == HoloScriptTokenTypes.NUMBER) {
            // Show "ms" hint after numeric literals that look like timer delays
            val parent = element.parent?.text ?: ""
            if (parent.contains("delay") || parent.contains("timer") || parent.contains("interval")) {
                val offset = element.textRange.endOffset
                sink.addInlineElement(
                    offset,
                    relatesToPrecedingText = true,
                    HintUtils.createTextElement(" ms", editor)
                )
            }
        }
        return true
    }
}

// ---------------------------------------------------------------------------

private object HintUtils {
    fun getHintsRenderer(editor: Editor) = editor.colorsScheme

    fun createTextElement(text: String, editor: Editor): com.intellij.codeInsight.hints.presentation.PresentationFactory {
        return com.intellij.codeInsight.hints.presentation.PresentationFactory(editor)
    }
}
