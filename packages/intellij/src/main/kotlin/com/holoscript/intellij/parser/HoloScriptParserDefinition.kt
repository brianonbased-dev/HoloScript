package com.holoscript.intellij.parser

import com.holoscript.intellij.HoloScriptLanguage
import com.holoscript.intellij.lexer.HoloScriptLexer
import com.holoscript.intellij.lexer.HoloScriptTokenTypes
import com.intellij.lang.ASTNode
import com.intellij.lang.ParserDefinition
import com.intellij.lang.PsiParser
import com.intellij.lexer.Lexer
import com.intellij.openapi.project.Project
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet

/**
 * Parser definition for HoloScript.
 *
 * Wires together the lexer, token sets, and PSI file factory
 * so the IntelliJ platform can build a PSI tree from HoloScript sources.
 */
class HoloScriptParserDefinition : ParserDefinition {

    companion object {
        val FILE = IFileElementType(HoloScriptLanguage)

        val COMMENTS = TokenSet.create(
            HoloScriptTokenTypes.LINE_COMMENT,
            HoloScriptTokenTypes.BLOCK_COMMENT
        )

        val STRINGS = TokenSet.create(HoloScriptTokenTypes.STRING)

        val WHITESPACE = TokenSet.create(
            HoloScriptTokenTypes.WHITESPACE,
            HoloScriptTokenTypes.NEWLINE
        )
    }

    override fun createLexer(project: Project?): Lexer = HoloScriptLexer()

    override fun createParser(project: Project?): PsiParser = HoloScriptParser()

    override fun getFileNodeType(): IFileElementType = FILE

    override fun getCommentTokens(): TokenSet = COMMENTS

    override fun getStringLiteralElements(): TokenSet = STRINGS

    override fun createElement(node: ASTNode): PsiElement =
        HoloScriptElementTypes.createElement(node)

    override fun createFile(viewProvider: FileViewProvider): PsiFile =
        HoloScriptFile(viewProvider)
}
