package com.holoscript.intellij.annotators

import com.holoscript.intellij.lexer.HoloScriptTokenTypes
import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.Annotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.psi.PsiElement
import com.intellij.psi.util.elementType

/**
 * Semantic annotator for HoloScript.
 *
 * Adds error/warning highlights beyond what pure lexer-based syntax
 * highlighting can detect — e.g., unknown traits, missing names, and
 * deprecated keywords.
 */
class HoloScriptAnnotator : Annotator {

    companion object {
        private val DEPRECATED_KEYWORDS = setOf("system", "networked_object")
        private val VALID_TOP_LEVEL_KEYWORDS = setOf(
            "orb", "world", "composition", "template", "object",
            "environment", "import", "export", "using"
        )
    }

    override fun annotate(element: PsiElement, holder: AnnotationHolder) {
        when (element.elementType) {
            HoloScriptTokenTypes.KEYWORD -> annotateKeyword(element, holder)
            HoloScriptTokenTypes.TRAIT -> annotateTrait(element, holder)
        }
    }

    private fun annotateKeyword(element: PsiElement, holder: AnnotationHolder) {
        val text = element.text.trim()

        if (text in DEPRECATED_KEYWORDS) {
            holder.newAnnotation(
                HighlightSeverity.WEAK_WARNING,
                "'$text' is deprecated — consider using the updated syntax"
            )
                .range(element.textRange)
                .create()
        }
    }

    private fun annotateTrait(element: PsiElement, holder: AnnotationHolder) {
        val text = element.text.trimStart('@').trim()

        // Empty trait annotation
        if (text.isEmpty()) {
            holder.newAnnotation(
                HighlightSeverity.ERROR,
                "Trait name expected after '@'"
            )
                .range(element.textRange)
                .create()
        }
    }
}
