package com.holoscript.intellij.parser

import com.holoscript.intellij.lexer.HoloScriptTokenTypes
import com.intellij.lang.ASTNode
import com.intellij.lang.PsiBuilder
import com.intellij.lang.PsiParser
import com.intellij.psi.tree.IElementType

/**
 * HoloScript PSI parser.
 *
 * Produces a lightweight AST used by the IntelliJ platform for
 * structure view, folding, and reference resolution.
 */
class HoloScriptParser : PsiParser {

    override fun parse(root: IElementType, builder: PsiBuilder): ASTNode {
        val rootMarker = builder.mark()
        parseFile(builder)
        rootMarker.done(root)
        return builder.treeBuilt
    }

    private fun parseFile(builder: PsiBuilder) {
        while (!builder.eof()) {
            parseTopLevel(builder)
        }
    }

    private fun parseTopLevel(builder: PsiBuilder) {
        when (builder.tokenType) {
            HoloScriptTokenTypes.KEYWORD -> parseDeclaration(builder)
            HoloScriptTokenTypes.LINE_COMMENT,
            HoloScriptTokenTypes.BLOCK_COMMENT -> builder.advanceLexer()
            HoloScriptTokenTypes.WHITESPACE,
            HoloScriptTokenTypes.NEWLINE -> builder.advanceLexer()
            else -> {
                // Consume unknown tokens to avoid infinite loops
                val error = builder.mark()
                builder.advanceLexer()
                error.error("Unexpected token")
            }
        }
    }

    private fun parseDeclaration(builder: PsiBuilder) {
        val marker = builder.mark()

        // Consume keyword (orb, world, composition, template, etc.)
        builder.advanceLexer()

        // Consume optional name
        if (builder.tokenType == HoloScriptTokenTypes.IDENTIFIER ||
            builder.tokenType == HoloScriptTokenTypes.OBJECT_NAME
        ) {
            builder.advanceLexer()
        }

        // Parse traits (@trait annotations)
        while (builder.tokenType == HoloScriptTokenTypes.TRAIT) {
            builder.advanceLexer()
        }

        // Parse body block
        if (builder.tokenType == HoloScriptTokenTypes.LBRACE) {
            parseBlock(builder)
        }

        marker.done(HoloScriptElementTypes.DECLARATION)
    }

    private fun parseBlock(builder: PsiBuilder) {
        val marker = builder.mark()
        builder.advanceLexer() // consume '{'

        while (!builder.eof() && builder.tokenType != HoloScriptTokenTypes.RBRACE) {
            when (builder.tokenType) {
                HoloScriptTokenTypes.KEYWORD -> parseDeclaration(builder)
                HoloScriptTokenTypes.IDENTIFIER,
                HoloScriptTokenTypes.PROPERTY -> parseProperty(builder)
                HoloScriptTokenTypes.TRAIT -> builder.advanceLexer()
                HoloScriptTokenTypes.LINE_COMMENT,
                HoloScriptTokenTypes.BLOCK_COMMENT,
                HoloScriptTokenTypes.WHITESPACE,
                HoloScriptTokenTypes.NEWLINE -> builder.advanceLexer()
                else -> builder.advanceLexer()
            }
        }

        if (builder.tokenType == HoloScriptTokenTypes.RBRACE) {
            builder.advanceLexer() // consume '}'
        }

        marker.done(HoloScriptElementTypes.BLOCK)
    }

    private fun parseProperty(builder: PsiBuilder) {
        val marker = builder.mark()
        builder.advanceLexer() // name

        // Optional: colon + value or block
        if (builder.tokenType == HoloScriptTokenTypes.COLON) {
            builder.advanceLexer()
            if (builder.tokenType == HoloScriptTokenTypes.LBRACE) {
                parseBlock(builder)
            } else {
                // consume value tokens until newline
                while (!builder.eof() &&
                    builder.tokenType != HoloScriptTokenTypes.NEWLINE &&
                    builder.tokenType != HoloScriptTokenTypes.RBRACE
                ) {
                    builder.advanceLexer()
                }
            }
        }

        marker.done(HoloScriptElementTypes.PROPERTY)
    }
}
