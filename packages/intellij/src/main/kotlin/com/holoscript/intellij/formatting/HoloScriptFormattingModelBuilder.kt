package com.holoscript.intellij.formatting

import com.holoscript.intellij.parser.HoloScriptElementTypes
import com.holoscript.intellij.lexer.HoloScriptTokenTypes
import com.intellij.formatting.*
import com.intellij.lang.ASTNode
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiFile
import com.intellij.psi.codeStyle.CodeStyleSettings
import com.intellij.psi.formatter.common.AbstractBlock

/**
 * Formatting model builder for HoloScript.
 *
 * Integrates with the IntelliJ formatter to apply consistent indentation and
 * spacing when the user invokes Reformat Code (Ctrl+Alt+L).
 */
class HoloScriptFormattingModelBuilder : FormattingModelBuilder {

    override fun createModel(formattingContext: FormattingContext): FormattingModel {
        val settings = formattingContext.codeStyleSettings
        val spacingBuilder = createSpacingBuilder(settings)
        val rootBlock = HoloScriptBlock(
            formattingContext.node,
            null,
            Indent.getNoneIndent(),
            spacingBuilder
        )
        return FormattingModelProvider.createFormattingModelForPsiFile(
            formattingContext.containingFile,
            rootBlock,
            settings
        )
    }

    private fun createSpacingBuilder(settings: CodeStyleSettings): SpacingBuilder =
        SpacingBuilder(settings, com.holoscript.intellij.HoloScriptLanguage)
            // space before opening brace
            .before(HoloScriptTokenTypes.LBRACE).spaces(1)
            // no space after opening brace
            .after(HoloScriptTokenTypes.LBRACE).none()
            // no space before closing brace
            .before(HoloScriptTokenTypes.RBRACE).none()
            // space after colon
            .after(HoloScriptTokenTypes.COLON).spaces(1)
            // space after comma
            .after(HoloScriptTokenTypes.COMMA).spaces(1)
}

// ---------------------------------------------------------------------------

private class HoloScriptBlock(
    node: ASTNode,
    wrap: Wrap?,
    indent: Indent?,
    private val spacingBuilder: SpacingBuilder
) : AbstractBlock(node, wrap, Alignment.createAlignment()) {

    override fun buildChildren(): List<Block> {
        val blocks = mutableListOf<Block>()
        var child: ASTNode? = node.firstChildNode
        while (child != null) {
            if (child.elementType != HoloScriptTokenTypes.WHITESPACE &&
                child.elementType != HoloScriptTokenTypes.NEWLINE
            ) {
                val childIndent = when (child.elementType) {
                    HoloScriptElementTypes.PROPERTY,
                    HoloScriptElementTypes.DECLARATION -> Indent.getNormalIndent()
                    else -> Indent.getNoneIndent()
                }
                blocks.add(
                    HoloScriptBlock(child, null, childIndent, spacingBuilder)
                )
            }
            child = child.treeNext
        }
        return blocks
    }

    override fun getIndent(): Indent = myIndent ?: Indent.getNoneIndent()

    override fun getSpacing(child1: Block?, child2: Block): Spacing? =
        spacingBuilder.getSpacing(this, child1, child2)

    override fun isLeaf(): Boolean = node.firstChildNode == null
}
