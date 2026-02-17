package com.holoscript.intellij.highlighting

import com.holoscript.intellij.HoloScriptIcons
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.options.colors.AttributesDescriptor
import com.intellij.openapi.options.colors.ColorDescriptor
import com.intellij.openapi.options.colors.ColorSettingsPage
import javax.swing.Icon

/**
 * Color settings page for HoloScript.
 *
 * Exposed under Settings > Editor > Color Scheme > HoloScript.
 * Lets users customize every token colour shown in the editor.
 */
class HoloScriptColorSettingsPage : ColorSettingsPage {

    companion object {
        private val ATTRIBUTES = arrayOf(
            AttributesDescriptor("Keywords//Keywords", HoloScriptSyntaxHighlighter.KEYWORD),
            AttributesDescriptor("Keywords//Traits (@annotations)", HoloScriptSyntaxHighlighter.TRAIT),
            AttributesDescriptor("Literals//Strings", HoloScriptSyntaxHighlighter.STRING),
            AttributesDescriptor("Literals//Numbers", HoloScriptSyntaxHighlighter.NUMBER),
            AttributesDescriptor("Comments//Line comment", HoloScriptSyntaxHighlighter.COMMENT),
            AttributesDescriptor("Comments//Block comment", HoloScriptSyntaxHighlighter.BLOCK_COMMENT),
            AttributesDescriptor("Identifiers//Object names", HoloScriptSyntaxHighlighter.OBJECT_NAME),
            AttributesDescriptor("Identifiers//Properties", HoloScriptSyntaxHighlighter.PROPERTY),
            AttributesDescriptor("Identifiers//Event handlers", HoloScriptSyntaxHighlighter.EVENT),
            AttributesDescriptor("Identifiers//Identifiers", HoloScriptSyntaxHighlighter.IDENTIFIER),
            AttributesDescriptor("Operators//Operators", HoloScriptSyntaxHighlighter.OPERATOR),
            AttributesDescriptor("Braces and Operators//Braces", HoloScriptSyntaxHighlighter.BRACES),
            AttributesDescriptor("Braces and Operators//Brackets", HoloScriptSyntaxHighlighter.BRACKETS),
            AttributesDescriptor("Braces and Operators//Parentheses", HoloScriptSyntaxHighlighter.PARENTHESES),
            AttributesDescriptor("Errors//Bad characters", HoloScriptSyntaxHighlighter.BAD_CHARACTER),
        )
    }

    override fun getAttributeDescriptors(): Array<AttributesDescriptor> = ATTRIBUTES

    override fun getColorDescriptors(): Array<ColorDescriptor> = ColorDescriptor.EMPTY_ARRAY

    override fun getDisplayName(): String = "HoloScript"

    override fun getIcon(): Icon = HoloScriptIcons.FILE

    override fun getHighlighter(): SyntaxHighlighter = HoloScriptSyntaxHighlighter()

    override fun getDemoText(): String = """
        // HoloScript demo — color settings preview
        /* block comment */
        import { PhysicsEngine } from "holoscript/physics"

        template Bouncy {
          @physics
          @collidable
          bounce: 0.8
        }

        composition demo {
          @grabbable
          @networked

          orb ball {
            using Bouncy
            position: [0, 1.5, -2]
            color: "#ff6600"
            radius: 0.2

            on_click: {
              this.color = "#0066ff"
              audio.play("pop.mp3")
            }
          }

          world {
            environment {
              sky: "sunset"
              ambient_light: 0.4
            }
          }
        }
    """.trimIndent()

    override fun getAdditionalHighlightingTagToDescriptorMap(): Map<String, TextAttributesKey>? = null
}
