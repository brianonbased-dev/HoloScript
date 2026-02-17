package com.holoscript.intellij.parser

import com.intellij.extapi.psi.ASTWrapperPsiElement
import com.intellij.lang.ASTNode

/**
 * Base PSI element for HoloScript.
 */
class HoloScriptPsiElement(node: ASTNode) : ASTWrapperPsiElement(node) {
    override fun toString(): String = "HoloScriptElement(${node.elementType})"
}
