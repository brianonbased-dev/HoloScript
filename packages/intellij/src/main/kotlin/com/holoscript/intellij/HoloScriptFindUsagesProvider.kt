package com.holoscript.intellij

import com.holoscript.intellij.lexer.HoloScriptLexer
import com.holoscript.intellij.lexer.HoloScriptTokenTypes
import com.intellij.lang.cacheBuilder.DefaultWordsScanner
import com.intellij.lang.cacheBuilder.WordsScanner
import com.intellij.lang.findUsages.FindUsagesProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiNamedElement
import com.intellij.psi.tree.TokenSet

/**
 * Find Usages support for HoloScript.
 *
 * Enables Ctrl+F7 / Find Usages for HoloScript symbols. Provides word-level
 * scanning so the IDE can efficiently index identifiers across the project.
 */
class HoloScriptFindUsagesProvider : FindUsagesProvider {

    override fun getWordsScanner(): WordsScanner = DefaultWordsScanner(
        HoloScriptLexer(),
        TokenSet.create(
            HoloScriptTokenTypes.IDENTIFIER,
            HoloScriptTokenTypes.OBJECT_NAME
        ),
        TokenSet.create(
            HoloScriptTokenTypes.LINE_COMMENT,
            HoloScriptTokenTypes.BLOCK_COMMENT
        ),
        TokenSet.create(HoloScriptTokenTypes.STRING)
    )

    override fun canFindUsagesFor(psiElement: PsiElement): Boolean =
        psiElement is PsiNamedElement

    override fun getHelpId(psiElement: PsiElement): String? = null

    override fun getType(element: PsiElement): String = when {
        element.text.startsWith("composition") -> "composition"
        element.text.startsWith("orb") -> "orb"
        element.text.startsWith("template") -> "template"
        element.text.startsWith("world") -> "world"
        else -> "symbol"
    }

    override fun getDescriptiveName(element: PsiElement): String =
        if (element is PsiNamedElement) element.name ?: element.text else element.text

    override fun getNodeText(element: PsiElement, useFullName: Boolean): String =
        element.text.lines().firstOrNull()?.trim() ?: element.text
}
