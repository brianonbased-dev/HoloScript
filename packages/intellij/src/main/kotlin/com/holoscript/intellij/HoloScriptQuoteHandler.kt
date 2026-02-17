package com.holoscript.intellij

import com.holoscript.intellij.lexer.HoloScriptTokenTypes
import com.intellij.codeInsight.editorActions.QuoteHandler
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.highlighter.HighlighterIterator
import com.intellij.psi.tree.IElementType

/**
 * Quote handler for HoloScript.
 *
 * Enables auto-closing of single and double quotes inside HoloScript files,
 * matching the editor behaviour of other IntelliJ languages.
 */
class HoloScriptQuoteHandler : QuoteHandler {

    private val stringTokens = setOf(HoloScriptTokenTypes.STRING)

    override fun isClosingQuote(iterator: HighlighterIterator, offset: Int): Boolean {
        val type = iterator.tokenType
        if (type !in stringTokens) return false
        val start = iterator.start
        val end = iterator.end
        return end - start >= 1 && offset == end - 1
    }

    override fun isOpeningQuote(iterator: HighlighterIterator, offset: Int): Boolean {
        return iterator.tokenType in stringTokens
    }

    override fun hasNonClosedLiteral(
        editor: Editor,
        iterator: HighlighterIterator,
        offset: Int
    ): Boolean {
        val start = iterator.start
        val document = editor.document
        val lineEnd = document.getLineEndOffset(document.getLineNumber(offset))
        val text = document.getText(
            com.intellij.openapi.util.TextRange(start, lineEnd)
        )
        val quote = if (offset < document.textLength) document.charsSequence[offset] else '"'
        val closeIndex = text.indexOf(quote, 1)
        return closeIndex < 0
    }

    override fun isInsideLiteral(iterator: HighlighterIterator): Boolean =
        iterator.tokenType in stringTokens
}
