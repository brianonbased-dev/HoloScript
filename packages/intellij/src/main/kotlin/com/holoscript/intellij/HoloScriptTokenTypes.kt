package com.holoscript.intellij

import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.TokenSet

/**
 * Token types for HoloScript lexer.
 */
object HoloScriptTokenTypes {
    // Keywords
    val KEYWORD = HoloScriptElementType("KEYWORD")

    // Traits (@grabbable, @physics, etc.)
    val TRAIT = HoloScriptElementType("TRAIT")

    // Literals
    val STRING = HoloScriptElementType("STRING")
    val NUMBER = HoloScriptElementType("NUMBER")

    // Comments
    val COMMENT = HoloScriptElementType("COMMENT")
    val BLOCK_COMMENT = HoloScriptElementType("BLOCK_COMMENT")

    // Identifiers
    val IDENTIFIER = HoloScriptElementType("IDENTIFIER")
    val PROPERTY = HoloScriptElementType("PROPERTY")

    // Types (orb, entity, object, etc.)
    val TYPE = HoloScriptElementType("TYPE")

    // Operators
    val OPERATOR = HoloScriptElementType("OPERATOR")
    val COLON = HoloScriptElementType("COLON")
    val COMMA = HoloScriptElementType("COMMA")
    val DOT = HoloScriptElementType("DOT")
    val EQUALS = HoloScriptElementType("EQUALS")
    val ARROW = HoloScriptElementType("ARROW")

    // Brackets
    val BRACE = HoloScriptElementType("BRACE")
    val LBRACE = HoloScriptElementType("LBRACE")
    val RBRACE = HoloScriptElementType("RBRACE")
    val BRACKET = HoloScriptElementType("BRACKET")
    val LBRACKET = HoloScriptElementType("LBRACKET")
    val RBRACKET = HoloScriptElementType("RBRACKET")
    val LPAREN = HoloScriptElementType("LPAREN")
    val RPAREN = HoloScriptElementType("RPAREN")

    // Whitespace
    val WHITE_SPACE = HoloScriptElementType("WHITE_SPACE")
    val NEW_LINE = HoloScriptElementType("NEW_LINE")

    // Error
    val BAD_CHARACTER = HoloScriptElementType("BAD_CHARACTER")

    // Token sets
    val COMMENTS = TokenSet.create(COMMENT, BLOCK_COMMENT)
    val STRINGS = TokenSet.create(STRING)
    val KEYWORDS_SET = TokenSet.create(KEYWORD)
    val WHITESPACES = TokenSet.create(WHITE_SPACE, NEW_LINE)
}

/**
 * Element type for HoloScript tokens.
 */
class HoloScriptElementType(debugName: String) : IElementType(debugName, HoloScriptLanguage)
