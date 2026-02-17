package com.holoscript.intellij

import com.intellij.lang.ASTNode
import com.intellij.lang.folding.FoldingBuilderEx
import com.intellij.lang.folding.FoldingDescriptor
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.FoldingGroup
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.holoscript.intellij.parser.HoloScriptElementTypes

/**
 * Code folding support for HoloScript.
 *
 * Allows collapsing composition/orb/template/logic blocks to keep large
 * files navigable.
 */
class HoloScriptFoldingBuilder : FoldingBuilderEx() {

    override fun buildFoldRegions(
        root: PsiElement,
        document: Document,
        quick: Boolean
    ): Array<FoldingDescriptor> {
        val descriptors = mutableListOf<FoldingDescriptor>()
        collectFoldRegions(root.node, document, descriptors)
        return descriptors.toTypedArray()
    }

    private fun collectFoldRegions(
        node: ASTNode,
        document: Document,
        descriptors: MutableList<FoldingDescriptor>
    ) {
        if (node.elementType == HoloScriptElementTypes.BLOCK) {
            val range = node.textRange
            // Only fold if the block spans more than one line
            if (document.getLineNumber(range.startOffset) <
                document.getLineNumber(range.endOffset)
            ) {
                descriptors.add(
                    FoldingDescriptor(
                        node,
                        range,
                        FoldingGroup.newGroup("holoscript-block"),
                    )
                )
            }
        }

        var child = node.firstChildNode
        while (child != null) {
            collectFoldRegions(child, document, descriptors)
            child = child.treeNext
        }
    }

    override fun getPlaceholderText(node: ASTNode): String = "{ ... }"

    override fun isCollapsedByDefault(node: ASTNode): Boolean = false
}
