package com.holoscript.intellij.parser

import com.holoscript.intellij.HoloScriptLanguage
import com.intellij.lang.ASTNode
import com.intellij.psi.PsiElement
import com.intellij.psi.tree.IElementType

/**
 * PSI element types for HoloScript.
 */
object HoloScriptElementTypes {

    val DECLARATION = IElementType("DECLARATION", HoloScriptLanguage)
    val BLOCK = IElementType("BLOCK", HoloScriptLanguage)
    val PROPERTY = IElementType("PROPERTY", HoloScriptLanguage)
    val TRAIT_ANNOTATION = IElementType("TRAIT_ANNOTATION", HoloScriptLanguage)
    val EXPRESSION = IElementType("EXPRESSION", HoloScriptLanguage)

    fun createElement(node: ASTNode): PsiElement =
        HoloScriptPsiElement(node)
}
